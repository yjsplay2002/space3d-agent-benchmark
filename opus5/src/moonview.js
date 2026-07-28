/**
 * src/moonview.js — 지구에서 보는 달 (인셋 패널)
 *
 * 3D 씬의 달을 축소한 것이 아니라, **위상 기하로 직접 계산해서 그리는 전용 렌더**다.
 *
 *  · 시선 좌표계: x 오른쪽, y 위, z 관측자(지구) 쪽.
 *    원반 위의 점 (u,v) 에 대한 법선 n = (u, v, √(1-u²-v²)).
 *  · 태양 방향 s = (sin D, 0, -cos D)   (D = 위상각, 달-태양 황경차)
 *      D=0   삭   → s=(0,0,-1)  전부 그늘
 *      D=90  상현 → s=(1,0,0)   오른쪽 절반이 밝음
 *      D=180 망   → s=(0,0,1)   전부 밝음
 *      D=270 하현 → s=(-1,0,0)  왼쪽 절반이 밝음
 *    즉 밝은 쪽이 언제나 태양이 있는 방향을 향한다.
 *  · 조석 고정: 달 표면 텍스처는 언제나 같은 면(경도 -90°~+90°)을 정사영으로 그린다.
 *    위상이 변해도 무늬는 회전하지 않는다.
 *
 * 픽셀별 기하(법선·텍스처 인덱스)는 크기가 바뀔 때만 한 번 계산해 두고,
 * 위상이 바뀔 때는 조명만 다시 칠한다.
 */

import {
  moonPhaseInfo,
  moonPhaseName,
  illuminationFromPhase,
  DEG,
} from './ephemeris.js';
import { MOON_PHASE_EXPLAIN } from './data/bodies.js';

// ─────────────────────────────────────────────────────────────────────────────
// 원반 렌더러
// ─────────────────────────────────────────────────────────────────────────────

class MoonDiscRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{showSunArrow?:boolean}} [opts]
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: false });
    this.showSunArrow = opts.showSunArrow !== false;
    this.tex = null;           // {data, w, h}
    this.geomSize = -1;
    this.lastPhase = null;
    this._buildImage();
  }

  setTexture(tex) {
    this.tex = tex;
    this.geomSize = -1;        // 텍스처 인덱스를 다시 계산해야 한다
    this.lastPhase = null;
  }

  _buildImage() {
    const s = this.canvas.width;
    this.image = this.ctx.createImageData(s, s);
    this.image.data.fill(0);
  }

  /** 픽셀별 법선 · 텍스처 인덱스 · 가장자리 알파를 미리 계산 */
  _buildGeometry() {
    const s = this.canvas.width;
    const tex = this.tex;
    const half = s / 2;
    // 원반이 캔버스에 꽉 차지 않도록 살짝 여유 (글로우 여백)
    const R = half * 0.955;

    const idx = [];
    const nxs = [];
    const nys = [];
    const nzs = [];
    const tix = [];
    const eas = [];

    for (let py = 0; py < s; py++) {
      const v = -(py + 0.5 - half) / R;        // 위쪽이 +
      for (let px = 0; px < s; px++) {
        const u = (px + 0.5 - half) / R;
        const rr = u * u + v * v;
        if (rr > 1.0) continue;

        const z = Math.sqrt(Math.max(0, 1 - rr));
        const r = Math.sqrt(rr);
        // 가장자리 안티에일리어싱
        const alpha = Math.min(1, (1 - r) * R * 1.6);
        if (alpha <= 0) continue;

        idx.push((py * s + px) * 4);
        nxs.push(u);
        nys.push(v);
        nzs.push(z);
        eas.push(alpha);

        if (tex) {
          // 정사영 → 구면 좌표 (조석 고정된 근지구면)
          const lat = Math.asin(Math.max(-1, Math.min(1, v)));
          const lon = Math.atan2(u, z);           // -π/2 … +π/2
          let tu = 0.5 + lon / (Math.PI * 2);
          let tv = 0.5 - lat / Math.PI;
          tu = Math.min(0.999999, Math.max(0, tu));
          tv = Math.min(0.999999, Math.max(0, tv));
          const tx = (tv * tex.h | 0) * tex.w + (tu * tex.w | 0);
          tix.push(tx * 4);
        } else {
          tix.push(-1);
        }
      }
    }

    this.geom = {
      idx: Int32Array.from(idx),
      nx: Float32Array.from(nxs),
      ny: Float32Array.from(nys),
      nz: Float32Array.from(nzs),
      ti: Int32Array.from(tix),
      ea: Float32Array.from(eas),
      n: idx.length,
    };
    this.geomSize = s;
  }

  /**
   * @param {number} phaseDeg 위상각 0~360
   * @param {boolean} [force]
   */
  render(phaseDeg, force = false) {
    const s = this.canvas.width;
    if (this.geomSize !== s) {
      this._buildImage();
      this._buildGeometry();
    }
    if (!force && this.lastPhase !== null && Math.abs(phaseDeg - this.lastPhase) < 0.05) return;
    this.lastPhase = phaseDeg;

    const g = this.geom;
    const data = this.image.data;
    const tex = this.tex;
    const td = tex ? tex.data : null;

    const rad = phaseDeg * DEG;
    const sx = Math.sin(rad);
    const sz = -Math.cos(rad);

    // 지구조(earthshine) — 삭에 가까울수록 지구가 달의 밤 쪽을 밝게 비춘다
    const k = illuminationFromPhase(phaseDeg);
    const earthshine = 0.035 + 0.075 * (1 - k);

    data.fill(0);

    for (let i = 0; i < g.n; i++) {
      const d = g.nx[i] * sx + g.nz[i] * sz;

      // 부드러운 터미네이터 (실제로도 달의 지형 때문에 경계가 칼같지 않다)
      let lit;
      if (d <= -0.055) lit = 0;
      else if (d >= 0.075) lit = 1;
      else {
        const t = (d + 0.055) / 0.13;
        lit = t * t * (3 - 2 * t);
      }

      // 정면일 때 평평해 보이는 달의 반사 특성(강한 후방산란)을 흉내
      const mu = d > 0 ? Math.pow(d, 0.34) : 0;
      let shade = lit * (0.20 + 0.80 * mu);
      shade += earthshine * (1 - lit);

      let rr, gg, bb;
      if (td) {
        const t = g.ti[i];
        rr = td[t];
        gg = td[t + 1];
        bb = td[t + 2];
      } else {
        rr = 168; gg = 164; bb = 156;
      }

      // 살짝 따뜻한 톤 + 가장자리 감광
      const gain = shade * 1.28 * g.ea[i];
      const o = g.idx[i];
      data[o] = Math.min(255, rr * gain * 1.03);
      data[o + 1] = Math.min(255, gg * gain);
      data[o + 2] = Math.min(255, bb * gain * 0.96);
      data[o + 3] = 255 * g.ea[i];
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, s, s);
    ctx.putImageData(this.image, 0, 0);

    // 밝은 쪽이 태양 방향임을 보여 주는 작은 표시
    if (this.showSunArrow) this._drawSunHint(phaseDeg, s);
  }

  _drawSunHint(phaseDeg, s) {
    const ctx = this.ctx;
    const half = s / 2;
    const R = half * 0.955;
    const rad = phaseDeg * DEG;
    // 태양의 화면상 방향 (밝은 쪽) — 위상각 90/270 에서 정확히 좌우를 가리킨다
    const dx = Math.sin(rad);
    const dy = 0;
    const len = Math.hypot(dx, dy);
    if (len < 0.08) return;   // 삭·망 근처에서는 좌우 방향이 의미 없으므로 생략

    const ux = dx / len;
    const r0 = R * 1.0;
    const r1 = half * 0.995;
    const x0 = half + ux * r0;
    const x1 = half + ux * r1;
    const y = half + dy;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255, 214, 130, 0.85)';
    ctx.lineWidth = Math.max(1.5, s * 0.012);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    // 태양 쪽 점
    ctx.fillStyle = 'rgba(255, 226, 160, 0.95)';
    ctx.beginPath();
    ctx.arc(x1, y, Math.max(2, s * 0.017), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 인셋 패널
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 항상 떠 있는 달 관측 패널.
 * @param {object} refs { canvas, nameEl, illumEl, ageEl, toFullEl, whyEl }
 */
export function createMoonView(refs) {
  const disc = new MoonDiscRenderer(refs.canvas, { showSunArrow: true });

  // 정보 패널 안의 큰 달 (선택 시 생성됨)
  let heroDisc = null;

  let lastInfo = null;
  let lastRenderAt = 0;
  let lastPhaseRendered = -999;

  function setTexture(tex) {
    disc.setTexture(tex);
    if (heroDisc) heroDisc.setTexture(tex);
    if (lastInfo) render(lastInfo, true);
  }

  /** 정보 패널용 큰 원반을 이 캔버스에 붙인다 */
  function attachHero(canvas) {
    heroDisc = new MoonDiscRenderer(canvas, { showSunArrow: false });
    heroDisc.setTexture(disc.tex);
    if (lastInfo) heroDisc.render(lastInfo.phase, true);
    return heroDisc;
  }

  function detachHero() {
    heroDisc = null;
  }

  function render(info, force) {
    disc.render(info.phase, force);
    if (heroDisc) heroDisc.render(info.phase, force);

    refs.nameEl.textContent = info.name;
    refs.illumEl.textContent = (info.illumination * 100).toFixed(info.illumination > 0.995 ? 0 : 1);
    refs.ageEl.textContent = info.age.toFixed(1);
    refs.toFullEl.textContent = info.toFullMoon.toFixed(1);
    if (refs.whyEl) refs.whyEl.textContent = MOON_PHASE_EXPLAIN[info.index].short;
  }

  /**
   * 날짜/시각이 바뀔 때마다 호출. force=true 면 즉시 다시 그린다.
   * (날짜 버튼을 눌렀을 때 한 박자도 늦지 않게 반영되어야 한다)
   */
  function update(jd, force = false) {
    const info = moonPhaseInfo(jd);
    lastInfo = info;

    if (force) {
      render(info, true);
      lastRenderAt = performance.now();
      lastPhaseRendered = info.phase;
      return info;
    }

    // 재생 중에는 초당 최대 20회로 제한 (원반 렌더는 픽셀 루프라 비싸다)
    const now = performance.now();
    let dp = Math.abs(info.phase - lastPhaseRendered);
    if (dp > 180) dp = 360 - dp;
    if (dp > 0.08 && now - lastRenderAt > 50) {
      render(info, false);
      lastRenderAt = now;
      lastPhaseRendered = info.phase;
    }
    return info;
  }

  return {
    update,
    setTexture,
    attachHero,
    detachHero,
    get info() { return lastInfo; },
    get renderer() { return disc; },
  };
}

/**
 * 위상에 따른 "지금 달이 이렇게 보이는 이유" 설명 (2~3줄).
 * 정보 패널에서 쓴다.
 */
export function moonWhyText(info) {
  const base = MOON_PHASE_EXPLAIN[info.index].long;
  const pct = (info.illumination * 100).toFixed(info.illumination > 0.995 ? 0 : 1);
  const dir = info.waxing ? '오른쪽부터 점점 차오르는 중' : '오른쪽부터 점점 기우는 중';
  return `${base}\n지금 달 표면의 ${pct}% 가 밝게 보이고, 달의 나이(월령)는 ${info.age.toFixed(1)}일이에요. ${dir}이에요.`;
}

/** 위상각 → 한국어 이름 (재수출) */
export { moonPhaseName };
