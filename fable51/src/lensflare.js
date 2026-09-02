import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// 스크린-스페이스 렌즈플레어 (Chapman 방식)
// 1) bright pass 1/4 해상도 (luma threshold + 태양 스크린 위치 주변 공간 마스크)
// 2) UV 반전 고스트 사슬 + 할로 + RGB 색수차 (fract 금지, 화면 밖 샘플은 버림)
// 3) 분리형 가우시안 블러
// 4) additive 합성 (방사형 미세 변조)

const fsVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const brightFrag = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uThreshold;
  uniform vec2 uSunPos;
  uniform float uMaskRadius;
  uniform float uAspect;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float k = max(luma - uThreshold, 0.0);
    // 태양 주변만 통과
    vec2 d = (vUv - uSunPos) * vec2(uAspect, 1.0);
    float mask = 1.0 - smoothstep(uMaskRadius * 0.6, uMaskRadius, length(d));
    gl_FragColor = vec4(min(c * k * mask, vec3(3.0)), 1.0);
  }
`;

const ghostFrag = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform int uGhosts;
  uniform float uDispersal;
  uniform float uHaloWidth;
  uniform float uDistortion;
  uniform float uAspect;
  varying vec2 vUv;

  bool inside(vec2 uv) { return uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0; }

  vec3 sampleClamped(vec2 uv) {
    return inside(uv) ? texture2D(tDiffuse, uv).rgb : vec3(0.0);
  }

  vec3 chromatic(vec2 uv, vec2 dir, float amount) {
    vec2 ra = uv - dir * amount;
    vec2 ba = uv + dir * amount;
    float r = inside(ra) ? texture2D(tDiffuse, ra).r : 0.0;
    float g = inside(uv) ? texture2D(tDiffuse, uv).g : 0.0;
    float b = inside(ba) ? texture2D(tDiffuse, ba).b : 0.0;
    return vec3(r, g, b);
  }

  void main() {
    vec2 uv = 1.0 - vUv; // UV 반전
    vec2 ghostVec = (vec2(0.5) - uv) * uDispersal;
    vec2 dir = normalize(ghostVec + vec2(1e-5));
    vec3 result = vec3(0.0);

    for (int i = 0; i < 8; i++) {
      if (i >= uGhosts) break;
      vec2 offset = uv + ghostVec * float(i);
      if (!inside(offset)) continue;
      float w = length(vec2(0.5) - offset) / length(vec2(0.5));
      w = pow(1.0 - w, 10.0);
      vec3 tint = mix(vec3(1.0, 0.8, 0.6), vec3(0.5, 0.8, 1.0), float(i) / 6.0);
      result += chromatic(offset, dir, uDistortion) * w * tint;
    }

    // 할로 링
    vec2 haloVec = dir * uHaloWidth;
    vec2 hp = uv + haloVec;
    if (inside(hp)) {
      vec2 hd = (hp - vec2(0.5)) * vec2(uAspect, 1.0);
      float w = length(hd) / (0.5 * uAspect);
      w = pow(1.0 - clamp(w, 0.0, 1.0), 5.0);
      result += chromatic(hp, dir, uDistortion) * w * vec3(0.7, 0.85, 1.0) * 0.6;
    }

    gl_FragColor = vec4(result, 1.0);
  }
`;

const blurFrag = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2 uDir;
  varying vec2 vUv;
  void main() {
    float w[5];
    w[0] = 0.227027; w[1] = 0.1945946; w[2] = 0.1216216; w[3] = 0.054054; w[4] = 0.016216;
    vec3 c = texture2D(tDiffuse, vUv).rgb * w[0];
    for (int i = 1; i < 5; i++) {
      vec2 o = uDir * float(i);
      c += texture2D(tDiffuse, clamp(vUv + o, 0.0, 1.0)).rgb * w[i];
      c += texture2D(tDiffuse, clamp(vUv - o, 0.0, 1.0)).rgb * w[i];
    }
    gl_FragColor = vec4(c, 1.0);
  }
`;

const compositeFrag = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D tFlare;
  uniform float uIntensity;
  uniform float uTime;
  uniform vec2 uSunPos;
  varying vec2 vUv;
  void main() {
    vec4 base = texture2D(tDiffuse, vUv);
    vec3 flare = texture2D(tFlare, vUv).rgb;
    // 방사형 미세 변조 (스타버스트 느낌)
    vec2 d = vUv - uSunPos;
    float ang = atan(d.y, d.x);
    float burst = 0.8 + 0.2 * sin(ang * 32.0 + uTime * 0.15) * sin(ang * 7.0 - uTime * 0.1);
    gl_FragColor = vec4(base.rgb + flare * uIntensity * burst, base.a);
  }
`;

