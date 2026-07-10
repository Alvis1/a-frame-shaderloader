## A-Frame ShaderLoader

An A-Frame component that applies [TSL](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language) (Three.js Shading Language) shaders to any entity — built-in primitives, `.glb` models, or `.obj` models. Point a `shader="src: …"` attribute at an ES module that exports a TSL shader and the component compiles and applies it on the WebGPU renderer.

### [Demo](https://alvis1.github.io/a-frame-shaderloader/)

![Screenshot](https://github.com/Alvis1/a-frame-shaderloader/assets/28161082/d1e69f4d-f35e-46a6-877f-d9ba5d4b1153)

### Setup

```html
<script src="js/a-frame-180-a-01.min.js"></script>
<script src="js/a-frame-shaderloader-0.4.js"></script>
<!-- optional: orbit camera controls -->
<script src="js/aframe-orbit-controls.min.js"></script>
```

Or load straight from the jsDelivr CDN (no build step):

```html
<script src="https://cdn.jsdelivr.net/gh/Alvis1/a-frame-shaderloader@main/js/a-frame-180-a-01.min.js"></script>
<script src="https://cdn.jsdelivr.net/gh/Alvis1/a-frame-shaderloader@main/js/a-frame-shaderloader-0.4.js"></script>
```

**`a-frame-180-a-01.min.js`** is a single IIFE bundle (built by `build/build.mjs` with esbuild) of **A-Frame 1.8.0**, **Three.js r184 (WebGPU build)**, and **[tsl-textures](https://boytchev.github.io/tsl-textures/)**. It installs one shared `window.THREE` (and `window.tslTextures`), so **no import map and no shim file are required**.

**`a-frame-shaderloader-0.4.js`** is the `shader` component itself. Given an ES-module `src`, it:

- rewrites the module's `import { … } from 'three/tsl'` into `const { … } = globalThis.THREE.TSL` (`globalizeBareImports`), so the shader reads the bundle's single Three.js instance;
- fixes Temporal Dead Zone ordering and injects any missing `three/tsl` imports at runtime;
- detects the **Object API** (multi-channel modules exposing any of `colorNode` / `positionNode` / `normalNode` / `opacityNode` / `roughnessNode` / `metalnessNode` / `emissiveNode`) vs the **Simple API** (a single default node);
- manages **property uniforms**: reads `export const schema` (or auto-detects `const NAME = uniform(value)` declarations), exposes each as an A-Frame component attribute, and updates the live TSL uniform whenever that attribute changes.

`aframe-orbit-controls.min.js` is also included for an optional orbit camera; it is not required to apply shaders.

### Usage

```html
<a-entity gltf-model="#my-model" shader="src: TSL/fire.js"></a-entity>

<a-plane shader="src: TSL/water.js"></a-plane>

<!-- property uniforms become component attributes you can set and animate -->
<a-sphere shader="src: TSL/lava.js; speed: 2.0; glow: 0.8"></a-sphere>
```
