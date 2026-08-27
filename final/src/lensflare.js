// 스크린-스페이스 렌즈플레어 (Chapman 방식) — fable5 이식, 절제 버전.
// 스프라이트가 아니라 렌더 결과의 실제 밝은 픽셀(태양 코어)에서 고스트를 만든다.
// 1/4 해상도 브라이트패스 → 고스트 사슬 + 할로 + 색수차 → 분리형 가우시안 블러 → additive 합성.
// CPU가 setSun(x, y, visible)로 태양 스크린 위치와 가시도를 공급한다.
// 절제 원칙: "고스트가 보인다"가 아니라 "태양이 밝게 느껴진다"가 목표.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const QUAD_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BRIGHT_FRAG = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform float uThreshold;
  uniform vec2 uSunPos;     // 태양 스크린 위치 (0~1 UV)
  uniform float uAspect;
  uniform float uVisible;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    float luma = dot(c, vec3(0.299, 0.587, 0.114));
    // 태양 스크린 위치 주변만 통과시키는 공간 마스크
    // (궤도 빛 펄스·충돌 섬광 등 잡광이 고스트로 번지는 것을 차단)
    vec2 d = vUv - uSunPos;
    d.x *= uAspect;
    float mask = 1.0 - smoothstep(0.04, 0.16, length(d));
    float w = smoothstep(uThreshold, uThreshold + 0.6, luma);
    gl_FragColor = vec4(c * w * mask * uVisible * 0.35, 1.0);
  }
`;

const GHOST_FRAG = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform float uDispersal;
  uniform float uHaloWidth;
  uniform float uChroma;
  varying vec2 vUv;

  // 화면 밖 소스는 버린다 (fract 래핑 금지 — 타일링 방지)
  float inBounds(vec2 uv) {
    return step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  }

  vec3 sampleChroma(vec2 uv) {
    vec2 dir = normalize(vec2(0.5) - uv + 1e-5);
    vec2 off = dir * uChroma;
    return vec3(
      texture2D(tDiffuse, uv - off).r,
      texture2D(tDiffuse, uv).g,
      texture2D(tDiffuse, uv + off).b
    );
  }

  void main() {
    // UV 반전 고스트 사슬 — fable5의 5개 대신 4개, 분산도 좁게 (태양 근처에 모이게)
    vec2 flipUv = vec2(1.0) - vUv;
    vec2 ghostVec = (vec2(0.5) - flipUv) * uDispersal;
    vec3 result = vec3(0.0);
    for (int i = 0; i < 4; i++) {
      vec2 suv = flipUv + ghostVec * float(i);
      float w = pow(max(0.0, 1.0 - length(suv - 0.5) / 0.7071), 3.0);
      w /= 1.0 + float(i) * 1.4;
      result += sampleChroma(suv) * w * inBounds(suv);
    }
    // 할로 링 — "밝다"는 인상은 고스트보다 이 쪽이 담당
    vec2 haloVec = normalize(ghostVec + 1e-6) * uHaloWidth;
    vec2 huv = flipUv + haloVec;
    float hw = pow(max(0.0, 1.0 - length(vec2(0.5) - huv) / 0.7071), 5.0);
    result += sampleChroma(huv) * hw * inBounds(huv) * 0.5;
    gl_FragColor = vec4(result, 1.0);
  }
`;

const BLUR_FRAG = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform vec2 uDirection;   // 분리형 가우시안 방향 (texel 단위)
  varying vec2 vUv;
  void main() {
    vec3 sum = vec3(0.0);
    float w[5];
    w[0] = 0.227027; w[1] = 0.194594; w[2] = 0.121621; w[3] = 0.054054; w[4] = 0.016216;
    sum += texture2D(tDiffuse, vUv).rgb * w[0];
    for (int i = 1; i < 5; i++) {
      vec2 off = uDirection * float(i);
      sum += texture2D(tDiffuse, vUv + off).rgb * w[i];
      sum += texture2D(tDiffuse, vUv - off).rgb * w[i];
    }
    gl_FragColor = vec4(sum, 1.0);
  }
`;

const COMPOSITE_FRAG = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform sampler2D tFlare;
  uniform float uIntensity;
  uniform vec2 uSunPos;
  uniform float uAspect;
  varying vec2 vUv;
  void main() {
    vec4 base = texture2D(tDiffuse, vUv);
    vec3 flare = texture2D(tFlare, vUv).rgb;
    // 방사형 미세 변조 — 은은한 스타버스트 (평균 밝기는 거의 그대로)
    vec2 rel = vUv - uSunPos;
    rel.x *= uAspect;
    float ang = atan(rel.y, rel.x);
    float burst = 0.86 + 0.14 * (0.5 + 0.5 * sin(ang * 14.0)) * (0.5 + 0.5 * sin(ang * 9.0 + 1.7));
    gl_FragColor = vec4(base.rgb + flare * uIntensity * burst, base.a);
  }
`;

