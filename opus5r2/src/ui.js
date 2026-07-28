/**
 * ui.js — HUD 전체: 이름 라벨, 정보 패널, 시간/날짜 컨트롤, 달 인셋, 로딩 화면.
 */

import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { statRows } from './data/bodies.js';
import { moonExplanation, moonFootNote } from './moonview.js';

/* ══════════════════════════════════════════════════════════════
   숫자 카운트업
   ══════════════════════════════════════════════════════════════ */

const activeCounters = new Set();

function countUp(el, to, format, duration = 900, delay = 0) {
  const state = { raf: 0 };
  activeCounters.add(state);
  const start = performance.now() + delay;
  el.textContent = format(0);

  const step = (now) => {
    if (!activeCounters.has(state)) return;
    if (now < start) {
      state.raf = requestAnimationFrame(step);
      return;
    }
    const t = Math.min(1, (now - start) / duration);
    // easeOutExpo
    const e = t === 1 ? 1 : 1 - Math.pow(2, -9 * t);
    el.textContent = format(to * e);
    if (t < 1) state.raf = requestAnimationFrame(step);
    else activeCounters.delete(state);
  };
  state.raf = requestAnimationFrame(step);
}

function stopCounters() {
  for (const s of activeCounters) cancelAnimationFrame(s.raf);
  activeCounters.clear();
}

/* ══════════════════════════════════════════════════════════════
   날짜 / 배속 포맷
   ══════════════════════════════════════════════════════════════ */

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function formatKoreanDate(date) {
  return `${date.getUTCFullYear()}년 ${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일`;
}

export function formatKoreanWeekday(date) {
  const w = WEEKDAYS[date.getUTCDay()];
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  return `${w}요일 · ${hh}:${mm} UTC`;
}

/** 슬라이더(0~1000) → 배속(0.1~1000), 로그 스케일 */
export function sliderToSpeed(v) {
  return 0.1 * Math.pow(10000, v / 1000);
}
export function speedToSlider(s) {
  return (Math.log(s / 0.1) / Math.log(10000)) * 1000;
}

export function formatSpeed(s) {
  if (s < 1) return `${s.toFixed(2)}×`;
  if (s < 10) return `${s.toFixed(1)}×`;
  return `${Math.round(s)}×`;
}

/* ══════════════════════════════════════════════════════════════
   라벨
   ══════════════════════════════════════════════════════════════ */

/**
 * 천체 위에 항상 떠 있는 이름 라벨.
 * @returns {{object: CSS2DObject, el: HTMLElement}}
 */
export function createLabel(bodyData, onClick) {
  const el = document.createElement('div');
  el.className = 'body-label';
  if (bodyData.key === 'moon') el.classList.add('is-moon');
  el.innerHTML = `${bodyData.nameKo}<span class="lbl-en">${bodyData.nameEn}</span>`;
  el.style.color = bodyData.labelColor;
  el.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick(bodyData.key);
  });

  const object = new CSS2DObject(el);
  object.center.set(0.5, 0.5);
  return { object, el };
}

/** 달 패널 본문 (날짜가 바뀌면 이 블록만 교체한다 → 애니메이션 재시작 없음) */
function moonWhyHtml(info) {
  return `
    <p style="margin:0 0 10px;font-size:15px;font-weight:700;letter-spacing:.04em;color:#fff">
      ${info.name} · 조명률 ${Math.round(info.illumination * 100)}% · 월령 ${info.age.toFixed(1)}일
    </p>
    ${moonExplanation(info).trim().replace(/<p>/g, '<p style="margin:0 0 8px">')}
    <p style="margin:10px 0 0;font-size:12px;color:rgba(255,238,214,.72)">
      다음 보름달까지 ${info.nextFullMoonDays.toFixed(1)}일 · 다음 삭까지 ${info.nextNewMoonDays.toFixed(1)}일
    </p>
  `;
}

/* ══════════════════════════════════════════════════════════════
   UI 컨트롤러
   ══════════════════════════════════════════════════════════════ */

