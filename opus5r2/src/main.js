/**
 * main.js — 부트스트랩.
 *
 * 시간 모델
 *   · currentJd(율리우스일)가 유일한 진실. 모든 천체 위치와 달 위상이 여기서 나온다.
 *   · 재생 중에는 currentJd += dt * speed  (speed 단위 = 일/초, 1× = 1초에 하루)
 *   · 날짜 버튼/←→ 키는 currentJd 를 ±1 하고 **그 프레임에 즉시** 전부 갱신한다.
 *     보간이나 배속 감기는 없다 — 하루 사이의 이동량이 그대로 보여야 하기 때문.
 */

import './style.css';
import * as THREE from 'three';

import { createScene, updateSunScreenPosition } from './scene.js';
import { loadAllTextures } from './textures.js';
import {
  createSolarSystem,
  updateBodies,
  updateBodyEffects,
  createMoonHelpers,
  updateMoonHelpers,
} from './bodies.js';
import { createOrbits } from './orbits.js';
import { CinematicCamera } from './camera.js';
import { MoonView } from './moonview.js';
import { UI, createLabel } from './ui.js';
import { dateToJD, jdToDate, moonPhase } from './ephemeris.js';
import { BODY_BY_KEY, ALL_BODIES } from './data/bodies.js';

/* ══════════════════════════════════════════════════════════════
   상태
   ══════════════════════════════════════════════════════════════ */

const state = {
  jd: dateToJD(new Date()),
  playing: true,
  speed: 1, // 일 / 초
  selected: null,
  hovered: null,
  dirty: true, // 이번 프레임에 천체 재배치가 필요한가
};

/* ══════════════════════════════════════════════════════════════
   부트
   ══════════════════════════════════════════════════════════════ */

const canvas = document.getElementById('scene-canvas');
const labelHost = document.getElementById('labels');

const view = createScene(canvas, labelHost);

const ui = new UI({
  onSelect: (key) => selectBody(key),
  onClose: () => deselect(),
  onOverview: () => deselect(),
  onDayStep: (d) => stepDay(d),
  onToday: () => goToday(),
  onPlayToggle: () => togglePlay(),
  onSpeedChange: (s) => {
    state.speed = s;
    ui.setSpeed(s);
  },
});

ui.setDate(jdToDate(state.jd));
ui.setSpeed(state.speed, { syncSlider: true });
ui.setPlaying(state.playing);

const moonView = new MoonView(
  document.getElementById('moon-canvas'),
  document.getElementById('moon-sun-arrow')
);

let system = null;
let orbits = null;
let moonHelpers = null;
let cinema = null;
const labels = new Map();

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(-10, -10);
const clock = new THREE.Clock();

let started = false;

async function boot() {
  ui.setLoading(0.02, '우주');

  const [textures] = await Promise.all([
    loadAllTextures((pct, label) => ui.setLoading(pct * 0.9, label), view.maxAnisotropy),
    moonView.init(),
  ]);

  ui.setLoading(0.94, '태양계');

  system = createSolarSystem(textures);
  view.scene.add(system.root);

  orbits = createOrbits(system, state.jd);
  view.scene.add(orbits.group);

  moonHelpers = createMoonHelpers(system);

  cinema = new CinematicCamera(view.camera, view.controls);

  // ── 이름 라벨
  for (const data of ALL_BODIES) {
    const body = system.byKey[data.key];
    if (!body) continue;
    const { object, el } = createLabel(data, (key) => selectBody(key));
    const host = data.key === 'sun' ? body.group : body.anchor;
    const offset = data.key === 'sun' ? body.radius * 1.32 : Math.max(body.radius * 1.9, 1.1);
    object.position.set(0, offset, 0);
    host.add(object);
    labels.set(data.key, { object, el, body, data });
  }

  applyDate(true);
  ui.setLoading(1, '');
  ui.finishLoading();

  started = true;
  clock.start();
  renderLoop();
}

