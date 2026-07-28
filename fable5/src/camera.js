/**
 * camera.js — 시네마틱 카메라 연출
 * fly-in(큐빅 이징) → 공전 추적(follow) → 전체 보기 복귀
 * + 유휴 드리프트, 커서 패럴랙스
 */
import * as THREE from "three";

const OVERVIEW_POS = new THREE.Vector3(0, 95, 175);
const OVERVIEW_TARGET = new THREE.Vector3(0, 0, 0);

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class CameraDirector {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {OrbitControls} controls
   * @param {{getPos:(key:string, out:THREE.Vector3)=>void, getRadius:(key:string)=>number}} api
   */
  constructor(camera, controls, api) {
    this.camera = camera;
    this.controls = controls;
    this.api = api;

    this.mode = "overview"; // overview | flying | follow
    this.followKey = null;
    this.flight = null;
    this.onArrive = null;

    this._lastBodyPos = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._endPos = new THREE.Vector3();
    this._endTarget = new THREE.Vector3();

    // 패럴랙스 / 유휴 드리프트
    this.pointer = new THREE.Vector2();
    this._parallax = new THREE.Vector3();
    this.lastInteraction = performance.now();
    const bump = () => (this.lastInteraction = performance.now());
    controls.addEventListener("start", bump);
    window.addEventListener("pointermove", (e) => {
      this.pointer.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
      );
      bump();
    });
    window.addEventListener("keydown", bump);
    window.addEventListener("wheel", bump, { passive: true });
  }

  /** 목적지 카메라 위치/타깃 계산 (행성이 화면 좌측에 오도록) */
  _computeDestination(key, outPos, outTarget) {
    const p = this._tmp;
    this.api.getPos(key, p);
    const radius = this.api.getRadius(key);

    if (key === "moon") {
      // 지구 쪽에서 달을 바라보는 시점 (지구에서 본 시선 방향)
      const earth = this._tmp2;
      this.api.getPos("earth", earth);
      const dir = p.clone().sub(earth).normalize();
      outPos.copy(earth).add(dir.multiplyScalar(this.api.getRadius("earth") * 1.9));
      outPos.y += 0.12;
      outTarget.copy(p);
      return;
    }

    const d = Math.max(radius * 5.2, 2.4);
    // 태양 반대쪽 + 위에서 살짝 내려다보는 구도
    const fromSun = p.clone().normalize();
    const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), fromSun).normalize();
    outPos
      .copy(p)
      .add(fromSun.clone().multiplyScalar(d * 0.45))
      .add(side.clone().multiplyScalar(d * 0.75))
      .add(new THREE.Vector3(0, d * 0.35, 0));
    // 타깃을 오른쪽으로 밀어 행성을 화면 좌측에 배치
    const viewDir = p.clone().sub(outPos).normalize();
    const right = new THREE.Vector3().crossVectors(viewDir, new THREE.Vector3(0, 1, 0)).normalize();
    outTarget.copy(p).add(right.multiplyScalar(radius * 1.15));
  }

  flyToBody(key, onArrive) {
    this.followKey = key;
    this.mode = "flying";
    this.onArrive = onArrive;
    this.controls.enabled = false;
    this.controls.autoRotate = false;
    this.flight = {
      t: 0,
      duration: 2.2,
      startPos: this.camera.position.clone(),
      startTarget: this.controls.target.clone(),
      dest: key, // 목적지는 매 프레임 재계산 (행성이 움직이므로)
    };
  }

  toOverview(onArrive) {
    this.followKey = null;
    this.mode = "flying";
    this.onArrive = onArrive;
    this.controls.enabled = false;
    this.flight = {
      t: 0,
      duration: 1.8,
      startPos: this.camera.position.clone(),
      startTarget: this.controls.target.clone(),
      dest: null,
    };
  }

  update(dt) {
    const now = performance.now();

    if (this.mode === "flying" && this.flight) {
      const f = this.flight;
      f.t = Math.min(f.t + dt / f.duration, 1);
      const e = easeInOutCubic(f.t);

      if (f.dest) {
        this._computeDestination(f.dest, this._endPos, this._endTarget);
      } else {
        this._endPos.copy(OVERVIEW_POS);
        this._endTarget.copy(OVERVIEW_TARGET);
      }
      this.camera.position.lerpVectors(f.startPos, this._endPos, e);
      this.controls.target.lerpVectors(f.startTarget, this._endTarget, e);

      if (f.t >= 1) {
        this.mode = this.followKey ? "follow" : "overview";
        this.controls.enabled = true;
        if (this.followKey) this.api.getPos(this.followKey, this._lastBodyPos);
        this.flight = null;
        this.onArrive?.();
        this.onArrive = null;
      }
    } else if (this.mode === "follow" && this.followKey) {
      // 행성 이동량만큼 카메라·타깃을 같이 이동 (공전 추적)
      this.api.getPos(this.followKey, this._tmp);
      this._tmp2.copy(this._tmp).sub(this._lastBodyPos);
      this.camera.position.add(this._tmp2);
      this.controls.target.add(this._tmp2);
      this._lastBodyPos.copy(this._tmp);
    }

    // 유휴 드리프트 (전체 보기에서 8초 이상 입력 없을 때)
    if (this.mode === "overview") {
      const idle = (now - this.lastInteraction) / 1000 > 8;
      this.controls.autoRotate = idle;
      this.controls.autoRotateSpeed = 0.22;
    } else {
      this.controls.autoRotate = false;
    }

    // 커서 패럴랙스 (미세)
    if (this.mode !== "flying") {
      const dist = this.camera.position.distanceTo(this.controls.target);
      const amp = Math.min(dist * 0.006, 0.8);
      const right = this._tmp
        .set(1, 0, 0)
        .applyQuaternion(this.camera.quaternion);
      const up = this._tmp2.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
      const desired = right
        .multiplyScalar(this.pointer.x * amp)
        .add(up.multiplyScalar(this.pointer.y * amp));
      // 이전 오프셋 제거 후 새 오프셋 적용 (감쇠)
      this.camera.position.sub(this._parallax);
      this._parallax.lerp(desired, 1 - Math.pow(0.001, dt));
      this.camera.position.add(this._parallax);
    }

    this.controls.update();
  }
}
