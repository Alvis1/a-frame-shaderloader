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
<script src="https://cdn.jsdelivr.net/gh/Alvis1/a-frame-shaderloader@master/js/a-frame-shaderloader-0.8.js"></script>
<!-- optional: orbit camera controls -->
<script src="https://cdn.jsdelivr.net/gh/Alvis1/a-frame-shaderloader@master/js/aframe-orbit-controls.min.js"></script>
```

or the same three files locally:

```html
<script src="js/a-frame-180-a-01.min.js"></script>
<script src="js/a-frame-shaderloader-0.8.js"></script>
<script src="js/aframe-orbit-controls.min.js"></script>
```

Copy `js/decoders/` beside the loader too if you load Draco-, meshopt-compressed
or KTX2-textured glTF: loaded from an http(s) URL, 0.8 fetches its decoders
from the `decoders/` folder next to its own script, so a local copy without it
answers a compressed model with a 404 and a `model-error`. Alternatively set the
`gltf-model` system's `dracoDecoderPath` (`<a-scene gltf-model="dracoDecoderPath: …">`)
to keep A-Frame's own Draco decoder; meshopt still comes from `js/decoders/`.

The loader must come AFTER the bundle and BEFORE the scene markup. Without
A-Frame on the page it still installs its plain-three.js core — see
[Plain three.js](#plain-threejs-no-a-frame).

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
| `a-frame-180-a-01.min.js` | 1.6 MB | One IIFE bundle of **A-Frame 1.8.0**, **Three.js r184 (WebGPU build)** and [tsl-textures](https://boytchev.github.io/tsl-textures/), built by `build/build.mjs` with esbuild. It installs a single shared `window.THREE` (and `window.tslTextures`) — which is why no import map is needed. It also carries one patch: the [`backend` renderer property](#choosing-the-renderer-backend). |
| `a-frame-shaderloader-0.8.js` | 116 KB | **Current version.** The plain-three.js core (`globalThis.FastShaders`) and the A-Frame `shader` component, which is registered only when A-Frame is on the page. New work goes here, and it is additive only: every edit reaches every shader already exported against it. |
| `a-frame-shaderloader-0.6.js` | 56 KB | **Frozen.** Shaders exported before 0.8 fetch it from the CDN, so it must never be edited. It requires A-Frame at evaluation (it calls `AFRAME.registerComponent` at the top level), including through the `./0.6` package export. |
| `a-frame-shaderloader-0.5.js` | 31 KB | **Frozen.** Shaders exported before 0.6 reference it from the CDN. |
| `a-frame-shaderloader-0.4.js` | 20 KB | **Frozen.** Shaders exported before 0.5 reference it from the CDN. |
| `aframe-orbit-controls.min.js` | 25 KB | Optional orbit camera. Not required to apply shaders. |
| `decoders/` | 865 KB | three r184's glTF Draco decoder (`draco_wasm_wrapper.js` + `draco_decoder.wasm`), its meshopt decoder (`meshopt_decoder.module.js`) and the Basis Universal transcoder KTX2 textures need (`basis_transcoder.js` + `basis_transcoder.wasm`), with the Apache-2.0 text for the Draco AND Basis files in its `README.md`. 0.8 installs them on every `GLTFLoader` and fetches them from beside its own script, only when a model needs them. |


## Choosing the renderer backend

This bundle is the three.js **WebGPU** build, so A-Frame constructs a
`WebGPURenderer`, which takes the WebGPU backend whenever `navigator.gpu`
exists. three then refuses to enter WebXR on it:

> `THREE.XRManager: XR is currently not supported with a WebGPU backend. Use WebGL by passing "{ forceWebGL: true }" to the constructor of the renderer.`

So any page that can enter VR has to force the WebGL2 backend. Set it on the
scene:

```html
<a-scene renderer="backend: webgl">
```

`backend` is `auto` (WebGPU when available, WebGL 2 otherwise) or `webgl`
(three's `forceWebGL`). Measured in Chrome with `navigator.gpu` present:
`backend: webgl` → WebGL2 backend, no attribute → WebGPU backend.

This property is **a patch carried in `build/build.mjs`**, not something A-Frame
ships — it is the relevant half of [aframevr/aframe#5847][pr5847], which is open
at the time of writing while A-Frame 1.8.0 remains the latest release. When that
merges, delete `patchAframeRenderer()` and rebuild; the attribute keeps working.

three r185 does *not* remove the need. It landed native WebGPU XR
(`XRGPUBinding`), but a WebGPU backend still throws unless the XR session was
granted the `"webgpu"` feature — and A-Frame requests only
`local-floor`/`bounded-floor`, while Quest Browser implements no `XRGPUBinding`
at all.

The alternative this replaces is hiding `navigator.gpu` in an inline `<script>`
before the bundle loads. That still works, but it is a global monkey-patch per
document; the attribute is per scene and declarative.

[pr5847]: https://github.com/aframevr/aframe/pull/5847

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
material nor surface an error over a newer shader. `src` is `'model'` for a
shader stored inside the model (see [Shader inside the model](#shader-inside-the-model-src-model)).

## Plain three.js (no A-Frame)

0.8 is a plain three.js loader too. Without A-Frame on the page it installs
`globalThis.FastShaders` and nothing else; with A-Frame it installs the same
object beside the component. Three is pinned to **0.184.0**, the revision the
loader is written for.

```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.webgpu.min.js",
    "three/webgpu": "https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.webgpu.min.js",
    "three/tsl": "https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.tsl.min.js"
  }
}
</script>
<script src="https://cdn.jsdelivr.net/gh/Alvis1/a-frame-shaderloader@master/js/a-frame-shaderloader-0.8.js"></script>
<script type="module">
  import * as THREE from 'three/webgpu';

  FastShaders.use(THREE);                                  // the three/webgpu namespace
  const shader = await FastShaders.load('./myshader.js');  // fetch + the four transforms + import

  const renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  document.body.appendChild(renderer.domElement);
  await renderer.init();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(0, 0, 3);
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 2);
  key.position.set(2, 3, 2);
  scene.add(key);

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.8, 64, 32));
  scene.add(mesh);
  const binding = FastShaders.apply(mesh, shader, { values: { speed: 2 } });

  renderer.setAnimationLoop(() => renderer.render(scene, camera));
