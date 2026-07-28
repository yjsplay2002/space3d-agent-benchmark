import * as THREE from 'three';
import BODY_DATA from './data/bodies.js';

const easeInOutCubic = (t) => (
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
);

export class CinematicCamera {
  constructor(camera, controls, objects) {
    this.camera = camera;
    this.controls = controls;
    this.objects = objects;
    this.selectedId = null;
    this.transition = null;
    this.pointer = new THREE.Vector2();
    this.lastTrackedPosition = new THREE.Vector3();
    this.overview = {
      position: new THREE.Vector3(0, 35, 62),
      target: new THREE.Vector3(0, 0, 0),
    };
  }

  setPointer(x, y) {
    this.pointer.set(x, y);
  }

  destinationFor(id) {
    const object = this.objects.get(id);
    const body = BODY_DATA[id];
    const position = object.position.clone();
    if (id === 'moon') {
      const earth = this.objects.get('earth').position;
      const earthward = earth.clone().sub(position).normalize();
      const moonDistance = earth.distanceTo(position);
      // 지구 표면 바로 위(대기권 구 밖)에서 달을 보는 시점. 압축 축척에서
      // 단순 고정 거리를 쓰면 카메라가 지구 대기 셰이더 안으로 들어갈 수 있다.
      const earthSurfaceToMoon = Math.max(0.9, moonDistance - 1.18);
      return {
        position: position.clone()
          .addScaledVector(earthward, earthSurfaceToMoon)
          .add(new THREE.Vector3(0, body.radius * 0.2, 0)),
        target: position,
      };
    }
    const outward = position.lengthSq() > 0.001
      ? position.clone().normalize()
      : new THREE.Vector3(0.65, 0.26, 1).normalize();
    const distance = Math.max(body.radius * 4.25, 2.4);
    const cameraPosition = position.clone()
      .addScaledVector(outward, distance)
      .add(new THREE.Vector3(0, body.radius * 0.55 + 0.2, 0));
    const forward = position.clone().sub(cameraPosition).normalize();
    const right = new THREE.Vector3().crossVectors(forward, this.camera.up).normalize();
    const target = position.clone().addScaledVector(right, body.radius * 1.25);
    return { position: cameraPosition, target };
  }

  flyTo(id) {
    const object = this.objects.get(id);
    if (!object) return;
    this.selectedId = id;
    const destination = this.destinationFor(id);
    this.lastTrackedPosition.copy(object.position);
    this.transition = {
      start: performance.now(),
      duration: id === 'moon' ? 1650 : 1450,
      fromPosition: this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
      toPosition: destination.position,
      toTarget: destination.target,
      returning: false,
    };
    this.controls.enabled = false;
  }

  returnOverview() {
    this.selectedId = null;
    this.transition = {
      start: performance.now(),
      duration: 1500,
      fromPosition: this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
      toPosition: this.overview.position.clone(),
      toTarget: this.overview.target.clone(),
      returning: true,
    };
    this.controls.enabled = false;
  }

  update(now, elapsed) {
    if (this.transition) {
      if (this.selectedId && !this.transition.returning) {
        const destination = this.destinationFor(this.selectedId);
        this.transition.toPosition.copy(destination.position);
        this.transition.toTarget.copy(destination.target);
      }
      const raw = Math.min(1, (now - this.transition.start) / this.transition.duration);
      const progress = easeInOutCubic(raw);
      this.camera.position.lerpVectors(this.transition.fromPosition, this.transition.toPosition, progress);
      this.controls.target.lerpVectors(this.transition.fromTarget, this.transition.toTarget, progress);
      if (raw >= 1) {
        this.transition = null;
        this.controls.enabled = true;
        if (this.selectedId) this.lastTrackedPosition.copy(this.objects.get(this.selectedId).position);
      }
      return;
    }

    if (this.selectedId) {
      const object = this.objects.get(this.selectedId);
      const movement = object.position.clone().sub(this.lastTrackedPosition);
      this.camera.position.add(movement);
      this.controls.target.add(movement);
      this.lastTrackedPosition.copy(object.position);
    } else {
      const driftTarget = new THREE.Vector3(
        this.pointer.x * 0.62 + Math.sin(elapsed * 0.085) * 0.16,
        this.pointer.y * 0.3 + Math.cos(elapsed * 0.07) * 0.08,
        0,
      );
      this.controls.target.lerp(driftTarget, 0.008);
    }
  }
}
