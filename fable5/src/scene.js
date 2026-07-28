/**
 * scene.js — 렌더러/카메라/후처리 파이프라인
 * EffectComposer: Render → UnrealBloom → LensFlare(Chapman) → Output → Grain/Vignette
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { Pass, FullScreenQuad } from "three/addons/postprocessing/Pass.js";

/* ================================================================== */
/* 스크린-스페이스 렌즈플레어 (Chapman 방식)                            */
/* 스프라이트가 아니라 렌더 결과의 실제 밝은 픽셀에서 고스트를 만든다.   */
/* ================================================================== */

const BRIGHT_FRAG = /* glsl */ `
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
    // (궤도 빛 펄스 등 잡광이 고스트로 번지는 것을 차단)
    vec2 d = vUv - uSunPos;
    d.x *= uAspect;
    float mask = 1.0 - smoothstep(0.04, 0.16, length(d));
    float w = smoothstep(uThreshold, uThreshold + 1.4, luma);
    gl_FragColor = vec4(c * w * mask * uVisible * 0.35, 1.0);
  }
`;

const GHOST_FRAG = /* glsl */ `
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
    // UV 반전 고스트 사슬 (고차 고스트일수록 확대되므로 가중치를 줄인다)
    vec2 flipUv = vec2(1.0) - vUv;
    vec2 ghostVec = (vec2(0.5) - flipUv) * uDispersal;
    vec3 result = vec3(0.0);
    for (int i = 0; i < 5; i++) {
      vec2 suv = flipUv + ghostVec * float(i);
      float w = pow(max(0.0, 1.0 - length(suv - 0.5) / 0.7071), 3.0);
      w /= 1.0 + float(i) * 1.2;
      result += sampleChroma(suv) * w * inBounds(suv);
    }
    // 할로 링
    vec2 haloVec = normalize(ghostVec + 1e-6) * uHaloWidth;
    vec2 huv = flipUv + haloVec;
    float hw = pow(max(0.0, 1.0 - length(vec2(0.5) - huv) / 0.7071), 5.0);
    result += sampleChroma(huv) * hw * inBounds(huv) * 0.6;
    gl_FragColor = vec4(result, 1.0);
  }
`;

const BLUR_FRAG = /* glsl */ `
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

const FLARE_COMPOSITE_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D tFlare;
  uniform float uIntensity;
  uniform vec2 uSunPos;
  uniform float uAspect;
  varying vec2 vUv;
  void main() {
    vec4 base = texture2D(tDiffuse, vUv);
    vec3 flare = texture2D(tFlare, vUv).rgb;
    // 방사형 미세 변조 — 스타버스트 느낌
    vec2 rel = vUv - uSunPos;
    rel.x *= uAspect;
    float ang = atan(rel.y, rel.x);
    float burst = 0.82 + 0.18 * (0.5 + 0.5 * sin(ang * 14.0)) * (0.5 + 0.5 * sin(ang * 9.0 + 1.7));
    gl_FragColor = vec4(base.rgb + flare * uIntensity * burst, base.a);
  }
`;

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

class LensFlarePass extends Pass {
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
        uThreshold: { value: 1.8 }, // 태양 코어만 추출 (궤도 펄스 차단)
        uSunPos: { value: new THREE.Vector2(0.5, 0.5) },
        uAspect: { value: 1 },
        uVisible: { value: 1 },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: BRIGHT_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.ghostMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uDispersal: { value: 0.19 },
        uHaloWidth: { value: 0.33 },
        uChroma: { value: 0.0045 },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: GHOST_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uDirection: { value: new THREE.Vector2() },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: BLUR_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.compMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tFlare: { value: null },
        uIntensity: { value: 0.5 },
        uSunPos: { value: new THREE.Vector2(0.5, 0.5) },
        uAspect: { value: 1 },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: FLARE_COMPOSITE_FRAG,
      depthTest: false,
      depthWrite: false,
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

