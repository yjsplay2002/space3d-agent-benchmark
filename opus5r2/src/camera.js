/**
 * camera.js — 시네마틱 카메라.
 *
 *  · 천체 클릭 → cubic 이징 fly-in, 도착하면 행성이 화면 **좌측**에 놓인다
 *    (우측은 정보 패널 자리).
 *  · 도착 후에는 공전을 따라다닌다. 따라다니는 동안에도 사용자가 자유롭게
 *    회전·줌 할 수 있다(상대 오프셋만 유지).
 *  · 달을 선택하면 "지구 쪽에서 달을 바라보는" 시점으로 간다.
 *  · 유휴 상태에서는 아주 느린 드리프트 + 커서 패럴랙스로 살아 있는 느낌을 준다.
 */

import * as THREE from 'three';
import { OVERVIEW_POSITION } from './scale.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/** cubic ease-in-out */
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class CinematicCamera {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {import('three/addons/controls/OrbitControls.js').OrbitControls} controls
   */
  constructor(camera, controls) {
    this.camera = camera;
    this.controls = controls;

    /** 현재 추적 중인 천체 { getWorldPosition(v) } */
    this.followTarget = null;
    this.followKey = null;
    /** 추적 대상 기준 상대 오프셋 */
    this.followOffset = new THREE.Vector3();
    this.lookOffset = new THREE.Vector3();

    /** 비행 상태 */
    this.flight = null;

    /** 드리프트 / 패럴랙스 */
    this.driftOffset = new THREE.Vector3();
    this.appliedOffset = new THREE.Vector3();
    this.pointer = new THREE.Vector2(0, 0);
    this.pointerSmooth = new THREE.Vector2(0, 0);
    this.idleTime = 0;
    this.elapsed = 0;

    this._onInteract = () => {
      this.idleTime = 0;
    };
    controls.addEventListener('start', this._onInteract);
    controls.addEventListener('change', this._onInteract);
  }

  /** 커서 위치(-1~1) */
  setPointer(nx, ny) {
    this.pointer.set(nx, ny);
  }

  get isFlying() {
    return !!this.flight;
  }

  /**
   * 천체로 영화적 이동.
   * @param {object} body      bodies.js 가 만든 천체 레코드
   * @param {THREE.Vector3} worldPos
   * @param {object} opts { fromEarth: 지구 쪽 시점(달 전용), sunPos }
   */
  focusOn(body, worldPos, opts = {}) {
    const radius = body.radius || 1;
    const camera = this.camera;

    // ── 도착 거리: 행성이 화면을 적당히 채우도록
    const dist = THREE.MathUtils.clamp(radius * 5.4, 1.1, 260);

    // ── 바라볼 방향 결정
    const dir = _v1.set(0, 0, 1);
    if (opts.fromEarth && opts.earthPos) {
      // 지구에서 달을 바라보는 시선 — 카메라는 지구 쪽에 선다
      dir.copy(opts.earthPos).sub(worldPos).normalize();
      dir.y += 0.16;
      dir.normalize();
    } else {
      // 태양 방향에서 약 55° 틀어 초승달~반달 형태의 명암을 만든다
      const toSun = _v2
        .copy(opts.sunPos || new THREE.Vector3())
        .sub(worldPos)
        .normalize();
      const right = _v3.crossVectors(_up, toSun).normalize();
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
      const a = THREE.MathUtils.degToRad(52);
      dir
        .copy(toSun)
        .multiplyScalar(Math.cos(a))
        .addScaledVector(right, Math.sin(a));
      dir.y += 0.3;
      dir.normalize();
    }

    const endPos = new THREE.Vector3().copy(worldPos).addScaledVector(dir, dist);

    // ── 행성을 화면 좌측으로: 시선 중심(target)을 오른쪽으로 민다
    const halfW = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist * camera.aspect;
    const shift = window.innerWidth < 900 ? 0 : halfW * 0.44;
    const camRight = new THREE.Vector3()
      .subVectors(endPos, worldPos)
      .normalize()
      .cross(_up)
      .normalize()
      .multiplyScalar(-1);
    const endTarget = new THREE.Vector3().copy(worldPos).addScaledVector(camRight, shift);

    this.flight = {
      t: 0,
      duration: this._flightDuration(camera.position.distanceTo(endPos)),
      fromPos: camera.position.clone().sub(this.appliedOffset),
      fromTarget: this.controls.target.clone(),
      toPos: endPos,
      toTarget: endTarget,
      body,
      onDone: () => {
        this.followTarget = body;
        this.followKey = body.key;
        this.followOffset.copy(endPos).sub(worldPos);
        this.lookOffset.copy(endTarget).sub(worldPos);
        this.controls.minDistance = Math.max(0.02, radius * 1.08);
        this.controls.maxDistance = Math.max(radius * 220, 900);
      },
    };

    // 비행 중에는 컨트롤을 잠근다
    this.controls.enabled = false;
    this.idleTime = 0;
  }

  /** 전체 보기로 복귀 */
  reset() {
    const endPos = new THREE.Vector3(...OVERVIEW_POSITION);
    const endTarget = new THREE.Vector3(0, 0, 0);
    this.flight = {
      t: 0,
      duration: this._flightDuration(this.camera.position.distanceTo(endPos)),
      fromPos: this.camera.position.clone().sub(this.appliedOffset),
      fromTarget: this.controls.target.clone(),
      toPos: endPos,
      toTarget: endTarget,
      body: null,
      onDone: () => {
        this.controls.minDistance = 0.05;
        this.controls.maxDistance = 3200;
      },
    };
    this.followTarget = null;
    this.followKey = null;
    this.controls.enabled = false;
    this.idleTime = 0;
  }

  _flightDuration(distance) {
    // 멀수록 길게, 하지만 1.3~3.0초 사이
    return THREE.MathUtils.clamp(1.3 + Math.log10(1 + distance) * 0.42, 1.3, 3.0);
  }

  /**
   * 매 프레임 호출.
   * @param {number} dt   프레임 시간(초)
   * @param {object} system  천체 월드 좌표를 조회하기 위한 시스템
   */
  update(dt, system) {
    const camera = this.camera;
    const controls = this.controls;
    this.elapsed += dt;

    // 이전 프레임에 더해 둔 드리프트를 걷어내고 "진짜" 위치로 되돌린다
    camera.position.sub(this.appliedOffset);

    if (this.flight) {
      const f = this.flight;
      f.t = Math.min(1, f.t + dt / f.duration);
      const e = easeInOutCubic(f.t);

      // 목표가 움직이는 천체라면 도착점도 함께 따라간다
      if (f.body && system?.worldPos?.[f.body.key]) {
        const now = system.worldPos[f.body.key];
        if (f.lastBodyPos) {
          _v1.copy(now).sub(f.lastBodyPos);
          f.toPos.add(_v1);
          f.toTarget.add(_v1);
        } else {
          f.lastBodyPos = new THREE.Vector3();
        }
        f.lastBodyPos.copy(now);
      }

      camera.position.lerpVectors(f.fromPos, f.toPos, e);
      controls.target.lerpVectors(f.fromTarget, f.toTarget, e);

      if (f.t >= 1) {
        f.onDone?.();
        this.flight = null;
        controls.enabled = true;
      }
    } else {
      // ── 공전 추적: 대상이 움직인 만큼 카메라와 시선을 함께 옮긴다
      if (this.followTarget && system?.worldPos?.[this.followKey]) {
        const p = system.worldPos[this.followKey];
        _v1.copy(p).add(this.lookOffset); // 새 시선 중심
        _v2.copy(_v1).sub(controls.target); // 이동량
        controls.target.add(_v2);
        camera.position.add(_v2);
      }
      controls.update();
    }

    // ── 유휴 드리프트 + 커서 패럴랙스
    this.idleTime += dt;
    const dist = camera.position.distanceTo(controls.target);

    this.pointerSmooth.lerp(this.pointer, 1 - Math.pow(0.001, dt));

    const idleAmt = THREE.MathUtils.smoothstep(this.idleTime, 1.2, 4.0);
    const driftAmp = dist * 0.0075 * idleAmt;
    const parallaxAmp = dist * 0.014;

    // 카메라 로컬 축 기준으로 흔든다
    camera.updateMatrixWorld();
    const right = _v1.setFromMatrixColumn(camera.matrixWorld, 0);
    const up = _v2.setFromMatrixColumn(camera.matrixWorld, 1);

    const t = this.elapsed;
    this.driftOffset
      .set(0, 0, 0)
      .addScaledVector(right, Math.sin(t * 0.19) * driftAmp + this.pointerSmooth.x * parallaxAmp)
      .addScaledVector(
        up,
        Math.cos(t * 0.146) * driftAmp * 0.7 + this.pointerSmooth.y * parallaxAmp * 0.6
      );

    camera.position.add(this.driftOffset);
    this.appliedOffset.copy(this.driftOffset);
  }

  dispose() {
    this.controls.removeEventListener('start', this._onInteract);
    this.controls.removeEventListener('change', this._onInteract);
  }
}
