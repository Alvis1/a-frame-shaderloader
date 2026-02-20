import { vec3, float, mix, uv, time, mx_fractal_noise_float, clamp } from 'three/tsl';

export default function() {
  const vUv = uv();
  const t = time.mul(0.5);

  // 3D noise coordinates from UV + animated time
  const p = vec3(vUv.x.mul(4.0), vUv.y.mul(4.0), t);

  // Layered fractal noise for organic fire turbulence
  const n1 = mx_fractal_noise_float(p, 4, 2.0, 0.5);
  const n2 = mx_fractal_noise_float(p.mul(2.0).add(vec3(0, t.mul(2.0), 0)), 3, 2.0, 0.4);
  const noise = n1.add(n2).mul(0.5).add(0.5);

  // Fire color ramp: dark red -> orange -> bright yellow
  const darkRed = vec3(0.5, 0.0, 0.0);
  const orange = vec3(1.0, 0.533, 0.0);
  const bright = vec3(1.0, 0.9, 0.2);

  const col = mix(darkRed, orange, clamp(noise, 0.0, 1.0));
  return mix(col, bright, clamp(noise.sub(0.5).mul(2.0), 0.0, 1.0));
}