export class LensFlarePass extends Pass {
  constructor() {
    super();
    const rtOpts = {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
    };
    this.rtBright = new THREE.WebGLRenderTarget(256, 256, rtOpts);
    this.rtGhost = new THREE.WebGLRenderTarget(256, 256, rtOpts);
    this.rtBlur = new THREE.WebGLRenderTarget(256, 256, rtOpts);

    this.brightMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        // 오버드라이브된 태양 코어(루마 ~1.4+)만 추출.
        // 궤도 꼬리(≤~1.05)·충돌 섬광(캔버스 스프라이트, ≤1.0)은 절대 못 넘는 값.
        uThreshold: { value: 1.15 },
        uSunPos: { value: new THREE.Vector2(0.5, 0.5) },
        uAspect: { value: 1 },
        uVisible: { value: 0 },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: BRIGHT_FRAG,
      depthTest: false, depthWrite: false,
    });
    this.ghostMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uDispersal: { value: 0.16 },
        uHaloWidth: { value: 0.3 },
        uChroma: { value: 0.004 },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: GHOST_FRAG,
      depthTest: false, depthWrite: false,
    });
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uDirection: { value: new THREE.Vector2() },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: BLUR_FRAG,
      depthTest: false, depthWrite: false,
    });
    this.compMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tFlare: { value: null },
        uIntensity: { value: 0.15 }, // fable5는 0.5 — 이 앱에선 과했던 전례가 있어 크게 낮춤
        uSunPos: { value: new THREE.Vector2(0.5, 0.5) },
        uAspect: { value: 1 },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: COMPOSITE_FRAG,
      depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.brightMat);
    this.needsSwap = true;
  }

  setSize(w, h) {
    const qw = Math.max(64, Math.floor(w / 4));
    const qh = Math.max(64, Math.floor(h / 4));
    this.rtBright.setSize(qw, qh);
    this.rtGhost.setSize(qw, qh);
    this.rtBlur.setSize(qw, qh);
    this.brightMat.uniforms.uAspect.value = w / h;
    this.compMat.uniforms.uAspect.value = w / h;
    this._texel = new THREE.Vector2(1 / qw, 1 / qh);
  }

  /** CPU에서 계산한 태양 스크린 위치(0~1)/가시도(0~1) 갱신 */
  setSun(x, y, visible) {
    this.brightMat.uniforms.uSunPos.value.set(x, y);
    this.brightMat.uniforms.uVisible.value = visible;
    this.compMat.uniforms.uSunPos.value.set(x, y);
  }

  render(renderer, writeBuffer, readBuffer) {
    const prevTarget = renderer.getRenderTarget();
    const vis = this.brightMat.uniforms.uVisible.value;

    if (vis > 0.003) {
      // 1) bright-pass (1/4 해상도)
      this.quad.material = this.brightMat;
      this.brightMat.uniforms.tDiffuse.value = readBuffer.texture;
      renderer.setRenderTarget(this.rtBright);
      this.quad.render(renderer);

      // 2) 고스트 사슬 + 할로 + 색수차
      this.quad.material = this.ghostMat;
      this.ghostMat.uniforms.tDiffuse.value = this.rtBright.texture;
      renderer.setRenderTarget(this.rtGhost);
      this.quad.render(renderer);

      // 3) 분리형 가우시안 블러 (H → V)
      this.quad.material = this.blurMat;
      this.blurMat.uniforms.tDiffuse.value = this.rtGhost.texture;
      this.blurMat.uniforms.uDirection.value.set(this._texel?.x ?? 0.004, 0);
      renderer.setRenderTarget(this.rtBlur);
      this.quad.render(renderer);
      this.blurMat.uniforms.tDiffuse.value = this.rtBlur.texture;
      this.blurMat.uniforms.uDirection.value.set(0, this._texel?.y ?? 0.004);
      renderer.setRenderTarget(this.rtGhost);
      this.quad.render(renderer);

      // 4) additive 합성
      this.quad.material = this.compMat;
      this.compMat.uniforms.tDiffuse.value = readBuffer.texture;
      this.compMat.uniforms.tFlare.value = this.rtGhost.texture;
      renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
      this.quad.render(renderer);
    } else {
      // 플레어가 완전히 꺼진 프레임엔 중간 패스를 전부 건너뛰고 원본만 통과시킨다
      const keepI = this.compMat.uniforms.uIntensity.value;
      this.quad.material = this.compMat;
      this.compMat.uniforms.tDiffuse.value = readBuffer.texture;
      this.compMat.uniforms.tFlare.value = this.rtGhost.texture;
      this.compMat.uniforms.uIntensity.value = 0;
      renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
      this.quad.render(renderer);
      this.compMat.uniforms.uIntensity.value = keepI;
    }

    renderer.setRenderTarget(prevTarget);
  }

  dispose() {
    this.rtBright.dispose();
    this.rtGhost.dispose();
    this.rtBlur.dispose();
    this.brightMat.dispose();
    this.ghostMat.dispose();
    this.blurMat.dispose();
    this.compMat.dispose();
    this.quad.dispose();
  }
}
