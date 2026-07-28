/**
 * Space3D — 부트스트랩
 */
import './style.css';
import * as THREE from 'three';
import { createScene } from './scene.js';
import {
  createSolarSystem,
  loadAllTextures,
  attachSpinRing,
  removeSpinRing,
} from './bodies.js';
import { updateOrbitMaterial, updateSpinRing } from './orbits.js';
import { CinematicCamera } from './camera.js';
import { UIController, createLabelElement } from './ui.js';
import { MoonView } from './moonview.js';
import {
  computeState,
  dateToJD,
  jdToDate,
  moonPhase,
} from './ephemeris.js';
import { BODIES, PLANET_ORDER } from './data/bodies.js';

const canvas = document.getElementById('c');
const labelsRoot = document.getElementById('labels');

const {
  scene,
  camera,
  controls,
  renderer,
  updateSunFlare,
  render,
} = createScene(canvas);

const cine = new CinematicCamera(camera, controls);

// Simulation clock
let simDate = new Date(); // local → use as UTC noon-ish for display
// normalize to UTC date at 12:00
simDate = new Date(Date.UTC(simDate.getFullYear(), simDate.getMonth(), simDate.getDate(), 12, 0, 0));
let playing = true;
let speed = 1; // days per second at 1x... we'll use slower base
// At 1x: 1 day per real 20 seconds for educational pacing, scaled by speed slider
const BASE_DAYS_PER_SEC = 1 / 30;
let selectedId = null;
let world = null;
let moonView = null;
let labels = {};
let raycaster = new THREE.Raycaster();
let pointer = new THREE.Vector2();
let hoverId = null;
let moonHelpers = null; // earth-moon-sun guide lines when moon selected

const ui = new UIController({
  onSelect: (id) => selectBody(id),
  onOverview: () => {
    clearSelection();
    cine.goOverview();
  },
  onDateChange: (delta) => {
    if (delta === 'today') {
      const n = new Date();
      simDate = new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate(), 12, 0, 0));
    } else {
      simDate = new Date(simDate.getTime() + delta * 86400000);
    }
    applyEphemeris(true);
  },
  onPlayToggle: (p) => {
    playing = p;
  },
  onSpeedChange: (v) => {
    speed = v;
  },
});

function applyEphemeris(immediate = false) {
  if (!world) return;
  const state = computeState(simDate);
  ui.setDate(state.date);

  // Place planets by true ecliptic longitude (angle real); distance = fixed educational scale
  for (const id of PLANET_ORDER) {
    const p = state.planets[id];
    const body = world.bodies[id];
    if (!p || !body) continue;
    // Keep planet on its educational orbit circle (mean AU), use true lon/lat angles
    const r = body.distance;
    const lon = (p.lon * Math.PI) / 180;
    const lat = (p.lat * Math.PI) / 180;
    body.pivot.position.set(
      r * Math.cos(lat) * Math.cos(lon),
      r * Math.sin(lat),
      r * Math.cos(lat) * Math.sin(lon)
    );
    const phase = ((p.lon % 360) + 360) % 360 / 360;
    if (body.orbit) {
      updateOrbitMaterial(body.orbit, performance.now() * 0.001, phase);
    }
  }

  // Moon relative to earth (geocentric ecliptic direction, visual radius)
  const moon = world.bodies.moon;
  const earth = world.bodies.earth;
  if (moon && earth && state.moon) {
    const m = state.moon;
    const lon = (m.lon * Math.PI) / 180;
    const lat = (m.lat * Math.PI) / 180;
    const mr = moon.orbitRadius;
    moon.group.position.set(
      mr * Math.cos(lat) * Math.cos(lon),
      mr * Math.sin(lat),
      mr * Math.cos(lat) * Math.sin(lon)
    );
    // tidal lock: same face toward Earth (parent local origin)
    moon.mesh.rotation.set(0, 0, 0);
    moon.group.lookAt(0, 0, 0);
    if (moon.orbit) {
      const phase = ((m.lon % 360) + 360) % 360 / 360;
      updateOrbitMaterial(moon.orbit, performance.now() * 0.001, phase);
    }
  }

  // Moon view inset — always update immediately
  if (moonView) {
    moonView.update(state.phase);
  }

  // If moon panel open, refresh explanation
  if (selectedId === 'moon' && ui.currentId === 'moon') {
    ui.showBody('moon', { phase: state.phase });
  }

  updateMoonHelpers(state);
  return state;
}

