/**
 * src/scene.js — 씬 / 카메라 / 렌더러 / 후처리 파이프라인
 *
 * 후처리 순서:
 *   RenderPass → UnrealBloomPass → LensFlarePass → Grain+Vignette → OutputPass
 * 톤매핑은 OutputPass 가 renderer.toneMapping (ACESFilmic) 을 적용한다.
 * 따라서 앞 단계들은 전부 선형 HDR 공간에서 동작한다.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { LensFlarePass } from './effects/lensflare.js';
import { GrainVignetteShader } from './effects/grain.js';
import { softDotTexture } from './textures.js';

export const SPACE_COLOR = 0x000005;

/**
 * 개발용 오버라이드. 후처리 단계를 끄거나 세기를 바꿔 가며 확인할 수 있다.
 *   ?bloom=0  ?flare=0  ?grain=0  ?sky=0  ?corona=0
 *   ?bloomStrength=0.3  ?bloomThreshold=1.1  ?exposure=0.9
 */
export const DEBUG = (() => {
  const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);
  return {
    bloom: num('bloom', 1),
    flare: num('flare', 1),
    grain: num('grain', 1),
    sky: num('sky', 1),
    corona: num('corona', 1),
    bloomStrength: q.has('bloomStrength') ? Number(q.get('bloomStrength')) : null,
    bloomThreshold: q.has('bloomThreshold') ? Number(q.get('bloomThreshold')) : null,
    bloomRadius: q.has('bloomRadius') ? Number(q.get('bloomRadius')) : null,
    exposure: q.has('exposure') ? Number(q.get('exposure')) : null,
    sunIntensity: q.has('sunIntensity') ? Number(q.get('sunIntensity')) : null,
  };
})();

/** 저사양/모바일 감지 — 파티클 수와 후처리 품질을 낮춘다 */
export function detectLowPower() {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const smallish = Math.min(window.innerWidth, window.innerHeight) < 620;
  const fewCores = (navigator.hardwareConcurrency || 8) <= 4;
  const lowMem = (navigator.deviceMemory || 8) <= 4;
  return Boolean((coarse && smallish) || fewCores || lowMem);
}

