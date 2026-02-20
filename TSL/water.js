import { vec3, float, uv, time, sin, abs, clamp, mix } from 'three/tsl';

export default function() {
  const vUv = uv();
  const t = time.mul(0.3);
  const scale = float(8.0);
  const u = vUv.x.mul(scale);
  const v = vUv.y.mul(scale);

  // Caustic light pattern: layered sine-wave products
  // Each layer creates diamond-shaped interference at a different frequency
  const c1 = sin(u.add(t)).mul(sin(v.mul(1.3).add(t.mul(0.7))));
  const c2 = sin(u.mul(2.7).add(t.mul(1.3))).mul(sin(v.mul(3.5).add(t.mul(0.9))));
  const c3 = sin(u.mul(4.4).add(t.mul(0.8))).mul(sin(v.mul(5.7).add(t.mul(1.1))));

  // Combine and sharpen: abs(x)^2 creates bright caustic peaks
  const raw = c1.add(c2).add(c3).mul(0.33);
  const sharpened = abs(raw);
  const caustic = sharpened.mul(sharpened).mul(3.0);

  // Color ramp: deep blue -> water blue -> bright caustic highlights
  const deep = vec3(0.01, 0.08, 0.2);
  const mid = vec3(0.1, 0.45, 0.85);
  const bright = vec3(0.3, 0.8, 1.0);

  const col = mix(deep, mid, clamp(caustic, 0.0, 1.0));
  return mix(col, bright, clamp(caustic.sub(0.5).mul(2.0), 0.0, 1.0));
}
