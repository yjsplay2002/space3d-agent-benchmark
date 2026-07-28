/**
 * main.js — Space3D 부트스트랩
 */
import "./style.css";
import * as THREE from "three";
import { createSceneSystem } from "./scene.js";
import { loadTextures } from "./textures.js";
import { createBodies } from "./bodies.js";
import { createOrbits } from "./orbits.js";
import { CameraDirector } from "./camera.js";
import { MoonView } from "./moonview.js";
import { createUI } from "./ui.js";
import { jdFromDate, moonPhase, PLANET_KEYS } from "./ephemeris.js";

const container = document.getElementById("app");

/* ---------------- 시뮬레이션 상태 ---------------- */
const state = {
  jd: jdFromDate(new Date()), // 현재 시뮬레이션 시각 (UTC 기준 JD)
  playing: false, // 시작은 "오늘"의 실제 하늘에 정지 — ▶ 를 누르면 흐른다
  speed: 1, // 배속: 1× = 1초에 하루
  hoveredKey: null,
  selectedKey: null,
};

/* ---------------- UI (로딩 화면 먼저) ---------------- */
let deselectRef = () => {}; // init() 완료 후 실제 함수로 교체됨
const ui = createUI({
  onPlayToggle() {
    state.playing = !state.playing;
    ui.setPlaying(state.playing);
  },
  onSpeedChange(speed) {
    state.speed = speed;
    ui.setSpeedDisplay(speed);
  },
  onDateStep(delta) {
    state.jd += delta; // 즉시 점프 — 보간/감기 없음
  },
  onToday() {
    state.jd = jdFromDate(new Date());
  },
  onOverview() {
    deselectRef();
  },
});

/* ---------------- 부트 ---------------- */
init().catch((err) => {
  console.error("Space3D 초기화 실패:", err);
});

