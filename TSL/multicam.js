import * as THREE from 'three';
import { camouflage } from 'tsl-textures';

export default function() {
  return camouflage({
    scale: 2,
    colorA: new THREE.Color(0xC2BEA8),
    colorB: new THREE.Color(0x9C895E),
    colorC: new THREE.Color(0x92A375),
    colorD: new THREE.Color(0x717561),
    seed: 0
  });
}
