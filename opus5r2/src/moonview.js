/**
 * moonview.js — 지구에서 육안으로 보는 달 (인셋 패널).
 *
 * 3D 씬의 달을 축소한 것이 **아니라**, 위상 기하로 계산한 전용 2D 렌더다.
 *   · 달 표면 텍스처를 정사영(orthographic)으로 한 번 구워 두고 (조석 고정:
 *     위상이 바뀌어도 무늬는 절대 회전하지 않는다)
 *   · 매 갱신마다 조명률 k 로 터미네이터 타원을 만들어 클리핑한다
 *   · 밝은 쪽 방향은 실제 밝은 가장자리 위치각 χ 를 그대로 쓴다 → 태양 방향과 일치
 *
 * 날짜가 바뀌면 같은 프레임에 즉시 다시 그린다(보간·지연 없음).
 */

import { moonPhase, norm360 } from './ephemeris.js';
import { loadMoonImage, proceduralMoonCanvas } from './textures.js';

const TAU = Math.PI * 2;

export class MoonView {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLElement} arrowEl 태양 방향 표시
   */
  constructor(canvas, arrowEl) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.arrowEl = arrowEl;
    this.size = canvas.width;
    this.radius = this.size * 0.42;
    this.baseCanvas = null;
    this.ready = false;
    this.lastJd = null;
  }

  /** 달 텍스처를 정사영으로 한 번 굽는다 */
  async init() {
    let img = await loadMoonImage();
    let src = img;
    if (!img) {
      // 로딩 실패 → 프로시저럴 폴백
      src = proceduralMoonCanvas();
    }

    const S = this.size;
    const R = this.radius;

    // 원본 픽셀 확보
    const srcW = src.width;
    const srcH = src.height;
    const tmp = document.createElement('canvas');
    tmp.width = srcW;
    tmp.height = srcH;
    const tctx = tmp.getContext('2d', { willReadFrequently: true });
    tctx.drawImage(src, 0, 0);
    let srcData;
    try {
      srcData = tctx.getImageData(0, 0, srcW, srcH).data;
    } catch {
      srcData = null;
    }

    const out = document.createElement('canvas');
    out.width = S;
    out.height = S;
    const octx = out.getContext('2d');
    const outImg = octx.createImageData(S, S);
    const od = outImg.data;

    const cx = S / 2;
    const cy = S / 2;

    for (let py = 0; py < S; py++) {
      for (let px = 0; px < S; px++) {
        const i = (py * S + px) * 4;
        const nx = (px + 0.5 - cx) / R;
        const ny = (py + 0.5 - cy) / R;
        const rr = nx * nx + ny * ny;
        if (rr > 1) {
          od[i + 3] = 0;
          continue;
        }
        const nz = Math.sqrt(1 - rr);

        // 정사영 역변환 — 시선 방향이 지구를 향한 면(경도 0°)
        const lat = Math.asin(Math.max(-1, Math.min(1, -ny)));
        const lon = Math.atan2(nx, nz);

        let r = 190;
        let g = 186;
        let b = 176;
        if (srcData) {
          const u = 0.5 + lon / TAU;
          const v = 0.5 - lat / Math.PI;
          const sx = Math.min(srcW - 1, Math.max(0, Math.round(u * srcW)));
          const sy = Math.min(srcH - 1, Math.max(0, Math.round(v * srcH)));
          const si = (sy * srcW + sx) * 4;
          r = srcData[si];
          g = srcData[si + 1];
          b = srcData[si + 2];
        }

        // 구면감을 주는 아주 옅은 주연감광 + 가장자리 안티앨리어싱
        const limb = 0.62 + 0.38 * Math.pow(nz, 0.42);
        const edge = Math.min(1, (1 - Math.sqrt(rr)) * R * 1.4);

        od[i] = Math.min(255, r * limb);
        od[i + 1] = Math.min(255, g * limb);
        od[i + 2] = Math.min(255, b * limb);
        od[i + 3] = Math.max(0, Math.min(255, edge * 255));
      }
    }

    octx.putImageData(outImg, 0, 0);
    this.baseCanvas = out;
    this.ready = true;
    return this;
  }

  /**
   * 주어진 시각으로 다시 그린다.
   * @param {number} jd 율리우스일
   * @param {boolean} immediate 날짜 버튼 등 — 변화량과 무관하게 무조건 다시 그린다
   * @returns {ReturnType<typeof moonPhase>} 계산된 위상 정보
   */
  render(jd, immediate = false) {
    const info = moonPhase(jd);
    if (!this.ready) return info;

    // 재생 중 눈에 보이지 않을 만큼의 변화면 캔버스 재작성을 건너뛴다.
    // (날짜 버튼은 immediate=true 라 항상 즉시 반영된다)
    if (!immediate && this._prev) {
      const dK = Math.abs(info.illumination - this._prev.k);
      const dChi = Math.abs(info.brightLimbAngle - this._prev.chi);
      if (dK < 0.0004 && (dChi < 0.06 || dChi > 359.9)) return info;
    }
    this._prev = { k: info.illumination, chi: info.brightLimbAngle };

    const ctx = this.ctx;
    const S = this.size;
    const R = this.radius;
    const cx = S / 2;
    const cy = S / 2;
    const k = Math.max(0, Math.min(1, info.illumination));

    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.translate(cx, cy);

    // ── 1. 어두운 면 (지구조 earthshine 살짝)
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.clip();
    ctx.globalAlpha = 1;
    ctx.filter = 'brightness(0.13) saturate(0.5)';
    ctx.drawImage(this.baseCanvas, -cx, -cy);
    ctx.filter = 'none';
    // 지구조 — 삭에 가까울수록 살짝 푸르게
    const earthshine = (1 - k) * 0.16;
    if (earthshine > 0.005) {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, `rgba(150,180,225,${earthshine})`);
      g.addColorStop(1, `rgba(120,150,200,${earthshine * 0.3})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // ── 2. 밝은 면 — 터미네이터 타원으로 클립
    // 밝은 가장자리 위치각 χ (황북극에서 동쪽으로). 화면은 북쪽 위, 동쪽 왼쪽.
    const chi = info.brightLimbAngle * (Math.PI / 180);
    const bx = -Math.sin(chi);
    const by = -Math.cos(chi);
    const phi = Math.atan2(by, bx); // +x 축을 밝은 방향으로 돌리는 각

    ctx.save();
    ctx.rotate(phi);
    ctx.beginPath();
    ctx.arc(0, 0, R, -Math.PI / 2, Math.PI / 2, false);
    const rx = R * Math.abs(1 - 2 * k);
    ctx.ellipse(0, 0, rx, R, 0, Math.PI / 2, -Math.PI / 2, k < 0.5);
    ctx.closePath();
    ctx.rotate(-phi);
    ctx.clip();
    ctx.drawImage(this.baseCanvas, -cx, -cy);
    ctx.restore();

    // ── 3. 터미네이터 주변을 살짝 부드럽게
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.clip();
    ctx.rotate(phi);
    const shade = ctx.createLinearGradient(-R, 0, R, 0);
    shade.addColorStop(0, 'rgba(0,0,0,0.35)');
    shade.addColorStop(0.5, 'rgba(0,0,0,0.05)');
    shade.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shade;
    ctx.fillRect(-R, -R, R * 2, R * 2);
    ctx.restore();

    // ── 4. 바깥 테두리 미세 글로우
    ctx.beginPath();
    ctx.arc(0, 0, R + 0.5, 0, TAU);
    ctx.strokeStyle = `rgba(255,244,220,${0.10 + k * 0.2})`;
    ctx.lineWidth = Math.max(1, S * 0.004);
    ctx.stroke();

    ctx.restore();

    // ── 5. 태양 방향 표시
    if (this.arrowEl) {
      const rr = (this.canvas.clientWidth || 116) * 0.44;
      this.arrowEl.style.setProperty('--sx', `${(bx * rr).toFixed(1)}px`);
      this.arrowEl.style.setProperty('--sy', `${(by * rr).toFixed(1)}px`);
    }

    this.lastJd = jd;
    return info;
  }
}

/* ══════════════════════════════════════════════════════════════
   설명 문장 생성
   ══════════════════════════════════════════════════════════════ */

/** 위상각에 따른 "언제 보이는지" */
function visibilityHint(angle) {
  const a = norm360(angle);
  if (a < 22.5 || a >= 337.5)
    return '태양과 거의 같은 방향에 있어서, 낮에 태양과 함께 뜨고 져요. 그래서 보이지 않아요.';
  if (a < 67.5) return '해가 진 직후 서쪽 하늘 낮은 곳에서 잠깐 볼 수 있어요.';
  if (a < 112.5) return '해 질 무렵 남쪽 하늘에 떠 있고, 자정쯤 서쪽으로 져요.';
  if (a < 157.5) return '저녁부터 새벽까지 오래 볼 수 있어요.';
  if (a < 202.5) return '해가 질 때 동쪽에서 떠서 해가 뜰 때 서쪽으로 져요. 밤새 볼 수 있어요.';
  if (a < 247.5) return '밤 늦게 동쪽에서 떠서 아침까지 보여요.';
  if (a < 292.5) return '자정쯤 떠서 새벽 남쪽 하늘에 높이 보여요.';
  return '해 뜨기 직전 동쪽 하늘에서 잠깐 볼 수 있어요.';
}

/** 밝은 쪽이 어느 방향인지 (북반구 기준) */
function litSideText(waxing) {
  return waxing
    ? '지금은 달의 <b>오른쪽</b>이 밝아요'
    : '지금은 달의 <b>왼쪽</b>이 밝아요';
}

/**
 * "지금 달이 이렇게 보이는 이유" — 위상에 따라 2~3줄 동적 생성.
 * @returns {string} HTML 문자열
 */
export function moonExplanation(info) {
  const pct = Math.round(info.illumination * 100);
  const a = norm360(info.phaseAngle);
  const dir = info.waxing ? '차오르는' : '기우는';

  let geometry;
  if (a < 22.5 || a >= 337.5) {
    geometry =
      '달이 지구에서 볼 때 <strong>태양과 같은 방향</strong>에 있어요. 햇빛을 받는 면이 통째로 반대쪽을 향하고 있어서 밝은 부분이 거의 안 보여요.';
  } else if (a < 157.5 && a >= 112.5) {
    geometry =
      '달이 태양에서 꽤 멀어져서, 햇빛 받는 면의 대부분이 지구 쪽을 향하게 됐어요.';
  } else if (a < 202.5) {
    geometry =
      '지구가 태양과 달 <strong>사이</strong>에 거의 일직선으로 놓였어요. 햇빛 받는 면이 통째로 지구를 향해서 꽉 찬 원으로 보여요.';
  } else if (a < 247.5) {
    geometry = '달이 다시 태양 쪽으로 돌아가기 시작해서, 밝은 면이 조금씩 줄어들어요.';
  } else if (a >= 67.5 && a < 112.5) {
    geometry =
      '태양 – 지구 – 달이 <strong>직각</strong>을 이루고 있어요. 그래서 햇빛 받는 면의 딱 절반만 보여요.';
  } else if (a >= 247.5 && a < 292.5) {
    geometry =
      '태양 – 지구 – 달이 반대쪽에서 <strong>직각</strong>을 이뤄요. 이번에도 절반만 보이는데, 밝은 쪽이 반대예요.';
  } else {
    geometry =
      '달이 태양 옆쪽에 있어서, 햇빛 받는 면이 비스듬히 보여요. 그래서 얇은 조각처럼 보여요.';
  }

  const l2 = `${litSideText(info.waxing)}. 달의 밝은 쪽은 <strong>언제나 태양이 있는 방향</strong>이에요.`;
  const l3 = visibilityHint(a);

  return `
    <p>${geometry}</p>
    <p>지금 조명률은 <strong>${pct}%</strong>, 월령은 <strong>${info.age.toFixed(1)}일</strong>이에요.
       ${dir} 중이라 내일은 조금 더 ${info.waxing ? '커' : '작아'}져요. ${l2}</p>
    <p>${l3}</p>
  `;
}

/** 인셋 패널 하단 한 줄 */
export function moonFootNote(info) {
  if (info.nextFullMoonDays < 1.2) return '내일이면 꽉 찬 보름달이에요! 🌕';
  if (info.illumination > 0.985) return '오늘은 보름달! 밤새 하늘에 떠 있어요.';
  if (info.illumination < 0.02) return '오늘은 삭 — 달이 보이지 않는 날이에요.';
  return `달은 항상 같은 면만 지구를 향해요. 다음 보름까지 ${Math.round(info.nextFullMoonDays)}일 남았어요.`;
}