/* ══════════════════════════════════════════════════════════════
   날짜 / 시간
   ══════════════════════════════════════════════════════════════ */

/**
 * 천체 위치·궤도·달 패널을 현재 jd 로 즉시 동기화.
 * @param {boolean} immediate 날짜 버튼처럼 "그 자리에서" 반영해야 하는 경우
 */
function applyDate(immediate = false) {
  updateBodies(system, state.jd);
  orbits.update(state.jd, clock.elapsedTime);

  const info = moonView.render(state.jd, immediate);
  ui.updateMoonInset(info);
  ui.setDate(jdToDate(state.jd));

  // 달 패널이 열려 있으면 설명도 갱신 (DOM 전체를 다시 만들지 않고 본문만 교체)
  if (state.selected === 'moon') {
    if (immediate) ui.updateMoonWhy(info);
    else throttleMoonWhy(info);
  }
}

let moonWhyAt = 0;
function throttleMoonWhy(info) {
  const now = performance.now();
  if (now - moonWhyAt < 180) return;
  moonWhyAt = now;
  ui.updateMoonWhy(info);
}

function stepDay(delta) {
  state.jd += delta;
  applyDate(true);
  pulseDateBox();
}

function goToday() {
  state.jd = dateToJD(new Date());
  applyDate(true);
  pulseDateBox();
}

