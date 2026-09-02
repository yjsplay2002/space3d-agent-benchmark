// HUD: 타이틀, 안내, 시간 컨트롤, 정보 패널, 로딩 화면

const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = (n) => String(n).split('').map((c) => SUP[c] ?? c).join('');
const fmtInt = (n) => Math.round(n).toLocaleString('ko-KR');

// km → "1억 4,960만 km" 형식
export function fmtKm(km) {
  km = Math.max(0, Math.round(km));
  const eok = Math.floor(km / 1e8);
  const man = Math.floor((km % 1e8) / 1e4);
  const rest = km % 1e4;
  const parts = [];
  if (eok) parts.push(`${fmtInt(eok)}억`);
  if (man) parts.push(`${fmtInt(man)}만`);
  if (rest || parts.length === 0) parts.push(fmtInt(rest));
  return parts.join(' ') + ' km';
}

function buildStats(d) {
  const rows = [];
  rows.push({ k: '지름', value: d.diameterKm, fmt: (v) => `${fmtInt(v)} km` });
  rows.push({ k: '질량', value: d.mass[0], fmt: (v) => `${v.toFixed(2)} × 10${sup(d.mass[1])} kg` });
  if (d.distance > 0) {
    rows.push({
      k: d.distanceLabel || '태양까지 거리',
      value: d.distance * 1e6,
      fmt: (v) => fmtKm(v),
    });
  }
  if (d.orbitDays > 0) {
    rows.push({
      k: d.parent ? '공전 주기 (지구 기준)' : '공전 주기',
      value: d.orbitDays,
      fmt: (v) => {
        if (d.orbitDays < 1000) {
          const yrs = d.orbitDays >= 360 && d.orbitDays <= 370 ? ' (1년)' : '';
          return `${v.toFixed(d.orbitDays < 100 ? 1 : 0)}일${yrs}`;
        }
        return `${(v / 365.25).toFixed(1)}년`;
      },
    });
  }
  rows.push({
    k: '자전 주기',
    value: Math.abs(d.rotationHours),
    fmt: (v) => {
      const retro = d.rotationHours < 0 ? ' (역자전)' : '';
      if (Math.abs(d.rotationHours) < 48) return `${v.toFixed(1)}시간${retro}`;
      return `${(v / 24).toFixed(Math.abs(d.rotationHours) / 24 < 100 ? 1 : 0)}일${retro}`;
    },
  });
  rows.push({ k: '평균 온도', value: d.tempC, fmt: (v) => `${Math.round(v)}°C` });
  rows.push({ k: '위성 수', value: d.moons, fmt: (v) => `${Math.round(v)}개` });
  rows.push({ k: '중력', value: d.gravity, fmt: (v) => `${v.toFixed(2)}<small>(지구=1)</small>` });
  rows.push({ k: '자전축 기울기', value: d.tiltDeg, fmt: (v) => `${v.toFixed(1)}°` });
  return rows;
}

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export function createUI({ onPlayToggle, onSpeedChange, onOverview, onClosePanel }) {
  const app = document.getElementById('app');

  // ---------- 로딩 ----------
  const loading = document.createElement('div');
  loading.className = 'loading';
  loading.innerHTML = `
    <div class="ring"></div>
    <div class="l-title">Space3D</div>
    <div class="l-sub">우리 태양계 탐험</div>
    <div class="bar"><i></i></div>
    <div class="pct">텍스처 불러오는 중 · 0%</div>
  `;
  document.body.appendChild(loading);
  const bar = loading.querySelector('.bar i');
  const pct = loading.querySelector('.pct');

  // ---------- HUD ----------
  const hud = document.createElement('div');
  hud.className = 'hud';
  hud.innerHTML = `
    <i class="hud-corner tl"></i><i class="hud-corner tr"></i><i class="hud-corner bl"></i><i class="hud-corner br"></i>
    <div class="title-block">
      <div class="eyebrow">Solar System · Explorer</div>
      <h1>우리 태양계 탐험</h1>
      <div class="hint"><b>행성을 클릭</b>해 보세요 · 휠로 확대/축소 · ESC로 돌아가기</div>
    </div>
    <div class="scale-note">실제 비율 아님 · 크기·거리는 교육용으로 압축됨</div>
    <button class="btn overview-btn" type="button">◀ 전체 보기</button>
    <div class="timebar">
      <button class="play" type="button" aria-label="일시정지/재생">
        <svg viewBox="0 0 16 16" class="ic-pause"><rect x="3" y="2" width="4" height="12"/><rect x="9" y="2" width="4" height="12"/></svg>
        <svg viewBox="0 0 16 16" class="ic-play" style="display:none"><path d="M4 2 L14 8 L4 14 Z"/></svg>
      </button>
      <div class="speed-wrap">
        <div class="speed-head"><span>시간 속도</span><span class="val">×1</span></div>
        <input class="speed" type="range" min="0" max="1000" value="0" />
      </div>
      <div class="clock"><b>0일</b><span>1초 = 1일</span></div>
    </div>
    <aside class="panel" aria-live="polite">
      <button class="close" type="button" aria-label="닫기">✕</button>
      <div class="p-body"></div>
    </aside>
  `;
  app.appendChild(hud);

  const overviewBtn = hud.querySelector('.overview-btn');
  const playBtn = hud.querySelector('.play');
  const icPause = hud.querySelector('.ic-pause');
  const icPlay = hud.querySelector('.ic-play');
  const speedInput = hud.querySelector('input.speed');
  const speedVal = hud.querySelector('.speed-head .val');
  const clock = hud.querySelector('.clock');
  const panel = hud.querySelector('.panel');
  const panelBody = hud.querySelector('.p-body');
  const closeBtn = hud.querySelector('.panel .close');

  // 속도: 슬라이더 0..1000 → 10^(-1 .. 3) = 0.1x .. 1000x (1x = 하루/초)
  const sliderToSpeed = (v) => Math.pow(10, -1 + (v / 1000) * 4);
  const speedToSlider = (s) => ((Math.log10(s) + 1) / 4) * 1000;

  function fmtSpeed(s) {
    if (s >= 100) return `×${Math.round(s)}`;
    if (s >= 10) return `×${s.toFixed(0)}`;
    return `×${s.toFixed(1)}`;
  }

  function setSpeed(s) {
    speedInput.value = String(speedToSlider(s));
    speedInput.style.setProperty('--pct', `${speedToSlider(s) / 10}%`);
    speedVal.textContent = fmtSpeed(s);
    const sub = s >= 1 ? `1초 = ${s < 10 ? s.toFixed(1) : Math.round(s)}일` : `1초 = ${(s * 24).toFixed(1)}시간`;
    clock.querySelector('span').textContent = sub;
  }

  speedInput.addEventListener('input', () => {
    const s = sliderToSpeed(Number(speedInput.value));
    setSpeed(s);
    onSpeedChange?.(s);
  });

  function setPlaying(p) {
    icPause.style.display = p ? '' : 'none';
    icPlay.style.display = p ? 'none' : '';
  }
  playBtn.addEventListener('click', () => {
    onPlayToggle?.();
  });

  overviewBtn.addEventListener('click', () => onOverview?.());
  closeBtn.addEventListener('click', () => onClosePanel?.());

  function setClock(days) {
    const y = Math.floor(days / 365.25);
    const d = Math.floor(days - y * 365.25);
    clock.querySelector('b').textContent = y > 0 ? `${fmtInt(y)}년 ${d}일 경과` : `${d}일 경과`;
  }

  // ---------- 정보 패널 ----------
  let countRaf = 0;
  function showPanel(data) {
    cancelAnimationFrame(countRaf);
    const stats = buildStats(data);
    let i = 0;
    const delay = () => `--d:${(0.08 + i++ * 0.06).toFixed(2)}s`;
    panelBody.innerHTML = `
      <div class="p-head mat" style="${delay()}">
        <div class="p-emoji">${data.emoji}</div>
        <div>
          <div class="p-type">${data.type}</div>
          <h2 class="p-name">${data.name}</h2>
          <div class="p-en">${data.en}</div>
        </div>
      </div>
      <div class="sect mat" style="${delay()}">데이터</div>
      <div class="stats">
        ${stats
          .map(
            (s) => `<div class="stat mat" style="${delay()}"><span class="k">${s.k}</span><span class="v" data-i>—</span></div>`,
          )
          .join('')}
      </div>
      <div class="sect mat" style="${delay()}">재미있는 사실</div>
      <ul class="facts">
        ${data.facts.map((f) => `<li class="mat" style="${delay()}">${f}</li>`).join('')}
      </ul>
      <div class="sect mat" style="${delay()}">자전 · 공전</div>
      <div class="spin-line mat" style="${delay()}">${data.spin}</div>
    `;
    panel.classList.add('open');
    overviewBtn.classList.add('show');
    panel.scrollTop = 0;

    // 숫자 카운트업
    const cells = panelBody.querySelectorAll('.stat .v');
    const start = performance.now();
    const dur = 1100;
    const tick = (now) => {
      let done = true;
      cells.forEach((cell, idx) => {
        const s = stats[idx];
        const t = Math.min(1, Math.max(0, (now - start - 120 - idx * 60) / dur));
        if (t < 1) done = false;
        const v = s.value * easeOut(t);
        cell.innerHTML = s.fmt(v);
      });
      if (!done) countRaf = requestAnimationFrame(tick);
    };
    countRaf = requestAnimationFrame(tick);
  }

  function hidePanel() {
    cancelAnimationFrame(countRaf);
    panel.classList.remove('open');
    overviewBtn.classList.remove('show');
  }

  // ---------- 로딩 ----------
  function setProgress(p) {
    const v = Math.round(p * 100);
    bar.style.width = `${v}%`;
    pct.textContent = `텍스처 불러오는 중 · ${v}%`;
  }
  function finishLoading() {
    bar.style.width = '100%';
    pct.textContent = '준비 완료';
    setTimeout(() => loading.classList.add('done'), 350);
    setTimeout(() => loading.remove(), 1600);
  }

  setPlaying(true);

  return { setProgress, finishLoading, showPanel, hidePanel, setPlaying, setSpeed, setClock, panel, hud };
}
