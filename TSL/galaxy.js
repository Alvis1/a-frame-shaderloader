import AFRAME from 'aframe';
import * as THREE from 'three';
import { color, cos, float, mix, range, sin, time, uniform, uv, vec3, vec4, PI2 } from 'three/tsl';

AFRAME.registerComponent('galaxy', {
  schema: {
    count: { type: 'number', default: 20000 }
  },
  init() {
    const material = new THREE.SpriteNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    const size = uniform(0.08);
    material.scaleNode = range(0, 1).mul(size);

    const radiusRatio = range(0, 1);
    const radius = radiusRatio.pow(1.5).mul(5).toVar();

    const branches = 3;
    const branchAngle = range(0, branches).floor().mul(PI2.div(branches));
    const angle = branchAngle.add(time.mul(radiusRatio.oneMinus()));

    const position = vec3(cos(angle), 0, sin(angle)).mul(radius);

    const randomOffset = range(vec3(-1), vec3(1)).pow(3).mul(radiusRatio).add(0.2);

    material.positionNode = position.add(randomOffset);

    const colorInside = uniform(color('#ffa575'));
    const colorOutside = uniform(color('#311599'));
    const colorFinal = mix(colorInside, colorOutside, radiusRatio.oneMinus().pow(2).oneMinus());
    const alpha = float(0.1).div(uv().sub(0.5).length()).sub(0.2);
    material.colorNode = vec4(colorFinal, alpha);

    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, this.data.count);
    this.el.setObject3D('mesh', mesh);

    if (new URLSearchParams(window.location.search).has('debug')) {
      import('three/addons/libs/lil-gui.module.min.js').then(({ GUI }) => {
        const gui = new GUI();
        this.gui = gui;

        gui.add(size, 'value', 0, 1, 0.001).name('size');

        gui
          .addColor({ color: colorInside.value.getHex(THREE.SRGBColorSpace) }, 'color')
          .name('colorInside')
          .onChange(function (value) {
            colorInside.value.set(value);
          });

        gui
          .addColor({ color: colorOutside.value.getHex(THREE.SRGBColorSpace) }, 'color')
          .name('colorOutside')
          .onChange(function (value) {
            colorOutside.value.set(value);
          });
      });
    }
  },
  remove() {
    const mesh = this.el.getObject3D('mesh');
    if (mesh) {
      mesh.material.dispose();
      mesh.geometry.dispose();
      this.el.removeObject3D('mesh');
    }
    if (this.gui) {
      this.gui.destroy();
    }
  }
});
