/*
 * fs-splat 0.1 — the Gaussian-splat runtime a page loads AFTER
 * a-frame-180-a-01.min.js (built by build/build-splat.mjs into
 * js/fs-splat-0.1.js; the addon sources live in splat/, see splat/README.md).
 *
 * It installs `globalThis.FastShadersSplat` and, when A-Frame is on the page,
 * the `splat-model` component. The shading itself is loader 0.8's job (a
 * module returning `{ splat: { … } }`, section 9b there); this file only turns
 * bytes into a GaussianSplat, and does it through ONE chokepoint, parseBytes:
 *
 *   cap BEFORE allocation → parse → drop spherical harmonics → return.
 *
 * The bytes are adversarial: they come out of a file somebody dropped. Every
 * refusal is an Error whose message is an English sentence, so a host page can
 * show it as it is. The limits are the SAME literals as the FastShaders app's
 * src/utils/splatLimits.ts and podest's sniff twin; a drift test compares them.
 *
 * Spherical harmonics are deleted at parse, always: on the WebGL backend a
 * degree-1+ splat under loader 0.8's wrapper cannot build its vertex shader,
 * and degree 0 keeps the addon's SH compute pass and storage off entirely.
 *
 * String literals stay ASCII (the page may not be served as UTF-8).
 */
import { FileLoader, Cache } from 'three';
import { GaussianSplat } from '../splat/objects/GaussianSplat.js';
import { CountingSort } from '../splat/gpgpu/CountingSort.js';
import {
  createGaussianSplatGeometry,
  getSphericalHarmonicsDegree,
} from '../splat/utils/GaussianSplatUtils.js';
import { SPLATLoader } from '../splat/loaders/SPLATLoader.js';
import { SPZLoader } from '../splat/loaders/SPZLoader.js';
import { GaussianSplatPLYLoader } from '../splat/loaders/GaussianSplatPLYLoader.js';
import { KSPLATLoader } from '../splat/loaders/KSPLATLoader.js';

const VERSION = '0.1.0';
const ADDON_REVISION = '186';
const ERR_NO_THREE = 'FastShadersSplat: three/webgpu global not found - load the A-Frame bundle first';

// The same numbers as src/utils/splatLimits.ts (see that file for the reasons).
const LIMITS = Object.freeze({
  SPLAT_ROW_BYTES: 32,
  SPLAT_MAX_COUNT: 1000000,
  SPLAT_HEADSET_ADVISORY_COUNT: 250000,
  SPZ_MAX_DECODED_BYTES: 96 * 1024 * 1024,
  PLY_HEADER_SCAN_BYTES: 64 * 1024,
  KSPLAT_HEADER_BYTES: 4096,
  SPZ_MAGIC: 0x5053474e,
});

const KINDS = ['splat', 'spz', 'ply', 'ksplat'];

// The conversion advice every "cannot show this file" sentence ends with.
const CONVERT = 'Convert it to .splat or .spz with SuperSplat or splat-transform, then load that file.';
const REDUCE = 'Reduce the scene in SuperSplat (or splat-transform) and export it again.';
const SPZ_V4 = 'SPZ version 4 (zstd) is not supported - export SPZ v2/v3 or .splat';

// SPZ's per-degree SH vector count (the stored degree may be 0..4).
const SPZ_SH_VECTORS = [0, 3, 8, 15, 24];
// Every vertex property a Gaussian-splat PLY must declare.
const PLY_REQUIRED = [
  'x', 'y', 'z',
  'scale_0', 'scale_1', 'scale_2',
  'rot_0', 'rot_1', 'rot_2', 'rot_3',
  'f_dc_0', 'f_dc_1', 'f_dc_2',
  'opacity',
];

function three() {
  const t = globalThis.THREE;
  if (!t || !t.TSL) throw new Error(ERR_NO_THREE);
  return t;
}

