/**
 * 지구에서 보는 달 인셋 패널 — 위상 기하 전용 렌더
 * (3D 씬 축소가 아닌 전용 2D/캔버스 렌더)
 */
import * as THREE from 'three';
import { moonPhaseExplanation } from './ephemeris.js';

/**
 * @param {HTMLCanvasElement} canvas
 */
export class MoonView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = canvas.width;
    this.texture = null;
    this.textureImg = null;
    this.phase = null;

    // soft circular clip via offscreen
    this._off = document.createElement('canvas');
    this._off.width = this.size;
    this._off.height = this.size;
    this._offCtx = this._off.getContext('2d');
  }

  /**
   * @param {THREE.Texture|HTMLImageElement|HTMLCanvasElement|null} tex
   */
  setTexture(tex) {
    if (!tex) return;
    if (tex.isTexture) {
      const img = tex.image;
      if (img) this.textureImg = img;
    } else {
      this.textureImg = tex;
    }
  }

  /**
   * Update and draw for current phase result from ephemeris.moonPhase
   * @param {ReturnType<import('./ephemeris.js').moonPhase>} phase
   */
  update(phase) {
    this.phase = phase;
    this.draw();
    this.updateDom();
  }

  updateDom() {
    if (!this.phase) return;
    const p = this.phase;
    const nameEl = document.getElementById('moon-phase-name');
    const illumEl = document.getElementById('moon-illum');
    const ageEl = document.getElementById('moon-age');
    const fullEl = document.getElementById('moon-to-full');
    if (nameEl) nameEl.textContent = p.phaseName;
    if (illumEl) illumEl.textContent = `${(p.illumination * 100).toFixed(1)}%`;
    if (ageEl) ageEl.textContent = `${p.ageDays.toFixed(1)}일`;
    if (fullEl) fullEl.textContent = `${p.daysToFull.toFixed(1)}일`;
  }

  draw() {
    const ctx = this.ctx;
    const s = this.size;
    const r = s / 2;
    const p = this.phase;
    ctx.clearRect(0, 0, s, s);

    // background space
    ctx.fillStyle = '#020208';
    ctx.beginPath();
    ctx.arc(r, r, r, 0, Math.PI * 2);
    ctx.fill();

    if (!p) return;

    // phaseAngle: 0=new, 90=first quarter, 180=full, 270=last quarter
    // Lit side faces the sun. In sky from Earth, we draw moon with
    // terminator based on phase. Convention: waxing lights on right (northern hemisphere).
    const phaseRad = (p.phaseAngle * Math.PI) / 180;

    // Draw moon surface (always same face — tidal lock)
    ctx.save();
    ctx.beginPath();
    ctx.arc(r, r, r - 1, 0, Math.PI * 2);
    ctx.clip();

    if (this.textureImg) {
      try {
        ctx.drawImage(this.textureImg, 0, 0, s, s);
      } catch {
        this._drawProceduralSurface(ctx, s, r);
      }
    } else {
      this._drawProceduralSurface(ctx, s, r);
    }

    // Night overlay via terminator
    // Spherical phase: illuminated fraction k = (1 - cos i)/2 with i=phase elongation
    // Draw shadow as half-ellipse + rect
    this._drawTerminator(ctx, s, r, phaseRad, p.illumination);

    ctx.restore();

    // rim glow
    const grad = ctx.createRadialGradient(r, r, r * 0.85, r, r, r);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(180,200,255,0.15)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(r, r, r, 0, Math.PI * 2);
    ctx.fill();

    // outer ring
    ctx.strokeStyle = 'rgba(77,238,234,0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(r, r, r - 0.75, 0, Math.PI * 2);
    ctx.stroke();
  }

  _drawProceduralSurface(ctx, s, r) {
    const g = ctx.createRadialGradient(r * 0.65, r * 0.55, r * 0.1, r, r, r);
    g.addColorStop(0, '#d8d8d0');
    g.addColorStop(0.5, '#a8a89e');
    g.addColorStop(1, '#5a5a55');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);

    // maria
    ctx.fillStyle = 'rgba(40,45,50,0.45)';
    const seas = [
      [0.35, 0.4, 0.18],
      [0.55, 0.35, 0.14],
      [0.4, 0.58, 0.12],
      [0.62, 0.55, 0.1],
      [0.48, 0.72, 0.09],
    ];
    for (const [x, y, rad] of seas) {
      ctx.beginPath();
      ctx.ellipse(x * s, y * s, rad * s, rad * s * 0.75, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // craters
    ctx.strokeStyle = 'rgba(30,30,30,0.3)';
    ctx.fillStyle = 'rgba(90,90,85,0.35)';
    for (let i = 0; i < 18; i++) {
      const cx = (0.15 + ((i * 97) % 70) / 100) * s;
      const cy = (0.15 + ((i * 53) % 70) / 100) * s;
      const cr = (0.02 + (i % 5) * 0.008) * s;
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  /**
   * Classic moon phase terminator drawing (northern-hemisphere sky view).
   * phaseAngle 0 = new, 90 = first quarter (right lit), 180 = full, 270 = last quarter (left lit).
   * Bright limb always faces the Sun direction.
   */
  _drawTerminator(ctx, s, r, phaseRad, illumination) {
    if (illumination > 0.995) return;
    if (illumination < 0.005) {
      ctx.fillStyle = 'rgba(0,0,8,0.92)';
      ctx.fillRect(0, 0, s, s);
      return;
    }

    // phaseRad: 0..2π. Use spherical limb: terminator is ellipse with semi-axis |cos(phase)|
    // Waxing (0..π): lit on the RIGHT. Waning (π..2π): lit on the LEFT.
    const cosP = Math.cos(phaseRad);
    const waxing = phaseRad <= Math.PI;

    ctx.save();
    ctx.beginPath();
    // Cover the dark hemisphere with arc + terminator ellipse
    if (waxing) {
      // dark = left side
      ctx.arc(r, r, r, Math.PI / 2, -Math.PI / 2, false); // left outer
      // ellipse: when cosP>0 (before quarter) dark extends past center to the right
      // when cosP<0 (gibbous) dark is a crescent on the left
      ctx.ellipse(r, r, Math.abs(cosP) * r, r, 0, -Math.PI / 2, Math.PI / 2, cosP > 0);
    } else {
      // dark = right side
      ctx.arc(r, r, r, -Math.PI / 2, Math.PI / 2, false); // right outer
      ctx.ellipse(r, r, Math.abs(cosP) * r, r, 0, Math.PI / 2, -Math.PI / 2, cosP < 0);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,10,0.88)';
    ctx.fill();
    ctx.restore();

    // Earthshine on dark limb
    if (illumination < 0.45) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(r, r, r - 1, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(50,60,100,${0.1 * (1 - illumination * 2)})`;
      ctx.fillRect(0, 0, s, s);
      ctx.restore();
    }
  }

  getExplanation() {
    if (!this.phase) return [];
    return moonPhaseExplanation(this.phase);
  }
}

/**
 * Create soft circular particle texture (radial gradient) — never square points
 */
export function createCircleParticleTexture(size = 64) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.15)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}
