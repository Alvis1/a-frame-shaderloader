import { Fn, color, mix, mx_noise_float, sin, time } from "three/tsl";

const shader = Fn(() => {
  const time = time;
  const noise = mx_noise_float(uv());
  const color = color(0x14f55b);
  const color2 = color(0xff4d00);
  const sin = sin(time);
  const mix = mix(color2, color, sin);
  const mix2 = mix(mix, 1.9711, noise);

  return mix2;
});

export default shader;
