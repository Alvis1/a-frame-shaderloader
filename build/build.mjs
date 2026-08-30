import * as esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const jsDir = path.join(root, 'js');

/**
 * Carry of aframevr/aframe#5847 — the `backend` renderer property.
 *
 * WHY. This bundle is the three r184 **WebGPU** build, so A-Frame constructs a
 * `WebGPURenderer`, which picks the WebGPU backend whenever `navigator.gpu`
 * exists. three's `XRManager.setSession` then refuses in as many words:
 *
 *   THREE.XRManager: XR is currently not supported with a WebGPU backend.
 *   Use WebGL by passing "{ forceWebGL: true }" to the constructor of the renderer.
 *
 * (It fails before that too: `getContextAttributes()` is called on the context,
 * and a WebGPU context has no such method.) Every page of ours that can enter
 * VR therefore has to force the WebGL2 backend, and until now the only way to
 * do that was to hide `navigator.gpu` with an inline `<script>` before the
 * bundle loads — a global monkey-patch, per document, repeated in five places.
 *
 * `forceWebGL` is a real `WebGPURenderer` constructor option and is already in
 * this bundle; what was missing is A-Frame passing it through. #5847 adds
 * exactly that. It is OPEN, not merged, and A-Frame 1.8.0 (2026-06-23) is still
 * the latest release — so this carries the two hunks that matter until it lands,
 * at which point this plugin is deleted and nothing else changes. Usage:
 * `<a-scene renderer="backend: webgl">`.
 *
 * r185 does NOT remove the need. It landed native WebGPU XR (`XRGPUBinding`),
 * but a WebGPU backend still throws unless the XR session was granted the
 * `"webgpu"` feature, and A-Frame requests only `local-floor`/`bounded-floor`
 * — nor does Quest Browser implement `XRGPUBinding` at all.
 *
 * BACKWARD COMPATIBILITY, and why this may edit `a-01` in place rather than
 * minting a new bundle name. Every already-exported shader loads this file from
 * jsdelivr by URL, so a rebuild ships retroactively. The patch cannot reach
 * them: the whole block is inside `if (this.hasAttribute('renderer'))`, and the
 * new branch is inside `if (rendererAttr.backend)` — `styleParser.parse` only
 * yields keys written in the attribute string, so a page that does not spell
 * `backend:` never touches `forceWebGL`. Verified alongside it that the build is
 * byte-for-byte reproducible from a clean checkout, so a patched rebuild differs
 * from the shipped bundle by this and nothing else.
 *
 * Deliberately NOT carried from #5847: `reversedDepthBuffer`, and the
 * `multiviewStereo` → `multiview` alias. Both change behaviour for pages that
 * already set those keys, which this one cannot.
 */
function patchAframeRenderer() {
  // A-Frame's package `exports` maps the `import` condition to
  // `dist/aframe-master.module.min.js`, so `import AFRAME from 'aframe'`
  // resolves to a PREBUILT MINIFIED bundle and the `src/` tree in node_modules
  // is never read. Patching src/ therefore does nothing — verified via
  // esbuild's metafile, which lists exactly one aframe input, the dist file.
  // So the anchors below are minified. That is tolerable because the version is
  // pinned EXACTLY ("aframe": "1.8.0"), making those bytes fixed, and because a
  // missing anchor fails the build rather than silently shipping an unpatched
  // bundle.
  //
  // In the minified `setupRenderer`, `t` is the parsed `renderer` attribute and
  // `n` is the config object — confirmed from the construction site a few
  // hundred bytes later: `new Re[r](n)`. Both anchors were checked to occur
  // exactly once in the file.
  const AFRAME_DIST = 'aframe-master.module.min.js';
  const edits = [
    {
      what: 'renderer system schema key',
      find: 'antialias:{default:"auto",oneOf:["true","false","auto"]},',
      add: 'backend:{default:"auto",oneOf:["auto","webgl"]},',
    },
    {
      what: 'setupRenderer forceWebGL mapping',
      find: 't.multiviewStereo&&(n.multiviewStereo="true"===t.multiviewStereo),',
      add: 't.backend&&(n.forceWebGL="webgl"===t.backend),',
    },
  ];

  return {
    name: 'aframe-backend-property',
    setup(build) {
      let patched = false;
      build.onLoad({ filter: /aframe-master\.module\.min\.js$/ }, async (args) => {
        const fs = await import('fs/promises');
        let source = await fs.readFile(args.path, 'utf8');
        for (const edit of edits) {
          const hits = source.split(edit.find).length - 1;
          // Fail the BUILD rather than emit an unpatched bundle. An A-Frame
          // upgrade that moves or re-minifies either anchor would otherwise drop
          // the property silently, and the only symptom would be
          // `renderer="backend: webgl"` quietly doing nothing — i.e. VR throwing
          // again, on a headset, much later.
          if (hits !== 1) {
            throw new Error(
              `[aframe-backend-property] expected exactly 1 match for the ${edit.what} ` +
                `in ${AFRAME_DIST}, found ${hits}. A-Frame changed underneath the patch — ` +
                're-check aframevr/aframe#5847; if it has merged, delete this plugin ' +
                'instead of re-anchoring it.',
            );
          }
          source = source.replace(edit.find, edit.find + edit.add);
        }
        patched = true;
        return { contents: source, loader: 'js' };
      });
      build.onEnd(() => {
        if (!patched) {
          throw new Error(
            `[aframe-backend-property] ${AFRAME_DIST} was never loaded — the bundle no ` +
              'longer resolves `aframe` to its prebuilt dist, so this patch did not run.',
          );
        }
      });
    },
  };
}

// 1. IIFE bundle: aframe 1.8.0 + three r184 WebGPU + tsl-textures → globals
await esbuild.build({
  entryPoints: [path.join(__dirname, 'entry.js')],
  bundle: true,
  format: 'iife',
  outfile: path.join(jsDir, 'a-frame-180-a-01.min.js'),
  minify: true,
  alias: {
    'three':        path.join(root, 'node_modules', 'three', 'build', 'three.webgpu.min.js'),
    'three/tsl':    path.join(root, 'node_modules', 'three', 'build', 'three.tsl.min.js'),
    'three/webgpu': path.join(root, 'node_modules', 'three', 'build', 'three.webgpu.min.js'),
  },
  external: ['https://*'],
  plugins: [patchAframeRenderer()],
  logLevel: 'info',
});

// 2. (Removed) tsl-shim.js generation.
// The shaderloader (a-frame-shaderloader-0.4.js) no longer resolves bare TSL
// specifiers to an ESM shim. Its globalizeBareImports() rewrites
// `import { … } from 'three/tsl'` into `const { … } = globalThis.THREE.TSL`,
// reading the SINGLE Three.js instance the IIFE bundle above installs on the
// global. No shim file is emitted; nothing else needs to load it.