  /** CPU에서 계산한 태양 스크린 위치/가시도 갱신 */
  setSun(x, y, visible) {
    this.brightMat.uniforms.uSunPos.value.set(x, y);
    this.brightMat.uniforms.uVisible.value = visible;
    this.compMat.uniforms.uSunPos.value.set(x, y);
  }

  render(renderer, writeBuffer, readBuffer) {
    const prevTarget = renderer.getRenderTarget();

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

    renderer.setRenderTarget(prevTarget);
  }

  dispose() {
    this.rtBright.dispose();
    this.rtGhost.dispose();
    this.rtBlur.dispose();
    this.quad.dispose();
  }
}

/* ================================================================== */
/* 필름 그레인 + 비네트                                                */
/* ================================================================== */

const GrainVignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.045 },
    uVignette: { value: 0.55 },
  },
  vertexShader: QUAD_VERT,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uGrain;
    uniform float uVignette;
    varying vec2 vUv;
    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float n = rand(vUv * 1000.0 + fract(uTime) * 100.0) - 0.5;
      c.rgb += n * uGrain;
      vec2 d = vUv - 0.5;
      float vig = 1.0 - uVignette * smoothstep(0.35, 0.85, length(d));
      c.rgb *= vig;
      gl_FragColor = c;
    }
  `,
};

/* ================================================================== */
/* 씬 셋업                                                             */
/* ================================================================== */

export function createSceneSystem(container) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000005);

  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    5000
  );
  camera.position.set(0, 95, 175);

  // 라벨 렌더러 (CSS2D)
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.className = "label-layer";
  container.appendChild(labelRenderer.domElement);

  // 컨트롤
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 1.2;
  controls.maxDistance = 700;
  controls.zoomSpeed = 1.1;

  // 조명: 태양 포인트 라이트 + 아주 약한 앰비언트
  // (decay 를 낮춰 수성~해왕성까지 노출이 고르게 유지되도록 — 교육용 연출)
  const sunLight = new THREE.PointLight(0xfff2e0, 6, 0, 0.35);
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0x223344, 0.35));

  // 후처리
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  // 플레어는 블룸 이전의 원본 HDR 버퍼에서 태양 코어만 추출해야 한다
  const flarePass = new LensFlarePass();
  flarePass.setSize(window.innerWidth, window.innerHeight);
  composer.addPass(flarePass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.1, // strength
    0.55, // radius
    0.85 // threshold
  );
  composer.addPass(bloomPass);

  composer.addPass(new OutputPass());

  const grainPass = new ShaderPass(GrainVignetteShader);
  composer.addPass(grainPass);

  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    labelRenderer.setSize(w, h);
  }
  window.addEventListener("resize", onResize);

  const _sunNDC = new THREE.Vector3();
  const _sunCam = new THREE.Vector3();
  /** 태양 스크린 위치를 플레어 패스에 공급 */
  function updateFlareSun(sunWorldPos) {
    // 카메라 공간 z 로 뒤/앞 판정 (project 만으로는 뒤쪽에서 미러링됨)
    _sunCam.copy(sunWorldPos).applyMatrix4(camera.matrixWorldInverse);
    const behind = _sunCam.z > -0.1;
    _sunNDC.copy(sunWorldPos).project(camera);
    const x = (_sunNDC.x + 1) / 2;
    const y = (_sunNDC.y + 1) / 2;
    // 화면 가장자리를 벗어나면 빠르게 사라짐 (가장자리 잡광의 고스트化 방지)
    const edge =
      (1 - THREE.MathUtils.smoothstep(Math.abs(_sunNDC.x), 0.85, 1.05)) *
      (1 - THREE.MathUtils.smoothstep(Math.abs(_sunNDC.y), 0.85, 1.05));
    flarePass.setSun(x, y, behind ? 0 : edge);
  }

  return {
    renderer,
    scene,
    camera,
    controls,
    composer,
    labelRenderer,
    sunLight,
    bloomPass,
    flarePass,
    grainPass,
    updateFlareSun,
  };
}
