// ui.js — 정보 패널, 시간/날짜 컨트롤, 라벨, 로딩
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { formatKoreanDate, isSameLocalDay } from './ephemeris.js';

const $ = (id) => document.getElementById(id);

// 슬라이더 0~1000 ↔ 배속 0.1x~1000x (로그)
export function sliderToSpeed(v) { return Math.pow(10, (v / 1000) * 4 - 1); }
export function speedToSlider(s) { return ((Math.log10(s) + 1) / 4) * 1000; }

function speedLabel(speed) {
  // 1x = 1초에 1시간
  const hoursPerSec = speed;
  let desc;
  if (hoursPerSec < 1) desc = `1초 = ${Math.round(hoursPerSec * 60)}분`;
  else if (hoursPerSec < 24) desc = `1초 = ${hoursPerSec.toFixed(hoursPerSec < 10 ? 1 : 0)}시간`;
  else desc = `1초 = ${(hoursPerSec / 24).toFixed(hoursPerSec / 24 < 10 ? 1 : 0)}일`;
  const sp = speed < 1 ? speed.toFixed(1) : speed < 10 ? speed.toFixed(1) : Math.round(speed);
  return `${sp}x<small>${desc}</small>`;
}

const WHY_TEXT = [
  '달이 태양과 지구 사이에 있어요. 태양빛을 받는 밝은 면이 태양 쪽을 향하고 있어서, 지구에서는 어두운 면만 보여요. 그래서 달이 거의 보이지 않아요.',
  '달이 태양에서 조금 동쪽으로 벗어났어요. 밝은 면의 오른쪽 가장자리만 살짝 보여서 가느다란 초승달이에요. 해 진 뒤 서쪽 하늘에서 찾아보세요.',
  '달이 태양에서 90° 떨어져 있어요. 밝은 반구의 절반이 보이니까 오른쪽 반이 밝은 반달이에요. 저녁에 남쪽 하늘 높이 떠 있어요.',
  '달이 태양의 반대편에 가까워지고 있어요. 밝은 면이 대부분 보여서 볼록해요. 며칠 뒤면 보름달이 돼요.',
  '지구가 태양과 달 사이에 있어요. 태양빛을 받는 면 전체가 지구를 향해서 둥근 보름달로 보여요. 해가 질 때 동쪽에서 떠올라 밤새 보여요.',
  '보름이 지나 달이 다시 태양 쪽으로 다가가고 있어요. 밝은 면의 왼쪽이 보이며 조금씩 기울어요. 밤늦게 떠서 아침 하늘에도 남아 있어요.',
  '달이 태양에서 다시 90° 떨어진 위치예요. 이번엔 왼쪽 반이 밝은 반달이에요. 한밤중에 떠서 새벽 남쪽 하늘에 있어요.',
  '달이 태양 바로 앞으로 돌아가는 중이에요. 왼쪽 가장자리만 가늘게 밝아요. 해 뜨기 전 동쪽 하늘에서 볼 수 있어요.',
];

export function moonWhyText(phase) {
  const base = WHY_TEXT[phase.index];
  return `${base} 지금 태양-지구-달 각도(위상각)는 ${phase.angle.toFixed(0)}°, 밝게 보이는 부분은 ${(phase.illumination * 100).toFixed(0)}%예요.`;
}

