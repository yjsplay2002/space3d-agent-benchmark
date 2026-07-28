/**
 * src/effects/lensflare.js — 스크린-스페이스 렌즈플레어 (Chapman 방식)
 *
 * 스프라이트를 씬에 붙이는 방식이 아니라, **렌더 결과의 밝은 픽셀을 직접 추출해서**
 * 렌즈 내부 반사를 흉내 내는 풀스크린 포스트 패스다.
 *
 *   1) bright-pass  — 1/4 해상도. luma threshold + 태양 스크린 위치 주변 공간 마스크.
 *                     궤도 라인의 빛 펄스 같은 잡광이 섞이면 화면이 사이키델릭해지므로
 *                     태양 코어만 남도록 threshold 와 마스크 반경을 좁게 잡는다.
 *   2) features     — UV 를 화면 중심 기준으로 반전시킨 고스트 사슬 5개 + 할로 링 +
 *                     RGB 색수차. fract() 래핑은 쓰지 않는다 — 화면 밖 좌표는
 *                     clamp 가 아니라 "버린다"(0 반환). 안 그러면 화면 전체에
 *                     고스트가 타일링된다.
 *   3) blur         — 분리형 가우시안 (수평 → 수직)
 *   4) composite    — additive. 방사형 미세 변조로 스타버스트 느낌을 준다.
 */

import {
  WebGLRenderTarget,
  ShaderMaterial,
  Vector2,
  Vector3,
  HalfFloatType,
  LinearFilter,
  ClampToEdgeWrapping,
  NoBlending,
} from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/* ── 1) bright-pass ────────────────────────────────────────────────────── */
const BRIGHT_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform float uThreshold;   // 이 밝기 아래는 전부 버린다
uniform float uKnee;        // threshold 부드러운 전환폭
uniform vec2  uSunUv;       // 태양의 스크린 위치 (0..1)
uniform float uSunRadius;   // 공간 마스크 반경 (uv 단위)
uniform float uSunVisible;  // 0 = 화면 밖/가려짐
uniform float uAspect;
varying vec2 vUv;

