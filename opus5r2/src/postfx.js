/**
 * postfx.js — 커스텀 후처리 패스
 *
 *  1) LensFlarePass — John Chapman 방식의 **스크린 스페이스** 렌즈플레어.
 *     스프라이트를 붙이는 방식이 아니라, 렌더 결과에서 실제로 밝은 픽셀을
 *     threshold 로 뽑아내 고스트/할로를 만든다.
 *       ① bright-pass (1/4 해상도, luma threshold + 태양 스크린 위치 공간 마스크)
 *       ② UV 반전 고스트 사슬 5개 + 할로 링 + RGB 색수차
 *          — fract 래핑을 쓰지 않는다. 화면 밖 소스는 버려서 타일링을 막는다.
 *       ③ 분리형 가우시안 블러 (가로 → 세로)
 *       ④ additive 합성 + 방사형 미세 변조(스타버스트)
 *
 *  2) FilmVignetteShader — 미세 필름 그레인 + 비네트.
 */

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/* ══════════════════════════════════════════════════════════════
   공통 정점 셰이더
   ══════════════════════════════════════════════════════════════ */

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/* ── ① bright pass ─────────────────────────────────────────── */

const BRIGHT_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tDiffuse;
  uniform float uThreshold;
  uniform float uKnee;
  uniform vec2  uSunUv;       // 태양의 스크린 UV
  uniform float uSunVisible;  // 0 = 화면 밖/가려짐
  uniform float uMaskRadius;  // 태양 주변 공간 마스크 반경(UV)
  uniform float uAspect;
  varying vec2 vUv;

  void main() {
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));

    // soft-knee threshold — 태양 코어만 남긴다
    float k = smoothstep(uThreshold, uThreshold + uKnee, luma);

    // 공간 마스크: 궤도 빛 펄스·행성 같은 잡광이 고스트로 번지는 것을 막는다
    vec2 d = (vUv - uSunUv) * vec2(uAspect, 1.0);
    float dist = length(d);
    float mask = 1.0 - smoothstep(uMaskRadius * 0.55, uMaskRadius, dist);

    vec3 outc = c * k * mask * uSunVisible;
    gl_FragColor = vec4(outc, 1.0);
  }
`;

/* ── ② 고스트 사슬 + 할로 + 색수차 ─────────────────────────── */

const FEATURE_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tBright;
  uniform float uGhostCount;
  uniform float uDispersal;
  uniform float uHaloWidth;
  uniform float uDistortion;   // RGB 색수차 세기
  uniform float uAspect;
  varying vec2 vUv;

  /**
   * 색수차 샘플링: 채널마다 아주 살짝 다른 위치를 본다.
   * 화면 밖(0~1 밖)은 **버린다** — fract 래핑을 쓰면 화면 전체에 고스트가
   * 타일링되어 사이키델릭해진다.
   */
  vec3 sampleChroma(sampler2D tex, vec2 uv, vec2 dir, float amount) {
    vec3 result = vec3(0.0);
    vec2 uvR = uv + dir * amount;
    vec2 uvG = uv;
    vec2 uvB = uv - dir * amount;

    if (uvR.x >= 0.0 && uvR.x <= 1.0 && uvR.y >= 0.0 && uvR.y <= 1.0)
      result.r = texture2D(tex, uvR).r;
    if (uvG.x >= 0.0 && uvG.x <= 1.0 && uvG.y >= 0.0 && uvG.y <= 1.0)
      result.g = texture2D(tex, uvG).g;
    if (uvB.x >= 0.0 && uvB.x <= 1.0 && uvB.y >= 0.0 && uvB.y <= 1.0)
      result.b = texture2D(tex, uvB).b;
    return result;
  }

  /** 반경에 따른 렌즈 착색 (Chapman 의 lens color LUT 를 해석적으로) */
  vec3 lensTint(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 a = vec3(1.00, 0.62, 0.30);   // 중심부: 따뜻한 앰버
    vec3 b = vec3(0.55, 0.85, 1.00);   // 중간: 시안
    vec3 c = vec3(0.72, 0.55, 1.00);   // 바깥: 보라
    return t < 0.5 ? mix(a, b, t * 2.0) : mix(b, c, (t - 0.5) * 2.0);
  }

  void main() {
    // 화면 중심 기준 UV 반전
    vec2 uv = vec2(1.0) - vUv;
    vec2 ghostVec = (vec2(0.5) - uv) * uDispersal;
    vec2 dir = normalize(ghostVec + vec2(1e-6));

    vec3 result = vec3(0.0);

    // ── 고스트 사슬
    for (int i = 0; i < 5; i++) {
      if (float(i) >= uGhostCount) break;
      vec2 offset = uv + ghostVec * float(i);

      // 화면 밖은 클램프가 아니라 **버린다**
      if (offset.x < 0.0 || offset.x > 1.0 || offset.y < 0.0 || offset.y > 1.0) continue;

      float d = length(vec2(0.5) - offset) / length(vec2(0.5));
      float weight = pow(1.0 - clamp(d, 0.0, 1.0), 2.6);

      vec3 s = sampleChroma(tBright, offset, dir, uDistortion * (1.0 + float(i) * 0.35));
      result += s * weight * lensTint(d);
    }

    // ── 할로 링
    {
      vec2 haloVec = dir * uHaloWidth;
      vec2 offset = uv + haloVec;
      if (offset.x >= 0.0 && offset.x <= 1.0 && offset.y >= 0.0 && offset.y <= 1.0) {
        float d = length(vec2(0.5) - uv) / length(vec2(0.5));
        float weight = pow(1.0 - clamp(abs(d - 0.42) * 2.6, 0.0, 1.0), 3.0);
        vec3 s = sampleChroma(tBright, offset, dir, uDistortion * 2.2);
        result += s * weight * lensTint(0.62) * 1.25;
      }
    }

    gl_FragColor = vec4(result, 1.0);
  }
`;

