// moonview.js — 지구에서 보는 달 인셋 패널 (위상 기하 전용 2D 캔버스 렌더)
//   - 관측자 시선: 달 중심을 원점, +z 가 관측자 방향. 근접면 텍스처는 회전하지 않음(조석 고정).
//   - 태양 방향(위상각 φ): sunDir = (sin φ, 0, -cos φ). φ=0 삭(뒤에서 비춤), 90 상현(오른쪽 밝음), 180 보름.
//   - 픽셀별 법선/텍스처 인덱스는 미리 계산해두고, 렌더 시에는 조명만 계산한다.

export class MoonView {
  constructor(canvas, imageSource, dom = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = canvas.width;
    this.dom = dom;
    this.lastAngle = null;
    this.ready = false;
    this._prepareTexture(imageSource);
    this._precompute();
  }

  _prepareTexture(src) {
    const w = 1024, h = 512;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    try {
      ctx.drawImage(src, 0, 0, w, h);
    } catch (e) {
      // 폴백: 회색 원반
      ctx.fillStyle = '#8a8a8a'; ctx.fillRect(0, 0, w, h);
    }
    this.texW = w; this.texH = h;
    this.tex = ctx.getImageData(0, 0, w, h).data;
    this.ready = true;
  }

  _precompute() {
    const S = this.size, R = S / 2 - 1.5, cx = S / 2, cy = S / 2;
    const px = [];
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const nx = (x + 0.5 - cx) / R, ny = (cy - (y + 0.5)) / R;
        const rr = nx * nx + ny * ny;
        if (rr > 1.0) continue;
        const nz = Math.sqrt(1 - rr);
        // 근접면 중심 = 경도 0 (텍스처 u=0.5). 오른쪽(+x) = 달의 동쪽 (위난의 바다 방향)
        const lon = Math.atan2(nx, nz);
        const lat = Math.asin(ny);
        const u = 0.5 + lon / (2 * Math.PI);
        const v = 0.5 - lat / Math.PI;
        const tx = Math.min(this.texW - 1, Math.max(0, Math.floor(u * this.texW)));
        const ty = Math.min(this.texH - 1, Math.max(0, Math.floor(v * this.texH)));
        px.push(y * S + x, nx, ny, nz, (ty * this.texW + tx) * 4, Math.sqrt(rr));
      }
    }
    this.px = new Float32Array(px);
    this.img = this.ctx.createImageData(S, S);
  }

  // phaseAngleDeg: 0 삭 → 180 보름 → 360
  render(phaseAngleDeg, force = false) {
    if (!this.ready) return;
    if (!force && this.lastAngle != null && Math.abs(phaseAngleDeg - this.lastAngle) < 0.05) return;
    this.lastAngle = phaseAngleDeg;
    const phi = phaseAngleDeg * Math.PI / 180;
    const sx = Math.sin(phi), sz = -Math.cos(phi);
    const d = this.img.data, tex = this.tex, px = this.px;
    d.fill(0);
    for (let i = 0; i < px.length; i += 6) {
      const idx = px[i] * 4;
      const nx = px[i + 1], ny = px[i + 2], nz = px[i + 3], ti = px[i + 4], edge = px[i + 5];
      const lit = nx * sx + nz * sz;                        // 태양 방향과 법선의 내적
      const shade = smooth(-0.03, 0.07, lit);               // 터미네이터 부드럽게
      const lambert = Math.max(0, lit);
      const bright = 0.045 + shade * (0.32 + 0.68 * Math.pow(lambert, 0.6));  // 0.045 = 지구조(earthshine)
      const limb = 1 - 0.25 * Math.pow(edge, 4);            // 가장자리 약간 어둡게
      const k = bright * limb;
      // 회색 달 텍스처를 살짝 따뜻하게
      d[idx] = clamp255(tex[ti] * k * 1.06);
      d[idx + 1] = clamp255(tex[ti + 1] * k * 1.02);
      d[idx + 2] = clamp255(tex[ti + 2] * k * 0.96);
      d[idx + 3] = 255;
    }
    this.ctx.putImageData(this.img, 0, 0);
  }

  // moonPhase() 결과로 텍스트/캔버스 갱신
  update(phase, force = false) {
    this.render(phase.angle, force);
    const { dom } = this;
    if (dom.name) dom.name.textContent = `${phase.emoji} ${phase.name}`;
    if (dom.illum) dom.illum.textContent = `${(phase.illumination * 100).toFixed(1)}%`;
    if (dom.age) dom.age.textContent = `${phase.age.toFixed(1)}일`;
    if (dom.nextFull) {
      const dd = phase.daysToFull;
      dom.nextFull.textContent = dd < 0.5 ? '오늘!' : `${dd.toFixed(1)}일`;
    }
    if (dom.sunDir) {
      let t;
      if (phase.index === 0) t = '☀ 태양이 달 뒤쪽에 있어서 밝은 면이 안 보여요';
      else if (phase.index === 4) t = '☀ 태양이 지구 뒤쪽(달 정면)에 있어서 전부 밝아요';
      else if (phase.waxing) t = '☀ 태양이 <b>오른쪽</b>에 있어요 → 오른쪽이 밝아요 (저녁 하늘)';
      else t = '☀ 태양이 <b>왼쪽</b>에 있어요 → 왼쪽이 밝아요 (새벽 하늘)';
      dom.sunDir.innerHTML = t;
    }
  }
}

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function clamp255(v) { return v > 255 ? 255 : v < 0 ? 0 : v; }