void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));

  // 소프트 threshold — 태양 코어만 남기고 궤도 빛 펄스 같은 잡광은 버린다
  float w = smoothstep(uThreshold, uThreshold + uKnee, luma);

  // 태양 스크린 위치 주변 공간 마스크. 이게 없으면 밝은 궤도 라인이 전부
  // 고스트가 되어 화면이 무지개색으로 번진다.
  vec2 d = vUv - uSunUv;
  d.x *= uAspect;
  float mask = 1.0 - smoothstep(uSunRadius * 0.55, uSunRadius, length(d));
  mask *= uSunVisible;

  // 과도한 HDR 값은 눌러서 고스트가 뭉개지지 않게
  vec3 outc = c * w * mask;
  outc = min(outc, vec3(3.0));
  gl_FragColor = vec4(outc, 1.0);
}
`;

/* ── 2) 고스트 + 할로 ──────────────────────────────────────────────────── */
/**
 * 고스트는 "화면 중심을 기준으로 UV 를 k 배 확대/축소해서 샘플링"하는 방식이다.
 *   s = center + (uv - center) * k
 * 출력에는 소스가 1/|k| 배 크기로, 중심에서 1/|k| 거리에 나타난다.
 * k 의 부호가 음수면 뒤집힌 고스트(실제 렌즈 반사도 그렇다).
 *
 * 중요: k 를 1 근처나 그 아래로 두면 고스트가 어마어마하게 확대돼 화면을 뒤덮는다.
 * 그래서 |k| 는 항상 1.2 이상으로 고정한다.
 */
const FEATURE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tBright;
uniform int   uGhosts;
uniform float uGhostK[6];        // 고스트별 스케일 계수 (|k| >= 1.2)
uniform float uGhostBright[6];
uniform float uGhostFalloff;
uniform float uHaloScale;
uniform float uHaloThickness;
uniform float uHaloStrength;
uniform float uChroma;           // RGB 색수차 강도 (uv 단위)
uniform float uAspect;
varying vec2 vUv;

// 화면 밖 좌표는 반드시 "버린다". fract() 로 래핑하면 고스트가 화면 전체에 타일링된다.
vec3 sampleClamped(vec2 p) {
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) return vec3(0.0);
  return texture2D(tBright, p).rgb;
}

// 색수차: 중심 방향으로 R/B 를 아주 살짝 어긋나게 뽑는다
vec3 sampleChroma(vec2 p, vec2 dir, float amount) {
  vec3 c;
  c.r = sampleClamped(p + dir * amount).r;
  c.g = sampleClamped(p).g;
  c.b = sampleClamped(p - dir * amount).b;
  return c;
}

void main() {
  // UV 반전 — 렌즈 내부 반사는 광원의 화면 중심 대칭점 쪽으로 늘어선다
  vec2 uv = 1.0 - vUv;
  vec2 center = vec2(0.5);
  vec2 dirN = normalize(center - uv + vec2(1e-6));

  // 출력 픽셀이 화면 중심에서 멀수록 감쇠 (고스트 전체에 걸리는 비네트)
  vec2 dOut = uv - center;
  dOut.x *= uAspect;
  float vign = pow(max(0.0, 1.0 - length(dOut) / 0.78), uGhostFalloff);

  vec3 result = vec3(0.0);

  for (int i = 0; i < 6; i++) {
    if (i >= uGhosts) break;
    float k = uGhostK[i];
    vec2 s = center + (uv - center) * k;

    float fi = float(i);
    vec3 tint = vec3(
      0.92 + 0.08 * sin(fi * 1.9),
      0.88 + 0.12 * sin(fi * 1.9 + 2.1),
      0.94 + 0.10 * sin(fi * 1.9 + 4.2)
    );
    result += sampleChroma(s, dirN, uChroma * (1.0 + fi * 0.45))
            * vign * tint * uGhostBright[i];
  }

  // ── 할로 링 ── 광원을 중심 기준으로 크게 축소해 링 모양으로 깐다
  {
    vec2 s = center + (uv - center) * uHaloScale;
    float rr = length(dOut);
    float ring = 1.0 - smoothstep(0.0, uHaloThickness, abs(rr - 0.30));
    ring *= vign;
    result += sampleChroma(s, dirN, uChroma * 3.0)
            * ring * vec3(1.0, 0.9, 0.78) * uHaloStrength;
  }

  gl_FragColor = vec4(result, 1.0);
}
`;

/* ── 3) 분리형 가우시안 블러 ───────────────────────────────────────────── */
const BLUR_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uDirection;   // 픽셀 단위 방향 (1/w,0) 또는 (0,1/h)
varying vec2 vUv;

void main() {
  // 9탭 가우시안
  float w[5];
  w[0] = 0.227027; w[1] = 0.194594; w[2] = 0.121621; w[3] = 0.054054; w[4] = 0.016216;
  vec3 sum = texture2D(tDiffuse, vUv).rgb * w[0];
  for (int i = 1; i < 5; i++) {
    vec2 o = uDirection * float(i) * 1.35;
    sum += texture2D(tDiffuse, vUv + o).rgb * w[i];
    sum += texture2D(tDiffuse, vUv - o).rgb * w[i];
  }
  gl_FragColor = vec4(sum, 1.0);
}
`;

/* ── 4) additive 합성 ──────────────────────────────────────────────────── */
const COMPOSITE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform sampler2D tFlare;
uniform float uIntensity;
uniform vec2  uSunUv;
uniform float uSunVisible;
uniform float uAspect;
uniform float uTime;
varying vec2 vUv;

void main() {
  vec3 base = texture2D(tDiffuse, vUv).rgb;
  vec3 flare = texture2D(tFlare, vUv).rgb;

  // 방사형 미세 변조 — 스타버스트(빛 갈래) 느낌
  vec2 d = vUv - uSunUv;
  d.x *= uAspect;
  float r = length(d);
  float ang = atan(d.y, d.x);
  float burst =
      0.45
    + 0.34 * pow(abs(cos(ang * 5.0 + uTime * 0.05)), 7.0)
    + 0.18 * pow(abs(cos(ang * 11.0 - uTime * 0.03)), 11.0);
  float radial = exp(-r * 5.5);
  vec3 streak = vec3(1.0, 0.86, 0.66) * burst * radial * 0.19 * uSunVisible;

  gl_FragColor = vec4(base + flare * uIntensity + streak, 1.0);
}
`;

