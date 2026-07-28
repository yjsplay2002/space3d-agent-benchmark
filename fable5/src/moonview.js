/**
 * moonview.js — "지구에서 보는 달" 인셋 패널 (핵심 교육 기능)
 * 3D 씬의 달을 축소한 것이 아니라, 위상 기하로 계산한 전용 미니 씬.
 * - 명암 경계선(터미네이터)이 위상각에 따라 정확히 이동
 * - 밝은 쪽이 향하는 방향 = 실제 태양 방향 (차오르면 오른쪽부터)
 * - 조석 고정: 위상이 변해도 무늬(바다)는 회전하지 않음
 */
import * as THREE from "three";
import { SYNODIC_MONTH } from "./ephemeris.js";

export class MoonView {
  /**
   * @param {HTMLElement} mount 패널을 붙일 부모
   * @param {THREE.Texture} moonTexture 달 표면 텍스처
   */
  constructor(mount, moonTexture) {
    this.root = document.createElement("div");
    this.root.id = "moon-panel";
    this.root.innerHTML = `
      <div class="moon-panel-title">오늘 밤 달의 모습 <span class="moon-panel-sub">지구에서 보면</span></div>
      <div class="moon-disc-wrap"></div>
      <div class="moon-phase-name">—</div>
      <div class="moon-stats">
        <div><span class="k">조명률</span><span class="v" data-f="illum">—</span></div>
        <div><span class="k">월령</span><span class="v" data-f="age">—</span></div>
        <div><span class="k">다음 보름달</span><span class="v" data-f="full">—</span></div>
      </div>
    `;
    mount.appendChild(this.root);

    const SIZE = 190;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(SIZE, SIZE);
    this.renderer.domElement.className = "moon-disc";
    this.root.querySelector(".moon-disc-wrap").appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 10);
    this.camera.position.set(0, 0, 4);

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 48),
      new THREE.MeshStandardMaterial({ map: moonTexture, roughness: 1 })
    );
    // 바다가 잘 보이는 근지구면을 카메라 쪽으로 고정 (조석 고정 — 회전하지 않음)
    mesh.rotation.y = -Math.PI / 2;
    this.scene.add(mesh);

    this.sun = new THREE.DirectionalLight(0xfff6e8, 3.2);
    this.scene.add(this.sun);
    // 지구조(地球照): 그믐 밤면이 아주 희미하게 보이는 현상
    this.scene.add(new THREE.AmbientLight(0x8899bb, 0.055));

    this._els = {
      name: this.root.querySelector(".moon-phase-name"),
      illum: this.root.querySelector('[data-f="illum"]'),
      age: this.root.querySelector('[data-f="age"]'),
      full: this.root.querySelector('[data-f="full"]'),
    };
    this._lastAngle = -999;
  }

  /**
   * @param {{angle:number, illum:number, age:number, nextFullDays:number, phaseName:string}} phase
   */
  update(phase) {
    // 태양 방향: ψ=0(삭) 뒤에서, ψ=90(상현) 오른쪽, ψ=180(보름) 정면, ψ=270(하현) 왼쪽
    const psi = (phase.angle * Math.PI) / 180;
    this.sun.position.set(Math.sin(psi) * 5, 0, -Math.cos(psi) * 5);

    this._els.name.textContent = phase.phaseName;
    this._els.illum.textContent = `${(phase.illum * 100).toFixed(1)}%`;
    this._els.age.textContent = `${phase.age.toFixed(1)}일`;
    const nf = phase.nextFullDays;
    this._els.full.textContent =
      nf < 0.5 || nf > SYNODIC_MONTH - 0.5 ? "오늘!" : `${Math.round(nf)}일 후`;

    // 위상각이 실제로 변했을 때만 재렌더 (즉시 반영 + 저비용)
    if (Math.abs(phase.angle - this._lastAngle) > 0.002) {
      this._lastAngle = phase.angle;
      this.renderer.render(this.scene, this.camera);
    }
  }
}