// 1234567 → "1,234,567" (ASCII, and independent of the page's locale).
function fmt(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// 100663296 → "96 MB"; below 1 MiB the byte count (only a test sets such a cap).
function sizeText(bytes) {
  return bytes >= 1024 * 1024 ? Math.round(bytes / (1024 * 1024)) + ' MB' : fmt(bytes) + ' bytes';
}

function reasonOf(e) {
  try {
    const m = e && typeof e.message === 'string' ? e.message : String(e);
    return m.length > 200 ? m.slice(0, 200) + '...' : m;
  } catch (x) {
    return 'unknown error';
  }
}

function u32le(bytes, at) {
  return (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;
}

// An ArrayBuffer of THIS realm. FileLoader already hands one over; a view, or
// a buffer made in another realm (an iframe, a test's vm), is copied once —
// PLYLoader tests `data instanceof ArrayBuffer` and would otherwise read the
// bytes as ASCII text.
function toArrayBuffer(input) {
  if (input instanceof ArrayBuffer) return input;
  if (Object.prototype.toString.call(input) === '[object ArrayBuffer]') {
    const copy = new ArrayBuffer(input.byteLength);
    new Uint8Array(copy).set(new Uint8Array(input));
    return copy;
  }
  if (ArrayBuffer.isView(input)) {
    const copy = new ArrayBuffer(input.byteLength);
    new Uint8Array(copy).set(new Uint8Array(input.buffer, input.byteOffset, input.byteLength));
    return copy;
  }
  throw new TypeError('FastShadersSplat.parseBytes: expected the file as an ArrayBuffer.');
}

function checkCount(count, kind) {
  if (count === 0) throw new Error('This .' + kind + ' file holds no splats.');
  if (count > LIMITS.SPLAT_MAX_COUNT) {
    throw new Error(
      'This .' + kind + ' file holds ' + fmt(count) + ' splats; the limit is ' +
        fmt(LIMITS.SPLAT_MAX_COUNT) + '. ' + REDUCE,
    );
  }
}

// A loader's own throw ("THREE.SPZLoader: Invalid SPZ byte length.") becomes a
// sentence naming the file kind.
function runLoader(kind, parse) {
  try {
    return parse();
  } catch (e) {
    throw new Error('This .' + kind + ' file could not be read (' + reasonOf(e) + ').');
  }
}

// ---------------------------------------------------------------------------
// .splat — fixed 32-byte rows, no header
// ---------------------------------------------------------------------------

function parseSplat(buffer) {
  const len = buffer.byteLength;
  if (len === 0) throw new Error('This .splat file is empty.');
  if (len % LIMITS.SPLAT_ROW_BYTES !== 0) {
    throw new Error(
      'This .splat file is damaged: its size (' + fmt(len) + ' bytes) is not a whole number of ' +
        LIMITS.SPLAT_ROW_BYTES + '-byte splats.',
    );
  }
  checkCount(len / LIMITS.SPLAT_ROW_BYTES, 'splat');
  return runLoader('splat', () => new SPLATLoader().parse(buffer));
}

// ---------------------------------------------------------------------------
// .ply — a bounded header read decides everything before PLYLoader runs
// ---------------------------------------------------------------------------

// The header as text: ASCII by construction (a PLY header is plain ASCII), read
// from at most PLY_HEADER_SCAN_BYTES, never the (possibly huge) binary body.
function plyHeaderText(bytes) {
  const n = Math.min(bytes.length, LIMITS.PLY_HEADER_SCAN_BYTES);
  let s = '';
  for (let i = 0; i < n; i += 8192) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(n, i + 8192)));
  }
  return s;
}

// A PLY scalar type's size in bytes (PLYLoader's getBinaryReader table), 0 when unknown.
function plyTypeBytes(type) {
  switch (type) {
    case 'char': case 'int8': case 'uchar': case 'uint8': return 1;
    case 'short': case 'int16': case 'ushort': case 'uint16': return 2;
    case 'int': case 'int32': case 'uint': case 'uint32': case 'float': case 'float32': return 4;
    case 'double': case 'float64': return 8;
    default: return 0;
  }
}

