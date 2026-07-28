/**
 * src/ui.js — 정보 패널 · 시간/날짜 컨트롤 · 라벨
 *
 *  · 정보 패널: 우측 슬라이드-인 + 데이터가 순차로 "물질화"되는 stagger 애니메이션
 *    + 숫자 카운트업
 *  · 시간 바: 재생/일시정지, 배속 슬라이더(0.1x~1000x), 날짜 ◀ 하루 전 / 오늘 /
 *    하루 후 ▶. 날짜 버튼은 보간 없이 **즉시** 점프한다.
 */

import { jdToDate, dateToJD, moonPhaseInfo } from './ephemeris.js';
import { BODY_BY_KEY } from './data/bodies.js';
import { moonWhyText } from './moonview.js';

// ─────────────────────────────────────────────────────────────────────────────
// 숫자 포맷
// ─────────────────────────────────────────────────────────────────────────────

const SUPERSCRIPT = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '+': '' };

function toSuperscript(n) {
  return String(n).split('').map((c) => SUPERSCRIPT[c] ?? c).join('');
}

function formatNumber(value, stat) {
  if (stat.format === 'sci') {
    const exp = Math.floor(Math.log10(Math.abs(value) || 1));
    const mant = value / Math.pow(10, exp);
    return `${mant.toFixed(3)} × 10${toSuperscript(exp)}`;
  }
  const d = stat.decimals ?? 0;
  return value.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
}

const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

/** 0 → target 카운트업 */
function countUp(el, stat, duration = 900, delay = 0) {
  const target = stat.value;
  const t0 = performance.now() + delay;
  // 지수 표기는 지수부가 튀지 않도록 가수만 애니메이션한다
  function frame(now) {
    const p = Math.max(0, Math.min(1, (now - t0) / duration));
    const e = easeOutExpo(p);
    const v = stat.format === 'sci' ? target * (0.001 + 0.999 * e) : target * e;
    el.firstChild.nodeValue = formatNumber(v, stat);
    if (p < 1) requestAnimationFrame(frame);
    else el.firstChild.nodeValue = formatNumber(target, stat);
  }
  el.firstChild.nodeValue = formatNumber(stat.format === 'sci' ? target * 0.001 : 0, stat);
  requestAnimationFrame(frame);
}

// ─────────────────────────────────────────────────────────────────────────────
// 날짜 포맷
// ─────────────────────────────────────────────────────────────────────────────

/** JD → 로컬 달력 기준 { y, m, d } */
function localYMD(jd) {
  const dt = jdToDate(jd);
  return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate(), dt };
}

