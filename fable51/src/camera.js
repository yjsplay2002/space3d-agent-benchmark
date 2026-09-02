// camera.js — 시네마틱 카메라 이동(fly-in, cubic easing) / 공전 추적 / 지구에서 보는 달 시점 / 유휴 드리프트·패럴랙스
import * as THREE from 'three';
import { EARTH_R } from './bodies.js';

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const UP = new THREE.Vector3(0, 1, 0);

export const OVERVIEW_POS = new THREE.Vector3(0, 165, 320);
export const OVERVIEW_TARGET = new THREE.Vector3(0, 0, 0);

export class CameraDirector {
  constructor(camera, controls) {
    this.camera = camera;
    this.controls = controls;
    this.mode = 'free';          // free | fly | follow | moon
    this.body = null;
    this.fly = null;
    this.pointer = new THREE.Vector2();
    this.parallax = new THREE.Vector2();
    this.lastInteraction = performance.now();
    this._bodyPos = new THREE.Vector3();
    this._prevBodyPos = new THREE.Vector3();
    this._target = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this.onArrive = null;
    controls.addEventListener('start', () => { this.lastInteraction = performance.now(); });
    controls.addEventListener('change', () => { this.lastInteraction = performance.now(); });
  }

  setPointer(x, y) { this.pointer.set(x, y); }

  _startFlight(endFn, duration, then, body) {
    this.fly = {
      t: 0, duration, endFn, then,
      startPos: this.camera.position.clone(),
      startTarget: this.mode === 'fly' ? this._target.clone() : this.controls.target.clone(),
    };
    this.body = body;
    this.mode = 'fly';
    this.controls.enabled = false;
    this.controls.autoRotate = false;
  }

  // 행성/태양: 옆에서 본 시네마틱 시점. 도착 시 행성이 화면 좌측.
  flyTo(body, earthBody = null) {
    if (body.id === 'moon' && earthBody) return this.flyToMoonView(body, earthBody);
    const bodyPos = body.worldPosition(this._bodyPos);
    const dist = Math.max(body.radius * 4.6, 2.4);
    const dir = this._tmp.copy(this.camera.position).sub(bodyPos);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0.4, 1);
    dir.normalize();
    dir.y = Math.max(dir.y, 0.28);
    dir.normalize();
    const camOffset = dir.clone().multiplyScalar(dist);
    // 카메라 오른쪽 벡터 → 목표점을 오른쪽으로 옮겨 행성이 왼쪽에 오도록
    const forward = camOffset.clone().negate().normalize();
    const right = new THREE.Vector3().crossVectors(forward, UP).normalize();
    const targetOffset = right.multiplyScalar(body.radius * 1.15);
    const endFn = () => {
      const p = body.worldPosition(this._bodyPos);
      return { pos: this._tmp.copy(p).add(camOffset), target: this._tmp2.copy(p).add(targetOffset) };
    };
    const flightDist = this.camera.position.distanceTo(endFn().pos);
    const duration = THREE.MathUtils.clamp(1.4 + flightDist / 220, 1.6, 3.2);
    this._startFlight(endFn, duration, 'follow', body);
    this.controls.minDistance = Math.max(body.radius * 1.5, 0.6);
  }

  // 달: 지구 쪽에서 달을 바라보는 시점 (지구에서 본 시선 방향)
  flyToMoonView(moon, earth) {
    const endFn = () => {
      const e = earth.worldPosition(this._tmp);
      const m = moon.worldPosition(this._tmp2);
      const dir = m.clone().sub(e).normalize();
      const pos = e.clone().addScaledVector(dir, EARTH_R * 1.7);
      return { pos, target: m.clone() };
    };
    const flightDist = this.camera.position.distanceTo(endFn().pos);
    const duration = THREE.MathUtils.clamp(1.6 + flightDist / 200, 1.8, 3.4);
    this._startFlight(endFn, duration, 'moon', moon);
  }

  flyToOverview() {
    const endFn = () => ({ pos: OVERVIEW_POS.clone(), target: OVERVIEW_TARGET.clone() });
    const flightDist = this.camera.position.distanceTo(OVERVIEW_POS);
    const duration = THREE.MathUtils.clamp(1.2 + flightDist / 260, 1.4, 2.8);
    this._startFlight(endFn, duration, 'free', null);
    this.controls.minDistance = 0.6;
  }

  update(dt) {
    const cam = this.camera, controls = this.controls;
    if (this.mode === 'fly' && this.fly) {
      const f = this.fly;
      f.t = Math.min(1, f.t + dt / f.duration);
      const k = easeInOutCubic(f.t);
      const end = f.endFn();
      cam.position.lerpVectors(f.startPos, end.pos, k);
      this._target.lerpVectors(f.startTarget, end.target, k);
      cam.up.copy(UP);
      cam.lookAt(this._target);
      if (f.t >= 1) {
        this.mode = f.then;
        this.fly = null;
        controls.target.copy(this._target);
        if (this.mode === 'moon') {
          controls.enabled = false;
        } else {
          controls.enabled = true;
          if (this.body) this.body.worldPosition(this._prevBodyPos);
          controls.update();
        }
        this.onArrive?.(this.mode, this.body);
      }
    } else if (this.mode === 'follow' && this.body) {
      const p = this.body.worldPosition(this._bodyPos);
      const delta = this._tmp.subVectors(p, this._prevBodyPos);
      cam.position.add(delta);
      controls.target.add(delta);
      this._prevBodyPos.copy(p);
      controls.autoRotate = performance.now() - this.lastInteraction > 4000;
      controls.update();
    } else if (this.mode === 'moon' && this.body) {
      // 매 프레임 지구→달 시선으로 고정 (달이 공전하므로 계속 갱신)
      const e = this.body.parent.worldPosition(this._tmp);
      const m = this.body.worldPosition(this._tmp2);
      const dir = m.clone().sub(e).normalize();
      cam.position.copy(e).addScaledVector(dir, EARTH_R * 1.7);
      cam.up.copy(UP);
      cam.lookAt(m);
      controls.target.copy(m);
    } else {
      controls.autoRotate = performance.now() - this.lastInteraction > 4000;
      controls.update();
    }

    // 커서 패럴랙스 (씬이 살짝 반응)
    this.parallax.x += (this.pointer.x - this.parallax.x) * 0.04;
    this.parallax.y += (this.pointer.y - this.parallax.y) * 0.04;
    const amt = this.mode === 'moon' ? 0.05 : 0.018;
    cam.rotateY(-this.parallax.x * amt);
    cam.rotateX(this.parallax.y * amt * 0.6);
  }
}
