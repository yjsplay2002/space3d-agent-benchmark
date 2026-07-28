/**
 * src/main.js — 부트스트랩
 *
 * 로딩 → 씬 구성 → 이벤트 연결 → 렌더 루프.
 * 시뮬레이션 시각(state.jd)이 모든 것의 단일 진실 공급원이다.
 * 행성 위치·달 위상·소행성대까지 전부 jd 하나로부터 계산된다.
 */

import './style.css';
import * as THREE from 'three';

import { createStage } from './scene.js';
import { loadTextures, extractImageData, proceduralMoonPixels } from './textures.js';
import { createSolarSystem } from './bodies.js';
import { createOrbits } from './orbits.js';
import { createCameraRig } from './camera.js';
import { createMoonView } from './moonview.js';
import { createUI, todayJD } from './ui.js';
import { dateToJD } from './ephemeris.js';

// ─────────────────────────────────────────────────────────────────────────────
// 상태
// ─────────────────────────────────────────────────────────────────────────────

const state = {
  jd: todayJD(),      // 지금 이 순간 (UTC 기준 율리우스일)
  playing: false,
  speed: 1,           // 1배속 = 실시간 1초에 하루
  selected: null,
  hovered: null,
};

const loaderEl = document.getElementById('loader');
const fillEl = document.getElementById('loader-fill');
const pctEl = document.getElementById('loader-pct');
const whatEl = document.getElementById('loader-what');

const LOADING_LABELS = {
  sun: '태양에 불을 붙이는 중…',
  mercury: '수성을 빚는 중…',
  venus: '금성에 구름을 씌우는 중…',
  earthDay: '지구에 바다를 붓는 중…',
  earthNight: '도시에 불을 켜는 중…',
  earthClouds: '구름을 띄우는 중…',
  moon: '달에 바다를 새기는 중…',
  mars: '화성에 붉은 모래를 뿌리는 중…',
  jupiter: '목성에 줄무늬를 그리는 중…',
  saturn: '토성 고리를 다듬는 중…',
  saturnRing: '고리에 얼음 조각을 채우는 중…',
  uranus: '천왕성을 옆으로 눕히는 중…',
  neptune: '해왕성에 바람을 부는 중…',
  stars: '은하수를 펼치는 중…',
};

// ─────────────────────────────────────────────────────────────────────────────
// 부트
// ─────────────────────────────────────────────────────────────────────────────

const viewport = document.getElementById('viewport');
const labels = document.getElementById('labels');
const stage = createStage(viewport, labels);

const {
  renderer, labelRenderer, scene, camera, controls,
  composer, lensFlare, grain, lowPower,
} = stage;

let system = null;
let orbitLayer = null;
let rig = null;
let ui = null;
let moonView = null;
let ready = false;

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2(-2, -2);
let pointerInside = false;
let lastPointerMoveAt = 0;

// ─────────────────────────────────────────────────────────────────────────────

loadTextures(renderer, (p, key) => {
  const pct = Math.round(p * 100);
  fillEl.style.width = `${pct}%`;
  pctEl.textContent = String(pct);
  whatEl.textContent = LOADING_LABELS[key] || '우주를 준비하는 중…';
}).then((textures) => {
  boot(textures);
}).catch((err) => {
  // 여기까지 오면 안 되지만, 어떤 경우에도 화면이 멈추지 않게 한다
  console.error('[space3d] 초기화 실패', err);
  whatEl.textContent = '문제가 생겼어요. 새로고침 해 주세요.';
});