export class UI {
  constructor(handlers = {}) {
    this.h = handlers;

    this.el = {
      loader: document.getElementById('loader'),
      ldFill: document.getElementById('ld-fill'),
      ldPct: document.getElementById('ld-pct'),
      ldStatus: document.getElementById('ld-status'),

      panel: document.getElementById('info-panel'),
      panelContent: document.getElementById('info-content'),
      panelClose: document.getElementById('info-close'),

      dateDisplay: document.getElementById('date-display'),
      dateSub: document.getElementById('date-sub'),
      btnPrev: document.getElementById('btn-prev-day'),
      btnNext: document.getElementById('btn-next-day'),
      btnToday: document.getElementById('btn-today'),
      btnPlay: document.getElementById('btn-play'),
      playIcon: document.getElementById('play-icon'),
      slider: document.getElementById('speed-slider'),
      speedDisplay: document.getElementById('speed-display'),
      btnOverview: document.getElementById('btn-overview'),

      moonEmoji: document.getElementById('moon-emoji'),
      moonPhaseName: document.getElementById('moon-phase-name'),
      moonIllum: document.getElementById('moon-illum'),
      moonAge: document.getElementById('moon-age'),
      moonNextFull: document.getElementById('moon-nextfull'),
      moonDist: document.getElementById('moon-dist'),
      moonFoot: document.getElementById('moon-foot'),
      moonFocusBtn: document.getElementById('moon-focus-btn'),
    };

    this._bind();
    this._selectedKey = null;
    this._lastMoonSig = '';
  }

