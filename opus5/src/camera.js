/**
 * src/camera.js — 영화적 카메라 이동 / 공전 추적 / 유휴 드리프트 · 패럴랙스
 *
 * 상태:
 *   free     : OrbitControls 자유 조작
 *   flying   : 목표 천체로 fly-in (cubic 이징). 컨트롤은 잠금
 *   tracking : 도착 완료. 천체가 화면 좌측에 오도록 target 을 오른쪽으로 밀고,
 *              천체가 공전으로 이동한 만큼 카메라도 같이 옮겨 추적한다.
 *
 * 유휴 드리프트와 커서 패럴랙스는 OrbitControls 와 싸우지 않도록
 * "매 프레임 오프셋을 되돌린 뒤 → controls.update() → 다시 더하기" 방식으로 넣는다.
 */

import * as THREE from 'three';

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

export function createCameraRig(camera, controls, opts = {}) {
  const homePosition = new THREE.Vector3(0, 245, 520);
  const homeTarget = new THREE.Vector3(0, 0, 0);

  const state = {
    mode: 'free',           // free | flying | tracking
    target: null,           // 추적 중인 entry
    t: 0,
    duration: 2.2,
  };

  // fly-in 보간용
  const fromPos = new THREE.Vector3();
  const fromTarget = new THREE.Vector3();
  const toPos = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const midLift = new THREE.Vector3();

  // 추적 시 천체의 직전 위치 (델타만큼 카메라를 따라 옮긴다)
  const prevBodyPos = new THREE.Vector3();

  // 유휴 드리프트 · 패럴랙스
  const driftOffset = new THREE.Vector3();
  const appliedOffset = new THREE.Vector3();
  const pointer = new THREE.Vector2(0, 0);
  const pointerSmooth = new THREE.Vector2(0, 0);
  let idleTime = 0;
  let lastInteraction = performance.now();

  const _v = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _up = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _lookAt = new THREE.Vector3();

  function noteInteraction() {
    lastInteraction = performance.now();
  }
  controls.addEventListener('start', noteInteraction);
  controls.addEventListener('change', () => {
    if (state.mode === 'free') noteInteraction();
  });

  window.addEventListener('pointermove', (e) => {
    pointer.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      (e.clientY / window.innerHeight) * 2 - 1,
    );
  }, { passive: true });

  /**
   * 천체를 화면 좌측에 두기 위한 target 의 가로 밀기 양.
   * 세로 화면(모바일)에서는 0 으로 두어 패널과 겹치지 않게 한다.
   */
  function lateralOffsetAmount(distance) {
    const aspect = window.innerWidth / window.innerHeight;
    if (aspect < 1.05) return 0;
    const k = THREE.MathUtils.clamp((aspect - 1.05) / 0.75, 0, 1);
    const halfW = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * aspect;
    return distance * halfW * 0.42 * k;
  }

  /** 천체 반지름에 맞춘 관람 거리 */
  function viewingDistance(entry) {
    const r = entry.radius;
    if (entry.key === 'sun') return r * 4.2;
    if (entry.key === 'moon') return r * 15;
    if (entry.key === 'saturn') return r * 9.5;   // 고리까지 담기게
    return THREE.MathUtils.clamp(r * 7.0, 3.2, 120);
  }

  /**
   * 천체로 영화적 fly-in.
   * @param {object} entry system.bodies[key]
   * @param {object} [o] { fromEarth: true } 이면 지구 쪽에서 바라보는 시점으로 간다
   */
  function flyTo(entry, o = {}) {
    if (!entry) return;
    state.mode = 'flying';
    state.target = entry;
    state.t = 0;
    state.fromEarth = Boolean(o.fromEarth);
    state.duration = o.duration ?? 2.2;
    controls.enabled = false;

    fromPos.copy(camera.position);
    fromTarget.copy(controls.target);

    computeDestination(entry, toPos, toTarget, state.fromEarth);

    // 중간 지점을 살짝 위로 띄워 곡선 경로를 만든다
    midLift.copy(fromPos).add(toPos).multiplyScalar(0.5);
    const span = fromPos.distanceTo(toPos);
    midLift.y += span * 0.16;
    prevBodyPos.copy(entry.worldPos);
  }

  /** 목표 카메라 위치/타깃 계산 */
  function computeDestination(entry, outPos, outTarget, fromEarth) {
    const bodyPos = entry.worldPos;
    const dist = viewingDistance(entry);

    if (fromEarth && entry.earthPos) {
      // 달 전용 — 지구에서 달을 바라보는 시선 방향으로 카메라를 놓는다.
      // (옆에서 보는 게 아니라, 실제로 우리가 밤하늘에서 보는 그 방향)
      _dir.copy(bodyPos).sub(entry.earthPos).normalize();
      outPos.copy(bodyPos).addScaledVector(_dir, -dist);   // 지구 쪽으로 물러선 위치
      outPos.y += dist * 0.14;
    } else {
      // 태양에 대해 거의 직각인 방향에서 접근한다.
      // 그래야 (1) 낮/밤 경계가 보이는 반달 모양으로 극적이고
      //       (2) 압축 스케일 때문에 거대해 보이는 태양이 화면 밖으로 빠진다.
      _dir.copy(bodyPos).normalize();
      if (_dir.lengthSq() < 1e-8) _dir.set(0, 0, 1);
      _right.set(-_dir.z, 0, _dir.x).normalize();   // 궤도 진행 방향
      outPos.copy(bodyPos)
        .addScaledVector(_right, dist * 0.90)
        .addScaledVector(_dir, dist * 0.14)
        .add(_v.set(0, dist * 0.41, 0));
    }

    // 천체를 화면 좌측에 두기 위한 타깃 밀기
    outTarget.copy(bodyPos);
    const camDist = outPos.distanceTo(bodyPos);
    const lateral = lateralOffsetAmount(camDist);
    if (lateral > 0) {
      _dir.copy(bodyPos).sub(outPos).normalize();
      _up.set(0, 1, 0);
      _right.crossVectors(_dir, _up).normalize();
      outTarget.addScaledVector(_right, lateral);
    }
  }

  /** 전체 보기로 복귀 */
  function goHome(duration = 1.9) {
    state.mode = 'flying';
    state.target = null;
    state.fromEarth = false;
    state.t = 0;
    state.duration = duration;
    controls.enabled = false;
    fromPos.copy(camera.position);
    fromTarget.copy(controls.target);
    toPos.copy(homePosition);
    toTarget.copy(homeTarget);
    midLift.copy(fromPos).add(toPos).multiplyScalar(0.5);
    midLift.y += fromPos.distanceTo(toPos) * 0.22;
  }

  /** 카메라를 즉시 홈 위치로 (초기화용) */
  function snapHome() {
    camera.position.copy(homePosition);
    controls.target.copy(homeTarget);
    controls.update();
    state.mode = 'free';
    state.target = null;
  }

  /**
   * @param {number} dt 초
   * @param {object} system createSolarSystem() 결과 (추적 대상 위치 조회용)
   */
  function update(dt, system) {
    // 1) 지난 프레임에 더했던 드리프트를 되돌린다 (컨트롤과 충돌 방지)
    camera.position.sub(appliedOffset);

    if (state.mode === 'flying') {
      state.t += dt / state.duration;
      const raw = Math.min(1, state.t);
      const e = easeInOutCubic(raw);

      // 목표가 공전으로 움직이는 것도 따라간다
      if (state.target) {
        if (state.fromEarth && system) state.target.earthPos = system.bodies.earth.worldPos;
        computeDestination(state.target, toPos, toTarget, state.fromEarth);
      }

      // 2차 베지에로 살짝 휘어지는 경로
      const om = 1 - e;
      camera.position.set(
        om * om * fromPos.x + 2 * om * e * midLift.x + e * e * toPos.x,
        om * om * fromPos.y + 2 * om * e * midLift.y + e * e * toPos.y,
        om * om * fromPos.z + 2 * om * e * midLift.z + e * e * toPos.z,
      );
      controls.target.lerpVectors(fromTarget, toTarget, easeOutCubic(raw));
      camera.lookAt(controls.target);

      if (raw >= 1) {
        if (state.target) {
          state.mode = 'tracking';
          prevBodyPos.copy(state.target.worldPos);
        } else {
          state.mode = 'free';
        }
        controls.enabled = true;
        controls.update();
      }
    } else if (state.mode === 'tracking' && state.target) {
      // 천체가 공전으로 이동한 만큼 카메라와 타깃을 같이 옮긴다
      _v.copy(state.target.worldPos).sub(prevBodyPos);
      camera.position.add(_v);
      controls.target.add(_v);
      prevBodyPos.copy(state.target.worldPos);

      // 화면 좌측 배치를 계속 유지 (사용자가 궤도 조작해도 유지되도록 보정)
      const camDist = camera.position.distanceTo(state.target.worldPos);
      const lateral = lateralOffsetAmount(camDist);
      _lookAt.copy(state.target.worldPos);
      if (lateral > 0) {
        _dir.copy(state.target.worldPos).sub(camera.position).normalize();
        _up.set(0, 1, 0);
        _right.crossVectors(_dir, _up).normalize();
        _lookAt.addScaledVector(_right, lateral);
      }
      controls.target.lerp(_lookAt, Math.min(1, dt * 3.2));
      controls.update();
    } else {
      controls.update();
    }

    // 2) 유휴 드리프트 + 커서 패럴랙스
    idleTime += dt;
    const idleSec = (performance.now() - lastInteraction) / 1000;
    const idleAmt = THREE.MathUtils.clamp((idleSec - 1.2) / 3.5, 0, 1);

    pointerSmooth.lerp(pointer, Math.min(1, dt * 2.4));

    const dist = camera.position.distanceTo(controls.target);
    const scale = THREE.MathUtils.clamp(dist * 0.012, 0.02, 2.6);

    // 카메라 로컬 축
    _dir.copy(controls.target).sub(camera.position).normalize();
    _right.crossVectors(_dir, _up.set(0, 1, 0)).normalize();
    _up.crossVectors(_right, _dir).normalize();

    const driftX = Math.sin(idleTime * 0.21) * 0.6 + Math.sin(idleTime * 0.077) * 0.4;
    const driftY = Math.cos(idleTime * 0.163) * 0.5 + Math.sin(idleTime * 0.041) * 0.35;

    driftOffset
      .copy(_right).multiplyScalar((driftX * idleAmt * 0.9 - pointerSmooth.x * 0.55) * scale)
      .addScaledVector(_up, (driftY * idleAmt * 0.7 - pointerSmooth.y * 0.35) * scale);

    appliedOffset.lerp(driftOffset, Math.min(1, dt * 1.6));
    camera.position.add(appliedOffset);

    // 시선도 오프셋을 조금만 따라가게 해서 패럴랙스가 느껴지도록
    _lookAt.copy(controls.target).addScaledVector(appliedOffset, 0.28);
    camera.lookAt(_lookAt);
  }

  function setHome(pos, target) {
    homePosition.copy(pos);
    if (target) homeTarget.copy(target);
  }

  return {
    state,
    flyTo,
    goHome,
    snapHome,
    update,
    setHome,
    noteInteraction,
    get isTracking() { return state.mode === 'tracking'; },
    get isFlying() { return state.mode === 'flying'; },
    get targetKey() { return state.target?.key ?? null; },
  };
}
