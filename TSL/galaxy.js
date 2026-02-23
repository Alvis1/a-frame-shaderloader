import * as THREE from "three";
import {
  Fn,
  add,
  color,
  dot,
  mix,
  mul,
  mx_fractal_noise_float,
  mx_noise_float,
  positionGeometry,
  round,
  sin,
  time,
} from "three/tsl";
import { turbulentSmoke } from "tsl-textures";

const shader = Fn(() => {
  const noise = mx_noise_float(mul(positionGeometry, 14.2915));
  const fractal_noise = mx_fractal_noise_float(
    mul(positionGeometry, 5.9058),
    1,
    1,
    0.5,
  );
  const time = time;
  const color = color(0x8995d2);
  const dot = dot(0, 0);
  const color2 = color(0xcb8567);
  const turbulentSmoke = turbulentSmoke({
    scale: 0.6346,
    speed: 0.2927,
    details: 8.0346,
    seed: 0,
  });
  const sin = sin(time);
  const add = add(sin, 3);
  const mul = mul(turbulentSmoke, add);
  const round = round(mul);
  const mix = mix(color, color2, mul);

  return mix;
});

export default shader;
