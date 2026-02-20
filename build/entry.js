import AFRAME from 'aframe';
import * as THREE from 'three';
import * as tslTextures from 'tsl-textures';

// A-Frame registers window.AFRAME as a side effect.
// Expose THREE and tsl-textures globally so shims can re-export them.
window.THREE = THREE;
window.tslTextures = tslTextures;
