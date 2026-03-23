## A-Frame ShaderLoader

An A-Frame component that applies [TSL](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language) (Three.js Shading Language) shaders to any entity — built-in primitives, `.glb` models, or `.obj` models.

### [Demo](https://alvis1.github.io/a-frame-shaderloader/)

![Screenshot](https://github.com/Alvis1/a-frame-shaderloader/assets/28161082/d1e69f4d-f35e-46a6-877f-d9ba5d4b1153)

### Setup

```html
<script src="js/aframe-171-a-0.1.min.js"></script>
<script src="js/a-frame-shaderloader-0.3.js"></script>
```

`aframe-171-a-0.1.min.js` packages A-Frame 1.7, Three.js r173 (WebGPU build), and [tsl-textures](https://boytchev.github.io/tsl-textures/).

`a-frame-shaderloader-0.3.js` handles TDZ fixes, auto-import injection, bare specifier resolution, property uniform schema, and Object API support (`colorNode`, `positionNode`, `normalNode`, etc.).

### Usage

```html
<a-entity gltf-model="#my-model" shader="src: TSL/fire.js"></a-entity>

<a-plane shader="src: TSL/water.js"></a-plane>
```
