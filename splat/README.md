# Gaussian-splat sources (vendored from three.js r186)

These are three.js's own Gaussian-splat renderer, its GPU counting sort, its
splat geometry helpers and its four splat file loaders. They are copied byte
for byte from the three 0.186.0 npm tarball (`examples/jsm/`), keeping their
relative layout, and never edited. `build/build-splat.mjs` bundles them into
`js/fs-splat-0.1.js`, the runtime a page loads AFTER `a-frame-180-a-01.min.js`
to get the `splat-model` A-Frame component and `globalThis.FastShadersSplat`.

| File | Copied from (three 0.186.0) | Bytes | sha256 |
|---|---|---|---|
| `objects/GaussianSplat.js` | `examples/jsm/objects/GaussianSplat.js` | 32,105 | `ea3f148d39413ef31781cdbb1c97a8972b2dce01ef5eebe6ef800c2b1ba7ab42` |
| `gpgpu/CountingSort.js` | `examples/jsm/gpgpu/CountingSort.js` | 8,392 | `e9e90b6940a4da923534c3f249e8e7bd2c7603f8b432c54c62ecdc6db4be47e3` |
| `utils/GaussianSplatUtils.js` | `examples/jsm/utils/GaussianSplatUtils.js` | 5,586 | `4b9b010149b3e1a7673de37638365e937e005a03ba706e4cd81301b717d30f54` |
| `loaders/SPLATLoader.js` | `examples/jsm/loaders/SPLATLoader.js` | 3,687 | `5b0557e7604c74c61b236e452f44b43f160a201a1f6517c99cd29a59b83ac703` |
| `loaders/SPZLoader.js` | `examples/jsm/loaders/SPZLoader.js` | 14,902 | `c6f0db88ffbffe2fbd682f520940f63880b7e75edf0911194b0d82ecfd7d78fe` |
| `loaders/GaussianSplatPLYLoader.js` | `examples/jsm/loaders/GaussianSplatPLYLoader.js` | 11,197 | `072def58e1c9d081bb5b3ce2641a652d1075f3a45d778874a38a765cfcd1dd60` |
| `loaders/PLYLoader.js` | `examples/jsm/loaders/PLYLoader.js` | 21,869 | `67b8c1015209b89081a92fdd69dc9df4a61284c3e9f8bb5380e441e4c64e5111` |
| `loaders/KSPLATLoader.js` | `examples/jsm/loaders/KSPLATLoader.js` | 14,309 | `261e89bdcf46f3b3b0f418f598822b9fa1f8b9104fb27ad6ad0b29adcceed456` |

`loaders/PLYLoader.js` is the r186 copy on purpose: `GaussianSplatPLYLoader`
relies on its custom property mapping, and the r184 copy differs.
`loaders/GLTFGaussianSplatLoaderExtension.js` is deliberately NOT here: a
`KHR_gaussian_splatting` glTF is refused (r184's GLTFLoader would hand the
loader raw points).

## Why three r186 on an r184 page

The A-Frame bundle is three r184, and these files come from r186. They build
and run on r184 unchanged except for ONE name: `GaussianSplat.js` imports
`unpackUnorm4x8` from `three/tsl`, which r184 does not export.
`build/build-splat.mjs` answers `three/tsl` with the page's own `THREE.TSL`
plus a six-line `Fn` polyfill named `fs_unpackUnorm4x8`, and only when the
page's TSL lacks the real one, so the day the bundle moves to r186 the polyfill
switches itself off. `three` and `three/webgpu` resolve to `globalThis.THREE`
(never a second copy of three), so the runtime must load after the bundle.

Two imports of `SPZLoader.js` are replaced by throwing stubs at build time, and
neither replacement is an edit of the file:

- `../libs/fflate.module.js`: fflate's `gunzipSync` allocates the output size
  the gzip trailer claims before it inflates a byte, and that number is written
  by whoever made the file. `FastShadersSplat.parseBytes` inflates a `.spz`
  itself, through `DecompressionStream('gzip')` behind a byte counter capped at
  `SPZ_MAX_DECODED_BYTES`, and hands the result to `SPZLoader.parseRawSPZ`.
- `../libs/zstddec.module.js`: the zstd decoder instantiates its WebAssembly
  from a `fetch("data:...")` that the FastShaders build's Content Security
  Policy blocks, so SPZ version 4 (zstd) is refused with a sentence instead.

## Rules

- **Never edit these files.** Re-copy them from the three tarball when the
  revision changes, update this table, and rebuild. `build/build-splat.mjs`
  refuses to build when a file's sha256 differs from its row here, and the
  FastShaders app's `src/vendorSync.test.ts` pins the same hashes.
- **The runtime reads private addon fields.** Loader 0.8's splat wrapper uses
  `GaussianSplat#_buffers.centerRead` and `#_sort.orderRead` (and the named
  varying `vSplatColor`); a re-copy that renames them makes the wrapper warn
  and leave the splat unedited. `src/fsSplatBundle.test.ts` pins those names in
  the built file.
- **Spherical harmonics are dropped at parse** (degree 0 only): a degree-1+
  splat wrapped on the WebGL backend fails to build its vertex shader.

## Licence

three.js is released under the MIT License. The text below is the `LICENSE`
file of the three 0.186.0 package, verbatim; it covers every file in this
folder and the bundle built from them.

```
The MIT License

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```