function boot(textures) {
  stage.buildBackground(textures);

  system = createSolarSystem(scene, textures, { lowPower });
  orbitLayer = createOrbits(scene, system, state.jd, { lowPower });
  rig = createCameraRig(camera, controls);

  // 궤도 라인 두께는 화면 기준 픽셀 폭으로 고정한다
  orbitLayer.setPixelScale(camera, window.innerHeight);
  window.addEventListener('resize', () => orbitLayer.setPixelScale(camera, window.innerHeight));

  // 첫 위치 계산 (라벨/카메라가 한 프레임도 어긋나지 않도록)
  system.update(state.jd, 0);

  // ── 달 인셋 패널 ────────────────────────────────────────────────────
  moonView = createMoonView({
    canvas: document.getElementById('moon-canvas'),
    nameEl: document.getElementById('moon-phase-name'),
    illumEl: document.getElementById('moon-illum'),
    ageEl: document.getElementById('moon-age'),
    toFullEl: document.getElementById('moon-tofull'),
    whyEl: document.getElementById('moon-why'),
  });
  // 달 표면 텍스처의 픽셀을 뽑아 위상 렌더에 사용 (실패 시 프로시저럴)
  const moonPixels = extractImageData(textures.moon, 512, 256) || proceduralMoonPixels(512, 256);
  moonView.setTexture(moonPixels);
  moonView.update(state.jd, true);

  // ── UI ──────────────────────────────────────────────────────────────
  ui = createUI(state, {
    onDateJump: jumpDate,
    onPlayToggle: togglePlay,
    onSpeedChange: (s) => { state.speed = s; },
    onSelect: select,
    onOverview: () => select(null),
    onFocusMoon: () => select('moon'),
  });

  // ── 입력 ────────────────────────────────────────────────────────────
  bindPointer();
  bindLabels();

  rig.snapHome();
  ready = true;

  document.body.classList.add('ready');
  loaderEl.classList.add('done');
  setTimeout(() => loaderEl.remove(), 1100);

  renderer.setAnimationLoop(tick);
}

// ─────────────────────────────────────────────────────────────────────────────
// 시간 · 날짜
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 날짜를 하루 단위로 옮긴다. **보간·감기 없이 즉시 점프**한다 —
 * 그래야 "하루 사이에 이만큼 움직였구나"가 눈에 보인다.
 * @param {number} days
 * @param {boolean} [toToday]
 */
function jumpDate(days, toToday = false) {
  state.jd = toToday ? dateToJD(new Date()) : state.jd + days;
  applyTimeImmediately();
}

/** jd 변경을 그 프레임 안에 전부 반영 */
function applyTimeImmediately() {
  system.update(state.jd, clock.getElapsedTime());
  orbitLayer.update(clock.getElapsedTime());
  moonView.update(state.jd, true);       // force — 한 박자도 늦지 않게
  ui.refreshDate();
  ui.refreshMoonHero();
}

function togglePlay() {
  state.playing = !state.playing;
  ui.refreshPlay();
}

// ─────────────────────────────────────────────────────────────────────────────
// 선택 · 호버
// ─────────────────────────────────────────────────────────────────────────────

function select(key) {
  if (key && !system.bodies[key]) return;
  state.selected = key;

  // 라벨 상태
  for (const e of system.list) {
    e.labelEl.classList.toggle('selected', e.key === key);
  }

  orbitLayer.setSpinTarget(key);          // 자전 방향 링
  orbitLayer.setHighlight(key, key ? 1 : 0);
  system.setMoonHelpers(key === 'moon');  // 달 학습 보조선

  if (!key) {
    ui.closePanel();
    rig.goHome();
    return;
  }

  const entry = system.bodies[key];
  // 달은 "지구에서 바라보는 시점"으로 간다 (옆에서 보는 게 아니라)
  if (key === 'moon') {
    entry.earthPos = system.bodies.earth.worldPos;
    rig.flyTo(entry, { fromEarth: true, duration: 2.4 });
  } else {
    rig.flyTo(entry, { duration: key === 'sun' ? 2.6 : 2.2 });
  }
  ui.openPanel(key, moonView);
}

function bindPointer() {
  const dom = renderer.domElement;

  dom.addEventListener('pointermove', (e) => {
    pointerNdc.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    );
    pointerInside = true;
    lastPointerMoveAt = performance.now();
  }, { passive: true });

  dom.addEventListener('pointerleave', () => { pointerInside = false; });

  // 드래그와 클릭을 구분한다
  let downX = 0, downY = 0, downT = 0;
  dom.addEventListener('pointerdown', (e) => {
    downX = e.clientX; downY = e.clientY; downT = performance.now();
  });
  dom.addEventListener('pointerup', (e) => {
    const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
    const dt = performance.now() - downT;
    if (moved > 7 || dt > 550) return;   // 드래그였다

    pointerNdc.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    );
    const hit = pick();
    if (hit) select(hit);
    // 빈 공간 클릭은 아무것도 하지 않는다 (실수로 패널이 닫히지 않도록)
  });
}