function formatNumber(v, digits) {
  return v.toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function createUI({ bodies, callbacks }) {
  const dom = {
    loading: $('loading'), loadingFill: $('loading-fill'), loadingPct: $('loading-pct'),
    panel: $('panel'), panelClose: $('panel-close'), panelEmoji: $('panel-emoji'), panelName: $('panel-name'),
    panelEn: $('panel-en'), panelType: $('panel-type'), panelStats: $('panel-stats'), panelFacts: $('panel-facts'),
    panelDirection: $('panel-direction'), panelMoonWhy: $('panel-moon-why'), panelMoonWhyText: $('panel-moon-why-text'),
    dateDisplay: $('date-display'), btnPrev: $('btn-prev-day'), btnNext: $('btn-next-day'), btnToday: $('btn-today'),
    btnPlay: $('btn-play'), speed: $('speed'), speedReadout: $('speed-readout'), btnOverview: $('btn-overview'),
  };

  // ---- 라벨
  const labels = new Map();
  let hoverId = null, activeId = null;
  for (const b of bodies.list) {
    const el = document.createElement('div');
    el.className = 'body-label' + (b.id === 'moon' ? ' moon-label' : '');
    el.textContent = b.data.name;
    el.style.setProperty('--c', b.data.color);
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => { e.stopPropagation(); callbacks.onSelect(b.id); });
    el.addEventListener('pointerenter', () => callbacks.onHover?.(b.id));
    el.addEventListener('pointerleave', () => callbacks.onHover?.(null));
    const obj = new CSS2DObject(el);
    obj.position.set(0, b.radius * 1.25, 0);
    obj.center.set(0.5, 1);
    b.group.add(obj);
    labels.set(b.id, { obj, el, body: b });
  }
  const _v = new THREE.Vector3();
  function updateLabels(camera) {
    for (const { obj, el, body } of labels.values()) {
      const d = body.worldPosition(_v).distanceTo(camera.position);
      let o = 1;
      const near = body.radius * 3.2;
      if (d < near) o = Math.max(0, (d - body.radius * 1.2) / (near - body.radius * 1.2));
      if (body.id === 'moon' && d > 90) o = Math.max(0, 1 - (d - 90) / 40);
      if (d > 700) o *= Math.max(0.35, 1 - (d - 700) / 600);
      el.style.opacity = o.toFixed(2);
      el.style.pointerEvents = o < 0.1 ? 'none' : 'auto';
      obj.visible = o > 0.02;
    }
  }
  function setHover(id) {
    if (hoverId && labels.get(hoverId)) labels.get(hoverId).el.classList.remove('hover');
    hoverId = id;
    if (id && labels.get(id)) labels.get(id).el.classList.add('hover');
    document.body.style.cursor = id ? 'pointer' : '';
  }
  function setActive(id) {
    if (activeId && labels.get(activeId)) labels.get(activeId).el.classList.remove('active');
    activeId = id;
    if (id && labels.get(id)) labels.get(id).el.classList.add('active');
  }

  // ---- 정보 패널
  let countUpTimers = [];
  function showPanel(body, { moonPhase } = {}) {
    for (const t of countUpTimers) cancelAnimationFrame(t);
    countUpTimers = [];
    const d = body.data;
    dom.panelEmoji.textContent = d.emoji;
    dom.panelName.textContent = d.name;
    dom.panelEn.textContent = d.nameEn;
    dom.panelType.textContent = d.type;
    dom.panel.style.setProperty('--c', d.color);
    dom.panelEmoji.style.boxShadow = `0 0 22px ${d.color}55`;

    // 수치 테이블 (stagger + 카운트업)
    dom.panelStats.innerHTML = '';
    d.stats.forEach((s, i) => {
      const tr = document.createElement('tr');
      tr.className = 'materialize';
      tr.style.animationDelay = `${120 + i * 70}ms`;
      const td1 = document.createElement('td'); td1.textContent = s.label;
      const td2 = document.createElement('td');
      const val = document.createElement('span'); val.className = 'val'; val.textContent = formatNumber(0, s.digits);
      const unit = document.createElement('span'); unit.className = 'unit'; unit.textContent = s.unit;
      td2.append(val, unit);
      tr.append(td1, td2);
      dom.panelStats.appendChild(tr);
      // 카운트업
      const start = performance.now() + 120 + i * 70, dur = 900;
      const tick = (now) => {
        const t = Math.min(1, Math.max(0, (now - start) / dur));
        const k = 1 - Math.pow(1 - t, 3);
        val.textContent = formatNumber(s.value * k, s.digits);
        if (t < 1) countUpTimers.push(requestAnimationFrame(tick));
      };
      countUpTimers.push(requestAnimationFrame(tick));
    });

    dom.panelFacts.innerHTML = '';
    d.facts.forEach((f, i) => {
      const li = document.createElement('li');
      li.className = 'materialize';
      li.style.animationDelay = `${700 + i * 110}ms`;
      li.textContent = f;
      dom.panelFacts.appendChild(li);
    });
    dom.panelDirection.textContent = d.direction;
    dom.panelDirection.className = 'direction materialize';
    dom.panelDirection.style.animationDelay = '1150ms';

    if (body.id === 'moon' && moonPhase) {
      dom.panelMoonWhy.hidden = false;
      dom.panelMoonWhy.className = 'panel-section materialize';
      dom.panelMoonWhy.style.animationDelay = '60ms';
      dom.panelMoonWhyText.textContent = moonWhyText(moonPhase);
    } else {
      dom.panelMoonWhy.hidden = true;
    }
    dom.panel.classList.remove('hidden');
    dom.panel.scrollTop = 0;
  }
  function updatePanelMoon(phase) {
    if (!dom.panelMoonWhy.hidden) dom.panelMoonWhyText.textContent = moonWhyText(phase);
  }
  function hidePanel() { dom.panel.classList.add('hidden'); }
  dom.panelClose.addEventListener('click', () => callbacks.onOverview());

  // ---- 시간/날짜 컨트롤
  dom.btnPrev.addEventListener('click', () => callbacks.onPrevDay());
  dom.btnNext.addEventListener('click', () => callbacks.onNextDay());
  dom.btnToday.addEventListener('click', () => callbacks.onToday());
  dom.btnPlay.addEventListener('click', () => callbacks.onTogglePlay());
  dom.btnOverview.addEventListener('click', () => callbacks.onOverview());
  dom.speed.addEventListener('input', () => {
    callbacks.onSpeed(sliderToSpeed(Number(dom.speed.value)));
  });
  dom.speed.addEventListener('change', () => dom.speed.blur());
  for (const b of [dom.btnPrev, dom.btnNext, dom.btnToday, dom.btnPlay, dom.btnOverview, dom.panelClose]) {
    b.addEventListener('click', () => b.blur());
  }

  let lastDateText = '';
  const insetTitle = document.querySelector('#moon-inset .inset-title');
  function setDate(jd, flash = false) {
    const text = formatKoreanDate(jd);
    if (text !== lastDateText) {
      dom.dateDisplay.textContent = text;
      lastDateText = text;
      const today = isSameLocalDay(jd);
      dom.btnToday.classList.toggle('accent', !today);
      if (insetTitle) insetTitle.textContent = today ? '🌙 오늘 밤 지구에서 보는 달' : `🌙 ${text} 밤 지구에서 보는 달`;
    }
    if (flash) {
      dom.dateDisplay.classList.remove('flash');
      void dom.dateDisplay.offsetWidth;
      dom.dateDisplay.classList.add('flash');
    }
  }
  function setPlaying(p) { dom.btnPlay.textContent = p ? '❚❚' : '▶'; dom.btnPlay.title = p ? '일시정지 (Space)' : '재생 (Space)'; }
  function setSpeed(speed) {
    dom.speed.value = String(Math.round(speedToSlider(speed)));
    dom.speedReadout.innerHTML = speedLabel(speed);
  }

  // ---- 로딩
  function setLoading(loaded, total) {
    const pct = Math.round((loaded / total) * 100);
    dom.loadingFill.style.width = `${pct}%`;
    dom.loadingPct.textContent = `${pct}%`;
  }
  function hideLoading() {
    dom.loading.classList.add('done');
    setTimeout(() => dom.loading.remove(), 1200);
  }

  return {
    labels, updateLabels, setHover, setActive, showPanel, hidePanel, updatePanelMoon,
    setDate, setPlaying, setSpeed, setLoading, hideLoading,
    moonDom: { name: $('moon-phase-name'), illum: $('moon-illum'), age: $('moon-age'), nextFull: $('moon-next-full'), sunDir: $('moon-sun-dir') },
  };
}
