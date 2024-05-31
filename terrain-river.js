AFRAME.registerComponent('terrain-river', {
  schema: {
    color: {type: 'color', default: '#0077ff'},
    riverWidth: {type: 'number', default: 0.2},
    displacementScale: {type: 'number', default: 1.0}
  },

  init: function () {
    this.el.setAttribute('material', {
      shader: 'terrain-river-shader'
    });
  }
});

AFRAME.registerShader('terrain-river-shader', {
  schema: {
    color: {type: 'color', is: 'uniform'},
    riverWidth: {type: 'number', is: 'uniform'},
    displacementScale: {type: 'number', is: 'uniform'}
  },

  vertexShader: `
    uniform float displacementScale;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      vec3 displacedPosition = position + normal * sin(uv.y * 10.0) * displacementScale;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
    }
  `,

  fragmentShader: `
    uniform vec3 color;
    uniform float riverWidth;
    varying vec2 vUv;
    void main() {
      float river = smoothstep(0.5 - riverWidth, 0.5 + riverWidth, sin(vUv.x * 10.0));
      vec3 terrainColor = mix(vec3(0.0, 0.5, 0.0), color, river);
      gl_FragColor = vec4(terrainColor, 1.0);
    }
  `
});