function formatKoreanDate(jd) {
  const { y, m, d } = localYMD(jd);
  return `${y}년 ${m}월 ${d}일`;
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

/** 오늘 기준 며칠 차이인지 (로컬 자정 기준) */
function dayDiffFromToday(jd) {
  const { dt } = localYMD(jd);
  const a = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  const n = new Date();
  const b = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  return Math.round((a - b) / 86400000);
}

function formatDateAux(jd) {
  const diff = dayDiffFromToday(jd);
  const { dt } = localYMD(jd);
  const wd = WEEKDAY[dt.getDay()];
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  let rel;
  if (diff === 0) rel = '오늘';
  else if (diff === 1) rel = '내일';
  else if (diff === -1) rel = '어제';
  else if (diff > 0) rel = `${diff}일 후`;
  else rel = `${-diff}일 전`;
  return { text: `${wd}요일 · ${rel} · ${hh}:${mm}`, isToday: diff === 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// 배속
// ─────────────────────────────────────────────────────────────────────────────

/** 슬라이더 값(-1..3) → 배속 (0.1 .. 1000). 1배속 = 실시간 1초에 하루가 지난다. */
export function sliderToSpeed(v) {
  return Math.pow(10, Number(v));
}

function formatSpeed(speed) {
  if (speed < 1) return `${speed.toFixed(2)}x`;
  if (speed < 10) return `${speed.toFixed(1)}x`;
  return `${Math.round(speed).toLocaleString('ko-KR')}x`;
}

function formatSpeedAux(speed) {
  if (speed >= 1) {
    const days = speed;
    if (days >= 365) return `1초 = ${(days / 365.25).toFixed(1)}년`;
    return `1초 = ${days < 10 ? days.toFixed(1) : Math.round(days).toLocaleString('ko-KR')}일`;
  }
  return `${(1 / speed).toFixed(1)}초 = 1일`;
}

// ─────────────────────────────────────────────────────────────────────────────
// UI 생성
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} state  { jd, playing, speed }
 * @param {object} hooks  { onDateJump, onPlayToggle, onSpeedChange, onSelect, onOverview, onFocusMoon }
 */
export function createUI(state, hooks) {
  const $ = (id) => document.getElementById(id);

  const panel = $('info-panel');
  const els = {
    panel,
    close: $('info-close'),
    emoji: $('info-emoji'),
    type: $('info-type'),
    name: $('info-name'),
    name2: $('info-name-2'),
    nameEn: $('info-name-en'),
    blurb: $('info-blurb'),
    stats: $('info-stats'),
    facts: $('info-facts'),
    spin: $('info-spin'),
    scroll: panel.querySelector('.info-scroll'),

    dateText: $('date-text'),
    dateAux: $('date-aux'),
    datePrev: $('date-prev'),
    dateNext: $('date-next'),
    dateToday: $('date-today'),

    play: $('btn-play'),
    playIcon: $('play-icon'),
    speed: $('speed'),
    speedText: $('speed-text'),
    speedAux: $('speed-aux'),

    overview: $('btn-overview'),
    help: $('btn-help'),
    helpBox: $('help'),
    helpClose: $('help-close'),
    moonFocus: $('moon-focus'),
  };

  let currentKey = null;
  let heroCanvas = null;

  // ── 날짜 표시 ─────────────────────────────────────────────────────────
  function refreshDate() {
    els.dateText.textContent = formatKoreanDate(state.jd);
    const aux = formatDateAux(state.jd);
    els.dateAux.textContent = aux.text;
    els.dateAux.classList.toggle('today', aux.isToday);
  }

  // ── 배속 표시 ─────────────────────────────────────────────────────────
  function refreshSpeed() {
    els.speedText.textContent = formatSpeed(state.speed);
    els.speedAux.textContent = formatSpeedAux(state.speed);
  }

  function refreshPlay() {
    els.playIcon.textContent = state.playing ? '❚❚' : '▶';
    els.play.title = state.playing ? '일시정지 (스페이스)' : '재생 (스페이스)';
  }

  // ── 정보 패널 ─────────────────────────────────────────────────────────

  function buildStats(data, delayStart) {
    els.stats.innerHTML = '';
    data.stats.forEach((stat, i) => {
      const row = document.createElement('div');
      row.className = 'row mat';
      row.style.setProperty('--d', `${delayStart + i * 0.05}s`);

      const dt = document.createElement('dt');
      dt.textContent = stat.label;

      const dd = document.createElement('dd');
      const num = document.createElement('span');
      num.appendChild(document.createTextNode('0'));
      dd.appendChild(num);
      if (stat.unit) {
        const u = document.createElement('span');
        u.className = 'u';
        u.textContent = stat.unit;
        dd.appendChild(u);
      }
      if (stat.hint) {
        const h = document.createElement('span');
        h.className = 'hint';
        h.textContent = stat.hint;
        dd.appendChild(h);
      }

      row.appendChild(dt);
      row.appendChild(dd);
      els.stats.appendChild(row);

      countUp(num, stat, 900, (delayStart + i * 0.05) * 1000 + 120);
    });
  }

  function buildFacts(data, delayStart) {
    els.facts.innerHTML = '';
    data.facts.forEach((f, i) => {
      const li = document.createElement('li');
      li.className = 'mat';
      li.style.setProperty('--d', `${delayStart + i * 0.07}s`);
      li.textContent = f;
      els.facts.appendChild(li);
    });
  }

  /** 달 전용 강조 블록 (다른 행성보다 크고 눈에 띄게) */
  function buildMoonHero(moonView) {
    removeMoonHero();
    const info = moonPhaseInfo(state.jd);
    const box = document.createElement('div');
    box.className = 'moon-hero mat';
    box.id = 'moon-hero';
    box.style.setProperty('--d', '0.1s');

    const top = document.createElement('div');
    top.className = 'mh-top';
    const cv = document.createElement('canvas');
    cv.width = 148;
    cv.height = 148;
    const txt = document.createElement('div');
    txt.innerHTML =
      `<div class="mh-name">${info.name}</div>` +
      `<div class="mh-sub">밝기 ${(info.illumination * 100).toFixed(1)}% · 월령 ${info.age.toFixed(1)}일<br>` +
      `다음 보름까지 ${info.toFullMoon.toFixed(1)}일</div>`;
    top.appendChild(cv);
    top.appendChild(txt);

    const p = document.createElement('p');
    p.id = 'moon-hero-why';
    p.textContent = moonWhyText(info);

    box.appendChild(top);
    box.appendChild(p);
    els.blurb.parentNode.insertBefore(box, els.blurb);

    heroCanvas = cv;
    if (moonView) moonView.attachHero(cv);
    return box;
  }

  function removeMoonHero() {
    const old = document.getElementById('moon-hero');
    if (old) old.remove();
    heroCanvas = null;
  }

  /** 달 패널 내용이 날짜 변화에 따라 살아 있도록 갱신 */
  function refreshMoonHero() {
    if (currentKey !== 'moon') return;
    const box = document.getElementById('moon-hero');
    if (!box) return;
    const info = moonPhaseInfo(state.jd);
    const sub = box.querySelector('.mh-name');
    const sub2 = box.querySelector('.mh-sub');
    const why = box.querySelector('#moon-hero-why');
    if (sub) sub.textContent = info.name;
    if (sub2) {
      sub2.innerHTML =
        `밝기 ${(info.illumination * 100).toFixed(1)}% · 월령 ${info.age.toFixed(1)}일<br>` +
        `다음 보름까지 ${info.toFullMoon.toFixed(1)}일`;
    }
    if (why) why.textContent = moonWhyText(info);
  }

  /**
   * 천체 정보 패널 열기
   * @param {string} key
   * @param {object} moonView 달 인셋 뷰 (달일 때 hero 캔버스 연결)
   */
  function openPanel(key, moonView) {
    const data = BODY_BY_KEY[key];
    if (!data) return;
    currentKey = key;

    // 애니메이션을 처음부터 다시 돌리기 위해 open 클래스를 잠깐 뗀다
    panel.classList.remove('open');
    // 강제 리플로우
    void panel.offsetWidth;

    els.emoji.textContent = data.emoji;
    els.type.textContent = data.type;
    els.name.textContent = data.name;
    els.name2.textContent = data.name;
    els.nameEn.textContent = data.nameEn;
    els.blurb.textContent = data.blurb;
    els.spin.textContent = data.spinNote;

    // stagger 대상에 클래스 부여
    panel.querySelector('.info-head').className = 'info-head mat';
    panel.querySelector('.info-head').style.setProperty('--d', '0.05s');

    if (key === 'moon') {
      buildMoonHero(moonView);
      els.blurb.className = 'info-blurb mat';
      els.blurb.style.setProperty('--d', '0.2s');
    } else {
      removeMoonHero();
      if (moonView) moonView.detachHero();
      els.blurb.className = 'info-blurb mat';
      els.blurb.style.setProperty('--d', '0.12s');
    }

    const titles = panel.querySelectorAll('.info-section-title');
    titles[0].className = 'info-section-title mat';
    titles[0].style.setProperty('--d', '0.2s');
    titles[1].className = 'info-section-title mat';
    titles[1].style.setProperty('--d', '0.5s');

    buildStats(data, 0.24);
    buildFacts(data, 0.56);

    els.spin.className = 'info-spin mat';
    els.spin.style.setProperty('--d', `${0.56 + data.facts.length * 0.07 + 0.06}s`);

    els.scroll.scrollTop = 0;
    requestAnimationFrame(() => panel.classList.add('open'));
  }

  function closePanel() {
    panel.classList.remove('open');
    currentKey = null;
    removeMoonHero();
  }

  // ── 이벤트 ────────────────────────────────────────────────────────────

  els.close.addEventListener('click', () => hooks.onSelect(null));

  els.datePrev.addEventListener('click', () => hooks.onDateJump(-1));
  els.dateNext.addEventListener('click', () => hooks.onDateJump(+1));
  els.dateToday.addEventListener('click', () => hooks.onDateJump(0, true));

  els.play.addEventListener('click', () => hooks.onPlayToggle());

  els.speed.addEventListener('input', () => {
    hooks.onSpeedChange(sliderToSpeed(els.speed.value));
    refreshSpeed();
  });

  els.overview.addEventListener('click', () => hooks.onOverview());
  els.moonFocus?.addEventListener('click', () => hooks.onFocusMoon());

  els.help.addEventListener('click', () => { els.helpBox.hidden = false; });
  els.helpClose.addEventListener('click', () => { els.helpBox.hidden = true; });
  els.helpBox.addEventListener('click', (e) => {
    if (e.target === els.helpBox) els.helpBox.hidden = true;
  });

  // 키보드
  window.addEventListener('keydown', (e) => {
    // 입력 요소에 포커스가 있으면 기본 동작을 존중한다
    // (배속 슬라이더에서 ← → 는 배속 조절이어야 한다)
    if (e.target instanceof HTMLInputElement) return;
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        hooks.onDateJump(-1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        hooks.onDateJump(+1);
        break;
      case ' ':
      case 'Spacebar':
        // 버튼에 포커스가 있으면 브라우저가 클릭을 대신 발생시키므로 중복 실행 방지
        if (e.target instanceof HTMLButtonElement) return;
        e.preventDefault();
        hooks.onPlayToggle();
        break;
      case 'Escape':
        if (!els.helpBox.hidden) els.helpBox.hidden = true;
        else hooks.onOverview();
        break;
      case 't':
      case 'T':
        hooks.onDateJump(0, true);
        break;
      default:
        break;
    }
  });

  // 초기 표시
  els.speed.value = String(Math.log10(state.speed));
  refreshDate();
  refreshSpeed();
  refreshPlay();

  return {
    els,
    openPanel,
    closePanel,
    refreshDate,
    refreshSpeed,
    refreshPlay,
    refreshMoonHero,
    get currentKey() { return currentKey; },
    get heroCanvas() { return heroCanvas; },
  };
}

/** 오늘(지금 이 순간)의 JD */
export function todayJD() {
  return dateToJD(new Date());
}
