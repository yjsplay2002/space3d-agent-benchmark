// lensflare.js — 스크린-스페이스 렌즈플레어 (Chapman 방식 커스텀 패스, 스프라이트 아님)
//  1) bright-pass (1/4 해상도, luma threshold + 태양 스크린 위치 주변 공간 마스크)
//  2) UV 반전 고스트 사슬 5개 + 할로 링 + RGB 색수차 (화면 밖 소스는 버림 — fract 래핑 금지)
//  3) 분리형 가우시안 블러
//  4) additive 합성 (방사형 미세 변조 = 스타버스트 느낌)
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const BRIGHT_FRAG = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform float uThreshold;
  uniform float uSoft;
  uniform vec2 uSunPos;
  uniform float uMaskRadius;
  uniform float uAspect;
  uniform float uSunVisible;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
    // 태양 스크린 위치 주변만 통과 (궤도 빛 펄스 등 잡광 차단)
    vec2 d = (vUv - uSunPos) * vec2(uAspect, 1.0);
    float mask = 1.0 - smoothstep(uMaskRadius * 0.55, uMaskRadius, length(d));
    // threshold 초과분만 추출하고 0~1 로 압축 (HDR 값이 그대로 고스트로 번지지 않게)
    vec3 b = max(c - vec3(uThreshold), vec3(0.0)) / max(uSoft, 1e-3);
    b = b / (vec3(1.0) + b);
    float k = smoothstep(uThreshold, uThreshold + uSoft * 0.5, luma);
    gl_FragColor = vec4(b * k * mask * uSunVisible, 1.0);
  }
`;

const GHOST_FRAG = /* glsl */`
  uniform sampler2D tBright;
  uniform float uDispersal;
  uniform float uHaloWidth;
  uniform float uDistortion;
  uniform float uAspect;
  varying vec2 vUv;

  vec3 sampleClamped(vec2 uv) {
    // 화면 밖 소스는 버린다 (fract 로 래핑하면 화면 전체에 고스트가 타일링됨)
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec3(0.0);
    return texture2D(tBright, uv).rgb;
  }
  vec3 chroma(vec2 uv, vec2 dir) {
    return vec3(
      sampleClamped(uv - dir * uDistortion).r,
      sampleClamped(uv).g,
      sampleClamped(uv + dir * uDistortion).b
    );
  }
  void main() {
    vec2 uv = vec2(1.0) - vUv;                       // UV 반전 (중심 대칭)
    vec2 ghostVec = (vec2(0.5) - uv) * uDispersal;
    vec2 dir = normalize(ghostVec + vec2(1e-5));
    vec3 result = vec3(0.0);
    vec3 tints[5];
    tints[0] = vec3(0.65, 0.95, 1.00);
    tints[1] = vec3(1.00, 0.80, 0.55);
    tints[2] = vec3(0.75, 1.00, 0.85);
    tints[3] = vec3(1.00, 0.65, 0.85);
    tints[4] = vec3(0.70, 0.85, 1.00);
    for (int i = 0; i < 5; i++) {
      // i*dispersal 이 1 에 가까워지면 중심부가 거대하게 확대되므로 dispersal 을 작게 유지하고
      // 확대율(1/(1-i*d))만큼 세기를 줄인다.
      float s = 1.0 - uDispersal * float(i);
      vec2 offset = uv + ghostVec * float(i);
      float w = length((vec2(0.5) - offset) * vec2(uAspect, 1.0)) / (0.5 * uAspect);
      w = pow(clamp(1.0 - w, 0.0, 1.0), 4.0);
      result += chroma(offset, dir) * w * tints[i] * (0.5 - 0.06 * float(i)) * s * s;
    }
    // 할로 링 (종횡비 보정 공간에서 일정 반지름, 은은하게)
    vec2 gv = ghostVec * vec2(uAspect, 1.0);
    vec2 haloVec = normalize(gv + vec2(1e-5)) * uHaloWidth / vec2(uAspect, 1.0);
    vec2 huv = uv + haloVec;
    float hw = length((vec2(0.5) - huv) * vec2(uAspect, 1.0)) / (0.5 * uAspect);
    hw = pow(clamp(1.0 - hw, 0.0, 1.0), 5.0);
    result += sampleClamped(huv) * hw * vec3(0.85, 0.95, 1.0) * 0.16;
    gl_FragColor = vec4(result, 1.0);
  }
`;

const BLUR_FRAG = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform vec2 uDirection;
  varying vec2 vUv;
  void main() {
    float w[5];
    w[0] = 0.227027; w[1] = 0.1945946; w[2] = 0.1216216; w[3] = 0.054054; w[4] = 0.016216;
    vec3 c = texture2D(tDiffuse, vUv).rgb * w[0];
    for (int i = 1; i < 5; i++) {
      vec2 o = uDirection * float(i);
      c += texture2D(tDiffuse, vUv + o).rgb * w[i];
      c += texture2D(tDiffuse, vUv - o).rgb * w[i];
    }
    gl_FragColor = vec4(c, 1.0);
  }
`;

const COMPOSITE_FRAG = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform sampler2D tFlare;
  uniform float uIntensity;
  uniform vec2 uSunPos;
  uniform float uAspect;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vec4 base = texture2D(tDiffuse, vUv);
    vec3 flare = texture2D(tFlare, vUv).rgb;
    vec2 d = (vUv - uSunPos) * vec2(uAspect, 1.0);
    float ang = atan(d.y, d.x);
    // 방사형 미세 변조 → 스타버스트 느낌
    float star = 0.82 + 0.18 * (0.5 + 0.5 * sin(ang * 14.0 + uTime * 0.15)) * (0.5 + 0.5 * sin(ang * 6.0 - uTime * 0.1));
    gl_FragColor = vec4(base.rgb + flare * uIntensity * star, base.a);
  }