/*
 * → { count } for a Gaussian-splat PLY this runtime can show, else throws.
 *
 * THE ONE PLY HEADER RULE SET — the FastShaders app's trusted sniff
 * (src/utils/splatSniff.ts, where the rules are listed with their reasons) and
 * podest's twin apply the same rules in the same order, and the app's tests
 * run this function over their shared corpus. In short:
 *  1. The header ends at the first LINE that is exactly "end_header", as
 *     PLYLoader's extractHeaderText decides it:
 *         const c = String.fromCharCode( bytes[ i ++ ] );
 *         if ( c !== '\n' && c !== '\r' ) { line += c; } else {
 *             if ( line === 'end_header' ) cont = false;
 *         ...
 *         if ( hasCRNL === true ) i ++;      // hasCRNL = /^ply\r\n/
 *     and the first "end_header" must BE that line, because
 *     GaussianSplatPLYLoader reads the header up to the first SUBSTRING.
 *  2. One format line (ascii or binary); every property "property <type>
 *     <name>" with a known scalar type, or a list; format, element and property
 *     lines ASCII (GaussianSplatPLYLoader decodes them as UTF-8, PLYLoader byte
 *     by byte).
 *  3. No "element chunk".
 *  4. Exactly ONE element, vertex, with no list property and none before it:
 *     PLYLoader walks EVERY element's count, and a property-less row reads 0
 *     bytes — a second element was a loop no cap bounded.
 *  5. The splat properties; no f_rest_*.  6. Binary.
 *  7. A 1-10 digit count, > 0, <= the cap.
 *  8. The body holds count x row bytes, from where PLYLoader starts it.
 */
function sniffPlyHeader(bytes) {
  const text = plyHeaderText(bytes);
  if (text.slice(0, 3) !== 'ply') {
    throw new Error('This .ply file is not a PLY file (it does not start with "ply").');
  }
  const at = text.indexOf('end_header');
  if (at < 0) {
    throw new Error(
      'This .ply file has no end_header in its first ' + LIMITS.PLY_HEADER_SCAN_BYTES / 1024 +
        ' KB, so it is not a Gaussian-splat PLY.',
    );
  }
  // Its line ending may be the one byte after the scan window.
  const before = bytes[at - 1];
  const after = bytes[at + 10];
  if (!((before === 13 || before === 10) && (after === 13 || after === 10))) {
    throw new Error('This .ply file is damaged: its header spells "end_header" inside another header line.');
  }
  const end = at + 10;
  let formats = 0;
  let format = '';
  let nonAscii = false;
  let badProperty = false;
  let orphan = false;
  let list = false;
  const elements = [];
  let current = null;
  const lines = text.slice(3, at).split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;
    const words = line.split(/\s+/);
    const keyword = words[0];
    // comment, obj_info and anything else PLYLoader skips carry no rule.
    if (keyword !== 'format' && keyword !== 'element' && keyword !== 'property') continue;
    if (/[^\x00-\x7f]/.test(lines[i])) nonAscii = true;
    if (keyword === 'format') {
      formats++;
      format = words[1] === undefined ? '' : words[1];
    } else if (keyword === 'element') {
      current = {
        name: words[1] === undefined ? '' : words[1],
        count: words[2] === undefined ? '' : words[2],
        names: [],
        rowBytes: 0,
      };
      elements.push(current);
    } else {
      if (current === null) orphan = true;
      if (words[1] === 'list') list = true;
      else if (words.length !== 3 || plyTypeBytes(words[1]) === 0) badProperty = true;
      else if (current !== null) {
        current.names.push(words[2]);
        current.rowBytes += plyTypeBytes(words[1]);
      }
    }
  }
  if (formats > 1) throw new Error('This .ply file is damaged: it declares its format more than once.');
  // PLYLoader splits an ASCII body into one string per number — for a 64 MB
  // file, tens of millions of them — before it reads a single splat. Splat
  // PLYs are binary in practice (3DGS training, SuperSplat and splat-transform
  // all write binary), so ASCII is refused rather than parsed (rule 6, below).
  if (format !== 'ascii' && format !== 'binary_little_endian' && format !== 'binary_big_endian') {
    throw new Error(
      'This .ply file does not declare a binary format; FastShaders reads binary Gaussian-splat PLYs only. ' + CONVERT,
    );
  }
  if (nonAscii) throw new Error('This .ply file is damaged: a header line holds bytes that are not ASCII.');
  if (badProperty) {
    throw new Error('This .ply file is damaged: a property line is malformed or names an unknown type.');
  }
  if (elements.some((e) => e.name === 'chunk')) {
    throw new Error(
      'This .ply file is a compressed splat PLY (it has an "element chunk"), which is not supported. ' + CONVERT,
    );
  }
  const vertex = elements.length === 1 && elements[0].name === 'vertex' && !orphan && !list ? elements[0] : null;
  if (vertex === null) {
    throw new Error(
      'This .ply file is a mesh or a point cloud, not a Gaussian splat: a splat PLY declares exactly one ' +
        'element, "vertex", with no list properties.',
    );
  }
  if (PLY_REQUIRED.some((p) => vertex.names.indexOf(p) === -1)) {
    throw new Error(
      'This .ply file is a mesh or a point cloud, not a Gaussian splat: it lacks the splat properties ' +
        '(x, y, z, scale_0-2, rot_0-3, f_dc_0-2, opacity).',
    );
  }
  if (vertex.names.some((p) => /^f_rest_\d+$/.test(p))) {
    throw new Error(
      'This .ply file carries view-dependent colour (spherical harmonics, the f_rest_* properties), ' +
        'which FastShaders cannot show. ' + CONVERT,
    );
  }
  if (format === 'ascii') {
    throw new Error(
      'This .ply file is stored as text (format ascii); FastShaders reads binary Gaussian-splat PLYs only. ' + CONVERT,
    );
  }
  if (!/^\d{1,10}$/.test(vertex.count)) {
    throw new Error('This .ply file is damaged: its vertex count is not a number.');
  }
  const count = Number(vertex.count);
  checkCount(count, 'ply');
  const bodyStart = end + 1 + (bytes[3] === 13 && bytes[4] === 10 ? 1 : 0);
  const need = count * vertex.rowBytes;
  const have = Math.max(0, bytes.length - bodyStart);
  if (need > have) {
    throw new Error(
      'This .ply file is cut short: its header declares ' + fmt(count) + ' splats (' + fmt(need) +
        ' bytes), but only ' + fmt(have) + ' bytes follow the header.',
    );
  }
  return { count: count };
}

