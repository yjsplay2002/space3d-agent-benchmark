import { julianToDate } from './ephemeris.js';

const smoothstep = (edge0, edge1, value) => {
  const x = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return x * x * (3 - 2 * x);
};

export function moonPhaseExplanation(phase) {
  if (phase.illumination < 0.03) {
    return '달이 태양과 거의 같은 방향에 있어 밝은 면이 지구 반대쪽을 향해요. 그래서 지구에서는 달이 거의 보이지 않아요.';
  }
  if (phase.illumination > 0.97) {
    return '지구가 태양과 달 사이에 가까이 놓여 달의 밝은 반구가 우리 쪽을 향해요. 그래서 둥근 보름달로 보여요.';
  }
  const side = phase.waxing ? '오른쪽' : '왼쪽';
  const motion = phase.waxing ? '보름달을 향해 차오르는 중' : '다음 삭을 향해 기우는 중';
  return `태양빛을 받는 달의 절반 가운데 일부만 지구에서 보여요. 지금은 밝은 ${side}이 보이며 ${motion}이에요.`;
}

export class MoonView {
  constructor(root) {
    this.root = root;
    this.canvas = root.querySelector('canvas');
    this.context = this.canvas.getContext('2d', { willReadFrequently: true });
    this.size = 440;
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    this.basePixels = null;
    this.current = null;
    this.image = new Image();
    this.image.onload = () => {
      this.prepareTexture();
      if (this.current) this.draw(this.current.jd, this.current.phase);
    };
    this.image.onerror = () => {
      this.prepareFallback();
      if (this.current) this.draw(this.current.jd, this.current.phase);
    };
    this.image.src = '/textures/2k_moon.jpg';
    this.prepareFallback();
  }

  prepareTexture() {
    const ctx = this.context;
    ctx.clearRect(0, 0, this.size, this.size);
    const sourceSize = Math.min(this.image.naturalHeight, this.image.naturalWidth / 2);
    const sx = (this.image.naturalWidth - sourceSize) / 2;
    const sy = (this.image.naturalHeight - sourceSize) / 2;
    ctx.drawImage(this.image, sx, sy, sourceSize, sourceSize, 0, 0, this.size, this.size);
    this.basePixels = ctx.getImageData(0, 0, this.size, this.size);
  }

  prepareFallback() {
    const ctx = this.context;
    const gradient = ctx.createRadialGradient(165, 135, 10, 220, 220, 215);
    gradient.addColorStop(0, '#e5e6df');
    gradient.addColorStop(0.72, '#8d918f');
    gradient.addColorStop(1, '#53585a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.size, this.size);
    let seed = 8128;
    for (let index = 0; index < 110; index += 1) {
      seed = (seed * 16807) % 2147483647;
      const x = seed / 2147483647 * this.size;
      seed = (seed * 16807) % 2147483647;
      const y = seed / 2147483647 * this.size;
      seed = (seed * 16807) % 2147483647;
      const radius = 3 + seed / 2147483647 * 27;
      ctx.fillStyle = `rgba(25,31,36,${0.04 + radius / 150})`;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    this.basePixels = ctx.getImageData(0, 0, this.size, this.size);
  }

  update(jd, phase) {
    this.current = { jd, phase };
    this.draw(jd, phase);
    this.root.querySelector('[data-moon-phase]').textContent = phase.name;
    this.root.querySelector('[data-illumination]').textContent = `${(phase.illumination * 100).toFixed(1)}%`;
    this.root.querySelector('[data-age]').textContent = `${phase.age.toFixed(1)}일`;
    this.root.querySelector('[data-full]').textContent =
      phase.daysToFull < 0.08 ? '오늘' : `${phase.daysToFull.toFixed(1)}일`;
    const fullDate = julianToDate(jd + phase.daysToFull);
    this.root.querySelector('[data-full-date]').textContent =
      `다음 보름 · ${fullDate.getUTCMonth() + 1}월 ${fullDate.getUTCDate()}일`;
  }

  draw(_jd, phase) {
    if (!this.basePixels) return;
    const output = new ImageData(
      new Uint8ClampedArray(this.basePixels.data),
      this.size,
      this.size,
    );
    const data = output.data;
    const center = this.size / 2;
    const radius = this.size * 0.465;
    const elongation = phase.angle * Math.PI / 180;
    const sunX = Math.sin(elongation);
    const sunZ = -Math.cos(elongation);
    for (let py = 0; py < this.size; py += 1) {
      for (let px = 0; px < this.size; px += 1) {
        const nx = (px + 0.5 - center) / radius;
        const ny = (center - py - 0.5) / radius;
        const r2 = nx * nx + ny * ny;
        const offset = (py * this.size + px) * 4;
        if (r2 > 1) {
          data[offset + 3] = 0;
          continue;
        }
        const nz = Math.sqrt(Math.max(0, 1 - r2));
        const lightDot = nx * sunX + nz * sunZ;
        const sunlight = smoothstep(-0.018, 0.025, lightDot);
        const limb = 0.68 + nz * 0.32;
        const brightness = (0.014 + sunlight * 0.986) * limb;
        data[offset] *= brightness * 1.04;
        data[offset + 1] *= brightness * 1.05;
        data[offset + 2] *= brightness * 1.08;
        data[offset + 3] = 255;
      }
    }
    this.context.clearRect(0, 0, this.size, this.size);
    this.context.save();
    this.context.shadowColor = `rgba(100, 202, 255, ${0.18 + phase.illumination * 0.2})`;
    this.context.shadowBlur = 28;
    this.context.beginPath();
    this.context.arc(center, center, radius, 0, Math.PI * 2);
    this.context.fillStyle = '#000';
    this.context.fill();
    this.context.restore();
    this.context.putImageData(output, 0, 0);
    this.context.strokeStyle = 'rgba(145, 220, 255, .25)';
    this.context.lineWidth = 2;
    this.context.beginPath();
    this.context.arc(center, center, radius, 0, Math.PI * 2);
    this.context.stroke();
  }
}