  _bind() {
    const { el, h } = this;

    el.panelClose.addEventListener('click', () => h.onClose?.());
    el.btnOverview.addEventListener('click', () => h.onOverview?.());
    el.btnPrev.addEventListener('click', () => h.onDayStep?.(-1));
    el.btnNext.addEventListener('click', () => h.onDayStep?.(+1));
    el.btnToday.addEventListener('click', () => h.onToday?.());
    el.btnPlay.addEventListener('click', () => h.onPlayToggle?.());
    el.moonFocusBtn.addEventListener('click', () => h.onSelect?.('moon'));

    el.slider.addEventListener('input', () => {
      const speed = sliderToSpeed(Number(el.slider.value));
      this._paintSlider();
      h.onSpeedChange?.(speed);
    });

    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          h.onDayStep?.(-1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          h.onDayStep?.(+1);
          break;
        case 'Escape':
          h.onOverview?.();
          break;
        case ' ':
          e.preventDefault();
          h.onPlayToggle?.();
          break;
        default:
          break;
      }
    });
  }

  _paintSlider() {
    const el = this.el.slider;
    const pct = ((Number(el.value) - Number(el.min)) / (Number(el.max) - Number(el.min))) * 100;
    el.style.setProperty('--fill', `${pct}%`);
  }

  /* ── 로딩 ─────────────────────────────────────────────── */

  setLoading(pct, label) {
    const p = Math.round(pct * 100);
    this.el.ldFill.style.width = `${p}%`;
    this.el.ldPct.textContent = String(p);
    if (label) this.el.ldStatus.textContent = `${label} 불러오는 중…`;
  }

  finishLoading() {
    this.el.ldStatus.textContent = '준비 완료';
    this.el.ldFill.style.width = '100%';
    this.el.ldPct.textContent = '100';
    setTimeout(() => this.el.loader.classList.add('is-done'), 380);
  }

  /* ── 시간 / 날짜 ──────────────────────────────────────── */

  setDate(date) {
    this.el.dateDisplay.textContent = formatKoreanDate(date);
    this.el.dateSub.textContent = formatKoreanWeekday(date);
  }

  setSpeed(speed, { syncSlider = false } = {}) {
    this.el.speedDisplay.innerHTML =
      `<b>${formatSpeed(speed)}</b><i>${speed < 1 ? speed.toFixed(2) : speed < 10 ? speed.toFixed(1) : Math.round(speed)}일/초</i>`;
    if (syncSlider) {
      this.el.slider.value = String(Math.round(speedToSlider(speed)));
    }
    this._paintSlider();
  }

  setPlaying(playing) {
    this.el.playIcon.textContent = playing ? '❚❚' : '▶';
    this.el.btnPlay.setAttribute('aria-label', playing ? '일시정지' : '재생');
  }

  /* ── 달 인셋 ──────────────────────────────────────────── */

  updateMoonInset(info) {
    const sig = `${info.name}|${info.illumination.toFixed(4)}|${info.age.toFixed(3)}`;
    if (sig === this._lastMoonSig) return;
    this._lastMoonSig = sig;

    const el = this.el;
    el.moonEmoji.textContent = info.emoji;
    el.moonPhaseName.textContent = info.name;
    el.moonIllum.textContent = `${(info.illumination * 100).toFixed(info.illumination > 0.995 || info.illumination < 0.005 ? 1 : 0)}%`;
    el.moonAge.textContent = `${info.age.toFixed(1)}일`;
    el.moonNextFull.textContent =
      info.nextFullMoonDays < 0.5
        ? '오늘!'
        : `${info.nextFullMoonDays.toFixed(1)}일 뒤`;
    el.moonDist.textContent = `${Math.round(info.distKm).toLocaleString('ko-KR')} km`;
    el.moonFoot.textContent = moonFootNote(info);
  }

  /* ── 정보 패널 ────────────────────────────────────────── */

  /**
   * @param {object} body data/bodies.js 의 천체 데이터
   * @param {object} extra { moonInfo }
   */
  showBody(body, extra = {}) {
    stopCounters();
    this._selectedKey = body.key;

    let i = 0;
    const next = () => i++;
    const parts = [];

    parts.push(
      `<p class="ip-kicker mz" style="--i:${next()}">선택한 천체</p>`,
      `<h2 class="ip-title mz" style="--i:${next()}"><span class="ip-emoji" style="color:${body.labelColor}">${body.emoji}</span>${body.nameKo}</h2>`,
      `<p class="ip-en mz" style="--i:${next()}">${body.nameEn} · ${body.type}</p>`,
      `<p class="ip-tagline mz" style="--i:${next()}">${body.tagline}</p>`
    );

    // ── 달이면 "왜 이렇게 보이는지"를 맨 위에 크게
    if (body.key === 'moon' && extra.moonInfo) {
      parts.push(
        `<section class="ip-sec mz" style="--i:${next()}">
           <h3><span id="ip-moon-emoji">${extra.moonInfo.emoji}</span> 지금 달이 이렇게 보이는 이유</h3>
           <div class="ip-moonwhy" id="ip-moonwhy">${moonWhyHtml(extra.moonInfo)}</div>
         </section>`
      );
    }

    // ── 수치 테이블
    const rows = statRows(body);
    parts.push(
      `<section class="ip-sec mz" style="--i:${next()}">
         <h3>숫자로 보는 ${body.nameKo}</h3>
         <div class="ip-stats">
           ${rows
             .map(
               (r, idx) =>
                 `<dl class="ip-stat"><dt>${r.label}</dt><dd data-count="${idx}"><span class="v">—</span><span class="u"></span></dd></dl>`
             )
             .join('')}
         </div>
       </section>`
    );

    // ── 재미있는 사실
    parts.push(
      `<section class="ip-sec mz" style="--i:${next()}">
         <h3>재미있는 사실</h3>
         <ul class="ip-facts">
           ${body.facts.map((f) => `<li>${f}</li>`).join('')}
         </ul>
       </section>`
    );

    // ── 자전/공전 방향
    parts.push(
      `<section class="ip-sec mz" style="--i:${next()}">
         <h3>자전과 공전 방향</h3>
         <p class="ip-spin">${body.spinNote}</p>
       </section>`
    );

    this.el.panelContent.innerHTML = parts.join('');
    this.el.panel.classList.add('is-open');
    this.el.panel.setAttribute('aria-hidden', 'false');
    this.el.panel.scrollTop = 0;

    // ── 숫자 카운트업
    const dds = this.el.panelContent.querySelectorAll('dd[data-count]');
    dds.forEach((dd, idx) => {
      const r = rows[idx];
      const vEl = dd.querySelector('.v');
      const uEl = dd.querySelector('.u');
      const unit = r.unitOverride ? r.unitOverride(r.value) : r.unit;
      uEl.textContent = unit;
      if (r.static) {
        vEl.textContent = r.format(r.value);
        uEl.textContent = '';
        return;
      }
      countUp(vEl, r.value, (v) => r.format(v), 950, 240 + idx * 55);
    });
  }

  /** 달 패널이 열려 있으면 설명 블록만 즉시 교체 */
  updateMoonWhy(info) {
    const box = document.getElementById('ip-moonwhy');
    if (!box) return;
    box.innerHTML = moonWhyHtml(info);
    const emoji = document.getElementById('ip-moon-emoji');
    if (emoji) emoji.textContent = info.emoji;
  }

  hidePanel() {
    stopCounters();
    this._selectedKey = null;
    this.el.panel.classList.remove('is-open');
    this.el.panel.setAttribute('aria-hidden', 'true');
  }

  get selectedKey() {
    return this._selectedKey;
  }
}
