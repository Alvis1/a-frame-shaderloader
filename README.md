## A-Frame ShaderLoader

An A-Frame component that applies [TSL](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language) (Three.js Shading Language) shaders to any entity — built-in primitives, `.glb` models, or `.obj` models.

### [Demo](https://alvis1.github.io/a-frame-shaderloader/)

![Screenshot](https://github.com/Alvis1/a-frame-shaderloader/assets/28161082/d1e69f4d-f35e-46a6-877f-d9ba5d4b1153)

### Setup

```html
<script src="js/a-frame-180-a-01.min.js"></script>
<script src="js/a-frame-shaderloader-0.4.js"></script>
```

`a-frame-180-a-01.min.js` packages A-Frame 1.8.0, Three.js r184 (WebGPU build), and [tsl-textures](https://boytchev.github.io/tsl-textures/).

`a-frame-shaderloader-0.4.js` handles TDZ fixes, auto-import injection, bare specifier resolution, property uniform schema, and Object API support (`colorNode`, `positionNode`, `normalNode`, etc.).

### Usage

```html
<a-entity gltf-model="#my-model" shader="src: TSL/fire.js"></a-entity>

<a-plane shader="src: TSL/water.js"></a-plane>
```