/* ── ③ 분리형 가우시안 블러 ────────────────────────────────── */

const BLUR_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tDiffuse;
  uniform vec2 uDirection;   // (1/w, 0) 또는 (0, 1/h)
  varying vec2 vUv;

  void main() {
    // 9-tap 가우시안 (선형 샘플링 최적화)
    float w0 = 0.227027;
    float w1 = 0.316216;
    float w2 = 0.070270;
    vec3 sum = texture2D(tDiffuse, vUv).rgb * w0;
    sum += texture2D(tDiffuse, vUv + uDirection * 1.3846153846).rgb * w1;
    sum += texture2D(tDiffuse, vUv - uDirection * 1.3846153846).rgb * w1;
    sum += texture2D(tDiffuse, vUv + uDirection * 3.2307692308).rgb * w2;
    sum += texture2D(tDiffuse, vUv - uDirection * 3.2307692308).rgb * w2;
    gl_FragColor = vec4(sum, 1.0);
  }
`;

/* ── ④ additive 합성 ───────────────────────────────────────── */

const COMPOSITE_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tDiffuse;
  uniform sampler2D tFlare;
  uniform float uIntensity;
  uniform vec2  uSunUv;
  uniform float uAspect;
  uniform float uStarburst;
  varying vec2 vUv;

  void main() {
    vec3 base = texture2D(tDiffuse, vUv).rgb;
    vec3 flare = texture2D(tFlare, vUv).rgb;

    // 방사형 미세 변조 — 스타버스트 느낌
    vec2 d = (vUv - uSunUv) * vec2(uAspect, 1.0);
    float ang = atan(d.y, d.x);
    float star =
      0.72 +
      0.18 * (0.5 + 0.5 * cos(ang * 12.0)) +
      0.10 * (0.5 + 0.5 * cos(ang * 30.0 + 1.7));
    flare *= mix(1.0, star, uStarburst);

    gl_FragColor = vec4(base + flare * uIntensity, 1.0);
  }
`;

/* ══════════════════════════════════════════════════════════════
   LensFlarePass
   ══════════════════════════════════════════════════════════════ */