`;

export class LensFlarePass extends Pass {
  constructor(width, height, {
    threshold = 1.45, soft = 0.6, intensity = 0.5, maskRadius = 0.16,
    dispersal = 0.14, haloWidth = 0.30, distortion = 0.006,
  } = {}) {
    super();
    this.scale = 0.25;
    const rtOpts = {
      type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, depthBuffer: false,
    };
    const w = Math.max(1, Math.floor(width * this.scale)), h = Math.max(1, Math.floor(height * this.scale));
    this.rtBright = new THREE.WebGLRenderTarget(w, h, rtOpts);
    this.rtGhost = new THREE.WebGLRenderTarget(w, h, rtOpts);
    this.rtBlur = new THREE.WebGLRenderTarget(w, h, rtOpts);

    this.brightMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, uThreshold: { value: threshold }, uSoft: { value: soft },
        uSunPos: { value: new THREE.Vector2(0.5, 0.5) }, uMaskRadius: { value: maskRadius },
        uAspect: { value: width / height }, uSunVisible: { value: 1 },
      },
      vertexShader: VERT, fragmentShader: BRIGHT_FRAG, depthTest: false, depthWrite: false,
    });
    this.ghostMat = new THREE.ShaderMaterial({
      uniforms: {
        tBright: { value: null }, uDispersal: { value: dispersal }, uHaloWidth: { value: haloWidth },
        uDistortion: { value: distortion }, uAspect: { value: width / height },
      },
      vertexShader: VERT, fragmentShader: GHOST_FRAG, depthTest: false, depthWrite: false,
    });
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uDirection: { value: new THREE.Vector2(1 / w, 0) } },
      vertexShader: VERT, fragmentShader: BLUR_FRAG, depthTest: false, depthWrite: false,
    });
    this.compositeMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, tFlare: { value: null }, uIntensity: { value: intensity },
        uSunPos: { value: new THREE.Vector2(0.5, 0.5) }, uAspect: { value: width / height }, uTime: { value: 0 },
      },
      vertexShader: VERT, fragmentShader: COMPOSITE_FRAG, depthTest: false, depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad(null);
    this.time = 0;
  }

  // 태양 스크린 위치 (0~1 UV), visible: 카메라 앞에 있고 화면 근처인지
  setSun(x, y, visible) {
    this.brightMat.uniforms.uSunPos.value.set(x, y);
    this.compositeMat.uniforms.uSunPos.value.set(x, y);
    this.brightMat.uniforms.uSunVisible.value = visible ? 1 : 0;
  }
  set intensity(v) { this.compositeMat.uniforms.uIntensity.value = v; }
  get intensity() { return this.compositeMat.uniforms.uIntensity.value; }

  setSize(width, height) {
    const w = Math.max(1, Math.floor(width * this.scale)), h = Math.max(1, Math.floor(height * this.scale));
    this.rtBright.setSize(w, h); this.rtGhost.setSize(w, h); this.rtBlur.setSize(w, h);
    const aspect = width / height;
    this.brightMat.uniforms.uAspect.value = aspect;
    this.ghostMat.uniforms.uAspect.value = aspect;
    this.compositeMat.uniforms.uAspect.value = aspect;
    this._texel = new THREE.Vector2(1 / w, 1 / h);
  }

  render(renderer, writeBuffer, readBuffer, deltaTime) {
    this.time += deltaTime || 0.016;
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    const texel = this._texel || new THREE.Vector2(1 / this.rtBright.width, 1 / this.rtBright.height);

    // 1) bright pass
    this.brightMat.uniforms.tDiffuse.value = readBuffer.texture;
    this.fsQuad.material = this.brightMat;
    renderer.setRenderTarget(this.rtBright); renderer.clear(); this.fsQuad.render(renderer);

    // 2) ghosts + halo
    this.ghostMat.uniforms.tBright.value = this.rtBright.texture;
    this.fsQuad.material = this.ghostMat;
    renderer.setRenderTarget(this.rtGhost); renderer.clear(); this.fsQuad.render(renderer);

    // 3) 분리형 가우시안 블러 (H → V)
    this.fsQuad.material = this.blurMat;
    this.blurMat.uniforms.tDiffuse.value = this.rtGhost.texture;
    this.blurMat.uniforms.uDirection.value.set(texel.x * 1.5, 0);
    renderer.setRenderTarget(this.rtBlur); renderer.clear(); this.fsQuad.render(renderer);
    this.blurMat.uniforms.tDiffuse.value = this.rtBlur.texture;
    this.blurMat.uniforms.uDirection.value.set(0, texel.y * 1.5);
    renderer.setRenderTarget(this.rtGhost); renderer.clear(); this.fsQuad.render(renderer);

    // 4) additive 합성
    this.compositeMat.uniforms.tDiffuse.value = readBuffer.texture;
    this.compositeMat.uniforms.tFlare.value = this.rtGhost.texture;
    this.compositeMat.uniforms.uTime.value = this.time;
    this.fsQuad.material = this.compositeMat;
    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
    }
    this.fsQuad.render(renderer);
    renderer.autoClear = prevAutoClear;
  }

  dispose() {
    this.rtBright.dispose(); this.rtGhost.dispose(); this.rtBlur.dispose();
    this.brightMat.dispose(); this.ghostMat.dispose(); this.blurMat.dispose(); this.compositeMat.dispose();
    this.fsQuad.dispose();
  }
}
