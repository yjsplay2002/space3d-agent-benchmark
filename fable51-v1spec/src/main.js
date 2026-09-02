import './style.css';
import * as THREE from 'three';
import { createScene } from './scene.js';
import { createTextureLoader } from './textures.js';
import { createSolarSystem } from './bodies.js';
import { createCameraRig } from './camera.js';
import { createUI } from './ui.js';

const app = document.getElementById('app');

// ---------- 시뮬레이션 상태 ----------
const sim = {
  days: 0,
  speed: 1, // 1초 = 1일
  paused: false,
  selected: null,
  hovered: null,
};

// ---------- UI ----------
const ui = createUI({
  onPlayToggle: () => {
    sim.paused = !sim.paused;
    ui.setPlaying(!sim.paused);
  },
  onSpeedChange: (s) => (sim.speed = s),
  onOverview: () => deselect(),
  onClosePanel: () => deselect(),
});
ui.setSpeed(sim.speed);

// ---------- 씬 ----------
const { scene, camera, renderer, flarePass, render } = createScene(app);
const tex = createTextureLoader(
  (p) => ui.setProgress(p),
  () => ui.finishLoading(),
  renderer.capabilities.getMaxAnisotropy(),
);
const system = createSolarSystem(scene, tex);
const rig = createCameraRig(camera, renderer.domElement);

// 로딩이 캐시로 즉시 끝나 onLoad 가 안 오는 경우 대비
setTimeout(() => ui.finishLoading(), 12000);

// ---------- 선택 / 호버 ----------
function select(body) {
  if (!body || sim.selected === body) return;
  sim.selected = body;
  system.setSelected(body);
  rig.focus(body);
  ui.showPanel(body.data);
}

function deselect() {
  if (!sim.selected) return;
  sim.selected = null;
  system.setSelected(null);
  rig.overview();
  ui.hidePanel();
}

function setHover(body) {
  if (sim.hovered === body) return;
  if (sim.hovered) {
    sim.hovered.setHighlight(false);
    sim.hovered.label.element.classList.remove('hover');
  }
  sim.hovered = body;
  if (body) {
    body.setHighlight(true);
    body.label.element.classList.add('hover');
  }
  renderer.domElement.style.cursor = body ? 'pointer' : '';
}

// 라벨 클릭
for (const b of system.bodies) {
  b.label.element.addEventListener('click', (e) => {
    e.stopPropagation();
    select(b);
  });
  b.label.element.addEventListener('pointerenter', () => setHover(b));
  b.label.element.addEventListener('pointerleave', () => setHover(null));
}

// 레이캐스트
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let downPos = null;

function pick(clientX, clientY) {
  ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(system.pickables, false);
  return hits.length ? hits[0].object.userData.body : null;
}

const canvas = renderer.domElement;
canvas.addEventListener('pointerdown', (e) => {
  downPos = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerup', (e) => {
  if (!downPos) return;
  const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
  downPos = null;
  if (moved > 6) return;
  const body = pick(e.clientX, e.clientY);
  if (body) select(body);
});
canvas.addEventListener('pointermove', (e) => {
  rig.setPointer((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  if (e.pointerType === 'touch') return;
  setHover(pick(e.clientX, e.clientY));
});
canvas.addEventListener('pointerleave', () => {
  rig.setPointer(0, 0);
  setHover(null);
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') deselect();
  if (e.key === ' ' && e.target === document.body) {
    e.preventDefault();
    sim.paused = !sim.paused;
    ui.setPlaying(!sim.paused);
  }
});

// ---------- 루프 ----------
const clock = new THREE.Clock();
let elapsed = 0;
const sunWorld = new THREE.Vector3();

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.1);
  elapsed += dt;
  if (!sim.paused) sim.days += dt * sim.speed;

  system.update(sim.days, elapsed);
  rig.update(dt);
  system.byId.sun.group.getWorldPosition(sunWorld);
  flarePass.updateSun(sunWorld, camera);
  system.updateLabels(camera);
  ui.setClock(sim.days);
  render(dt);
}
loop();
