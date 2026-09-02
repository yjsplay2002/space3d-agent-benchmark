import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const OVERVIEW_POS = new THREE.Vector3(0, 170, 330);
const ORIGIN = new THREE.Vector3(0, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * 시네마틱 카메라 리그: OrbitControls + fly-in + 공전 추적 + 유휴 드리프트 + 커서 패럴랙스
 */
export function createCameraRig(camera, domElement) {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 1.15;
  controls.enablePan = false;
  controls.minDistance = 1.2;
  controls.maxDistance = 1500;
  controls.maxPolarAngle = Math.PI * 0.97;
  controls.autoRotateSpeed = 0.12;
  controls.target.copy(ORIGIN);

  const state = {
    mode: 'overview', // overview | flying | follow
    body: null,
    flight: null,
    lastBodyPos: new THREE.Vector3(),
    lastInteraction: performance.now(),
    pointer: new THREE.Vector2(0, 0),
    parallaxApplied: new THREE.Vector3(),
    parallaxTarget: new THREE.Vector3(),
  };

  controls.addEventListener('start', () => {
    state.lastInteraction = performance.now();
  });
  domElement.addEventListener('wheel', () => (state.lastInteraction = performance.now()), { passive: true });
  domElement.addEventListener('pointerdown', () => (state.lastInteraction = performance.now()));

  const tmpBodyPos = new THREE.Vector3();
  const tmpEndPos = new THREE.Vector3();
  const tmpEndTarget = new THREE.Vector3();
  const tmpDir = new THREE.Vector3();
  const tmpRight = new THREE.Vector3();
  const tmpDelta = new THREE.Vector3();

  function bodyWorldPos(body, out) {
    body.group.getWorldPosition(out);
    return out;
  }

  function startFlight(body, duration) {
    // 패럴랙스 오프셋 제거 후 시작점 고정
    camera.position.sub(state.parallaxApplied);
    state.parallaxApplied.set(0, 0, 0);
    state.flight = {
      t: 0,
      start: performance.now(),
      dur: duration,
      fromPos: camera.position.clone(),
      fromTarget: controls.target.clone(),
      camOffset: new THREE.Vector3(),
      targetOffset: new THREE.Vector3(),
    };
    state.body = body;
    state.mode = 'flying';
    controls.enabled = false;
    controls.autoRotate = false;
  }

  function focus(body) {
    const r = body.radius;
    bodyWorldPos(body, tmpBodyPos);
    // 현재 카메라 방향 유지 + 약간 위에서 내려다봄
    tmpDir.subVectors(camera.position, tmpBodyPos);
    if (tmpDir.lengthSq() < 1e-6) tmpDir.set(0, 0.4, 1);
    tmpDir.normalize();
    tmpDir.y = THREE.MathUtils.clamp(tmpDir.y, 0.18, 0.55);
    tmpDir.normalize();
    const dist = Math.max(r * 4.4, 3.2);

    const dx = camera.position.distanceTo(tmpBodyPos);
    const dur = THREE.MathUtils.clamp(1.4 + dx / 260, 1.6, 3.2);
    startFlight(body, dur);
    state.flight.camOffset.copy(tmpDir).multiplyScalar(dist);

    // 행성이 화면 좌측(모바일: 상단)에 오도록 타깃 오프셋
    const viewDir = tmpDir.clone().negate();
    tmpRight.crossVectors(viewDir, UP).normalize();
    if (window.innerWidth < 720) {
      state.flight.targetOffset.copy(UP).multiplyScalar(-r * 1.15);
    } else {
      state.flight.targetOffset.copy(tmpRight).multiplyScalar(r * 1.5);
    }
    controls.minDistance = Math.max(r * 1.25, 0.8);
  }

  function overview() {
    const dx = camera.position.distanceTo(OVERVIEW_POS);
    startFlight(null, THREE.MathUtils.clamp(1.2 + dx / 300, 1.6, 3.0));
    controls.minDistance = 1.2;
  }

  function setPointer(ndcX, ndcY) {
    state.pointer.set(ndcX, ndcY);
  }

  function update(dt) {
    const now = performance.now();

    // 이전 프레임 패럴랙스 제거
    camera.position.sub(state.parallaxApplied);

    if (state.mode === 'flying' && state.flight) {
      const f = state.flight;
      f.t = Math.min(1, (now - f.start) / 1000 / f.dur);
      const e = easeInOutCubic(f.t);
      if (state.body) {
        bodyWorldPos(state.body, tmpBodyPos);
        tmpEndPos.addVectors(tmpBodyPos, f.camOffset);
        tmpEndTarget.addVectors(tmpBodyPos, f.targetOffset);
      } else {
        tmpEndPos.copy(OVERVIEW_POS);
        tmpEndTarget.copy(ORIGIN);
      }
      camera.position.lerpVectors(f.fromPos, tmpEndPos, e);
      controls.target.lerpVectors(f.fromTarget, tmpEndTarget, e);
      if (f.t >= 1) {
        state.mode = state.body ? 'follow' : 'overview';
        if (state.body) state.lastBodyPos.copy(tmpBodyPos);
        state.flight = null;
        controls.enabled = true;
        state.lastInteraction = now;
      }
    } else if (state.mode === 'follow' && state.body) {
      bodyWorldPos(state.body, tmpBodyPos);
      tmpDelta.subVectors(tmpBodyPos, state.lastBodyPos);
      camera.position.add(tmpDelta);
      controls.target.add(tmpDelta);
      state.lastBodyPos.copy(tmpBodyPos);
    }

    // 유휴 드리프트 (전체 뷰에서만)
    const idle = now - state.lastInteraction > 4000;
    controls.autoRotate = idle && state.mode === 'overview';

    controls.update();

    // 커서 패럴랙스
    const distToTarget = camera.position.distanceTo(controls.target);
    const amount = distToTarget * 0.012;
    tmpDir.subVectors(controls.target, camera.position).normalize();
    tmpRight.crossVectors(tmpDir, UP).normalize();
    const upv = new THREE.Vector3().crossVectors(tmpRight, tmpDir).normalize();
    state.parallaxTarget
      .copy(tmpRight)
      .multiplyScalar(state.pointer.x * amount)
      .addScaledVector(upv, state.pointer.y * amount);
    state.parallaxApplied.lerp(state.parallaxTarget, 1 - Math.pow(0.001, dt));
    camera.position.add(state.parallaxApplied);
  }

  return {
    controls,
    state,
    focus,
    overview,
    setPointer,
    update,
    get isFollowing() {
      return state.mode === 'follow' || (state.mode === 'flying' && !!state.body);
    },
  };
}
