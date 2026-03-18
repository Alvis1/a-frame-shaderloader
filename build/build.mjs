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

// 2. Generate combined tsl-shim.js: re-exports THREE, THREE.TSL, and tslTextures as ESM
const THREE = await import(path.join(root, 'node_modules', 'three', 'build', 'three.webgpu.min.js'));
const tslNames = Object.keys(THREE.TSL).sort();
const threeNames = Object.keys(THREE).filter(k => k !== 'default').sort();

// tsl-textures references `window` at top level; polyfill for Node.js
globalThis.window = globalThis;
const tslTex = await import('tsl-textures');
const texNames = Object.keys(tslTex).filter(k => k !== 'default').sort();

const shimSource = [
  '// Auto-generated combined shim — re-exports window.THREE, THREE.TSL, and tslTextures as ESM',
  '// Spread THREE.TSL into a mutable copy so we can patch in fallbacks (THREE.TSL may be frozen)',
  'const _THREE = window.THREE;',
  'const _raw = (_THREE && _THREE.TSL) || {};',
  'const _tex = window.tslTextures || {};',
  'const _TSL = { ..._raw,',
  '  ...(!_raw.hsl && _tex.hsl ? { hsl: _tex.hsl } : {}),',
  '  ...(!_raw.toHsl && _tex.toHsl ? { toHsl: _tex.toHsl } : {}),',
  '};',
  'if (!_THREE || !_THREE.TSL) {',
  "  console.warn('[tsl-shim] THREE.TSL not available — IIFE bundle may not have loaded yet');",
  '}',
  '',
  '// --- THREE (import from \'three\' / \'three/webgpu\') ---',
  'export default _THREE;',
  'export const { ' + threeNames.join(', ') + ' } = _THREE;',
  '',
  '// --- THREE.TSL (import from \'three/tsl\') ---',
  'export const { ' + tslNames.join(', ') + ' } = _TSL;',
  '',
  '// --- tsl-textures (import from \'tsl-textures\') ---',
  'export const { ' + texNames.join(', ') + ' } = _tex;',
  '',
].join('\n');
fs.writeFileSync(path.join(jsDir, 'tsl-shim.js'), shimSource);
console.log(`  js/tsl-shim.js  ${(shimSource.length / 1024).toFixed(1)}kb`);