export class LensFlarePass extends Pass {
  constructor(width, height, options = {}) {
    super();
    this.needsSwap = true;

    this.downscale = options.downscale ?? 4;
    const w = Math.max(1, Math.floor(width / this.downscale));
    const h = Math.max(1, Math.floor(height / this.downscale));

    const rtOpts = {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    };
    this.rtBright = new THREE.WebGLRenderTarget(w, h, rtOpts);
    this.rtFeature = new THREE.WebGLRenderTarget(w, h, rtOpts);
    this.rtBlur = new THREE.WebGLRenderTarget(w, h, rtOpts);

    this.brightMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uThreshold: { value: options.threshold ?? 1.55 },
        uKnee: { value: options.knee ?? 0.7 },
        uSunUv: { value: new THREE.Vector2(0.5, 0.5) },
        uSunVisible: { value: 0 },
        uMaskRadius: { value: options.maskRadius ?? 0.14 },
        uAspect: { value: width / height },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: BRIGHT_FRAG,
      depthTest: false,
      depthWrite: false,
    });

    this.featureMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tBright: { value: this.rtBright.texture },
        uGhostCount: { value: options.ghosts ?? 5 },
        uDispersal: { value: options.dispersal ?? 0.29 },
        uHaloWidth: { value: options.haloWidth ?? 0.46 },
        uDistortion: { value: options.distortion ?? 0.008 },
        uAspect: { value: width / height },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: FEATURE_FRAG,
      depthTest: false,
      depthWrite: false,
    });

    this.blurMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uDirection: { value: new THREE.Vector2() },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: BLUR_FRAG,
      depthTest: false,
      depthWrite: false,
    });

    this.compositeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tFlare: { value: this.rtBlur.texture },
        uIntensity: { value: options.intensity ?? 0.5 },
        uSunUv: { value: this.brightMaterial.uniforms.uSunUv.value },
        uAspect: { value: width / height },
        uStarburst: { value: options.starburst ?? 0.85 },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: COMPOSITE_FRAG,
      depthTest: false,
      depthWrite: false,
    });

    this.fsQuad = new FullScreenQuad(null);

    /** 외부에서 매 프레임 갱신 */
    this.sunScreen = this.brightMaterial.uniforms.uSunUv.value;
    this.enabledFlare = true;
  }

  /** 태양의 스크린 UV(0~1)와 가시성(0~1)을 알려준다 */
  setSun(uvX, uvY, visible) {
    this.sunScreen.set(uvX, uvY);
    this.brightMaterial.uniforms.uSunVisible.value = visible;
  }

  setSize(width, height) {
    const w = Math.max(1, Math.floor(width / this.downscale));
    const h = Math.max(1, Math.floor(height / this.downscale));
    this.rtBright.setSize(w, h);
    this.rtFeature.setSize(w, h);
    this.rtBlur.setSize(w, h);
    const aspect = width / height;
    this.brightMaterial.uniforms.uAspect.value = aspect;
    this.featureMaterial.uniforms.uAspect.value = aspect;
    this.compositeMaterial.uniforms.uAspect.value = aspect;
    this._w = w;
    this._h = h;
  }

  render(renderer, writeBuffer, readBuffer) {
    const oldTarget = renderer.getRenderTarget();
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    const w = this.rtBright.width;
    const h = this.rtBright.height;

    // ① bright pass
    this.brightMaterial.uniforms.tDiffuse.value = readBuffer.texture;
    this.fsQuad.material = this.brightMaterial;
    renderer.setRenderTarget(this.rtBright);
    renderer.clear();
    this.fsQuad.render(renderer);

    // ② 고스트 + 할로 + 색수차
    this.fsQuad.material = this.featureMaterial;
    renderer.setRenderTarget(this.rtFeature);
    renderer.clear();
    this.fsQuad.render(renderer);

    // ③ 분리형 가우시안 블러 (가로 → 세로)
    this.blurMaterial.uniforms.tDiffuse.value = this.rtFeature.texture;
    this.blurMaterial.uniforms.uDirection.value.set(1 / w, 0);
    this.fsQuad.material = this.blurMaterial;
    renderer.setRenderTarget(this.rtBlur);
    renderer.clear();
    this.fsQuad.render(renderer);

    this.blurMaterial.uniforms.tDiffuse.value = this.rtBlur.texture;
    this.blurMaterial.uniforms.uDirection.value.set(0, 1 / h);
    renderer.setRenderTarget(this.rtFeature);
    renderer.clear();
    this.fsQuad.render(renderer);

    // ④ additive 합성
    this.compositeMaterial.uniforms.tDiffuse.value = readBuffer.texture;
    this.compositeMaterial.uniforms.tFlare.value = this.rtFeature.texture;
    this.fsQuad.material = this.compositeMaterial;

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
      this.fsQuad.render(renderer);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
      this.fsQuad.render(renderer);
    }

    renderer.autoClear = oldAutoClear;
    renderer.setRenderTarget(oldTarget);
  }

  dispose() {
    this.rtBright.dispose();
    this.rtFeature.dispose();
    this.rtBlur.dispose();
    this.brightMaterial.dispose();
    this.featureMaterial.dispose();
    this.blurMaterial.dispose();
    this.compositeMaterial.dispose();
    this.fsQuad.dispose();
  }
}

/* ══════════════════════════════════════════════════════════════
   필름 그레인 + 비네트
   ══════════════════════════════════════════════════════════════ */

export const FilmVignetteShader = {
  name: 'FilmVignetteShader',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.045 },
    uVignette: { value: 1.05 },
    uVignetteSoft: { value: 0.62 },
    uChroma: { value: 0.0012 },
  },
  vertexShader: QUAD_VERT,
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
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 c = vUv - 0.5;

      // 아주 미세한 렌즈 색수차 (가장자리에서만)
      float r2 = dot(c, c);
      vec2 off = c * r2 * uChroma * 12.0;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;

      // 비네트
      float v = smoothstep(uVignette, uVignetteSoft, length(c) * 1.414);
      col *= mix(0.42, 1.0, v);

      // 필름 그레인 (시간에 따라 흐르는 노이즈)
      float n = hash(vUv * 1024.0 + fract(uTime) * 91.7) - 0.5;
      col += n * uGrain * (1.0 - 0.55 * v);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
