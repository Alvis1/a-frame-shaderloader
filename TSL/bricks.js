import { vec3, float, uv, floor, fract, smoothstep, mix, sin } from 'three/tsl';

export default function() {
  const vUv = uv();

  // Brick grid parameters
  const rows = float(8.0);
  const cols = float(4.0);
  const jointW = float(0.04);
  const jointBlur = float(0.015);

  // Scale UVs to brick grid
  const scaledU = vUv.x.mul(cols);
  const scaledV = vUv.y.mul(rows);

  // Alternate row offset (every other row shifts by half a brick)
  const row = floor(scaledV);
  const shift = fract(row.mul(0.5)).mul(2.0).mul(0.5); // 0 or 0.5
  const brickU = fract(scaledU.add(shift));
  const brickV = fract(scaledV);

  // Joint mask: mortar lines between bricks
  // Horizontal joints (top/bottom of each brick)
  const hJoint = smoothstep(float(0.0), jointBlur, brickV.sub(jointW))
    .mul(smoothstep(float(0.0), jointBlur, float(1.0).sub(brickV).sub(jointW)));

  // Vertical joints (left/right of each brick)
  const vJoint = smoothstep(float(0.0), jointBlur, brickU.sub(jointW))
    .mul(smoothstep(float(0.0), jointBlur, float(1.0).sub(brickU).sub(jointW)));

  const brickMask = hJoint.mul(vJoint);

  // Per-brick color variation using cheap hash from row/col indices
  const col = floor(scaledU.add(shift));
  const hash = fract(sin(row.mul(127.1).add(col.mul(311.7))).mul(43758.5453));

  // Brick colors: orange base with gold variation
  const brickBase = vec3(1.0, 0.25, 0.0);
  const brickAlt = vec3(0.816, 0.627, 0.188);
  const brickCol = mix(brickBase, brickAlt, hash);

  // Subtle per-pixel noise from UV for surface roughness
  const noise = fract(sin(vUv.x.mul(1234.5).add(vUv.y.mul(6789.1))).mul(43758.5453));
  const shaded = brickCol.mul(float(0.85).add(noise.mul(0.3)));

  // Mortar color
  const mortarCol = vec3(0.667, 0.667, 0.667);

  return mix(mortarCol, shaded, brickMask);
}