</script>
```

`FastShaders.use(THREE)` takes the **`three/webgpu` namespace** (it must carry
`MeshPhysicalNodeMaterial` and `TSL`) and throws on anything else. It also sets
`globalThis.THREE` when the page has none, because a module that bakes a
texture (FastShaders' Image, Data and Colormap nodes) builds it from that
global; it warns when a different instance is already there.

`FastShaders.apply(target, shader, options)` is synchronous and does what the
component does: the uniforms from `schema`, the material (the Simple and Object
APIs, the emissive-to-colour fallback, the four material flags), `parts` by
mesh name, the weld and the barycentric corners. It throws on failure, after
putting the target back. The **Binding** it returns:

| Member | What it is |
| --- | --- |
| `uniforms` | The property uniforms by name, in a null-prototype object |
| `set(name, value)` | Set one: a number, a colour (`'#33ccff'`, a `THREE.Color`) or, for a `map`, a `THREE.Texture`, an element or a URL. `false` for a name the shader does not declare |
| `material`, `parts`, `applied` | The default material, the part materials (a `Map` by mesh name), and what each mesh ended up wearing (by `uuid`) |
| `materialParts` | For a module that returns `materialParts`: `{ status, applied, dropped, expected, found }` (see glTF models below); otherwise `null` |
| `dispose()` | Put the target's own materials and geometry back and release what the apply built. A second call does nothing |
| `target`, `module`, `source`, `url`, `state` | What was applied, to what |

Options: `values` (initial property values), `weld` (`'auto'`, `true` or
`false`), `source` and `url` (see below), and `textures` (your own texture
adapter for `map` values).

**The weld** runs, as under A-Frame, only when the shader displaces
(`positionNode`) and the module does not return `mergeVertices: false`. Under
`'auto'` it runs only on a mesh whose `geometry.type` is one of three's own
primitives (`BoxGeometry`, `SphereGeometry`, …): a loaded model's plain
`BufferGeometry` is never welded, because the rebuild would drop vertex
colours, skin weights and morph targets. `weld: true` welds anyway, and
`weld: false` never does.

**glTF models.** A module may also shade by glTF material index:
`materialParts: { "0": { colorNode, … } }` next to a `modelSignature:
{ materials: [...] }` naming the model's materials in order. The loader learns
which glTF material each mesh came from while the model is PARSED, so register
its plugin on your `GLTFLoader` before loading:

```js
const loader = new GLTFLoader();
loader.register(FastShaders.gltfPlugin);
const gltf = await loader.loadAsync('./model.glb');
FastShaders.apply(gltf.scene, shader);
```

The table applies only when `modelSignature` equals the loaded model exactly
(`FastShaders.modelSignature(gltf)` gives you the value to write). Otherwise, or
without the plugin, it is skipped with one warning and the Binding's
`materialParts.status` says why (`mismatch`, `no-record`, …); `parts` by mesh
name and the default material still apply, and every other mesh wears its
authored material. A clone of `gltf.scene` has no
record. Under A-Frame nothing is needed: the loader registers the plugin on
every `gltf-model` itself.

**Compressed glTF.** `FastShaders.decoders.install(loader)` gives a
`GLTFLoader` the Draco and meshopt decoders in `js/decoders/`, fetched from
beside the loader's script (from jsDelivr, when you load it from there). The
`three/webgpu` namespace has no `DRACOLoader`, so import it from
`three/addons/loaders/DRACOLoader.js` — add a `"three/addons/":
"https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/"` entry to the import
map, where `GLTFLoader` lives too — and pass it to `configure()` first:

```js
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