function parsePly(buffer) {
  sniffPlyHeader(new Uint8Array(buffer));
  return runLoader('ply', () => new GaussianSplatPLYLoader().parse(buffer));
}

// ---------------------------------------------------------------------------
// .spz — gzip (v1-v3) inflated behind a byte counter; zstd (v4) refused
// ---------------------------------------------------------------------------

function concatChunks(chunks, total) {
  const out = new Uint8Array(total);
  let at = 0;
  for (let i = 0; i < chunks.length; i++) {
    out.set(chunks[i], at);
    at += chunks[i].length;
  }
  return out;
}

/*
 * Inflate a gzip stream, never holding more than `cap` decoded bytes.
 *
 * `plan(head16)` (optional) reads the first 16 DECODED bytes, refuses by
 * throwing, and returns the exact decoded size the header declares — the one
 * allocation, made before the rest is read; a stream longer than it declares
 * is refused at the counter, a shorter one after the last chunk. Without a
 * plan the chunks are kept until the end (at most `cap` bytes) and joined.
 *
 * fflate's gunzipSync is not used on purpose: it allocates the size the gzip
 * TRAILER claims, a number the file's author writes.
 */
async function gunzipCapped(bytes, cap, plan) {
  if (typeof DecompressionStream !== 'function' || typeof Blob !== 'function') {
    throw new Error('This browser cannot unpack a .spz file (it has no DecompressionStream).');
  }
  const capSentence =
    'This .spz file unpacks to more than ' + sizeText(cap) + ', the limit for one splat file.';
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const head = [];
  let headLength = 0;
  let out = null;
  let total = 0;
  let limit = cap;
  try {
    for (;;) {
      let step;
      try {
        step = await reader.read();
      } catch (e) {
        throw new Error('This .spz file is damaged: its gzip data is truncated or corrupt.');
      }
      if (step.done) break;
      const chunk = step.value;
      total += chunk.length;
      if (total > limit) {
        throw new Error(
          limit < cap
            ? 'This .spz file is damaged: it unpacks to more data than its header declares.'
            : capSentence,
        );
      }
      if (out) {
        out.set(chunk, total - chunk.length);
        continue;
      }
      head.push(chunk);
      headLength += chunk.length;
      if (plan && headLength >= 16) {
        const joined = concatChunks(head, headLength);
        const expected = plan(joined.subarray(0, 16));
        if (expected > cap) throw new Error(capSentence);
        if (headLength > expected) {
          throw new Error('This .spz file is damaged: it unpacks to more data than its header declares.');
        }
        limit = expected;
        out = new Uint8Array(expected);
        out.set(joined, 0);
        head.length = 0;
      }
    }
  } catch (e) {
    reader.cancel().catch(() => {});
    throw e;
  }
  if (!plan) return concatChunks(head, headLength);
  if (!out) throw new Error('This .spz file is damaged: it is too short to hold an SPZ header.');
  if (total < limit) {
    throw new Error('This .spz file is damaged: it unpacks to less data than its header declares.');
  }
  return out;
}