export function createStage(container, labelContainer) {
  const lowPower = detectLowPower();

  // ── 렌더러 ────────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({
    antialias: !lowPower,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = DEBUG.exposure ?? 1.0;
  renderer.setClearColor(SPACE_COLOR, 1);
  container.appendChild(renderer.domElement);

  // ── CSS2D 라벨 렌더러 ─────────────────────────────────────────────────
  const labelRenderer = new CSS2DRenderer({ element: labelContainer });
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelContainer.style.position = 'fixed';
  labelContainer.style.inset = '0';
  labelContainer.style.pointerEvents = 'none';

  // ── 씬 ────────────────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SPACE_COLOR);

  // ── 카메라 ────────────────────────────────────────────────────────────
  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.02,
    30000,
  );
  camera.position.set(0, 245, 520);

  // ── 컨트롤 ────────────────────────────────────────────────────────────
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.rotateSpeed = 0.52;
  controls.zoomSpeed = 0.9;
  controls.panSpeed = 0.6;
  controls.screenSpacePanning = true;
  controls.minDistance = 0.35;      // 행성 표면 근접까지
  controls.maxDistance = 3200;      // 태양계 전체 뷰
  controls.enablePan = true;
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN,      // 핀치 줌
  };

  // ── 조명 ──────────────────────────────────────────────────────────────
  // 태양광 (태양 위치에 놓는 점광원).
  // decay=0 이라 거리와 무관하게 같은 세기 — 압축 스케일에서 바깥 행성이
  // 새까맣게 보이지 않게 하려는 의도적 선택이다.
  // 세기는 Lambert(albedo/π) 를 감안해 지구 셰이더의 밝기와 맞췄다.
  const sunLight = new THREE.PointLight(0xfff2dc, 3.8, 0, 0.0);
  sunLight.position.set(0, 0, 0);
  scene.add(sunLight);

  // 아주 옅은 환경광 — 그림자 쪽이 완전히 검게 죽지 않도록
  scene.add(new THREE.AmbientLight(0x223448, 0.16));

  // 은하수 반사광 느낌의 반구광
  scene.add(new THREE.HemisphereLight(0x2a3a5a, 0x0a0a12, 0.1));

  // ── 후처리 ────────────────────────────────────────────────────────────
  const composer = new EffectComposer(
    renderer,
    new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
      type: THREE.HalfFloatType,
      samples: lowPower ? 0 : 2,
    }),
  );
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(window.innerWidth, window.innerHeight);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // 태양처럼 아주 밝고 작은 광원은 UnrealBloom 의 거친 밉에서 화면 전체로
  // 번져 버린다. threshold 를 높이고 strength 를 눌러 "빛나되 날아가지는 않게".
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    DEBUG.bloomStrength ?? (lowPower ? 0.34 : 0.46),   // strength
    DEBUG.bloomRadius ?? 0.5,                           // radius
    DEBUG.bloomThreshold ?? 0.92,                       // threshold
  );
  if (DEBUG.bloom) composer.addPass(bloom);

  const lensFlare = new LensFlarePass(window.innerWidth, window.innerHeight, {
    intensity: 0.5,
    threshold: 2.4,
    sunRadius: 0.075,
    ghosts: lowPower ? 4 : 5,
  });
  if (DEBUG.flare) composer.addPass(lensFlare);

  const grain = new ShaderPass(GrainVignetteShader);
  grain.uniforms.uGrain.value = lowPower ? 0.022 : 0.032;
  if (DEBUG.grain) composer.addPass(grain);

  const output = new OutputPass();
  composer.addPass(output);

  // ── 배경: 은하수 스카이박스 + 별 파티클 ───────────────────────────────
  let skybox = null;
  let starField = null;

  function buildBackground(textures) {
    if (!DEBUG.sky) return;
    // 8k 은하수 스카이박스
    const geo = new THREE.SphereGeometry(9000, 64, 40);
    geo.scale(-1, 1, 1); // 안쪽에서 보이도록 뒤집기
    const mat = new THREE.MeshBasicMaterial({
      map: textures.stars || null,
      color: new THREE.Color(0xb6bfd0),   // 은하수 띠가 보일 만큼만
      depthWrite: false,
      fog: false,
    });
    skybox = new THREE.Mesh(geo, mat);
    skybox.renderOrder = -1000;
    skybox.frustumCulled = false;
    // 은하수 면을 황도에 대해 60° 기울여 놓는다 (실제 은하 적도 경사와 비슷하게)
    skybox.rotation.z = THREE.MathUtils.degToRad(60.2);
    scene.add(skybox);

    // 추가 별 파티클 — 반드시 원형 소프트 텍스처 사용 (기본 사각형 금지)
    const count = lowPower ? 5000 : 14000;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const siz = new Float32Array(count);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      // 구 껍질에 균일 분포
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const r = 1400 + Math.pow(Math.random(), 0.55) * 5200;
      pos[i * 3] = Math.cos(th) * s * r;
      pos[i * 3 + 1] = u * r;
      pos[i * 3 + 2] = Math.sin(th) * s * r;

      // 색온도 분포 (푸른 별 · 흰 별 · 붉은 별)
      const t = Math.random();
      if (t > 0.9) c.setHSL(0.07, 0.55, 0.72);
      else if (t < 0.14) c.setHSL(0.6, 0.45, 0.8);
      else c.setHSL(0.58, 0.06, 0.9);
      const b = 0.35 + Math.pow(Math.random(), 2.2) * 0.85;
      col[i * 3] = c.r * b;
      col[i * 3 + 1] = c.g * b;
      col[i * 3 + 2] = c.b * b;

      siz[i] = 6 + Math.pow(Math.random(), 5) * 46;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    sg.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));

    const sm = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: softDotTexture() },
        uTime: { value: 0 },
        uPixelRatio: { value: renderer.getPixelRatio() },
      },
      vertexShader: /* glsl */ `
        attribute float aSize;
        varying vec3 vColor;
        varying float vTw;
        uniform float uTime;
        uniform float uPixelRatio;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // 별마다 다른 위상으로 반짝임
          float seed = position.x * 0.013 + position.y * 0.021 + position.z * 0.017;
          vTw = 0.75 + 0.25 * sin(uTime * 1.6 + seed);
          gl_PointSize = min(aSize * uPixelRatio * (300.0 / -mv.z), 8.0 * uPixelRatio);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying vec3 vColor;
        varying float vTw;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          if (t.a < 0.01) discard;
          gl_FragColor = vec4(vColor * vTw * 1.4, t.a);
        }
      `,
      transparent: true,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });

    starField = new THREE.Points(sg, sm);
    starField.frustumCulled = false;
    starField.renderOrder = -900;
    scene.add(starField);
  }

  // ── 리사이즈 ──────────────────────────────────────────────────────────
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2));
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    bloom.setSize(w, h);
    lensFlare.setSize(w, h);
    if (starField) starField.material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  }
  window.addEventListener('resize', resize);

  return {
    lowPower,
    renderer,
    labelRenderer,
    scene,
    camera,
    controls,
    composer,
    bloom,
    lensFlare,
    grain,
    sunLight,
    buildBackground,
    resize,
    get skybox() { return skybox; },
    get starField() { return starField; },
  };
}