/** 라벨 클릭도 천체 클릭과 동일하게 동작 */
function bindLabels() {
  for (const e of system.list) {
    e.labelEl.addEventListener('click', (ev) => {
      ev.stopPropagation();
      select(e.key);
    });
    e.labelEl.addEventListener('pointerenter', () => setHover(e.key));
    e.labelEl.addEventListener('pointerleave', () => setHover(null));
  }
}

function pick() {
  raycaster.setFromCamera(pointerNdc, camera);
  // 아주 작은 행성도 잡히도록 넉넉한 히트박스를 쓴다
  const hits = raycaster.intersectObjects(system.pickables, false);
  return hits.length ? hits[0].object.userData.key : null;
}

function setHover(key) {
  if (state.hovered === key) return;
  state.hovered = key;
  for (const e of system.list) {
    const on = e.key === key;
    e.labelEl.classList.toggle('hovered', on);
    e.halo.material.opacity = on ? 0.9 : 0;
  }
  renderer.domElement.style.cursor = key ? 'pointer' : '';
  if (!state.selected) orbitLayer.setHighlight(key, key ? 0.65 : 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// 라벨 페이드 (거리에 따라)
// ─────────────────────────────────────────────────────────────────────────────

const _lv = new THREE.Vector3();

function updateLabels() {
  const camPos = camera.position;
  for (const e of system.list) {
    const d = _lv.copy(e.worldPos).sub(camPos).length();
    const el = e.labelEl;

    // 아주 멀리 물러났을 때만 흐려진다 (작은 행성도 전체 뷰에서 계속 보이도록
    // 반지름이 아니라 절대 거리로 판정한다)
    let op = 1;
    if (d > 1400) op = Math.max(0, 1 - (d - 1400) / 2200);
    // 천체 안으로 들어갈 만큼 가까워지면 사라진다
    const nearLimit = Math.max(e.radius * 2.6, 0.9);
    if (d < nearLimit) op = Math.min(op, Math.max(0, (d - e.radius * 1.15) / (nearLimit - e.radius * 1.15)));

    // 태양계 전체 뷰에서 달 라벨은 지구와 겹치므로 가까울 때만 보여준다
    if (e.key === 'moon' && d > 120) op = 0;

    if (state.selected === e.key || state.hovered === e.key) op = Math.max(op, 0.95);

    el.style.opacity = op.toFixed(3);
    el.style.display = op < 0.02 ? 'none' : '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 렌더 루프
// ─────────────────────────────────────────────────────────────────────────────

const _sunScreen = new THREE.Vector3();
let lastHeroRefresh = 0;

function tick() {
  if (!ready) return;
  const dt = Math.min(clock.getDelta(), 0.1);
  const elapsed = clock.getElapsedTime();

  // 시간 진행 — 1배속 = 실시간 1초에 하루
  if (state.playing) {
    state.jd += dt * state.speed;
    ui.refreshDate();
  }

  // 천체 위치 · 자전
  system.update(state.jd, elapsed);
  orbitLayer.update(elapsed);

  // 달 인셋 (재생 중이면 스로틀, 날짜 점프는 force 로 이미 처리됨)
  if (state.playing) {
    moonView.update(state.jd, false);
    // 정보 패널의 달 블록은 DOM 갱신이라 10Hz 정도면 충분하다
    const now = performance.now();
    if (now - lastHeroRefresh > 100) {
      lastHeroRefresh = now;
      ui.refreshMoonHero();
    }
  }

  // 호버 판정 (포인터가 멈춰 있어도 천체가 움직이므로 매 프레임 검사)
  if (pointerInside && !rig.isFlying && performance.now() - lastPointerMoveAt < 8000) {
    setHover(pick());
  }

  // 카메라 (fly-in / 추적 / 드리프트 · 패럴랙스)
  rig.update(dt, system);

  // 렌즈플레어 — 태양의 스크린 위치를 넘긴다.
  // 태양이 다른 천체에 가려졌는지까지는 보지 않고, 화면 안에 있는지만 본다.
  _sunScreen.copy(system.bodies.sun.worldPos);
  lensFlare.updateSun(_sunScreen, camera, 1);

  grain.uniforms.uTime.value = elapsed;
  if (stage.starField) stage.starField.material.uniforms.uTime.value = elapsed;

  updateLabels();

  composer.render(dt);
  labelRenderer.render(scene, camera);
}
