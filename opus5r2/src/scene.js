/**
 * scene.js — 렌더러 / 카메라 / 컨트롤 / 후처리 파이프라인.
 *
 * 파이프라인:
 *   RenderPass → UnrealBloomPass → LensFlarePass(Chapman) → 필름그레인+비네트 → OutputPass
 * 톤매핑은 ACESFilmic, 출력 색공간 변환은 OutputPass 가 담당한다.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { LensFlarePass, FilmVignetteShader } from './postfx.js';
import { CAMERA_NEAR, CAMERA_FAR, OVERVIEW_POSITION } from './scale.js';

export function createScene(canvas, labelContainer) {
  /* ── 렌더러 ─────────────────────────────────────────────── */
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // 상한 2
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000005, 1);

  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

  /* ── 씬 / 카메라 ────────────────────────────────────────── */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000005);
  scene.fog = null;

  const camera = new THREE.PerspectiveCamera(
    52,
    window.innerWidth / window.innerHeight,
    CAMERA_NEAR,
    CAMERA_FAR
  );
  camera.position.set(...OVERVIEW_POSITION);
  camera.lookAt(0, 0, 0);

  /* ── 컨트롤 ─────────────────────────────────────────────── */
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.9;
  controls.panSpeed = 0.6;
  controls.screenSpacePanning = true;
  controls.minDistance = 0.05; // 행성 표면 근접까지
  controls.maxDistance = 3200; // 태양계 전체 뷰
  controls.enablePan = true;
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN, // 핀치 줌
  };

  /* ── CSS2D 라벨 ─────────────────────────────────────────── */
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.top = '0';
  labelRenderer.domElement.style.left = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  labelContainer.appendChild(labelRenderer.domElement);

  /* ── 후처리 ─────────────────────────────────────────────── */
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  composer.setSize(window.innerWidth, window.innerHeight);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.86, // strength
    0.62, // radius
    0.42 // threshold
  );
  composer.addPass(bloomPass);

  const lensFlare = new LensFlarePass(window.innerWidth, window.innerHeight, {
    // 너무 낮추면 궤도 빛 펄스가 전부 고스트로 번진다 — 태양 코어만 추출
    threshold: 1.6,
    knee: 0.75,
    maskRadius: 0.15,
    intensity: 0.5,
    dispersal: 0.3,
    haloWidth: 0.47,
    distortion: 0.0085,
    ghosts: 5,
    starburst: 0.85,
  });
  composer.addPass(lensFlare);

  const filmPass = new ShaderPass(FilmVignetteShader);
  composer.addPass(filmPass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  /* ── 리사이즈 ───────────────────────────────────────────── */
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio, 2);

    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h);

    composer.setPixelRatio(dpr);
    composer.setSize(w, h);

    bloomPass.setSize(w, h);
    lensFlare.setSize(w * dpr, h * dpr);
    labelRenderer.setSize(w, h);
  }

  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(resize, 220));

  return {
    renderer,
    scene,
    camera,
    controls,
    labelRenderer,
    composer,
    bloomPass,
    lensFlare,
    filmPass,
    maxAnisotropy,
    resize,
    render() {
      composer.render();
      labelRenderer.render(scene, camera);
    },
  };
}

/* ══════════════════════════════════════════════════════════════
   태양 스크린 좌표 계산 (렌즈플레어 입력)
   ══════════════════════════════════════════════════════════════ */

const _sunNdc = new THREE.Vector3();

/**
 * 태양의 스크린 UV 와 가시성을 계산해 렌즈플레어 패스에 넣는다.
 * 화면 밖으로 나가면 부드럽게 0 으로 떨어뜨려 깜빡임을 막는다.
 */
export function updateSunScreenPosition(lensFlare, camera, sunWorldPos, sunRadius) {
  _sunNdc.copy(sunWorldPos).project(camera);

  const uvX = _sunNdc.x * 0.5 + 0.5;
  const uvY = _sunNdc.y * 0.5 + 0.5;

  // 카메라 뒤쪽이면 완전히 끈다
  let visible = _sunNdc.z < 1 ? 1 : 0;

  // 화면 경계 밖으로 나가면 서서히 감쇠
  const margin = 0.22;
  const fx = Math.min(uvX + margin, 1 + margin - uvX) / margin;
  const fy = Math.min(uvY + margin, 1 + margin - uvY) / margin;
  visible *= THREE.MathUtils.clamp(Math.min(fx, fy), 0, 1);

  // 태양이 아주 멀면(작으면) 플레어도 약해진다
  const dist = camera.position.distanceTo(sunWorldPos);
  const apparent = sunRadius / Math.max(dist, 1e-3);
  visible *= THREE.MathUtils.clamp(apparent * 22, 0.12, 1);

  lensFlare.setSun(uvX, uvY, visible);
  return visible;
}
