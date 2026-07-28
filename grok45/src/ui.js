/**
 * 정보 패널, 시간/날짜 컨트롤, 라벨
 */
import { BODIES } from './data/bodies.js';
import { moonPhaseExplanation } from './ephemeris.js';

function formatNum(n, digits = 2) {
  if (n === 0) return '0';
  if (Math.abs(n) >= 1e6) return n.toExponential(2);
  if (Math.abs(n) >= 1000) return n.toLocaleString('ko-KR', { maximumFractionDigits: 0 });
  return n.toLocaleString('ko-KR', { maximumFractionDigits: digits });
}

function formatMass(m) {
  if (m >= 1000) return `${formatNum(m, 0)} × 지구`;
  if (m < 0.01) return `${m.toExponential(2)} × 지구`;
  return `${formatNum(m, 3)} × 지구`;
}

function formatOrbit(days) {
  if (!days) return '—';
  if (days < 2) return `${(days * 24).toFixed(1)}시간`;
  if (days < 400) return `${formatNum(days, 1)}일`;
  return `${formatNum(days / 365.25, 1)}년`;
}

function formatRotation(days) {
  if (days === 0) return '—';
  const abs = Math.abs(days);
  const dir = days < 0 ? ' (역방향)' : '';
  if (abs < 2) return `${(abs * 24).toFixed(1)}시간${dir}`;
  return `${formatNum(abs, 1)}일${dir}`;
}

/**
 * Count-up animation for a number display
 */
function animateValue(el, target, duration = 600, suffix = '') {
  const start = performance.now();
  const from = 0;
  const isInt = Number.isInteger(target);
  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const e = 1 - Math.pow(1 - t, 3);
    const v = from + (target - from) * e;
    el.textContent = (isInt ? Math.round(v) : v.toFixed(2)) + suffix;
    if (t < 1) requestAnimationFrame(frame);
    else el.textContent = (isInt ? target : target) + suffix;
  }
  requestAnimationFrame(frame);
}

export class UIController {
  constructor({ onSelect, onOverview, onDateChange, onPlayToggle, onSpeedChange }) {
    this.onSelect = onSelect;
    this.onOverview = onOverview;
    this.onDateChange = onDateChange;
    this.onPlayToggle = onPlayToggle;
    this.onSpeedChange = onSpeedChange;

    this.panel = document.getElementById('info-panel');
    this.panelContent = document.getElementById('panel-content');
    this.dateEl = document.getElementById('sim-date');
    this.playBtn = document.getElementById('btn-play');
    this.speedSlider = document.getElementById('speed-slider');
    this.speedDisplay = document.getElementById('speed-display');
    this.playing = true;
    this.currentId = null;

    document.getElementById('btn-overview')?.addEventListener('click', () => {
      this.closePanel();
      this.onOverview?.();
    });
    document.getElementById('panel-close')?.addEventListener('click', () => {
      this.closePanel();
      this.onOverview?.();
    });
    document.getElementById('btn-day-prev')?.addEventListener('click', () => this.onDateChange?.(-1));
    document.getElementById('btn-day-next')?.addEventListener('click', () => this.onDateChange?.(+1));
    document.getElementById('btn-today')?.addEventListener('click', () => this.onDateChange?.('today'));
    this.playBtn?.addEventListener('click', () => {
      this.playing = !this.playing;
      this.playBtn.textContent = this.playing ? '⏸' : '▶';
      this.onPlayToggle?.(this.playing);
    });
    // start as playing → show pause icon
    if (this.playBtn) this.playBtn.textContent = '⏸';

    this.speedSlider?.addEventListener('input', () => {
      const v = parseFloat(this.speedSlider.value);
      this.speedDisplay.textContent = `${v.toFixed(v < 10 ? 1 : 0)}x`;
      this.onSpeedChange?.(v);
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closePanel();
        this.onOverview?.();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.onDateChange?.(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.onDateChange?.(+1);
      } else if (e.key === ' ') {
        // don't steal space from inputs
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
        e.preventDefault();
        this.playBtn?.click();
      }
    });
  }

  setDate(date) {
    if (!this.dateEl) return;
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate();
    this.dateEl.textContent = `${y}년 ${m}월 ${d}일`;
  }

  setLoadingProgress(p) {
    const bar = document.getElementById('loading-bar');
    const pct = document.getElementById('loading-pct');
    const v = Math.round(Math.min(100, Math.max(0, p * 100)));
    if (bar) bar.style.width = `${v}%`;
    if (pct) pct.textContent = `${v}%`;
  }

  hideLoading() {
    const el = document.getElementById('loading');
    if (el) el.classList.add('hidden');
  }

  showBody(id, extra = {}) {
    const body = BODIES[id];
    if (!body) return;
    this.currentId = id;
    this.panel?.classList.add('open');
    this.panel?.setAttribute('aria-hidden', 'false');

    const rows = [
      ['지름', `${formatNum(body.diameterKm, 0)} km`],
      ['질량', formatMass(body.massEarth)],
      ['태양까지 거리', body.distanceAu ? `${body.distanceAu} AU` : '—'],
      ['공전 주기', formatOrbit(body.orbitDays)],
      ['자전 주기', formatRotation(body.rotationDays)],
      ['평균 온도', `${body.tempC}°C`],
      ['위성 수', `${body.moons}개`],
      ['중력 (지구=1)', `${body.gravityEarth}`],
    ];

    let moonWhy = '';
    if (id === 'moon' && extra.phase) {
      const lines = moonPhaseExplanation(extra.phase);
      moonWhy = `
        <div class="panel-section-title">지금 달이 이렇게 보이는 이유</div>
        <div class="panel-moon-why">
          ${lines.map((l, i) => `<p style="animation-delay:${0.35 + i * 0.08}s">${l}</p>`).join('')}
        </div>
      `;
    }

    this.panelContent.innerHTML = `
      <div class="panel-head">
        <div class="panel-emoji">${body.emoji}</div>
        <div class="panel-names">
          <h2>${body.nameKo}</h2>
          <div class="en">${body.nameEn}</div>
          <span class="panel-type">${body.type}</span>
        </div>
      </div>
      <table class="panel-table">
        <tbody>
          ${rows
            .map(
              ([k, v], i) =>
                `<tr style="animation-delay:${0.05 + i * 0.05}s"><th>${k}</th><td>${v}</td></tr>`
            )
            .join('')}
        </tbody>
      </table>
      ${moonWhy}
      <div class="panel-section-title">재미있는 사실</div>
      <ul class="panel-facts">
        ${body.facts
          .map((f, i) => `<li style="animation-delay:${0.4 + i * 0.08}s">${f}</li>`)
          .join('')}
      </ul>
      <p class="panel-spin-note">${body.spinNote}</p>
    `;
  }

  closePanel() {
    this.currentId = null;
    this.panel?.classList.remove('open');
    this.panel?.setAttribute('aria-hidden', 'true');
  }

  setLabelSelected(id) {
    document.querySelectorAll('.body-label').forEach((el) => {
      el.classList.toggle('selected', el.dataset.id === id);
    });
  }
}

/**
 * Create a CSS2D-style HTML label (we manage positions manually for simplicity)
 */
export function createLabelElement(id, nameKo) {
  const el = document.createElement('div');
  el.className = 'body-label';
  el.dataset.id = id;
  el.textContent = nameKo;
  el.style.position = 'absolute';
  el.style.transform = 'translate(-50%, -120%)';
  el.style.opacity = '0';
  return el;
}
