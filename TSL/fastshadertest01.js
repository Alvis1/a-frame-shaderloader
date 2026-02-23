// TSL Shader Module — for use with a-frame-shaderloader
//
// HTML setup:
//   <script src="https://cdn.jsdelivr.net/gh/Alvis1/a-frame-shaderloader@main/js/aframe-171-a-0.1.min.js"></script>
//   <script src="https://cdn.jsdelivr.net/gh/Alvis1/a-frame-shaderloader@main/js/a-frame-shaderloader-0.2.js"></script>
//   <a-entity shader="src: shader.js; DispAmount: 0.3"></a-entity>
//
// Properties can be updated at runtime:
//   el.setAttribute('shader', { DispAmount: value });
//
// Also usable directly with Three.js — import from 'three/tsl'

import {
  add,
  clamp,
  color,
  cos,
  float,
  mix,
  mul,
  positionGeometry,
  sin,
  sub,
  time,
  uniform,
  uv,
  vec2,
  positionLocal,
  normalLocal,
} from "three/tsl";
import { runnyEggs } from "tsl-textures";

export const schema = {
  DispAmount: { type: "number", default: 0.3 },
};

export default function (params) {
  const color1 = color(0xffbb00);
  const color2 = color(0x44a260);
  const time1 = time;
  const DispAmount = uniform(float(params.DispAmount));
  const _uv1 = sub(uv(1), vec2(0.5, 0.5));
  const uv1 = add(
    vec2(
      sub(mul(_uv1.x, cos(1)), mul(_uv1.y, sin(1))),
      add(mul(_uv1.x, sin(1)), mul(_uv1.y, cos(1))),
    ),
    vec2(0.5, 0.5),
  );
  const positionGeometry1 = positionGeometry;
  const sin1 = sin(time1);
  const add1 = add(sin1, positionGeometry1);
  const runnyEggs1 = runnyEggs({
    position: add1,
    scale: 0.5831,
    sizeYolk: 0.2,
    sizeWhite: 0.7,
    colorYolk: color(0xffa500),
    colorWhite: color(0xffffff),
    colorBackground: color(0xd3d3d3),
    seed: 0,
  });
  const mix1 = mix(color1, color2, runnyEggs1);
  const clamp1 = clamp(mix1, 0, 1);
  const mul1 = mul(DispAmount, runnyEggs1.y);

  return {
    colorNode: mix1,
    positionNode: positionLocal.add(normalLocal.mul(mul1)),
    uniforms: { DispAmount },
  };
}