async function init() {
  const textures = await loadTextures((loaded, total) =>
    ui.setLoadingProgress(loaded, total)
  );

  const sys = createSceneSystem(container);
  const { scene, camera, controls, renderer, composer, labelRenderer } = sys;

  const bodiesSys = createBodies(scene, textures);
  const orbitsSys = createOrbits(scene);
  const moonView = new MoonView(document.body, textures["2k_moon.jpg"]);

  const director = new CameraDirector(camera, controls, {
    getPos: (key, out) => out.copy(bodiesSys.bodies[key].group.position),
    getRadius: (key) => bodiesSys.bodies[key].visual.radius,
  });

  /* ----- 선택/해제 ----- */
  function select(key) {
    if (state.selectedKey === key) return;
    state.selectedKey = key;
    bodiesSys.setSelected(key);
    for (const k of Object.keys(bodiesSys.bodies)) {
      bodiesSys.bodies[k]?.label?.el.classList.toggle("selected", k === key);
    }
    ui.showPanel(key, moonPhase(state.jd));
    director.flyToBody(key);
  }

  function deselect() {
    if (!state.selectedKey && director.mode === "overview") return;
    state.selectedKey = null;
    bodiesSys.setSelected(null);
    for (const k of Object.keys(bodiesSys.bodies)) {
      bodiesSys.bodies[k]?.label?.el.classList.remove("selected");
    }
    ui.hidePanel();
    director.toOverview();
  }
  deselectRef = deselect;

  /* ----- 입력: 라벨 클릭 ----- */
  labelRenderer.domElement.addEventListener("click", (e) => {
    const label = e.target.closest?.(".body-label");
    if (label?.dataset.key) {
      e.stopPropagation();
      select(label.dataset.key);
    }
  });

  /* ----- 입력: 씬 클릭/호버 (레이캐스트) ----- */
  const raycaster = new THREE.Raycaster();
  const pointerNDC = new THREE.Vector2(-10, -10);
  let downPos = null;

  renderer.domElement.addEventListener("pointerdown", (e) => {
    downPos = { x: e.clientX, y: e.clientY };
  });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!downPos) return;
    const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
    downPos = null;
    if (moved > 6) return; // 드래그는 클릭 아님
    pointerNDC.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObjects(bodiesSys.hitTargets, false);
    if (hits.length > 0) select(hits[0].object.userData.key);
  });
  window.addEventListener("pointermove", (e) => {
    pointerNDC.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );
  });

  /* ----- 키보드 ----- */
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") deselect();
    else if (e.key === "ArrowLeft") state.jd -= 1;
    else if (e.key === "ArrowRight") state.jd += 1;
  });

  /* ----- 호버 처리 ----- */
  function updateHover() {
    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObjects(bodiesSys.hitTargets, false);
    const key = hits.length > 0 ? hits[0].object.userData.key : null;
    if (key === state.hoveredKey) return;

    // 이전 호버 해제
    if (state.hoveredKey) {
      const prev = bodiesSys.bodies[state.hoveredKey];
      prev?.label?.el.classList.remove("hover");
      if (prev?.mesh.material.emissive) prev.mesh.material.emissive.setHex(0x000000);
    }
    state.hoveredKey = key;
    if (key) {
      const b = bodiesSys.bodies[key];
      b.label?.el.classList.add("hover");
      if (b.mesh.material.emissive) b.mesh.material.emissive.setHex(0x2a3a4a);
    }
    renderer.domElement.style.cursor = key ? "pointer" : "default";
  }

  /* ----- 라벨 거리 페이드 ----- */
  const _lv = new THREE.Vector3();
  function updateLabels() {
    for (const key of ["sun", ...PLANET_KEYS, "moon"]) {
      const b = bodiesSys.bodies[key];
      b.group.getWorldPosition(_lv);
      const dist = camera.position.distanceTo(_lv);
      let op;
      if (key === "moon") {
        // 달 라벨은 지구 근처에서만
        op = THREE.MathUtils.clamp(1 - (dist - 12) / 40, 0, 1);
      } else {
        op = THREE.MathUtils.clamp(1.15 - dist / 650, 0.3, 1);
        if (dist < b.visual.radius * 4) op *= 0.35; // 표면 근접 시 방해되지 않게
      }
      b.label.el.style.opacity = op.toFixed(2);
      b.label.el.style.visibility = op < 0.03 ? "hidden" : "visible";
    }
  }

  /* ----- 메인 루프 ----- */
  const clock = new THREE.Clock();
  const sunWorld = new THREE.Vector3(0, 0, 0);
  let lastPanelJD = -1;

  function tick() {
    requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.1);
    const time = clock.elapsedTime;

    // 시간 진행 (1× = 1초에 하루)
    if (state.playing) state.jd += dt * state.speed;

    // 천체 위치/자전 — jd 로부터 결정적 계산 (날짜 점프도 즉시 반영)
    bodiesSys.updatePositions(state.jd);
    bodiesSys.updateBelt(state.jd);
    bodiesSys.updateFrame(time, camera);
    orbitsSys.update(
      state.jd,
      time,
      bodiesSys.bodies.earth.group.position,
      state.hoveredKey ?? state.selectedKey,
      camera.position
    );

    // 달 위상 (인셋 패널 즉시 갱신)
    const phase = moonPhase(state.jd);
    moonView.update(phase);
    if (state.selectedKey === "moon" && Math.abs(state.jd - lastPanelJD) > 0.01) {
      lastPanelJD = state.jd;
      ui.updateMoonExplanation(phase);
    }

    ui.setJD(state.jd);

    director.update(dt);
    updateHover();
    updateLabels();

    sys.updateFlareSun(sunWorld);
    sys.grainPass.uniforms.uTime.value = time;

    composer.render();
    labelRenderer.render(scene, camera);
  }

  // 첫 프레임 배치 후 로딩 페이드아웃
  bodiesSys.updatePositions(state.jd);
  ui.setJD(state.jd);
  ui.setPlaying(state.playing);
  ui.setSpeedDisplay(state.speed);
  tick();
  ui.hideLoading();
}
