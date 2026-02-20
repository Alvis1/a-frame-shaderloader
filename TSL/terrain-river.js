import { vec3, float, uv, sin, smoothstep, mix } from 'three/tsl';

export default function() {
  const vUv = uv();

  const riverW = float(0.2);
  const riverCol = vec3(0.0, 0.47, 1.0);
  const terrainCol = vec3(0.0, 0.5, 0.0);

  const river = smoothstep(
    float(0.5).sub(riverW),
    float(0.5).add(riverW),
    sin(vUv.x.mul(10.0))
  );

  return mix(terrainCol, riverCol, river);
}
