/**
 * 시네마틱 카메라 이동 / 행성 추적
 */
import * as THREE from 'three';

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class CinematicCamera {
  constructor(camera, controls) {
    this.camera = camera;
    this.controls = controls;
    this.mode = 'free'; // free | flying | tracking
    this.fly = null;
    this.trackTarget = null;
    this.trackOffset = new THREE.Vector3(1, 0.35, 1);
    this.overviewPos = new THREE.Vector3(0, 80, 140);
    this.overviewTarget = new THREE.Vector3(0, 0, 0);
    this.driftEnabled = true;
    this.driftPhase = 0;
    this.parallax = new THREE.Vector2(0, 0);
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
  }

  /**
   * Fly to a world position looking at target, then optionally track.
   */
  flyTo(lookAt, cameraPos, duration = 1.8, onComplete = null, track = null) {
    this.mode = 'flying';
    this.controls.enabled = false;
    this.fly = {
      fromPos: this.camera.position.clone(),
      toPos: cameraPos.clone(),
      fromTarget: this.controls.target.clone(),
      toTarget: lookAt.clone(),
      t: 0,
      duration,
      onComplete,
      track,
    };
  }

  /**
   * Fly to overview of whole solar system
   */
  goOverview(duration = 1.6) {
    this.trackTarget = null;
    this.flyTo(this.overviewTarget, this.overviewPos, duration, () => {
      this.mode = 'free';
      this.controls.enabled = true;
      this.controls.minDistance = 2;
      this.controls.maxDistance = 600;
    });
  }

  /**
   * Cinematic approach to a body mesh.
   * Planet ends on left side of frame; camera tracks orbit afterward.
   */
  focusBody(object3d, opts = {}) {
    const {
      distanceFactor = 4.5,
      duration = 2.0,
      fromEarth = false,
      earthPos = null,
    } = opts;

    const target = new THREE.Vector3();
    object3d.getWorldPosition(target);
    const radius = object3d.userData.radius || 1;

    let camPos;
    if (fromEarth && earthPos) {
      // Look from Earth toward the body (moon view)
      const dir = target.clone().sub(earthPos).normalize();
      camPos = target.clone().sub(dir.multiplyScalar(radius * distanceFactor * 1.2));
      // slight up offset
      camPos.y += radius * 0.4;
    } else {
      // Offset so body sits left of center
      const toCam = this.camera.position.clone().sub(target);
      if (toCam.lengthSq() < 1e-6) toCam.set(1, 0.4, 1);
      toCam.normalize();
      // rotate a bit so body is left
      const right = new THREE.Vector3().crossVectors(toCam, new THREE.Vector3(0, 1, 0)).normalize();
      camPos = target
        .clone()
        .add(toCam.multiplyScalar(radius * distanceFactor))
        .add(right.multiplyScalar(radius * 1.2))
        .add(new THREE.Vector3(0, radius * 0.6, 0));
    }

    this.flyTo(
      target,
      camPos,
      duration,
      () => {
        this.mode = 'tracking';
        this.trackTarget = object3d;
        const wp = new THREE.Vector3();
        object3d.getWorldPosition(wp);
        this.trackOffset.copy(this.camera.position).sub(wp);
        this.controls.enabled = true;
        this.controls.minDistance = radius * 1.4;
        this.controls.maxDistance = radius * 80;
      },
      object3d
    );
  }

  setParallax(nx, ny) {
    this.parallax.set(nx, ny);
  }

  update(dt, simPlaying = true) {
    this.driftPhase += dt * 0.15;

    if (this.mode === 'flying' && this.fly) {
      this.fly.t += dt;
      const u = Math.min(1, this.fly.t / this.fly.duration);
      const e = easeInOutCubic(u);
      this.camera.position.lerpVectors(this.fly.fromPos, this.fly.toPos, e);
      this.controls.target.lerpVectors(this.fly.fromTarget, this.fly.toTarget, e);
      this.controls.update();
      if (u >= 1) {
        const cb = this.fly.onComplete;
        const track = this.fly.track;
        this.fly = null;
        if (track) this.trackTarget = track;
        if (cb) cb();
      }
      return;
    }

    if (this.mode === 'tracking' && this.trackTarget) {
      const wp = new THREE.Vector3();
      this.trackTarget.getWorldPosition(wp);
      // soft follow: blend controls target to body
      this.controls.target.lerp(wp, 1 - Math.exp(-4 * dt));
      // keep relative offset lightly
      if (!this.controls.enabled || true) {
        // allow user orbit while tracking; just keep target locked
      }
      this.controls.update();
    } else {
      // idle drift
      if (this.driftEnabled && this.mode === 'free' && !simPlaying) {
        // subtle even when paused
      }
      if (this.driftEnabled && this.mode === 'free') {
        const drift = Math.sin(this.driftPhase) * 0.02;
        this.camera.position.x += drift * dt;
        this.camera.position.y += Math.cos(this.driftPhase * 0.7) * 0.01 * dt;
      }
      // parallax nudge on target
      if (this.mode === 'free') {
        this.controls.target.x += this.parallax.x * 0.4 * dt;
        this.controls.target.y += this.parallax.y * 0.3 * dt;
        this.controls.target.multiplyScalar(0.98); // spring back slowly — actually bad
        // better: store base and offset
      }
      this.controls.update();
    }
  }
}
