/**
 * Builds js/fs-splat-0.1.js — the Gaussian-splat runtime — from build/entry-splat.js
 * and the eight three r186 addon files in splat/ (see splat/README.md).
 *
 *   npm run build:splat
 *
 * Separate from build.mjs on purpose: that script's output (a-01) is stated to
 * be byte-reproducible from a clean checkout, and this bundle has nothing to do
 * with it. Nothing here reads node_modules/three — the three specifiers are
 * answered with the PAGE'S three (globalThis.THREE), so the runtime and the
 * A-Frame bundle share one instance and one TSL:
 *
 *   three, three/webgpu  →  globalThis.THREE
 *   three/tsl            →  globalThis.THREE.TSL, plus an `unpackUnorm4x8`
 *                           polyfill ONLY when that TSL lacks it (r184 does;
 *                           r186 exports it, and the polyfill then switches
 *                           itself off). The spread into a fresh object is
 *                           load-bearing: esbuild's CommonJS interop copies OWN
 *                           properties only.
 *   ../libs/fflate.module.js, ../libs/zstddec.module.js  →  throwing stubs.
 *     fflate's gunzipSync allocates the size a gzip trailer CLAIMS; the runtime
 *     inflates .spz itself behind a byte counter. zstddec instantiates its wasm
 *     from a fetch("data:…") the production CSP blocks, so SPZ v4 is refused.
 *
 * Never esbuild's `external:` for the three specifiers — an IIFE cannot import,
 * so an external would ship an unresolvable `require("three")`.
 *
 * Like build.mjs's aframe#5847 patch, every assumption FAILS THE BUILD when it
 * stops holding, rather than shipping a runtime that silently does something
 * else: a splat source whose sha256 differs from splat/README.md, a bare import
 * that is not one of the three above, a stub that is never reached, an input
 * that is not one of the eight files, and an output that still contains a
 * gunzip call, a data: fetch, an import/require, or lacks a private name the
 * loader's splat wrapper reads.
 */
import * as esbuild from 'esbuild';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const splatDir = path.join(root, 'splat');
const outfile = path.join(root, 'js', 'fs-splat-0.1.js');

const SOURCES = [
  'objects/GaussianSplat.js',
  'gpgpu/CountingSort.js',
  'utils/GaussianSplatUtils.js',
  'loaders/SPLATLoader.js',
  'loaders/SPZLoader.js',
  'loaders/GaussianSplatPLYLoader.js',
  'loaders/PLYLoader.js',
  'loaders/KSPLATLoader.js',
];

const ERR_NO_THREE = 'FastShadersSplat: three/webgpu global not found - load the A-Frame bundle first';

function fail(msg) {
  throw new Error(`[build-splat] ${msg}`);
}

// 1. The sources are three's bytes, as splat/README.md states them.
const readme = readFileSync(path.join(splatDir, 'README.md'), 'utf8');
for (const rel of SOURCES) {
  const bytes = readFileSync(path.join(splatDir, rel));
  const sha = createHash('sha256').update(bytes).digest('hex');
  const row = readme.split('\n').find((l) => l.startsWith(`| \`${rel}\``));
  if (!row) fail(`splat/README.md has no row for ${rel}`);
  if (!row.includes(sha)) {
    fail(`splat/${rel} (sha256 ${sha}) is not the file splat/README.md records — the addon sources are never edited; re-copy it from the three tarball and update the table.`);
  }
  if (!row.includes(bytes.length.toLocaleString('en-US'))) fail(`splat/README.md states the wrong size for ${rel}`);
}
// The polyfill exists for exactly one import; if the addon stops importing it,
// re-check what else r186 → r184 needs instead of carrying dead code.
if (!/unpackUnorm4x8,?\s/.test(readFileSync(path.join(splatDir, 'objects/GaussianSplat.js'), 'utf8'))) {
  fail('GaussianSplat.js no longer imports unpackUnorm4x8 — re-check the three/tsl polyfill.');
}

const GUARD = `var T = globalThis.THREE; if (!T || !T.TSL) throw new Error(${JSON.stringify(ERR_NO_THREE)});`;
const POLYFILL =
  "Object.assign({}, T.TSL, { unpackUnorm4x8: T.TSL.Fn(([x]) => T.TSL.vec4(T.TSL.uvec4(x, x.shiftRight(8), x.shiftRight(16), x.shiftRight(24)).bitAnd(T.TSL.uint(0xff))).div(255.0)).setLayout({ name: 'fs_unpackUnorm4x8', type: 'vec4', inputs: [{ name: 'x', type: 'uint' }] }) })";
const VIRTUAL = {
  three: `${GUARD} module.exports = T;`,
  'three/webgpu': `${GUARD} module.exports = T;`,
  'three/tsl': `${GUARD} module.exports = T.TSL.unpackUnorm4x8 ? T.TSL : ${POLYFILL};`,
};
const STUBS = {
  fflate:
    "export function gunzipSync() { throw new Error('FastShadersSplat: .spz is unpacked by FastShadersSplat.parseBytes, never by SPZLoader.parse'); }",
  zstddec:
    "export class ZSTDDecoder { init() { return Promise.reject(new Error('SPZ version 4 (zstd) is not supported - export SPZ v2/v3 or .splat')); } }",
};

