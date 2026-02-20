import { vec3, float, time, normalView, positionView, dot, smoothstep, mix, sin } from 'three/tsl';

export default function() {
  // Fresnel-based rim glow (approximates the original's glow + wiggly effect)
  const viewDir = positionView.negate().normalize();
  const NdotV = dot(normalView, viewDir).clamp(0.0, 1.0);
  const rim = float(1.0).sub(NdotV);

  const rimFactor = smoothstep(0.2, 0.8, rim);

  // Blue glow from the original shader
  const glowColor = vec3(0.2, 0.2, 1.6);
  const baseColor = vec3(0.02, 0.02, 0.05);

  // Animated brightness wiggle
  const wiggle = sin(time.mul(3.0)).mul(0.2).add(0.8);

  return mix(baseColor, glowColor, rimFactor.mul(wiggle));
}