export class LensFlarePass extends Pass {
  constructor(width, height, options = {}) {
    super();
    this.enabled = options.enabled ?? true;
    this.needsSwap = true;
    this.intensity = options.intensity ?? 0.5;
    this.threshold = options.threshold ?? 1.35;
    this.maskRadius = options.maskRadius ?? 0.14;

    const rtOpts = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    this.rtBright = new THREE.WebGLRenderTarget(1, 1, rtOpts);
    this.rtGhost = new THREE.WebGLRenderTarget(1, 1, rtOpts);
    this.rtBlur = new THREE.WebGLRenderTarget(1, 1, rtOpts);

    this.brightMat = new THREE.ShaderMaterial({
      vertexShader: fsVert,
      fragmentShader: brightFrag,
      uniforms: {
        tDiffuse: { value: null },
        uThreshold: { value: this.threshold },
        uSunPos: { value: new THREE.Vector2(0.5, 0.5) },
        uMaskRadius: { value: this.maskRadius },
        uAspect: { value: 1 },
      },
    });
    this.ghostMat = new THREE.ShaderMaterial({
      vertexShader: fsVert,
      fragmentShader: ghostFrag,
      uniforms: {
        tDiffuse: { value: null },
        uGhosts: { value: 5 },
        uDispersal: { value: 0.32 },
        uHaloWidth: { value: 0.42 },
        uDistortion: { value: 0.0025 },
        uAspect: { value: 1 },
      },
    });
    this.blurMat = new THREE.ShaderMaterial({
      vertexShader: fsVert,
      fragmentShader: blurFrag,
      uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2(1, 0) } },
    });
    this.compositeMat = new THREE.ShaderMaterial({
      vertexShader: fsVert,
      fragmentShader: compositeFrag,
      uniforms: {
        tDiffuse: { value: null },
        tFlare: { value: null },
        uIntensity: { value: this.intensity },
        uTime: { value: 0 },
        uSunPos: { value: new THREE.Vector2(0.5, 0.5) },
      },
    });

    this.quad = new FullScreenQuad(null);
    this.sunScreen = new THREE.Vector2(0.5, 0.5);
    this.sunVisible = true;
    this.time = 0;
    this.setSize(width, height);
  }

  setSize(w, h) {
    const qw = Math.max(1, Math.floor(w / 4));
    const qh = Math.max(1, Math.floor(h / 4));
    this.rtBright.setSize(qw, qh);
    this.rtGhost.setSize(qw, qh);
    this.rtBlur.setSize(qw, qh);
    this.brightMat.uniforms.uAspect.value = w / h;
    this.ghostMat.uniforms.uAspect.value = w / h;
    this.texel = new THREE.Vector2(1 / qw, 1 / qh);
  }

  // 매 프레임: 태양 월드 좌표 → 스크린 UV
  updateSun(sunWorldPos, camera) {
    const p = sunWorldPos.clone().project(camera);
    this.sunVisible = p.z < 1 && Math.abs(p.x) < 1.6 && Math.abs(p.y) < 1.6;
    this.sunScreen.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
  }

  render(renderer, writeBuffer, readBuffer, deltaTime) {
    this.time += deltaTime || 0.016;
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    const flareOn = this.sunVisible && this.intensity > 0;
    if (flareOn) {
      // 1) bright pass
      this.brightMat.uniforms.tDiffuse.value = readBuffer.texture;
      this.brightMat.uniforms.uSunPos.value.copy(this.sunScreen);
      this.brightMat.uniforms.uThreshold.value = this.threshold;
      this.brightMat.uniforms.uMaskRadius.value = this.maskRadius;
      this.quad.material = this.brightMat;
      renderer.setRenderTarget(this.rtBright);
      renderer.clear();
      this.quad.render(renderer);

      // 2) ghosts + halo
      this.ghostMat.uniforms.tDiffuse.value = this.rtBright.texture;
      this.quad.material = this.ghostMat;
      renderer.setRenderTarget(this.rtGhost);
      renderer.clear();
      this.quad.render(renderer);

      // 3) separable blur (H → rtBlur, V → rtGhost)
      this.blurMat.uniforms.tDiffuse.value = this.rtGhost.texture;
      this.blurMat.uniforms.uDir.value.set(this.texel.x * 1.5, 0);
      this.quad.material = this.blurMat;
      renderer.setRenderTarget(this.rtBlur);
      renderer.clear();
      this.quad.render(renderer);

      this.blurMat.uniforms.tDiffuse.value = this.rtBlur.texture;
      this.blurMat.uniforms.uDir.value.set(0, this.texel.y * 1.5);
      renderer.setRenderTarget(this.rtGhost);
      renderer.clear();
      this.quad.render(renderer);
    }

    // 4) composite
    this.compositeMat.uniforms.tDiffuse.value = readBuffer.texture;
    this.compositeMat.uniforms.tFlare.value = this.rtGhost.texture;
    this.compositeMat.uniforms.uIntensity.value = flareOn ? this.intensity : 0;
    this.compositeMat.uniforms.uTime.value = this.time;
    this.compositeMat.uniforms.uSunPos.value.copy(this.sunScreen);
    this.quad.material = this.compositeMat;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.quad.render(renderer);

    renderer.autoClear = oldAutoClear;
  }

  dispose() {
    this.rtBright.dispose();
    this.rtGhost.dispose();
    this.rtBlur.dispose();
    this.brightMat.dispose();
    this.ghostMat.dispose();
    this.blurMat.dispose();
    this.compositeMat.dispose();
    this.quad.dispose();
  }
}