const hits = { three: 0, 'three/webgpu': 0, 'three/tsl': 0, fflate: 0, zstddec: 0 };

const globalsPlugin = {
  name: 'fs-global',
  setup(build) {
    // Every BARE specifier comes through here: the three names are answered
    // from the page's global, anything else is a new dependency and a
    // failure (esbuild would otherwise bundle a second three from
    // node_modules, or fail later with a less useful message).
    build.onResolve({ filter: /^[^./]/ }, (args) => {
      if (Object.prototype.hasOwnProperty.call(VIRTUAL, args.path)) {
        hits[args.path]++;
        return { path: args.path, namespace: 'fs-global' };
      }
      return { errors: [{ text: `[build-splat] unexpected bare import "${args.path}" in ${args.importer} — the runtime may only reach three through the page's global.` }] };
    });
    build.onLoad({ filter: /.*/, namespace: 'fs-global' }, (args) => ({ contents: VIRTUAL[args.path], loader: 'js' }));
    build.onResolve({ filter: /^\.\.\/libs\/(fflate|zstddec)\.module\.js$/ }, (args) => {
      const name = /fflate/.test(args.path) ? 'fflate' : 'zstddec';
      if (!args.importer.endsWith(`${path.sep}loaders${path.sep}SPZLoader.js`)) {
        return { errors: [{ text: `[build-splat] ${args.importer} imports ${args.path}; only SPZLoader.js may, and only to reach a stub.` }] };
      }
      hits[name]++;
      return { path: name, namespace: 'fs-stub' };
    });
    build.onLoad({ filter: /.*/, namespace: 'fs-stub' }, (args) => ({ contents: STUBS[args.path], loader: 'js' }));
  },
};

const banner =
  '/*! fs-splat 0.1.0 - the Gaussian-splat runtime for a-frame-shaderloader 0.8 (load it after a-frame-180-a-01.min.js). ' +
  'Bundles three.js r186 examples/jsm GaussianSplat, CountingSort, GaussianSplatUtils and the SPLAT, SPZ, PLY, GaussianSplatPLY and KSPLAT loaders ' +
  '(MIT License, Copyright (c) 2010-2026 three.js authors; the full text is in splat/README.md). Built by build/build-splat.mjs. */';

const result = await esbuild.build({
  entryPoints: [path.join(__dirname, 'entry-splat.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  charset: 'ascii',
  legalComments: 'none',
  banner: { js: banner },
  outfile,
  metafile: true,
  plugins: [globalsPlugin],
  logLevel: 'warning',
});

// 2. Every stub and every three specifier was actually reached (once is enough
//    for the virtual modules — esbuild dedupes by path — and the stubs have
//    exactly one importer, SPZLoader.js).
for (const [name, n] of Object.entries(hits)) {
  if (n === 0) fail(`${name} was never imported — the addon's imports changed; re-check the plugin before shipping.`);
}

// 3. The inputs are the entry, the eight sources and the five virtual modules — nothing else.
const inputs = Object.keys(result.metafile.inputs);
const realFiles = inputs.filter((k) => !k.startsWith('fs-global:') && !k.startsWith('fs-stub:'));
const expected = ['build/entry-splat.js', ...SOURCES.map((s) => `splat/${s}`)].sort();
const got = realFiles.map((k) => path.relative(root, path.resolve(process.cwd(), k)).split(path.sep).join('/')).sort();
if (JSON.stringify(got) !== JSON.stringify(expected)) {
  fail(`unexpected bundle inputs:\n  got      ${got.join(', ')}\n  expected ${expected.join(', ')}`);
}

// 4. The shipped text.
const text = readFileSync(outfile, 'utf8');
const MUST_NOT = ['gunzipSync(', 'fetch("data:', "fetch('data:", 'require("', 'import(', 'from"three', "from'three"];
for (const s of MUST_NOT) if (text.includes(s)) fail(`the built file contains ${JSON.stringify(s)}`);
// What loader 0.8's splat wrapper reads off a GaussianSplat, plus the names a
// page and the drift tests look for.
const MUST = [
  '_buffers', 'centerRead', '_sort', 'orderRead', 'isGaussianSplat', 'splatGeometry',
  'updateSphericalHarmonics', 'updateSort', 'autoSort', 'vSplatColor', 'parseRawSPZ',
  'fs_unpackUnorm4x8', 'FastShadersSplat', 'splat-model',
];
for (const s of MUST) if (!text.includes(s)) fail(`the built file lacks ${JSON.stringify(s)}`);
if (!/^[\x00-\x7f]*$/.test(text)) fail('the built file is not pure ASCII');

console.log(`[build-splat] ${path.relative(root, outfile)}: ${text.length.toLocaleString('en-US')} bytes, sha256 ${createHash('sha256').update(text).digest('hex')}`);
