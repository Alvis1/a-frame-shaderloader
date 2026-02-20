import * as THREE from 'three';
import { vec3, float, uv, time, abs, clamp, mix, floor, fract, step, length } from 'three/tsl';

export default function() {
  const vUv = uv();
  const t = time;

  // Edge detection for border
  const borderUv = abs(vUv.sub(0.5).mul(2.0));
  const edgeW = float(0.1);
  const sharp = float(100.0);

  const lr = clamp(borderUv.x.sub(float(1.0).sub(edgeW)).mul(sharp), 0.0, 1.0);
  const ud = clamp(borderUv.y.sub(float(1.0).sub(edgeW)).mul(sharp), 0.0, 1.0);

  // Marching ants animation: alternating segments via mod(floor, 2)
  const antUv = vUv.mul(10.0);
  const antOff = t;
  const antX = step(0.25, fract(floor(antUv.x.add(antOff)).mul(0.5)));
  const antY = step(0.25, fract(floor(antUv.y.add(antOff)).mul(0.5)));

  const border = clamp(ud.mul(antX).add(lr.mul(antY)), 0.0, 1.0);
  const borderCol = vec3(0.41, 1.0, 0.75);

  // Circular gradient background
  const dist = length(vUv.sub(0.5)).mul(0.91);
  const grad = mix(vec3(0.21, 1.0, 0.32), vec3(0.0, 0.0, 0.0), dist);

  return {
    colorNode: mix(grad.mul(0.3), borderCol, border.mul(0.9)),
    opacityNode: clamp(border.add(0.15), 0.0, 1.0),
    transparent: true,
    side: THREE.DoubleSide
  };
}