// The decoded SPZ header (16 bytes) → the exact decoded size SPZLoader expects.
function spzPlan(h) {
  if (u32le(h, 0) !== LIMITS.SPZ_MAGIC) {
    throw new Error('This .spz file is damaged: the unpacked data does not start with an SPZ header.');
  }
  const version = u32le(h, 4);
  if (version < 1 || version > 3) {
    throw new Error('This .spz file uses SPZ version ' + version + ', which is not supported.');
  }
  const count = u32le(h, 8);
  checkCount(count, 'spz');
  const degree = h[12];
  if (degree >= SPZ_SH_VECTORS.length) {
    throw new Error('This .spz file is damaged: it declares spherical-harmonics degree ' + degree + '.');
  }
  const flags = h[14];
  return (
    16 +
    count * 3 * (version === 1 ? 2 : 3) + // positions
    count + // alphas
    count * 3 + // colours
    count * 3 + // scales
    count * (version === 3 ? 4 : 3) + // rotations
    count * SPZ_SH_VECTORS[degree] * 3 + // spherical harmonics
    ((flags & 0x80) !== 0 ? count * 6 : 0) // LOD
  );
}

async function parseSpz(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 4 && u32le(bytes, 0) === LIMITS.SPZ_MAGIC) throw new Error(SPZ_V4);
  if (bytes.length < 18 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
    throw new Error('This .spz file is damaged: it is not gzip-compressed (SPZ versions 1 to 3 are).');
  }
  const decoded = await gunzipCapped(bytes, LIMITS.SPZ_MAX_DECODED_BYTES, spzPlan);
  return runLoader('spz', () => new SPZLoader().parseRawSPZ(decoded));
}

// ---------------------------------------------------------------------------
// .ksplat — fixed 4096-byte header, splat count at byte 16
// ---------------------------------------------------------------------------

function parseKsplat(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < LIMITS.KSPLAT_HEADER_BYTES) {
    throw new Error(
      'This .ksplat file is damaged: it is shorter than its ' + LIMITS.KSPLAT_HEADER_BYTES + '-byte header.',
    );
  }
  checkCount(u32le(bytes, 16), 'ksplat');
  return runLoader('ksplat', () => new KSPLATLoader().parse(buffer));
}

// ---------------------------------------------------------------------------
// The chokepoint
// ---------------------------------------------------------------------------

// Delete every SH band, recording the highest one present (0 = none).
function dropSphericalHarmonics(geometry) {
  let dropped = 0;
  for (let i = 1; i <= 3; i++) {
    const name = 'sphericalHarmonics' + i;
    if (geometry.getAttribute(name) !== undefined) {
      dropped = i;
      geometry.deleteAttribute(name);
    }
  }
  return dropped;
}

async function parse(kind, input) {
  if (KINDS.indexOf(kind) === -1) {
    throw new Error('FastShadersSplat cannot read this file kind; it reads .splat, .spz, .ply and .ksplat.');
  }
  three();
  const buffer = toArrayBuffer(input);
  let geometry;
  if (kind === 'splat') geometry = parseSplat(buffer);
  else if (kind === 'ply') geometry = parsePly(buffer);
  else if (kind === 'spz') geometry = await parseSpz(buffer);
  else geometry = parseKsplat(buffer);
  const position = geometry && geometry.getAttribute('position');
  const count = position ? position.count : 0;
  // A loader that disagrees with its own header is checked again here.
  checkCount(count, kind);
  const shDropped = dropSphericalHarmonics(geometry);
  return { geometry: geometry, count: count, shDropped: shDropped };
}