function updateMoonHelpers(state) {
  if (selectedId !== 'moon' || !world) {
    if (moonHelpers) {
      scene.remove(moonHelpers);
      moonHelpers = null;
    }
    return;
  }
  if (!moonHelpers) {
    moonHelpers = new THREE.Group();
    scene.add(moonHelpers);
  }
  // clear children
  while (moonHelpers.children.length) {
    const c = moonHelpers.children[0];
    moonHelpers.remove(c);
    c.geometry?.dispose();
    c.material?.dispose();
  }

  const earth = world.bodies.earth;
  const moon = world.bodies.moon;
  const ePos = new THREE.Vector3();
  const mPos = new THREE.Vector3();
  earth.mesh.getWorldPosition(ePos);
  moon.mesh.getWorldPosition(mPos);
  const sunPos = new THREE.Vector3(0, 0, 0);

  // Earth-Moon line
  const emGeo = new THREE.BufferGeometry().setFromPoints([ePos, mPos]);
  moonHelpers.add(
    new THREE.Line(
      emGeo,
      new THREE.LineBasicMaterial({ color: 0x4deeea, transparent: true, opacity: 0.7 })
    )
  );
  // Moon-Sun direction arrow (sunlight)
  const dir = sunPos.clone().sub(mPos).normalize();
  const arrowLen = moon.radius * 8;
  const arrow = new THREE.ArrowHelper(dir, mPos, arrowLen, 0xffb347, arrowLen * 0.2, arrowLen * 0.12);
  moonHelpers.add(arrow);

  // Earth-Sun thin line
  const esGeo = new THREE.BufferGeometry().setFromPoints([ePos, sunPos]);
  moonHelpers.add(
    new THREE.Line(
      esGeo,
      new THREE.LineBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.25 })
    )
  );

  // Bright hemisphere marker on moon (disc facing sun)
  const bright = new THREE.Mesh(
    new THREE.SphereGeometry(moon.radius * 1.05, 16, 16, 0, Math.PI),
    new THREE.MeshBasicMaterial({
      color: 0xfff2cc,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  bright.position.copy(mPos);
  bright.lookAt(mPos.clone().add(dir));
  moonHelpers.add(bright);
}

function clearSelection() {
  if (selectedId && world?.bodies[selectedId]) {
    removeSpinRing(world.bodies[selectedId]);
  }
  selectedId = null;
  ui.closePanel();
  ui.setLabelSelected(null);
  if (moonHelpers) {
    scene.remove(moonHelpers);
    moonHelpers = null;
  }
}

function selectBody(id) {
  if (!world?.bodies[id]) return;
  if (selectedId && selectedId !== id) {
    removeSpinRing(world.bodies[selectedId]);
  }
  selectedId = id;
  const body = world.bodies[id];
  if (id !== 'sun') attachSpinRing(body);
  ui.setLabelSelected(id);

  const phase = moonPhase(dateToJD(simDate));
  ui.showBody(id, id === 'moon' ? { phase } : {});

  if (id === 'moon') {
    const earthPos = new THREE.Vector3();
    world.bodies.earth.mesh.getWorldPosition(earthPos);
    cine.focusBody(body.mesh, {
      distanceFactor: 5,
      duration: 2.0,
      fromEarth: true,
      earthPos,
    });
    updateMoonHelpers(computeState(simDate));
  } else if (id === 'sun') {
    cine.focusBody(body.mesh, { distanceFactor: 5, duration: 2.0 });
  } else {
    cine.focusBody(body.mesh, { distanceFactor: 5.5, duration: 2.0 });
  }
}

function setupLabels() {
  const ids = ['sun', ...PLANET_ORDER, 'moon'];
  for (const id of ids) {
    const el = createLabelElement(id, BODIES[id].nameKo);
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      selectBody(id);
    });
    labelsRoot.appendChild(el);
    labels[id] = el;
  }
}

function updateLabels() {
  if (!world) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  for (const id of Object.keys(labels)) {
    const body = world.bodies[id];
    if (!body) continue;
    const el = labels[id];
    const pos = new THREE.Vector3();
    body.mesh.getWorldPosition(pos);
    // offset up by radius
    pos.y += body.radius * 1.2;
    pos.project(camera);
    const x = (pos.x * 0.5 + 0.5) * w;
    const y = (-pos.y * 0.5 + 0.5) * h;
    const behind = pos.z > 1;
    const dist = camera.position.distanceTo(
      body.mesh.getWorldPosition(new THREE.Vector3())
    );
    // fade by distance
    let opacity = 1;
    if (dist > 250) opacity = Math.max(0, 1 - (dist - 250) / 200);
    if (dist < 8 && id !== selectedId) opacity *= 0.3;
    if (behind || x < -50 || x > w + 50 || y < -50 || y > h + 50) {
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
    } else {
      el.style.opacity = String(opacity);
      el.style.pointerEvents = opacity > 0.15 ? 'auto' : 'none';
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    }
    el.classList.toggle('hover', hoverId === id);
    el.classList.toggle('selected', selectedId === id);
  }
}

function pickBodies(clientX, clientY) {
  if (!world) return null;
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const meshes = [];
  for (const id of Object.keys(world.bodies)) {
    const b = world.bodies[id];
    if (b.mesh) meshes.push(b.mesh);
  }
  const hits = raycaster.intersectObjects(meshes, false);
  if (hits.length) {
    return hits[0].object.userData.id;
  }
  return null;
}