function pulseDateBox() {
  const el = document.getElementById('date-display');
  el.animate(
    [
      { transform: 'scale(1)', filter: 'brightness(1)' },
      { transform: 'scale(1.06)', filter: 'brightness(1.6)' },
      { transform: 'scale(1)', filter: 'brightness(1)' },
    ],
    { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' }
  );
}

function togglePlay() {
  state.playing = !state.playing;
  ui.setPlaying(state.playing);
}

/* ══════════════════════════════════════════════════════════════
   선택 / 호버
   ══════════════════════════════════════════════════════════════ */

function selectBody(key) {
  const body = system.byKey[key];
  const data = BODY_BY_KEY[key];
  if (!body || !data) return;

  state.selected = key;
  orbits.setSelected(key);

  for (const [k, l] of labels) l.el.classList.toggle('is-selected', k === key);

  moonHelpers.group.visible = key === 'moon';

  const worldPos = system.worldPos[key] || new THREE.Vector3();
  cinema.focusOn(body, worldPos, {
    sunPos: system.worldPos.sun,
    earthPos: system.worldPos.earth,
    fromEarth: key === 'moon',
  });

  const extra = {};
  if (key === 'moon') extra.moonInfo = moonPhase(state.jd);
  ui.showBody(data, extra);
}

function deselect() {
  if (!state.selected && !cinema) return;
  state.selected = null;
  orbits?.setSelected(null);
  for (const [, l] of labels) l.el.classList.remove('is-selected');
  if (moonHelpers) moonHelpers.group.visible = false;
  ui.hidePanel();
  cinema?.reset();
}

/* ── 포인터 ─────────────────────────────────────────────────── */

let pointerDownAt = null;

canvas.addEventListener(
  'pointermove',
  (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    cinema?.setPointer(pointer.x, pointer.y);
  },
  { passive: true }
);

canvas.addEventListener('pointerdown', (e) => {
  pointerDownAt = { x: e.clientX, y: e.clientY, t: performance.now() };
});

canvas.addEventListener('pointerup', (e) => {
  if (!pointerDownAt || !system) return;
  const dx = e.clientX - pointerDownAt.x;
  const dy = e.clientY - pointerDownAt.y;
  const moved = Math.hypot(dx, dy);
  const dt = performance.now() - pointerDownAt.t;
  pointerDownAt = null;
  // 드래그(회전)와 클릭을 구분
  if (moved > 6 || dt > 600) return;

  const nx = (e.clientX / window.innerWidth) * 2 - 1;
  const ny = -(e.clientY / window.innerHeight) * 2 + 1;
  const hit = pick(nx, ny);
  if (hit) selectBody(hit);
});

canvas.addEventListener('pointerleave', () => {
  pointer.set(-10, -10);
});

function pick(nx, ny) {
  raycaster.setFromCamera({ x: nx, y: ny }, view.camera);
  const hits = raycaster.intersectObjects(system.pickables, false);
  for (const h of hits) {
    const key = h.object.userData.bodyKey;
    if (key) return key;
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════
   렌더 루프
   ══════════════════════════════════════════════════════════════ */

const _labelWorld = new THREE.Vector3();

function renderLoop() {
  requestAnimationFrame(renderLoop);
  if (!started) return;

  const dt = Math.min(clock.getDelta(), 0.1);
  const elapsed = clock.elapsedTime;

  // ── 시간 진행
  if (state.playing) {
    state.jd += dt * state.speed;
    state.dirty = true;
  }

  if (state.dirty) {
    applyDate();
    state.dirty = state.playing;
  }

  orbits.update(state.jd, elapsed);
  updateBodyEffects(system, elapsed, state.jd);

  // ── 호버 판정 (드래그 중이 아닐 때만)
  if (pointer.x > -5 && !cinema.isFlying) {
    const key = pick(pointer.x, pointer.y);
    if (key !== state.hovered) {
      if (state.hovered) setHover(state.hovered, false);
      state.hovered = key;
      if (key) setHover(key, true);
      canvas.style.cursor = key ? 'pointer' : '';
    }
  }

  // ── 카메라
  cinema.update(dt, system);
  updateMoonHelpers(moonHelpers, system);

  // ── 라벨 거리 페이드 / 하이라이트 빌보드
  updateLabels();
  billboardHalos();

  // ── 렌즈플레어 입력
  updateSunScreenPosition(
    view.lensFlare,
    view.camera,
    system.worldPos.sun,
    system.sun.radius
  );

  view.filmPass.uniforms.uTime.value = elapsed;

  view.render();
}

function setHover(key, on) {
  const l = labels.get(key);
  if (l) l.el.classList.toggle('is-hover', on);
  const body = system.byKey[key];
  if (body?.halo) {
    body.halo.material.opacity = on ? 0.85 : 0;
  }
}

function updateLabels() {
  const cam = view.camera;
  for (const [key, l] of labels) {
    l.object.getWorldPosition(_labelWorld);
    const dist = cam.position.distanceTo(_labelWorld);
    const r = l.body.radius || 1;

    // 화면상 겉보기 크기로 페이드: 너무 멀면 흐려지고, 너무 가까우면 사라진다
    const apparent = r / dist;
    let op = THREE.MathUtils.smoothstep(apparent, 0.0009, 0.006);
    op *= 1 - THREE.MathUtils.smoothstep(apparent, 0.42, 0.95);

    // 선택된 천체와 태양은 항상 잘 보이게
    if (key === state.selected) op = Math.max(op, 0.95);
    if (key === 'sun') op = Math.max(op, 0.35);

    l.el.style.opacity = op.toFixed(3);
    l.el.style.pointerEvents = op > 0.25 ? 'auto' : 'none';

    // 라벨이 천체에 겹치지 않도록 화면 크기에 맞춰 위로 띄운다
    const lift = Math.max(r * 1.9, Math.min(dist * 0.045, r * 6));
    l.object.position.y = key === 'sun' ? r * 1.3 : lift;
  }
}

/** 호버 하이라이트 링은 항상 카메라를 향한다 */
const _tmpQ = new THREE.Quaternion();
function billboardHalos() {
  view.camera.getWorldQuaternion(_tmpQ);
  for (const b of system.planets) b.halo.quaternion.copy(_tmpQ);
  system.moon.halo.quaternion.copy(_tmpQ);
}

/* ══════════════════════════════════════════════════════════════ */

boot().catch((err) => {
  console.error(err);
  const status = document.getElementById('ld-status');
  if (status) {
    status.textContent = '앗, 우주를 여는 데 실패했어요. 새로고침 해 주세요.';
    status.style.color = '#ff8a8a';
  }
});
