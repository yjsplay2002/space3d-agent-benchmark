import * as THREE from 'three';
import './style.css';
import { createScene } from './scene.js';
import {
  createSolarSystem, createSoftParticleTexture, createStarField, loadBodyTextures,
} from './bodies.js';
import { createFlowingOrbits } from './orbits.js';
import { PLANETS } from './data/bodies.js';
import {
  dateToJulian, getEphemeris, julianToDate,
} from './ephemeris.js';
import { CinematicCamera } from './camera.js';
import { MoonView } from './moonview.js';
import { SpaceUI } from './ui.js';

const app = document.querySelector('#app');
app.innerHTML = '<main class="space-viewport" data-viewport aria-label="3D 태양계"></main>';
const viewport = app.querySelector('[data-viewport]');

let solarSystem = null;
let cameraRig = null;
let moonView = null;
let latestEphemeris = null;
let playing = true;
let speed = 1;
let selectedId = null;
let hoveredId = null;

const now = new Date();
let simulationJd = dateToJulian(now);
let lastMoonDraw = -Infinity;
let lastMoonDrawTime = -Infinity;
let lastDateKey = '';

function forceAstronomyUpdate() {
  if (!solarSystem) return;
  latestEphemeris = getEphemeris(simulationJd);
  solarSystem.update(latestEphemeris, performance.now() / 1000, 0, selectedId, hoveredId);
  moonView.update(simulationJd, latestEphemeris.phase);
  ui.updateSelectedPhase(latestEphemeris.phase);
  lastMoonDraw = simulationJd;
  lastMoonDrawTime = performance.now();
  updateDateLabel(true);
}

function changeDay(days) {
  simulationJd += days;
  forceAstronomyUpdate();
}

function goToday() {
  simulationJd = dateToJulian(new Date());
  forceAstronomyUpdate();
}

function selectBody(id) {
  if (!solarSystem || !latestEphemeris) return;
  selectedId = id;
  solarSystem.select(id);
  cameraRig.flyTo(id);
  ui.select(id, latestEphemeris.phase);
}

function returnOverview() {
  selectedId = null;
  solarSystem?.select(null);
  cameraRig?.returnOverview();
  ui.clearSelection();
}

const ui = new SpaceUI(app, {
  changeDay,
  today: goToday,
  overview: returnOverview,
  select: selectBody,
  play: (value) => { playing = value; },
  speed: (value) => { speed = value; },
});

function updateDateLabel(force = false) {
  const date = julianToDate(simulationJd);
  const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
  if (force || key !== lastDateKey) {
    ui.setDate(date);
    lastDateKey = key;
  }
}

async function boot() {
  const runtime = createScene(viewport);
  const textures = await loadBodyTextures(runtime.renderer, (progress) => ui.setLoading(progress * 0.9));
  runtime.setGalaxy(textures.galaxy);
  createStarField(runtime.scene, createSoftParticleTexture());
  solarSystem = createSolarSystem(runtime.scene, textures);
  const orbits = createFlowingOrbits(runtime.scene, PLANETS);
  cameraRig = new CinematicCamera(runtime.camera, runtime.controls, solarSystem.objects);
  moonView = new MoonView(app.querySelector('[data-moon-root]'));

  latestEphemeris = getEphemeris(simulationJd);
  solarSystem.update(latestEphemeris, 0, 0, null, null);
  moonView.update(simulationJd, latestEphemeris.phase);
  updateDateLabel(true);
  ui.setLoading(0.96);

  setupInteraction(runtime);
  ui.finishLoading();

  let previous = performance.now();
  const clockStart = previous;
  function animate(frameTime) {
    requestAnimationFrame(animate);
    const elapsed = (frameTime - clockStart) / 1000;
    const deltaSeconds = Math.min(0.05, Math.max(0, (frameTime - previous) / 1000));
    previous = frameTime;
    const deltaDays = playing ? deltaSeconds * speed * 0.02 : 0;
    simulationJd += deltaDays;
    latestEphemeris = getEphemeris(simulationJd);
    solarSystem.update(latestEphemeris, elapsed, deltaDays, selectedId, hoveredId);
    orbits.update(elapsed, latestEphemeris, selectedId);
    cameraRig.update(frameTime, elapsed);
    updateLabelVisibility(runtime.camera);
    updateDateLabel();
    if (
      Math.abs(simulationJd - lastMoonDraw) >= 0.035
      && frameTime - lastMoonDrawTime >= 90
    ) {
      moonView.update(simulationJd, latestEphemeris.phase);
      ui.updateSelectedPhase(latestEphemeris.phase);
      lastMoonDraw = simulationJd;
      lastMoonDrawTime = frameTime;
    }
    runtime.render(elapsed);
  }
  requestAnimationFrame(animate);

  function updateLabelVisibility(camera) {
    for (const [id, object] of solarSystem.objects) {
      const distance = camera.position.distanceTo(object.position);
      const fade = THREE.MathUtils.clamp(1 - (distance - 42) / 82, 0.16, 1);
      object.userData.label.element.style.opacity = String(
        id === selectedId || id === hoveredId ? 1 : fade,
      );
    }
  }
}

function setupInteraction(runtime) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerDown = new THREE.Vector2();
  let pointerTravel = 0;

  function setPointer(event) {
    const rect = runtime.renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    cameraRig.setPointer(pointer.x, pointer.y);
  }

  runtime.renderer.domElement.addEventListener('pointerdown', (event) => {
    setPointer(event);
    pointerDown.set(event.clientX, event.clientY);
    pointerTravel = 0;
  });

  runtime.renderer.domElement.addEventListener('pointermove', (event) => {
    setPointer(event);
    pointerTravel = Math.max(pointerTravel, pointerDown.distanceTo(new THREE.Vector2(event.clientX, event.clientY)));
    raycaster.setFromCamera(pointer, runtime.camera);
    const hit = raycaster.intersectObjects(solarSystem.pickables, false)[0];
    hoveredId = hit?.object.userData.bodyId ?? null;
    runtime.renderer.domElement.classList.toggle('is-hovering-body', Boolean(hoveredId));
  });

  runtime.renderer.domElement.addEventListener('pointerup', () => {
    if (pointerTravel > 7) return;
    raycaster.setFromCamera(pointer, runtime.camera);
    const hit = raycaster.intersectObjects(solarSystem.pickables, false)[0];
    if (hit) selectBody(hit.object.userData.bodyId);
  });

  app.addEventListener('click', (event) => {
    const label = event.target.closest('.body-label');
    if (label) selectBody(label.dataset.body);
  });

  window.addEventListener('keydown', (event) => {
    if (event.target.matches('input, button, textarea')) return;
    if (event.key === 'Escape') returnOverview();
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      changeDay(-1);
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      changeDay(1);
    }
  });
}

boot().catch((error) => {
  console.error(error);
  const loading = app.querySelector('[data-loading]');
  if (loading) {
    loading.querySelector('p').textContent = '항법 시스템을 시작하지 못했습니다';
    loading.querySelector('[data-loading-text]').textContent = '새로고침해 주세요';
  }
});