canvas.addEventListener('pointermove', (e) => {
  const id = pickBodies(e.clientX, e.clientY);
  hoverId = id;
  canvas.style.cursor = id ? 'pointer' : 'default';
  // parallax
  const nx = (e.clientX / window.innerWidth) * 2 - 1;
  const ny = (e.clientY / window.innerHeight) * 2 - 1;
  cine.setParallax(nx * 0.15, -ny * 0.1);
});

canvas.addEventListener('click', (e) => {
  const id = pickBodies(e.clientX, e.clientY);
  if (id) selectBody(id);
});

// Rotation accumulators
const spinAngles = {};

function animateRotations(dtDays) {
  if (!world) return;
  // Moon is tidally locked — orientation set in applyEphemeris via lookAt
  for (const id of [...PLANET_ORDER, 'sun']) {
    const body = world.bodies[id];
    if (!body) continue;
    const rotDays = body.rotationDays ?? BODIES[id]?.rotationDays;
    if (!rotDays) continue;
    const absDays = Math.abs(rotDays);
    const dir = rotDays < 0 || body.retrograde ? -1 : 1;
    // sidereal rotation: 2π per |rotationDays|
    const delta = dir * (dtDays / absDays) * Math.PI * 2;
    if (body.mesh) body.mesh.rotation.y += delta;
    if (body.group?.userData?.clouds) {
      body.group.userData.clouds.rotation.y += delta * 1.15;
    }
    // earth clouds on tiltGroup
    if (id === 'earth' && body.group) {
      body.group.traverse((c) => {
        if (c.userData?.isClouds) c.rotation.y += delta * 0.2;
      });
    }
    if (body.spinRing) updateSpinRing(body.spinRing, performance.now() * 0.001);
  }
  // sun glow time
  const sun = world.bodies.sun;
  if (sun?.glow?.material?.uniforms) {
    sun.glow.material.uniforms.uTime.value = performance.now() * 0.001;
  }
  if (sun?.glow2?.material?.uniforms) {
    sun.glow2.material.uniforms.uTime.value = performance.now() * 0.001;
  }

  // asteroid slow drift
  if (world.asteroidBelt) {
    const data = world.asteroidBelt.userData.asteroids;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < data.length; i++) {
      const a = data[i];
      a.theta += a.speed * dtDays * 0.02;
      dummy.position.set(Math.cos(a.theta) * a.r, a.y, Math.sin(a.theta) * a.r);
      dummy.scale.setScalar(a.scale);
      dummy.rotation.set(a.theta, a.theta * 0.5, 0);
      dummy.updateMatrix();
      world.asteroidBelt.setMatrixAt(i, dummy.matrix);
    }
    world.asteroidBelt.instanceMatrix.needsUpdate = true;
  }
}

// ── Boot ──────────────────────────────────────────────
async function boot() {
  ui.setLoadingProgress(0.02);
  const textures = await loadAllTextures((p) => ui.setLoadingProgress(p * 0.7));
  ui.setLoadingProgress(0.75);

  world = await createSolarSystem(textures, (p) => ui.setLoadingProgress(0.75 + p * 0.2));
  scene.add(world.root);

  // anisotropy max
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  for (const key of Object.keys(textures)) {
    if (textures[key]?.isTexture) {
      textures[key].anisotropy = maxAniso;
      textures[key].needsUpdate = true;
    }
  }

  moonView = new MoonView(document.getElementById('moon-canvas'));
  moonView.setTexture(textures.moon);

  setupLabels();
  applyEphemeris(true);

  ui.setLoadingProgress(1);
  setTimeout(() => ui.hideLoading(), 400);

  // initial overview
  cine.goOverview(0.01);
  // fix: goOverview with near-zero still runs fly — just set positions
  camera.position.set(0, 80, 140);
  controls.target.set(0, 0, 0);
  controls.update();
  cine.mode = 'free';
  controls.enabled = true;

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (playing) {
      const dtDays = BASE_DAYS_PER_SEC * speed * dt;
      simDate = new Date(simDate.getTime() + dtDays * 86400000);
      applyEphemeris();
      animateRotations(dtDays);
    } else {
      // still animate orbit light flows and spin rings
      const t = now * 0.001;
      if (world) {
        for (const id of PLANET_ORDER) {
          const body = world.bodies[id];
          if (body?.orbit) {
            const state = computeState(simDate);
            const phase = (state.planets[id].lon % 360) / 360;
            updateOrbitMaterial(body.orbit, t, phase);
          }
          if (body?.spinRing) updateSpinRing(body.spinRing, t);
        }
      }
    }

    cine.update(dt, playing);
    updateLabels();

    // sun flare
    updateSunFlare(new THREE.Vector3(0, 0, 0));

    // track helpers update when moon selected
    if (selectedId === 'moon') {
      updateMoonHelpers(computeState(simDate));
    }

    render(now * 0.001);
  }
  requestAnimationFrame(frame);
}

boot().catch((err) => {
  console.error(err);
  ui.setLoadingProgress(1);
  ui.hideLoading();
  const sub = document.querySelector('.loading-sub');
  if (sub) sub.textContent = '로딩 오류 — 콘솔을 확인하세요';
});
