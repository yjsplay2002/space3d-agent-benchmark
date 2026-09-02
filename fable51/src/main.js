// main.js — 부트스트랩
import './style.css';
import * as THREE from 'three';
import { loadTextures } from './textures.js';
import { createScene } from './scene.js';
import { createBodies, planetOrbitScenePoints, moonOrbitScenePoints, compressAU } from './bodies.js';
import { createOrbitLine, createSpinRing } from './orbits.js';
import { CameraDirector } from './camera.js';
import { MoonView } from './moonview.js';
import { createUI } from './ui.js';
import { PLANET_IDS } from './data/bodies.js';
import {
  toJulianDay, moonPhase, moonPosition, planetProgress, orbitalElements, jdAtUTCMidnight,
} from './ephemeris.js';

const sim = {
  jd: toJulianDay(new Date()),
  playing: true,
  speed: 1,        // 1x = 1초에 1시간
};

async function boot() {
  const canvas = document.getElementById('scene');
  const labelsEl = document.getElementById('labels');
  const loadingFill = document.getElementById('loading-fill');
  const loadingPct = document.getElementById('loading-pct');

  // 1) 텍스처 로딩 (진행률)
  const probe = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
  const maxAniso = probe ? Math.min(16, probe.getParameter(probe.getExtension('EXT_texture_filter_anisotropic')?.MAX_TEXTURE_MAX_ANISOTROPY_EXT || 1) || 1) : 1;
  const textures = await loadTextures((loaded, total) => {
    const pct = Math.round((loaded / total) * 100);
    loadingFill.style.width = `${pct}%`;
    loadingPct.textContent = `${pct}%`;
  }, maxAniso);
  if (textures.fallbacks.length) console.warn('프로시저럴 폴백 텍스처 사용:', textures.fallbacks.join(', '));

  // 2) 씬 / 천체 / 궤도
  const S = createScene(canvas, labelsEl, textures);
  const { scene, camera, controls } = S;
  const bodies = createBodies(scene, textures);

  const orbits = {};
  for (const id of PLANET_IDS) {
    const b = bodies.map[id];
    const a = orbitalElements(id, sim.jd).a;
    const orbit = createOrbitLine({
      points: planetOrbitScenePoints(id, sim.jd, 320),
      color: b.data.color,
      radius: 0.07 + 0.0011 * compressAU(a),
      pulseSpeed: 0.045 + 0.02 / a,
      // 근접 뷰에서는 튜브가 굵은 빛기둥으로 보이므로 궤도 크기에 비례해 가까운 구간을 페이드
      fadeNear: Math.max(b.radius * 1.3, compressAU(a) * 0.06),
    });
    orbit.builtJd = sim.jd;
    scene.add(orbit.mesh);
    orbits[id] = orbit;
  }
  const moonOrbit = createOrbitLine({ points: moonOrbitScenePoints(160), color: bodies.map.moon.data.color, radius: 0.022, pulseSpeed: 0.12, opacity: 0.9, fadeNear: 1.4 });
  bodies.map.earth.group.add(moonOrbit.mesh);
  orbits.moon = moonOrbit;

  // 자전 방향 빛 링 (선택 시 표시) — tilt 그룹의 자식이라 기울어진 축 기준
  const spinRings = {};
  for (const b of bodies.list) {
    const ring = createSpinRing({ radius: b.radius * 1.28, color: b.data.color, tube: Math.max(0.012, b.radius * 0.02), speed: b.isSun ? 0.15 : 0.35 });
    b.tilt.add(ring.mesh);
    spinRings[b.id] = ring;
  }

  // 3) UI / 카메라 / 달 인셋
  let selectedId = null;
  const director = new CameraDirector(camera, controls);
  const ui = createUI({
    bodies,
    callbacks: {
      onSelect: (id) => select(id),
      onHover: (id) => setHover(id),
      onOverview: () => overview(),
      onTogglePlay: () => setPlaying(!sim.playing),
      onSpeed: (s) => { sim.speed = s; ui.setSpeed(s); },
      onPrevDay: () => setJD(jdAtUTCMidnight(sim.jd) - 1 + (sim.jd - jdAtUTCMidnight(sim.jd)), true),
      onNextDay: () => setJD(jdAtUTCMidnight(sim.jd) + 1 + (sim.jd - jdAtUTCMidnight(sim.jd)), true),
      onToday: () => setJD(toJulianDay(new Date()), true),
    },
  });
  ui.setSpeed(sim.speed);
  ui.setPlaying(sim.playing);
  const moonView = new MoonView(document.getElementById('moon-canvas'), textures.moon.image, ui.moonDom);

  // ---- 상태 갱신
  let phase = null;
  let lastPhaseJd = -Infinity;
  const clock = new THREE.Clock();
  let elapsed = 0;

  function refresh(force = false) {
    bodies.update(sim.jd, elapsed, camera);
    for (const id of PLANET_IDS) {
      const o = orbits[id];
      o.setHead(planetProgress(id, sim.jd));
      if (Math.abs(sim.jd - o.builtJd) > 3650) { // 10년 넘게 벗어나면 궤도 요소 갱신
        o.rebuild(planetOrbitScenePoints(id, sim.jd, 320));
        o.builtJd = sim.jd;
      }
    }
    moonOrbit.setHead(moonPosition(sim.jd).lon / 360);
    if (force || Math.abs(sim.jd - lastPhaseJd) > 0.0015) {
      phase = moonPhase(sim.jd);
      lastPhaseJd = sim.jd;
      moonView.update(phase, force);
      if (selectedId === 'moon') ui.updatePanelMoon(phase);
    }
    ui.setDate(sim.jd);
    scene.updateMatrixWorld(true);
  }

  function setJD(jd, flash = false) {
    sim.jd = jd;
    refresh(true);            // 즉시 반영 (보간 없음)
    ui.setDate(sim.jd, flash);
  }
  function setPlaying(p) { sim.playing = p; ui.setPlaying(p); }

  // ---- 선택 / 호버
  const glowTargets = {};
  function setHighlightTarget(id, v) { if (id) glowTargets[id] = v; }
  function setHover(id) {
    if (hoverId === id) return;
    if (hoverId && hoverId !== selectedId) { setHighlightTarget(hoverId, 0); orbits[hoverId]?.setHighlight(0); }
    hoverId = id;
    ui.setHover(id);
    if (id && id !== selectedId) { setHighlightTarget(id, 0.55); orbits[id]?.setHighlight(0.6); }
  }
  let hoverId = null;

  function select(id) {
    const body = bodies.map[id];
    if (!body) return;
    if (selectedId) { setHighlightTarget(selectedId, 0); spinRings[selectedId]?.show(false); orbits[selectedId]?.setHighlight(0); }
    selectedId = id;
    ui.setActive(id);
    setHighlightTarget(id, 0.8);
    spinRings[id]?.show(true);
    orbits[id]?.setHighlight(1);
    bodies.map.moon.extra.helpers.visible = id === 'moon';
    if (id === 'moon') refresh(true);
    ui.showPanel(body, { moonPhase: phase });
    director.flyTo(body, bodies.map.earth);
  }
  function overview() {
    if (selectedId) { setHighlightTarget(selectedId, 0); spinRings[selectedId]?.show(false); orbits[selectedId]?.setHighlight(0); }
    selectedId = null;
    ui.setActive(null);
    ui.hidePanel();
    bodies.map.moon.extra.helpers.visible = false;
    director.flyToOverview();
  }

  // ---- 포인터 / 레이캐스트
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pickMeshes = bodies.list.map((b) => { b.mesh.userData.bodyId = b.id; return b.mesh; });
  let downPos = null, pointerMoved = false;
  canvas.addEventListener('pointerdown', (e) => { downPos = { x: e.clientX, y: e.clientY }; pointerMoved = false; });
  canvas.addEventListener('pointermove', (e) => {
    pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    director.setPointer(pointer.x, pointer.y);
    if (downPos && Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 6) pointerMoved = true;
    if (e.pointerType === 'mouse') pickHover();
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!downPos || pointerMoved) { downPos = null; return; }
    downPos = null;
    pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    const hit = pick();
    if (hit) select(hit);
  });
  canvas.addEventListener('pointerleave', () => { setHover(null); director.setPointer(0, 0); });
  function pick() {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickMeshes, false);
    return hits.length ? hits[0].object.userData.bodyId : null;
  }
  function pickHover() { setHover(pick()); }

  // ---- 키보드
  document.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.target.blur(); else return;
    }
    switch (e.key) {
      case 'ArrowLeft': e.preventDefault(); ui.setDate(sim.jd); setJD(sim.jd - 1, true); break;
      case 'ArrowRight': e.preventDefault(); setJD(sim.jd + 1, true); break;
      case ' ': e.preventDefault(); setPlaying(!sim.playing); break;
      case 'Escape': overview(); break;
      case 'Home': case 't': case 'T': setJD(toJulianDay(new Date()), true); break;
      default: return;
    }
  });

  // 디버그/테스트용 훅
  window.__space3d = { sim, camera, controls, director, bodies, select, overview, setJD, renderer: S.renderer, composer: S.composer, get phase() { return phase; } };

  // ---- 초기 상태
  refresh(true);
  ui.hideLoading();
  // 도입 연출: 넓은 뷰에서 오버뷰로 부드럽게
  camera.position.set(40, 420, 760);
  controls.target.set(0, 0, 0);
  director.flyToOverview();

  // ---- 루프
  const sunPos = new THREE.Vector3(0, 0, 0);
  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.1);
    elapsed += dt;
    if (sim.playing) sim.jd += (dt * sim.speed) / 24;
    refresh(false);
    director.update(dt);
    // 하이라이트 셸 부드럽게
    for (const b of bodies.list) {
      if (!b.highlight) continue;
      const u = b.highlight.material.uniforms.uStrength;
      const target = glowTargets[b.id] || 0;
      u.value += (target - u.value) * 0.1;
      b.highlight.visible = u.value > 0.01;
    }
    for (const o of Object.values(orbits)) o.update(elapsed);
    for (const r of Object.values(spinRings)) r.update(elapsed);
    S.updateSunScreenPos(sunPos);
    ui.updateLabels(camera);
    S.render(dt, elapsed);
  }
  loop();
}

boot().catch((err) => {
  console.error(err);
  const el = document.getElementById('loading-pct');
  if (el) el.textContent = '오류: ' + err.message;
});