export class LensFlarePass extends Pass {
  /**
   * @param {number} width
   * @param {number} height
   * @param {object} [opts]
   */
  constructor(width, height, opts = {}) {
    super();
    this.needsSwap = true;

    this.intensity = opts.intensity ?? 0.5;
    // 태양 코어만 잡히도록 높게. 낮추면 궤도 빛 펄스가 전부 고스트로 번진다.
    this.threshold = opts.threshold ?? 3.2;
    this.sunUv = new Vector2(0.5, 0.5);
    this.sunVisible = 0;
    this.sunRadius = opts.sunRadius ?? 0.07;
    this.time = 0;

    const rtOpts = {
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      wrapS: ClampToEdgeWrapping,
      wrapT: ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    };
    const qw = Math.max(1, Math.floor(width / 4));
    const qh = Math.max(1, Math.floor(height / 4));

    this.rtBright = new WebGLRenderTarget(qw, qh, rtOpts);
    this.rtFeature = new WebGLRenderTarget(qw, qh, rtOpts);
    this.rtBlurA = new WebGLRenderTarget(qw, qh, rtOpts);
    this.rtBlurB = new WebGLRenderTarget(qw, qh, rtOpts);

    this.rtBright.texture.name = 'LensFlare.bright';
    this.rtFeature.texture.name = 'LensFlare.feature';

    const mk = (frag, uniforms) =>
      new ShaderMaterial({
        uniforms,
        vertexShader: QUAD_VERT,
        fragmentShader: frag,
        blending: NoBlending,
        depthTest: false,
        depthWrite: false,
      });

    this.matBright = mk(BRIGHT_FRAG, {
      tDiffuse: { value: null },
      uThreshold: { value: this.threshold },
      uKnee: { value: 1.4 },
      uSunUv: { value: new Vector2(0.5, 0.5) },
      uSunRadius: { value: this.sunRadius },
      uSunVisible: { value: 0 },
      uAspect: { value: width / height },
    });

    // 고스트 사슬 5개 — |k| >= 1.2 로 두어 확대 폭주를 막는다.
    // 음수 k 는 뒤집힌 고스트 (중심 반대편에 생긴다).
    this.matFeature = mk(FEATURE_FRAG, {
      tBright: { value: null },
      uGhosts: { value: Math.min(6, opts.ghosts ?? 5) },
      uGhostK: { value: opts.ghostK ?? [-2.35, -1.45, 1.28, 1.95, 3.2, 4.6] },
      uGhostBright: { value: opts.ghostBright ?? [0.34, 0.26, 0.42, 0.3, 0.2, 0.14] },
      uGhostFalloff: { value: opts.falloff ?? 2.0 },
      uHaloScale: { value: opts.haloScale ?? 2.9 },
      uHaloThickness: { value: opts.haloThickness ?? 0.13 },
      uHaloStrength: { value: opts.haloStrength ?? 0.5 },
      uChroma: { value: opts.chroma ?? 0.0032 },
      uAspect: { value: width / height },
    });

    this.matBlur = mk(BLUR_FRAG, {
      tDiffuse: { value: null },
      uDirection: { value: new Vector2() },
    });

    this.matComposite = mk(COMPOSITE_FRAG, {
      tDiffuse: { value: null },
      tFlare: { value: null },
      uIntensity: { value: this.intensity },
      uSunUv: { value: new Vector2(0.5, 0.5) },
      uSunVisible: { value: 0 },
      uAspect: { value: width / height },
      uTime: { value: 0 },
    });

    this.quad = new FullScreenQuad(this.matBright);
    this._v = new Vector3();
    this.setSize(width, height);
  }

  /**
   * 태양의 월드 좌표를 스크린 UV 로 투영한다.
   * 화면 밖이거나 카메라 뒤에 있으면 sunVisible 을 0 으로 만들어 플레어를 끈다.
   */
  updateSun(sunWorldPos, camera, extraVisibility = 1) {
    this._v.copy(sunWorldPos).project(camera);
    const behind = this._v.z > 1;
    const u = this._v.x * 0.5 + 0.5;
    const v = this._v.y * 0.5 + 0.5;
    this.sunUv.set(u, v);

    // 화면 가장자리를 벗어날수록 부드럽게 감쇠
    const mx = Math.max(0, Math.max(-u, u - 1));
    const my = Math.max(0, Math.max(-v, v - 1));
    const edge = Math.max(0, 1 - Math.max(mx, my) / 0.35);
    this.sunVisible = behind ? 0 : edge * Math.max(0, Math.min(1, extraVisibility));
  }