// KTX2 also needs the renderer: its transcode target depends on what the GPU has.
FastShaders.decoders.configure({ DRACOLoader, KTX2Loader, renderer });
FastShaders.decoders.install(loader); // before loader.loadAsync(…)
```

`LoadingManager` comes from the namespace `use()` bound, and a `resolve(file)`
option points the three file names somewhere else. A decoder that could not be
installed leaves its reason in `FastShaders.decoders.lastError`. Under A-Frame
nothing is needed here either: the loader installs them on every `gltf-model`,
and keeps A-Frame's own Draco decoder when the page set a `dracoDecoderPath`.

**Prefer `load()`.** `apply()` also accepts a module you imported yourself (or
its default export), but then the only source it can read is the default
export's own text. That text is what the schema auto-detection and the weld's
"does it read `uv()`?" test look at, so a `params.x` or a `uv()` outside the
default function goes unseen; pass `{ source }` to supply the whole module.
And an import you do yourself skips the four transforms below, so the module
has to resolve its own `three/tsl` imports through your import map.

### A shader stored inside a .glb

A FastShaders single-GLB export carries its shader module inside the file (see
[Shader inside the model](#shader-inside-the-model-src-model)). With the glTF
plugin registered before loading, `applyFromGltf` runs it on the model and
returns the same Binding `apply()` does:

```js
const loader = new GLTFLoader();
loader.register(FastShaders.gltfPlugin);
const gltf = await loader.loadAsync('./my-shader.glb');
scene.add(gltf.scene);
const binding = await FastShaders.applyFromGltf(gltf, { values: { speed: 2 } });
// …
binding.dispose(); // the model's own materials come back
```

`FastShaders.loadFromGltf(gltf)` gives you the loaded module instead, to
`apply()` to several targets; call its `release()` once every binding using it
is disposed. Both reject, and change nothing, when the file carries no shader
or a damaged one.

**`threeRevision`.** A module that declares `export const threeRevision = '184'`
is compared with the page's three, and so is the loader's own revision. A
mismatch prints one warning per pair and never stops the shader; a value that
is not a plain revision number is ignored.

`FastShaders.fetch` and `FastShaders.importSource` replace `load()`'s two
network legs (the `fetch` and the Blob-URL `import()`), for pages and tests
that need to.

## Shader inside the model (`src: model`)

A FastShaders single-GLB export stores its shader module, and the images that
shader uses, inside the `.glb`. Opt in on the entity that loads it:

```html
<a-entity gltf-model="url(my-shader.glb)" shader="src: model"></a-entity>
```

Property values work as they do with a URL (`shader="src: model; speed: 2"`).
The images come from the same file: each image placeholder in the module
becomes a `blob:` URL of the model's own bytes, alive for as long as the shader
is applied. If the file carries no shader, or a damaged one, the model keeps its
own materials, the console says why, and `shader-error` fires. Relative imports
inside the module resolve against the model's URL. It needs loader 0.8; 0.6
reads `model` as a file path, fails, and keeps the authored materials.

**Never use `src: model` on a page that loads models other people supply: the
shader inside runs with your page's privileges, exactly like a script tag.** A
page that must never run a model's code can call
`FastShaders.disableModelModules()`, a one-way switch.

## What the loader does to your source

Before importing the module it runs four transforms, which is what lets an
ordinary `three/tsl` module run against a single global Three.js. 0.8 runs
0.6's transforms unchanged and exposes them as `FastShaders.transforms`
(`FastShaders.prepareSource(text, moduleUrl)` runs all four in order):

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
