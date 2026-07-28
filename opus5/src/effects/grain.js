/**
 * src/effects/grain.js — 미세 필름 그레인 + 비네트 셰이더
 * EffectComposer 의 ShaderPass 에 그대로 넣어 쓴다.
 */

export const GrainVignetteShader = {
  name: 'GrainVignetteShader',

  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.03 },
    uVignette: { value: 1.28 },
    uVignetteSoft: { value: 0.48 },
    uChroma: { value: 0.0011 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uGrain;
    uniform float uVignette;
    uniform float uVignetteSoft;
    uniform float uChroma;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(443.8975, 397.2973));
      p += dot(p, p + 19.19);
      return fract(p.x * p.y);
    }

    void main() {
      vec2 uv = vUv;
      vec2 d = uv - 0.5;
      float r2 = dot(d, d);

      // 화면 가장자리 아주 약한 렌즈 색수차 (배럴)
      vec2 off = d * r2 * uChroma * 4.0;
      vec3 c;
      c.r = texture2D(tDiffuse, uv + off).r;
      c.g = texture2D(tDiffuse, uv).g;
      c.b = texture2D(tDiffuse, uv - off).b;

      // 비네트
      float vig = smoothstep(uVignette, uVignetteSoft, length(d) * 1.414);
      c *= mix(1.0, vig, 0.7);

      // 필름 그레인 — 어두운 곳에서 더 도드라지게
      float n = hash(uv * vec2(1920.0, 1080.0) + fract(uTime) * 137.13);
      float luma = dot(c, vec3(0.299, 0.587, 0.114));
      float amount = uGrain * mix(1.5, 0.4, clamp(luma, 0.0, 1.0));
      c += (n - 0.5) * amount;

      gl_FragColor = vec4(c, 1.0);
    }
  `,
};
