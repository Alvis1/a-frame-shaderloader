import { Fn, color, mix, sin, time } from "three/tsl";

const shader = Fn(() => {
  const color = color(0x14f55b);
  const time = time;
  const color2 = color(0xff4d00);
  const sin = sin(time);
  const mix = mix(color2, color, sin);

  return mix;
});

export default shader;
