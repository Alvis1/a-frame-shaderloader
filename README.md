# A-Frame ShaderLoader

An A-Frame component that applies [TSL](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language)
(Three.js Shading Language) shaders to any entity — built-in primitives, `.glb`
models, or `.obj` models. Point a `shader="src: …"` attribute at an ES module
that exports a TSL shader and the component compiles it and applies it on the
WebGPU renderer.

It is the runtime half of [FastShaders](https://github.com/Alvis1/FastShaders):
every shader that editor exports is a module in exactly this format.

### [Demo](https://alvis1.github.io/a-frame-shaderloader/) *(pinned to loader 0.4)*

![Screenshot](https://github.com/Alvis1/a-frame-shaderloader/assets/28161082/d1e69f4d-f35e-46a6-877f-d9ba5d4b1153)

## Setup

Two scripts (plus optional orbit controls), no build step, no import map, no
shim:

```html
<script src="https://cdn.jsdelivr.net/gh/Alvis1/a-frame-shaderloader@master/js/a-frame-180-a-01.min.js"></script>
<script src="https://cdn.jsdelivr.net/gh/Alvis1/a-frame-shaderloader@master/js/a-frame-shaderloader-0.5.js"></script>
<!-- optional: orbit camera controls -->
<script src="https://cdn.jsdelivr.net/gh/Alvis1/a-frame-shaderloader@master/js/aframe-orbit-controls.min.js"></script>
```

or the same three files locally:

```html
<script src="js/a-frame-180-a-01.min.js"></script>
<script src="js/a-frame-shaderloader-0.5.js"></script>
<script src="js/aframe-orbit-controls.min.js"></script>
```

> **Note the `@master`.** This repository has no `main` branch, so a `@main`
> URL 404s — and jsDelivr caches the 404, so it does not heal itself. After
> pushing a change, force a refresh with
> `https://purge.jsdelivr.net/gh/Alvis1/a-frame-shaderloader@master/js/<file>`.

**Serve the page over http(s).** The loader `fetch`es the shader module and
imports it as a blob, and browsers block `fetch` on `file:` URLs — opening the
HTML straight from disk leaves the mesh unshaded with `Failed to fetch` in the
console.

### The files

| File | Size | What it is |
| --- | --- | --- |
| `a-frame-180-a-01.min.js` | 1.6 MB | One IIFE bundle of **A-Frame 1.8.0**, **Three.js r184 (WebGPU build)** and [tsl-textures](https://boytchev.github.io/tsl-textures/), built by `build/build.mjs` with esbuild. It installs a single shared `window.THREE` (and `window.tslTextures`) — which is why no import map is needed. |
| `a-frame-shaderloader-0.5.js` | 31 KB | The `shader` component. **Current version.** |
| `a-frame-shaderloader-0.4.js` | 20 KB | **Frozen.** Shaders exported before 0.5 reference it from the CDN, so it must never be edited. New work goes into 0.5 or a bump. |
| `aframe-orbit-controls.min.js` | 25 KB | Optional orbit camera. Not required to apply shaders. |

## Usage

```html
<a-entity gltf-model="#my-model" shader="src: TSL/fire.js"></a-entity>

<a-plane shader="src: TSL/water.js"></a-plane>

<!-- property uniforms become component attributes you can set and animate -->
<!-- illustrative: TSL/lava.js is not shipped, and no module in TSL/ declares
     speed/tint — swap in your own module and property names -->
<a-sphere shader="src: TSL/lava.js; speed: 2.0; tint: #33ccff"></a-sphere>
```

`src` accepts a relative path (a bare one is treated as `./`-relative), a
root-absolute path, any absolute URL, and `blob:` / `data:` URLs — the last two
are special-cased so a sandboxed iframe's `blob:null/<uuid>` still works.

The component re-applies on its entity's `model-loaded`, so it can be set before
a model has finished loading. The material is applied to every mesh inside the
entity's own `mesh` object3D — every mesh of a loaded `.glb`/`.obj` scene — but
not to child entities, which keep their own materials. The originals are
restored on `remove()` or on failure.

## Writing a shader module

A module exports a default function; whatever it returns becomes the material.

### Simple API — return one node

```js
import { color, mix, sin, time } from 'three/tsl';

export default function () {
  return mix(color(0x101820), color(0x33ccff), sin(time).mul(0.5).add(0.5));
}
```

The returned node is assigned to `colorNode`.

### Object API — return named channels

```js
export default function () {
  return {
    colorNode: /* … */,
    emissiveNode: /* … */,
    transparent: true,
  };
}
```

Recognised node channels, in the order they are applied:
`colorNode`, `positionNode`, `normalNode`, `opacityNode`, `roughnessNode`,
`metalnessNode`, `emissiveNode`, `envNode`.

A texture-valued `envNode` becomes real image-based lighting — three's
`EnvironmentNode` wraps it in `pmremTexture()`, giving prefiltered radiance and
irradiance driven by the roughness and metalness channels.

Alongside them, four plain material flags are read when present: `transparent`,
`side`, `alphaTest`, `depthWrite`.

Returning **any** of the eight node channels is what selects the Object API — an
object carrying only flags is treated as the Simple API and assigned to
`colorNode`. Supplying `emissiveNode` with no `colorNode` copies it onto
`colorNode`, because emissive alone renders black on the WebGPU renderer.

The material is always a `THREE.MeshPhysicalNodeMaterial`.

## Property uniforms

Declare a schema and the loader creates the uniforms, exposes each one as an
A-Frame component attribute, and updates the live uniform whenever that
attribute changes.

```js
export const schema = {
  speed: { type: 'number', default: 1.5 },
  tint:  { type: 'color',  default: '#33ccff' },
  tex:   { type: 'map',    default: '#myTexture' },
};

export default function (params) {
  const speed = params.speed;     // ← use the value the loader passes in
  const tint  = params.tint;
  // …
  return { colorNode: /* … */ };
}
```

| Type | Uniform built | Attribute accepts |
| --- | --- | --- |
| `number` *(default)* | float uniform | any number |
| `color` | `THREE.Color` uniform | `#fff`, `#ff0000`, `red`, a `THREE.Color` |
| `map` | TSL texture node | `#id` of an `<img>`/`<canvas>`/`<video>` (or an `<a-asset-item>`'s `src`), a URL, a `url(…)`-wrapped URL, or a DOM element |

An unrecognised `type` silently becomes a float uniform. A `map` default of `''`
means "no default".

> **Use `params.X` directly.** Re-wrapping it —
> `const speed = uniform(float(params.speed))` — builds a *separate* uniform
> node that the loader does not hold a reference to: the attribute and any
> `_propertyUniforms` write then update a node the compiled shader never
> samples, and nothing errors. (`TSL/fastshadertest01.js` in this repo has that
> bug; its `DispAmount` control does nothing.)

If a module exports no schema (or an empty one), the loader scans the source
instead and picks up `params.X` references and `const NAME = uniform(…)`
declarations, typing `uniform(color(0xRRGGBB))` as a colour. Auto-detection
never produces a `map` entry — those need an explicit schema.

Updating at runtime:

```js
el.setAttribute('shader', { speed: 3.0 });
```

For per-frame drives, `component._propertyUniforms[name]` is the escape hatch the
FastShaders preview and Podest both use — dispatching on the uniform's kind
exactly as the loader does: `u.value = 3.0` for a `number`, `u.value.set('#33ccff')`
for a `color` (assigning `.value` there would replace the `THREE.Color` with
something the renderer cannot read), and a `THREE.Texture` for a `map`.

Guard it. The map is `undefined` until an apply gets as far as building the
uniforms — a load that fails *after* that point leaves it populated even though
no material was installed, so use the `shader-applied` event rather than the
map's existence as your readiness signal — and `null` after `remove()`.

Map loading is cached per source, de-duplicated while in flight, and
latest-request-wins, so a slow schema default cannot clobber a newer assignment
and two properties sharing an image do not burn two texture binding slots.

## Events

The component emits two entity events (both bubble):

| Event | Detail | When |
| --- | --- | --- |
| `shader-applied` | `{ src }` | the material is installed |
| `shader-error` | `{ src, message }` | fetch/compile/apply failed — the original materials have been restored |

Both carry a staleness guard, so a superseded load can neither install a
material nor surface an error over a newer shader.

## What the loader does to your source

Before importing the module it runs four transforms, which is what lets an
ordinary `three/tsl` module run against a single global Three.js:

1. **Auto-inject missing `three/tsl` imports** — scans for TSL symbols used but
   not imported and appends them to the existing import list, validating each
   against the real `THREE.TSL` so no non-existent name is ever injected.
   Comments are stripped first — block comments across the whole file, then line
   comments — so a trailing JSON block cannot leak keys into the scan. (String
   literals are *not* stripped, so a TSL name inside a string can still be
   injected as an unused import.)
2. **Fix temporal-dead-zone shadowing** — `const color = color(0x14f55b)`
   renames the binding to `__color`, which is what makes generated code work.
3. **Globalize bare imports** — `import { … } from 'three/tsl'` becomes
   `const { … } = globalThis.THREE.TSL`; `three` and `three/webgpu` map to
   `globalThis.THREE`, `tsl-textures` to `globalThis.tslTextures`. Relative
   specifiers are left alone. (This is why no page-level import map is needed —
   blob modules ignore those anyway.)
4. **Resolve relative imports** to absolute URLs against the module's own URL,
   so a module executed from a blob still reaches its siblings.

## Building the bundle

```bash
npm install
npm run build      # → js/a-frame-180-a-01.min.js
```

esbuild is the only dev dependency; the bundle's contents are pinned by
`package.json` (aframe 1.8.0, super-three 0.184.0, tsl-textures ^3.0.1). The
built file is committed, which is what lets jsDelivr serve it and lets consumers
clone without building.

## License

ISC, as declared in `package.json`.
