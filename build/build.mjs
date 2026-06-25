import * as esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const jsDir = path.join(root, 'js');

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
  logLevel: 'info',
});

// 2. (Removed) tsl-shim.js generation.
// The shaderloader (a-frame-shaderloader-0.4.js) no longer resolves bare TSL
// specifiers to an ESM shim. Its globalizeBareImports() rewrites
// `import { … } from 'three/tsl'` into `const { … } = globalThis.THREE.TSL`,
// reading the SINGLE Three.js instance the IIFE bundle above installs on the
// global. No shim file is emitted; nothing else needs to load it.
