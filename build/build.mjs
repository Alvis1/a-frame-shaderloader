import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const jsDir = path.join(root, 'js');

// 1. IIFE bundle: aframe + three WebGPU + tsl-textures → globals
await esbuild.build({
  entryPoints: [path.join(__dirname, 'entry.js')],
  bundle: true,
  format: 'iife',
  outfile: path.join(jsDir, 'aframe-171-a-0.1.min.js'),
  minify: true,
  alias: {
    'three':        path.join(root, 'node_modules', 'three', 'build', 'three.webgpu.min.js'),
    'three/tsl':    path.join(root, 'node_modules', 'three', 'build', 'three.tsl.min.js'),
    'three/webgpu': path.join(root, 'node_modules', 'three', 'build', 'three.webgpu.min.js'),
  },
  external: ['https://*'],
  logLevel: 'info',
});

// 2. Generate three-tsl shim: re-exports window.THREE.TSL as ESM named exports
const THREE = await import(path.join(root, 'node_modules', 'three', 'build', 'three.webgpu.min.js'));
const tslNames = Object.keys(THREE.TSL).sort();
const shimSource = [
  '// Auto-generated shim — re-exports THREE.TSL from the global scope',
  'const _T = window.THREE.TSL;',
  'export const { ' + tslNames.join(', ') + ' } = _T;',
  '',
].join('\n');
fs.writeFileSync(path.join(jsDir, 'three-tsl-shim.js'), shimSource);
console.log(`  js/three-tsl-shim.js  ${(shimSource.length / 1024).toFixed(1)}kb`);

// 3. Generate three shim: re-exports window.THREE as ESM named exports
const threeNames = Object.keys(THREE).filter(k => k !== 'default').sort();
const threeShimSource = [
  '// Auto-generated shim — re-exports window.THREE as ESM',
  'const _T = window.THREE;',
  'export default _T;',
  'export const { ' + threeNames.join(', ') + ' } = _T;',
  '',
].join('\n');
fs.writeFileSync(path.join(jsDir, 'three-shim.js'), threeShimSource);
console.log(`  js/three-shim.js  ${(threeShimSource.length / 1024).toFixed(1)}kb`);

// 4. Generate tsl-textures shim: re-exports window.tslTextures as ESM
// tsl-textures references `window` at top level; polyfill for Node.js
globalThis.window = globalThis;
const tslTex = await import('tsl-textures');
const texNames = Object.keys(tslTex).filter(k => k !== 'default').sort();
const texShimSource = [
  '// Auto-generated shim — re-exports window.tslTextures as ESM',
  'const _T = window.tslTextures;',
  'export const { ' + texNames.join(', ') + ' } = _T;',
  '',
].join('\n');
fs.writeFileSync(path.join(jsDir, 'tsl-textures-shim.js'), texShimSource);
console.log(`  js/tsl-textures-shim.js  ${(texShimSource.length / 1024).toFixed(1)}kb`);