/**
 * parseBytes(kind, arrayBuffer) → Promise<{ geometry, count, shDropped }>.
 * `kind` is the lower-case extension. Never throws synchronously.
 */
function parseBytes(kind, input) {
  return new Promise((resolve) => resolve(parse(kind, input)));
}

/**
 * normalize(geometry, size): centre the splats and scale their longest
 * 2-sigma extent to `size`, IN PLACE (position (p - c) * s, covariance * s^2),
 * then null the bounds so GaussianSplat recomputes them. `size <= 0` keeps the
 * authored units. The extent follows GaussianSplat#computeBoundingBox: each
 * splat grows by 2 * sqrt(max(c00, c11, c22)). Rows that are not finite are
 * left out of the measurement; nothing measurable means nothing is changed.
 */
function normalize(geometry, size) {
  if (!(typeof size === 'number' && size > 0 && isFinite(size))) return geometry;
  const position = geometry && geometry.getAttribute('position');
  const covariance = geometry && geometry.getAttribute('covariance');
  if (!position || !covariance) return geometry;
  const p = position.array;
  const c = covariance.array;
  const n = position.count;
  let x0 = Infinity, y0 = Infinity, z0 = Infinity;
  let x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
    if (!isFinite(x) || !isFinite(y) || !isFinite(z)) continue;
    let r = 2 * Math.sqrt(Math.max(c[i * 6], c[i * 6 + 3], c[i * 6 + 5]));
    if (!(r >= 0 && isFinite(r))) r = 0;
    if (x - r < x0) x0 = x - r;
    if (y - r < y0) y0 = y - r;
    if (z - r < z0) z0 = z - r;
    if (x + r > x1) x1 = x + r;
    if (y + r > y1) y1 = y + r;
    if (z + r > z1) z1 = z + r;
  }
  const extent = Math.max(x1 - x0, y1 - y0, z1 - z0);
  if (!(extent > 0 && isFinite(extent))) return geometry;
  const s = size / extent;
  const s2 = s * s;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
  for (let i = 0; i < n; i++) {
    p[i * 3] = (p[i * 3] - cx) * s;
    p[i * 3 + 1] = (p[i * 3 + 1] - cy) * s;
    p[i * 3 + 2] = (p[i * 3 + 2] - cz) * s;
  }
  for (let j = 0; j < c.length; j++) c[j] *= s2;
  position.needsUpdate = true;
  covariance.needsUpdate = true;
  geometry.boundingBox = null;
  geometry.boundingSphere = null;
  return geometry;
}

// ---------------------------------------------------------------------------
// The A-Frame component
// ---------------------------------------------------------------------------

