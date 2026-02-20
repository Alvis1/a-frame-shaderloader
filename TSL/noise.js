import { vec3, float, time, positionLocal, mx_fractal_noise_float, sin, clamp } from 'three/tsl';

export default function() {
  const pos = positionLocal;
  const t = time;

  // Animate noise coordinates with time-based scrolling
  const coords = vec3(pos.x.add(t.mul(0.1)), pos.y.add(t.mul(0.025)), pos.z);
  const n = mx_fractal_noise_float(coords, 4, 2.0, 0.5);

  // Create smooth stripe pattern from noise
  const stripe = sin(n.mul(20.0).add(t.mul(0.5))).mul(0.5).add(0.5);
  const pattern = clamp(stripe.sub(0.3).mul(5.0), 0.0, 1.0);

  const val = float(1.1).sub(pattern);
  return vec3(val, val, val);
}