  setSize(width, height) {
    const qw = Math.max(1, Math.floor(width / 4));
    const qh = Math.max(1, Math.floor(height / 4));
    this.rtBright.setSize(qw, qh);
    this.rtFeature.setSize(qw, qh);
    this.rtBlurA.setSize(qw, qh);
    this.rtBlurB.setSize(qw, qh);
    this._qw = qw;
    this._qh = qh;
    const aspect = width / height;
    this.matBright.uniforms.uAspect.value = aspect;
    this.matFeature.uniforms.uAspect.value = aspect;
    this.matComposite.uniforms.uAspect.value = aspect;
  }

  render(renderer, writeBuffer, readBuffer, deltaTime) {
    const prevTarget = renderer.getRenderTarget();
    this.time += deltaTime || 0.016;

    // 태양이 안 보이면 플레어 계산 자체를 건너뛴다 (모바일 성능)
    if (this.sunVisible <= 0.001) {
      if (this.renderToScreen) {
        this.matComposite.uniforms.tDiffuse.value = readBuffer.texture;
        this.matComposite.uniforms.tFlare.value = this.rtBlurB.texture;
        this.matComposite.uniforms.uIntensity.value = 0;
        this.matComposite.uniforms.uSunVisible.value = 0;
        this.quad.material = this.matComposite;
        renderer.setRenderTarget(null);
        this.quad.render(renderer);
        renderer.setRenderTarget(prevTarget);
        return;
      }
      // 통과: 아무것도 하지 않고 needsSwap 을 끈다
      this.needsSwap = false;
      return;
    }
    this.needsSwap = true;

    // 1) bright-pass
    const bu = this.matBright.uniforms;
    bu.tDiffuse.value = readBuffer.texture;
    bu.uThreshold.value = this.threshold;
    bu.uSunUv.value.copy(this.sunUv);
    bu.uSunRadius.value = this.sunRadius;
    bu.uSunVisible.value = this.sunVisible;
    this.quad.material = this.matBright;
    renderer.setRenderTarget(this.rtBright);
    renderer.clear();
    this.quad.render(renderer);

    // 2) 고스트 + 할로 + 색수차
    this.matFeature.uniforms.tBright.value = this.rtBright.texture;
    this.quad.material = this.matFeature;
    renderer.setRenderTarget(this.rtFeature);
    renderer.clear();
    this.quad.render(renderer);

    // 3) 분리형 가우시안 블러 (수평 → 수직)
    this.matBlur.uniforms.tDiffuse.value = this.rtFeature.texture;
    this.matBlur.uniforms.uDirection.value.set(1 / this._qw, 0);
    this.quad.material = this.matBlur;
    renderer.setRenderTarget(this.rtBlurA);
    renderer.clear();
    this.quad.render(renderer);

    this.matBlur.uniforms.tDiffuse.value = this.rtBlurA.texture;
    this.matBlur.uniforms.uDirection.value.set(0, 1 / this._qh);
    renderer.setRenderTarget(this.rtBlurB);
    renderer.clear();
    this.quad.render(renderer);

    // 4) additive 합성
    const cu = this.matComposite.uniforms;
    cu.tDiffuse.value = readBuffer.texture;
    cu.tFlare.value = this.rtBlurB.texture;
    cu.uIntensity.value = this.intensity;
    cu.uSunUv.value.copy(this.sunUv);
    cu.uSunVisible.value = this.sunVisible;
    cu.uTime.value = this.time;
    this.quad.material = this.matComposite;

    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.quad.render(renderer);
    renderer.setRenderTarget(prevTarget);
  }

  dispose() {
    this.rtBright.dispose();
    this.rtFeature.dispose();
    this.rtBlurA.dispose();
    this.rtBlurB.dispose();
    this.matBright.dispose();
    this.matFeature.dispose();
    this.matBlur.dispose();
    this.matComposite.dispose();
    this.quad.dispose();
  }
}