// `url(blob:…)` → `blob:…` (a plain string property keeps A-Frame's wrapper).
function stripUrl(src) {
  const s = String(src == null ? '' : src).trim();
  const m = /^url\(\s*(['"]?)(.*)\1\s*\)$/i.exec(s);
  return m ? m[2].trim() : s;
}

const splatModel = {
  schema: {
    src: { type: 'string' },
    kind: { default: 'splat', oneOf: KINDS },
    size: { type: 'number', default: 1.6 },
    autoSort: { default: true },
  },
  init: function () {
    this._generation = 0;
    this._splat = null;
    this._ownMaterial = null;
    this._warnedMaterial = false;
  },
  update: function () {
    const generation = ++this._generation;
    this._disposeSplat();
    const src = stripUrl(this.data.src);
    if (!src) return;
    const kind = this.data.kind;
    const size = this.data.size;
    const autoSort = this.data.autoSort !== false;
    const el = this.el;
    const stale = () => generation !== this._generation;
    const fail = (e) => {
      if (stale()) return;
      const message = reasonOf(e);
      console.warn('FastShadersSplat: ' + message);
      el.emit('model-error', { src: src, message: message });
    };
    let loader;
    try {
      three();
      // FileLoader, so the page's DefaultLoadingManager (and a sandboxed
      // document's setURLModifier allow-list) sees the request.
      loader = new FileLoader();
      loader.setResponseType('arraybuffer');
    } catch (e) {
      fail(e);
      return;
    }
    loader.load(
      src,
      (buffer) => {
        // The bytes would live on in the three cache for the page's lifetime
        // (FileLoader keys it `file:` + the manager-resolved URL).
        if (Cache && Cache.enabled && loader.manager && typeof loader.manager.resolveURL === 'function') {
          Cache.remove('file:' + loader.manager.resolveURL(src));
        }
        if (stale()) return;
        parseBytes(kind, buffer)
          .then((result) => {
            if (stale()) {
              result.geometry.dispose();
              return;
            }
            normalize(result.geometry, size);
            // Never compiled here: on WebGL the PBO program is reached only
            // through the splat's first onBeforeRender (updateSort).
            const splat = new GaussianSplat(result.geometry, { autoSort: autoSort });
            this._splat = splat;
            this._ownMaterial = splat.material;
            el.setObject3D('mesh', splat);
            // An A-Frame `material` on the same entity assigns ITS material to
            // whatever lands in the 'mesh' slot (on object3dset) — measured in
            // the editor preview as flat grey quads. Re-assert before anyone
            // (the shader component on model-loaded) reads the material.
            this._guardMaterial();
            el.emit('model-loaded', { format: 'splat', model: splat });
            el.emit('splat-loaded', { count: result.count, shDropped: result.shDropped });
          })
          .catch(fail);
      },
      undefined,
      fail,
    );
  },
  remove: function () {
    this._generation++;
    this._disposeSplat();
  },
  // One identity compare per frame. A GaussianSplat renders ONLY through its
  // own NodeMaterial (the projection lives in its vertexNode), so any other
  // material — a later `material` component update, page code — would draw
  // one flat quad per splat. The loader never replaces it (it skips
  // isGaussianSplat and edits the vertexNode of this same object in place).
  tick: function () {
    this._guardMaterial();
  },
  _guardMaterial: function () {
    const splat = this._splat;
    if (!splat || !this._ownMaterial || splat.material === this._ownMaterial) return;
    splat.material = this._ownMaterial;
    if (!this._warnedMaterial) {
      this._warnedMaterial = true;
      console.warn('FastShadersSplat: another material was assigned to the splat entity (an A-Frame `material` attribute?) - a Gaussian splat draws only through its own material, which was restored.');
    }
  },
  _disposeSplat: function () {
    const splat = this._splat;
    const own = this._ownMaterial;
    if (!splat) return;
    this._splat = null;
    this._ownMaterial = null;
    if (this.el.getObject3D('mesh') === splat) this.el.removeObject3D('mesh');
    if (splat.geometry) splat.geometry.dispose();
    if (splat.splatGeometry) splat.splatGeometry.dispose();
    if (own) own.dispose();
  },
};

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

three();

// A second copy on one page is a no-op: the first copy stays in charge.
if (!(globalThis.FastShadersSplat && /^0\.1\./.test(String(globalThis.FastShadersSplat.version)))) {
  globalThis.FastShadersSplat = Object.freeze({
    version: VERSION,
    addonRevision: ADDON_REVISION,
    GaussianSplat: GaussianSplat,
    CountingSort: CountingSort,
    createGaussianSplatGeometry: createGaussianSplatGeometry,
    getSphericalHarmonicsDegree: getSphericalHarmonicsDegree,
    // SPZLoader#parse would reach the gunzip stub: use parseBytes for .spz.
    loaders: Object.freeze({
      splat: SPLATLoader,
      spz: SPZLoader,
      ply: GaussianSplatPLYLoader,
      ksplat: KSPLATLoader,
    }),
    parseBytes: parseBytes,
    normalize: normalize,
    LIMITS: LIMITS,
    // NOT a stable interface: for tests.
    internals: Object.freeze({
      gunzipCapped: gunzipCapped,
      sniffPlyHeader: sniffPlyHeader,
      spzPlan: spzPlan,
    }),
  });

  const AF = globalThis.AFRAME;
  if (AF && typeof AF.registerComponent === 'function' && !(AF.components && AF.components['splat-model'])) {
    AF.registerComponent('splat-model', splatModel);
  }
}
