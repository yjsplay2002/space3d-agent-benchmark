// 소행성 충돌 시뮬레이션 — UI + 3D 연출
// 물리 계산은 impact-physics.js(순수 함수)에, 여기는 화면에 보여 주는 일만 담당한다.
//
// 흐름: 정보 패널의 "☄️ 소행성 충돌시키기" → 설정 시트(크기/속도/각도/조성)
//   → 발사(시트 내려감) → 소행성 비행 → 충돌 연출(섬광/충격파/파편/카메라 흔들림)
//   → 행성에 흔적 적용(크레이터/검은 멍/용융/파괴) → 결과 시트(실제 물리 수치)
import * as THREE from 'three';
import { computeImpact, COMPOSITIONS, sliderToDiameter } from './impact-physics.js';

// ---------------------------------------------------------------- 숫자 → 한국어 표기
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (n) => String(n).split('').map((c) => (c === '-' ? '⁻' : SUP[+c])).join('');
function trimNum(x) { // 유효 3자리 + 천 단위 콤마
  const v = Number(x.toPrecision(3));
  return v.toLocaleString('ko-KR', { maximumFractionDigits: v < 10 ? 2 : v < 100 ? 1 : 0 });
}
function fmtExp(x, digits = 1) { // 3.1 × 10²³ 꼴
  if (!isFinite(x) || x <= 0) return '0';
  const e = Math.floor(Math.log10(x));
  if (e >= -2 && e <= 3) return trimNum(x);
  return `${(x / 10 ** e).toFixed(digits)} × 10${sup(e)}`;
}
function fmtKo(x) { // 큰 수를 만/억/조/경으로
  if (x >= 1e20) return `${fmtExp(x)}`;
  if (x >= 1e16) return `${trimNum(x / 1e16)}경`;
  if (x >= 1e12) return `${trimNum(x / 1e12)}조`;
  if (x >= 1e8) return `${trimNum(x / 1e8)}억`;
  if (x >= 1e4) return `${trimNum(x / 1e4)}만`;
  return trimNum(x);
}
function fmtMt(mt) { // TNT 환산
  if (mt >= 1) return `약 ${fmtKo(mt)} 메가톤`;
  if (mt >= 1e-3) return `약 ${trimNum(mt * 1000)} 킬로톤`;
  return `약 ${fmtKo(mt * 1e6)} 톤`;
}
function fmtLen(m) {
  if (m >= 1000) return `약 ${fmtKo(m / 1000)} km`;
  return `약 ${trimNum(m)} m`;
}
function fmtDur(sec) {
  if (sec >= 3600) return `${trimNum(sec / 3600)}시간`;
  if (sec >= 60) return `${trimNum(sec / 60)}분`;
  if (sec >= 0.01) return `${trimNum(sec)}초`;
  return `${fmtExp(sec)}초`;
}
// 받침에 따라 조사 선택: josa('달','이','가') → '달이'
function josa(word, withBatchim, without) {
  const c = word.charCodeAt(word.length - 1);
  const has = c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 > 0;
  return word + (has ? withBatchim : without);
}

// ---------------------------------------------------------------- 결과 등급
const GRADES = {
  trace:      { label: '흔적만 남음', color: '#9fb3c8' },
  airburst:   { label: '공중 폭발', color: '#ffc46b' },
  crater:     { label: '크레이터 생성', color: '#6ee7ff' },
  regional:   { label: '지역 재앙', color: '#ff9d5c' },
  extinction: { label: '대멸종급', color: '#ff6b4d' },
  remelt:     { label: '표면 재용융', color: '#ff4d26' },
  destroyed:  { label: '행성 파괴', color: '#ff5c8a' },
  'gas-scar': { label: '구름에 남은 검은 멍', color: '#d8a06b' },
  sun:        { label: '태양에 삼켜짐', color: '#ffd94d' },
};

function gradeDesc(res, d) {
  const n = d.name;
  switch (res.grade) {
    case 'sun': {
      const s = res.sunSeconds;
      const cmp = s >= 1
        ? `태양이 약 ${fmtDur(s)} 동안 내뿜는 빛 에너지밖에 안 돼요`
        : '태양이 1초 동안 내뿜는 빛 에너지에도 한참 모자라요';
      return `소행성이 태양 표면에 닿기도 전에 녹아서 증발해 버렸어요. 크레이터는 생기지 않아요. 이 어마어마해 보이는 충돌 에너지도 ${cmp}. 태양은 눈 하나 깜짝하지 않아요.`;
    }
    case 'gas-scar':
      return `${josa(n, '은', '는')} 가스로 된 행성이라 부딪힐 땅이 없어요. 소행성은 구름 속으로 빨려 들어가며 폭발했고, 구름 위에 검은 멍 자국이 남았어요. 1994년 슈메이커-레비 9 혜성이 목성에 부딪혔을 때 실제로 이런 자국이 생겼답니다. 자국은 시간이 지나면 바람에 지워져요.`;
    case 'airburst':
      return `소행성이 땅에 닿기 전에 공기와 세게 부딪혀 하늘에서 펑! 하고 폭발했어요. 크레이터는 생기지 않았어요. 2013년 러시아 첼랴빈스크 하늘에서 지름 약 20m 소행성이 실제로 이렇게 폭발해 유리창이 많이 깨졌어요.`;
    case 'trace':
      return `표면에 작은 자국만 남았어요. ${n} 전체로 보면 아무 일도 없었던 것과 같아요.`;
    case 'crater':
      return `쾅! 크레이터(운석 구덩이)가 생겼어요. 하지만 ${n} 전체로 보면 아주 작은 상처예요. 행성은 끄떡없어요.`;
    case 'regional':
      return d.phys.ocean
        ? '충돌 지점 주변 수백 km가 뜨거운 열과 지진, 거대한 해일에 휩쓸렸어요. 하지만 행성 전체가 위험해지는 정도는 아니에요.'
        : '충돌 지점 주변 수백 km가 완전히 뒤집혔어요. 하지만 행성 전체로 보면 일부분의 재앙이에요.';
    case 'extinction': {
      const r = res.chicxulubRatio;
      const cmp = r >= 2 ? `약 ${fmtKo(r)}배나 되는` : r >= 0.5 ? '비슷한' : '가까운';
      return `공룡을 멸종시킨 칙술루브 충돌(6,600만 년 전)과 ${cmp} 에너지예요. 먼지가 하늘을 덮어 오랫동안 어둡고 추워져요. 지구였다면 수많은 생물이 사라지는 대멸종이 일어나요.`;
    }
    case 'remelt':
      return `너무나 강한 충돌이라 ${d.phys.kind === 'rock' ? '표면이 통째로 녹아 마그마(끓는 돌) 바다가 되었어요' : '행성 전체가 뒤흔들렸어요'}. 크레이터를 셀 수 있는 수준이 아니에요. 아주 먼 옛날 지구에 달을 만든 충돌이 이런 급이었다고 해요.`;
    case 'destroyed':
      return `충돌 에너지가 ${josa(n, '을', '를')} 하나로 붙잡아 두는 중력 에너지보다 커요! ${josa(n, '이', '가')} 산산조각 나서 우주에 흩어졌어요. 조각들은 다시 뭉치지 못해요.`;
  }
  return '';
}

// 자전·질량·기후·표면 변화 — 정직하게, 변화가 없으면 없다고 말한다
function changesText(res, d) {
  const lines = [];
  // 자전
  if (res.grade === 'destroyed') {
    lines.push('🔄 자전: 행성이 사라져서 잴 수 없어요.');
  } else if (res.spin.rel < 1e-6) {
    lines.push('🔄 자전: 변화가 너무 작아 잴 수 없어요. 팽이에 먼지 한 톨이 붙은 정도예요.');
  } else {
    lines.push(`🔄 자전: 스치듯 맞으면 하루 길이가 최대 ${fmtDur(res.spin.dTsec)} 바뀔 수 있어요. (${(res.spin.rel * 100).toPrecision(2)}%)`);
  }
  // 질량
  if (res.grade !== 'destroyed') {
    lines.push(res.massGain >= 1e-8
      ? `⚖️ 질량: 소행성만큼 ${(res.massGain * 100).toPrecision(2)}% 늘었어요.`
      : '⚖️ 질량: 늘긴 했지만 0.000001%도 안 돼요.');
  }
  // 대기·기후
  if (res.grade === 'destroyed') {
    lines.push('🌫️ 대기: 행성과 함께 흩어졌어요.');
  } else if (res.grade === 'remelt') {
    lines.push(d.phys.ocean
      ? '🌫️ 기후: 바다가 모두 끓어 증발하고, 하늘은 돌이 증발한 가스로 뒤덮여요.'
      : '🌫️ 기후: 표면이 녹으면서 돌이 증발한 가스가 하늘을 뒤덮어요.');
  } else if (res.grade === 'extinction') {
    lines.push(d.phys.atm > 0
      ? '🌫️ 기후: 먼지가 해를 가려 몇 년 동안 춥고 어두운 "충돌 겨울"이 와요.'
      : '🌫️ 대기: 공기가 없어서 먼지는 금방 가라앉지만, 부서진 조각이 온 표면에 쏟아져요.');
  } else if (res.grade === 'regional') {
    lines.push(d.phys.atm > 0
      ? '🌫️ 기후: 먼지와 연기가 퍼져 몇 달 동안 하늘이 뿌예져요.'
      : '🌫️ 대기: 공기가 없어서 폭발 바람도 소리도 없어요. 먼지는 곧 내려앉아요.');
  } else if (res.grade === 'gas-scar') {
    lines.push('🌫️ 구름: 검은 멍이 몇 달에 걸쳐 바람에 풀려 사라져요.');
  } else if (res.grade === 'sun') {
    lines.push('🌫️ 태양: 아무 변화도 없어요. 소행성은 태양의 아주 작은 간식거리도 못 돼요.');
  } else {
    lines.push('🌫️ 기후: 날씨에는 거의 변화가 없어요.');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------- 텍스처 유틸
function softCircleTexture(inner = 0.15) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(inner, 'rgba(255,255,255,0.9)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// 구면 캡(SphereGeometry 부분 구)에 입힐 세로 그라데이션 텍스처.
// 캡의 UV v가 0(가장자리)~1(중심 극점)으로 매핑되므로, 세로줄 색 = 중심에서의 거리 색.
function capTexture(stops) {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128); // y=0 이 중심(극점)
  for (const [t, color] of stops) grad.addColorStop(t, color);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(c);
}
const craterStops = [ // 어두운 바닥 → 밝은 테두리(융기된 림) → 투명
  [0.0, 'rgba(16,11,8,0.92)'],
  [0.45, 'rgba(34,24,17,0.85)'],
  [0.62, 'rgba(58,44,32,0.6)'],
  [0.74, 'rgba(214,180,142,0.5)'],
  [0.85, 'rgba(150,120,92,0.25)'],
  [1.0, 'rgba(120,95,70,0)'],
];
const moltenStops = [ // 이글거리는 용암 크레이터
  [0.0, 'rgba(255,120,40,0.9)'],
  [0.4, 'rgba(255,70,20,0.55)'],
  [0.7, 'rgba(255,140,50,0.35)'],
  [1.0, 'rgba(255,120,40,0)'],
];
const scarStops = [ // 가스 행성의 검은 멍 — 림 없이 부드럽게 퍼짐
  [0.0, 'rgba(26,16,10,0.85)'],
  [0.5, 'rgba(30,19,12,0.6)'],
  [0.8, 'rgba(36,24,15,0.25)'],
  [1.0, 'rgba(40,28,18,0)'],
];

// ---------------------------------------------------------------- 본체
export function initImpact(ctx) {
  const { camera, LOW_POWER } = ctx;
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const softDot = softCircleTexture();

  // DOM
  const panel = document.getElementById('impact-panel');
  const elControls = document.getElementById('impact-controls');
  const elResult = document.getElementById('impact-result');
  const elTarget = document.getElementById('impact-target');
  const inSize = document.getElementById('in-size');
  const inSpeed = document.getElementById('in-speed');
  const inAngle = document.getElementById('in-angle');
  const valSize = document.getElementById('val-size');
  const valSpeed = document.getElementById('val-speed');
  const valAngle = document.getElementById('val-angle');
  const compGroup = document.getElementById('comp-group');
  const liveMass = document.getElementById('live-mass');
  const liveEnergy = document.getElementById('live-energy');
  const btnFire = document.getElementById('btn-fire');
  const elNote = document.getElementById('impact-note');
  const badge = document.getElementById('grade-badge');
  const gradeDescEl = document.getElementById('grade-desc');
  const statsEl = document.getElementById('impact-stats');
  const changesEl = document.getElementById('impact-changes');

  // 상태
  let entry = null;          // 현재 대상 bodyMap entry
  let phase = 'idle';        // idle | config | flying | boom | result
  let compKey = 'rock';
  let pending = null;        // 발사된 충돌의 물리 계산 결과
  let flight = null;         // 비행 중인 소행성
  let resultTimer = -1;      // 충돌 후 결과 시트까지 남은 시간
  const fx = [];             // 진행 중인 시각 효과 { update(dt)→살아있으면 true, dispose() }
  const marks = new Map();   // bodyId → { craters:[], matBackup, cloudsHidden, destroyed, debris }
  const lastShake = new THREE.Vector3();
  let shakeT = 0, shakeDur = 0.8, shakeAmp = 0;

  // ---------------- 설정값 읽기
  const config = () => ({
    diameter: sliderToDiameter(parseFloat(inSize.value)),
    speed: parseFloat(inSpeed.value) * 1000,
    angleDeg: parseFloat(inAngle.value),
    comp: COMPOSITIONS[compKey],
  });

  function refreshLive() {
    const c = config();
    valSize.textContent = fmtLen(c.diameter);
    valSpeed.textContent = `${inSpeed.value} km/s`;
    valAngle.textContent = `${inAngle.value}° ${inAngle.value >= 80 ? '(수직)' : inAngle.value <= 25 ? '(스치듯)' : ''}`;
    const r = c.diameter / 2;
    const mass = c.comp.density * (4 / 3) * Math.PI * r ** 3;
    const energy = 0.5 * mass * c.speed ** 2;
    liveMass.textContent = `${fmtExp(mass)} kg`;
    liveEnergy.textContent = `${fmtExp(energy)} J · TNT ${fmtMt(energy / 4.184e15)}`;
  }
  for (const el of [inSize, inSpeed, inAngle]) el.addEventListener('input', refreshLive);
  compGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.comp-btn');
    if (!btn) return;
    compKey = btn.dataset.comp;
    for (const b of compGroup.children) b.classList.toggle('active', b === btn);
    refreshLive();
  });

  // ---------------- 패널 표시/숨김
  function showSheet(view) { // view: 'controls' | 'result'
    elControls.hidden = view !== 'controls';
    elResult.hidden = view !== 'result';
    panel.hidden = false;
    panel.scrollTop = 0;
    document.body.classList.add('impact-open', 'impact-sheet');
    void panel.offsetWidth; // 리플로우 → transform 트랜지션 확실히 재생
    panel.classList.add('open');
  }
  function hideSheet() {
    panel.classList.remove('open');
    document.body.classList.remove('impact-sheet');
  }

  function refreshControls() {
    const d = entry.data;
    elTarget.textContent = `${d.emoji} ${d.name}에 떨어뜨려 봐요! 크기·속도·각도를 정하고 발사!`;
    const mk = marks.get(d.id);
    const destroyed = !!(mk && mk.destroyed);
    if (destroyed) {
      elNote.hidden = false;
      elNote.textContent = `${josa(d.name, '은', '는')} 이미 산산조각 났어요. 아래 버튼으로 되돌린 뒤 다시 실험해 보세요.`;
      btnFire.textContent = '✨ 원래대로 되돌리기';
    } else if (d.phys.kind === 'star') {
      elNote.hidden = false;
      elNote.textContent = '태양은 땅이 없는 커다란 불덩어리 별이에요. 소행성이 어떻게 되는지 지켜보세요!';
      btnFire.textContent = '☄️ 발사!';
    } else if (d.phys.kind === 'gas') {
      elNote.hidden = false;
      elNote.textContent = `${josa(d.name, '은', '는')} 가스 행성이라 땅이 없어요. 그래도 부딪히면 무슨 일이 생길까요?`;
      btnFire.textContent = '☄️ 발사!';
    } else {
      elNote.hidden = true;
      btnFire.textContent = '☄️ 발사!';
    }
    refreshLive();
  }

  // ---------------- 모드 열기/닫기
  function open(e) {
    entry = e;
    phase = 'config';
    refreshControls();
    showSheet('controls');
  }

  function close(reopenInfo = true) {
    if (phase === 'idle') return;
    // 비행 중이면 소행성만 조용히 회수 (이미 생긴 흔적은 유지)
    if (flight) { flight.dispose(); flight = null; }
    pending = null;
    resultTimer = -1;
    phase = 'idle';
    entry = null;
    hideSheet();
    panel.classList.remove('open');
    document.body.classList.remove('impact-open', 'impact-sheet');
    if (reopenInfo && ctx.reopenInfo) ctx.reopenInfo();
  }

  document.getElementById('impact-close').addEventListener('click', () => close(true));
  // 시트 손잡이: 탭/아래로 스와이프 → 닫기 (정보 시트와 같은 제스처)
  {
    const grab = document.getElementById('impact-grabber');
    let y0 = null;
    grab.addEventListener('pointerdown', (e) => { y0 = e.clientY; });
    grab.addEventListener('pointerup', (e) => {
      if (y0 === null) return;
      const dy = e.clientY - y0;
      y0 = null;
      if (dy > 30 || Math.abs(dy) < 8) close(true);
    });
  }

  // ---------------- 발사
  btnFire.addEventListener('click', () => {
    if (phase !== 'config' || !entry) return;
    const mk = marks.get(entry.data.id);
    if (mk && mk.destroyed) { restore(entry); refreshControls(); return; }
    const c = config();
    pending = computeImpact({
      diameter: c.diameter, speed: c.speed, angleDeg: c.angleDeg,
      comp: c.comp, phys: entry.data.phys, rotationHours: entry.data.rotationHours,
    });
    phase = 'flying';
    hideSheet();
    launchAsteroid(c);
  });

  document.getElementById('btn-again').addEventListener('click', () => {
    if (phase !== 'result') return;
    phase = 'config';
    refreshControls();
    showSheet('controls');
  });
  document.getElementById('btn-restore').addEventListener('click', () => {
    if (!entry) return;
    restore(entry);
    phase = 'config';
    refreshControls();
    showSheet('controls');
  });

  // ---------------- 소행성 비행
  function launchAsteroid(c) {
    const d = entry.data;
    const rVis = d.radius;
    const group = entry.group;

    // 충돌 지점: 카메라를 바라보는 면에서 살짝 옆 — 아이 눈에 보이는 자리
    const bodyW = group.getWorldPosition(new THREE.Vector3());
    const toCam = camera.position.clone().sub(bodyW).normalize();
    if (toCam.lengthSq() < 0.5) toCam.set(0, 0.3, 1).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    let right = new THREE.Vector3().crossVectors(toCam, up);
    if (right.lengthSq() < 0.01) right.set(1, 0, 0); else right.normalize();
    // group은 회전하지 않으므로 월드 방향 = group 로컬 방향
    const n = toCam.clone().applyAxisAngle(up, 0.45).applyAxisAngle(right, -0.22).normalize();
    let tang = new THREE.Vector3().crossVectors(up, n);
    if (tang.lengthSq() < 0.01) tang.set(1, 0, 0); else tang.normalize();

    const a = (c.angleDeg * Math.PI) / 180;
    const dirOut = n.clone().multiplyScalar(Math.sin(a)).addScaledVector(tang, Math.cos(a)).normalize();
    const hitP = n.clone().multiplyScalar(rVis);
    const startDist = Math.max(rVis * 5, 8);
    const start = hitP.clone().addScaledVector(dirOut, startDist);

    // 소행성 크기: 실제 비율로 하되 최소한 눈에 보이게 클램프
    const aVisR = THREE.MathUtils.clamp((c.diameter / 2) * (rVis / d.phys.R), rVis * 0.045, rVis * 0.9);

    // 울퉁불퉁한 바위 메시
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const s = 0.78 + Math.random() * 0.45;
      pos.setXYZ(i, pos.getX(i) * s, pos.getY(i) * s, pos.getZ(i) * s);
    }
    geo.computeVertexNormals();
    const matByComp = {
      rock: { color: 0x8a7666, roughness: 1, metalness: 0.05 },
      iron: { color: 0x9aa3ad, roughness: 0.35, metalness: 0.85 },
      ice: { color: 0xcfeaff, roughness: 0.25, metalness: 0, emissive: 0x16283a },
    };
    const rock = new THREE.Mesh(geo, new THREE.MeshStandardMaterial(matByComp[compKey]));
    rock.scale.setScalar(aVisR);

    // 대기 마찰로 달아오른 글로우 — 작은 소행성도 눈에 띄게
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: softDot, color: 0xffb36b, blending: THREE.AdditiveBlending,
      depthWrite: false, opacity: 0.85,
    }));
    glow.scale.setScalar(Math.max(aVisR * 3.2, rVis * 0.22));

    // 꼬리 잔상 (링 버퍼)
    const TR = REDUCED ? 10 : LOW_POWER ? 18 : 36;
    const trailPos = new Float32Array(TR * 3);
    for (let i = 0; i < TR; i++) trailPos.set([start.x, start.y, start.z], i * 3);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
    const trail = new THREE.Points(trailGeo, new THREE.PointsMaterial({
      color: 0xffcf9a, size: Math.max(aVisR * 1.4, rVis * 0.09), sizeAttenuation: true,
      map: softDot, transparent: true, opacity: 0.65,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));

    const holder = new THREE.Group();
    holder.add(rock, glow, trail);
    group.add(holder);
    rock.position.copy(start);
    glow.position.copy(start);

    const dur = REDUCED ? 1.2 : 1.7;
    let t = 0;
    const spinAxis = new THREE.Vector3().randomDirection();
    flight = {
      update(dt) {
        t += dt;
        const p = Math.min(1, t / dur);
        const k = p * p; // 가속하며 낙하
        rock.position.lerpVectors(start, hitP, k);
        glow.position.copy(rock.position);
        rock.rotateOnAxis(spinAxis, dt * 4);
        glow.material.opacity = 0.5 + 0.45 * k;
        // 꼬리: 한 칸씩 밀고 머리에 현재 위치 기록
        trailPos.copyWithin(3, 0, (TR - 1) * 3);
        rock.position.toArray(trailPos, 0);
        trailGeo.attributes.position.needsUpdate = true;
        if (p >= 1) {
          boom(hitP, n);
          return false;
        }
        return true;
      },
      dispose() {
        group.remove(holder);
        geo.dispose(); trailGeo.dispose();
        rock.material.dispose(); glow.material.dispose(); trail.material.dispose();
      },
    };
  }

  // ---------------- 충돌 순간
  function boom(hitP, n) {
    const res = pending;
    const d = entry.data;
    const rVis = d.radius;
    const group = entry.group;
    const eLog = Math.log10(res.energy);
    const power = THREE.MathUtils.clamp((eLog - 13) / 18, 0.1, 1.1); // 0~1 연출 강도
    // 카메라가 표면에 바짝 붙어 있으면 섬광/링을 눌러서 보고 있던 표면이 하얗게 타지 않게
    const nearDim = 1 - 0.6 * (ctx.getProx ? ctx.getProx() : 0);

    if (flight) { flight.dispose(); flight = null; }

    // 섬광
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: softDot, color: 0xfff1d6, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: false, opacity: nearDim,
    }));
    flash.position.copy(hitP).addScaledVector(n, rVis * 0.03);
    group.add(flash);
    const flashMax = rVis * (0.5 + power * 3.2);
    const flashDur = REDUCED ? 0.45 : 0.9;
    let ft = 0;
    fx.push({
      update(dt) {
        ft += dt;
        const p = Math.min(1, ft / flashDur);
        flash.scale.setScalar(0.15 + flashMax * Math.pow(p, 0.35));
        flash.material.opacity = (1 - p) * nearDim;
        return p < 1;
      },
      dispose() { group.remove(flash); flash.material.dispose(); },
    });

    // 충격파 링 — 표면을 따라 퍼지는 고리
    const ringGeo = new THREE.RingGeometry(0.72, 1, LOW_POWER ? 40 : 64);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: 0xffa94d, transparent: true, opacity: 0.9 * nearDim,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    ring.position.copy(hitP).addScaledVector(n, rVis * 0.02);
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    group.add(ring);
    const ringMax = rVis * (0.4 + power * 2.4);
    const ringDur = REDUCED ? 0.7 : 1.3;
    let rt = 0;
    fx.push({
      update(dt) {
        rt += dt;
        const p = Math.min(1, rt / ringDur);
        ring.scale.setScalar(0.05 + ringMax * (1 - Math.pow(1 - p, 3)));
        ring.material.opacity = 0.9 * (1 - p) * nearDim;
        return p < 1;
      },
      dispose() { group.remove(ring); ringGeo.dispose(); ring.material.dispose(); },
    });

    // 파편(이젝타) — 태양은 생략(전부 증발)
    if (d.phys.kind !== 'star') {
      const N = REDUCED ? 60 : LOW_POWER ? 140 : 340;
      const ePos = new Float32Array(N * 3);
      const eVel = [];
      for (let i = 0; i < N; i++) {
        hitP.toArray(ePos, i * 3);
        const spread = new THREE.Vector3().randomDirection().multiplyScalar(0.85);
        const v = n.clone().multiplyScalar(0.5 + Math.random()).add(spread)
          .normalize().multiplyScalar(rVis * (0.5 + Math.random() * 1.3) * (0.6 + power));
        eVel.push(v);
      }
      const eGeo = new THREE.BufferGeometry();
      eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
      const ejecta = new THREE.Points(eGeo, new THREE.PointsMaterial({
        color: 0xffc46b, size: rVis * 0.06, sizeAttenuation: true,
        map: softDot, transparent: true, opacity: 0.95,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      group.add(ejecta);
      const gVis = rVis * 2.2; // 시각용 중력 — 파편이 포물선을 그리며 되떨어지게
      const life = REDUCED ? 1.0 : 1.7;
      let et = 0;
      const pv = new THREE.Vector3();
      fx.push({
        update(dt) {
          et += dt;
          for (let i = 0; i < N; i++) {
            const v = eVel[i];
            pv.fromArray(ePos, i * 3);
            const rlen = pv.length() || 1;
            v.addScaledVector(pv, (-gVis * dt) / rlen); // 행성 중심 방향으로 끌림
            pv.addScaledVector(v, dt);
            if (pv.length() < rVis * 0.99) { // 표면에 떨어짐 → 고정
              pv.setLength(rVis);
              v.set(0, 0, 0);
            }
            pv.toArray(ePos, i * 3);
          }
          eGeo.attributes.position.needsUpdate = true;
          ejecta.material.opacity = 0.95 * Math.max(0, 1 - et / life);
          return et < life;
        },
        dispose() { group.remove(ejecta); eGeo.dispose(); ejecta.material.dispose(); },
      });
    }

    // 카메라 흔들림 — 에너지에 비례, 모션 최소화 설정이면 없음
    if (!REDUCED) {
      const camDist = camera.position.distanceTo(group.getWorldPosition(new THREE.Vector3()));
      shakeAmp = camDist * 0.035 * power;
      shakeDur = 0.5 + power * 0.5;
      shakeT = shakeDur;
    }

    // 천체에 남는 흔적
    applyMark(res, hitP);

    phase = 'boom';
    resultTimer = REDUCED ? 0.9 : 1.5;
  }

  // ---------------- 천체에 남는 흔적 (리셋 전까지 유지)
  function getMark(id) {
    let mk = marks.get(id);
    if (!mk) { mk = { craters: [], matBackup: null, cloudsHidden: false, destroyed: false, debris: null }; marks.set(id, mk); }
    return mk;
  }

  // 구면 캡 데칼 — 평면 데칼과 달리 곡면에 정확히 붙는다
  function addCap(localN, angRad, stops, additive) {
    const rVis = entry.data.radius;
    const geo = new THREE.SphereGeometry(rVis * 1.006, 32, 12, 0, Math.PI * 2, 0, angRad);
    const tex = capTexture(stops);
    // SphereGeometry의 v는 극점(중심)에서 1 → 텍스처 y=0 이 중심이 되도록 뒤집기
    tex.flipY = true;
    // additive(용융 글로우)는 표면을 코앞에서 볼 때 과하게 번지지 않게 근접도만큼 감쇠
    const capOpacity = additive ? 1 - 0.5 * (ctx.getProx ? ctx.getProx() : 0) : 1;
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, opacity: capOpacity,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    const holder = new THREE.Object3D();
    holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), localN.clone().normalize());
    holder.add(mesh);
    entry.mesh.add(holder);
    return { holder, geo, tex, mat: mesh.material };
  }

  function applyMark(res, hitP) {
    const d = entry.data;
    const mk = getMark(d.id);
    if (d.phys.kind === 'star') return; // 태양: 흔적 없음 (그게 과학적 사실)

    // 충돌 지점을 mesh 로컬 좌표로 (자전을 따라 흔적이 같이 돌게 mesh에 붙인다)
    const worldP = entry.group.localToWorld(hitP.clone());
    const localN = entry.mesh.worldToLocal(worldP).normalize();

    if (res.grade === 'destroyed') {
      destroyBody(mk);
      return;
    }

    if (res.grade === 'remelt') {
      // 표면 전체가 녹은 모습 — 재질을 용암빛으로
      const mat = entry.mesh.material;
      if (!mk.matBackup) {
        mk.matBackup = {
          emissive: mat.emissive ? mat.emissive.clone() : null,
          emissiveIntensity: mat.emissiveIntensity,
          emissiveMap: mat.emissiveMap || null,
        };
      }
      if (mat.emissive) {
        mat.emissiveMap = null;
        mat.emissive.set(0xff4a14);
        mat.emissiveIntensity = 0.85;
        mat.needsUpdate = true;
      }
      if (entry.clouds && entry.clouds.visible) { entry.clouds.visible = false; mk.cloudsHidden = true; }
      mk.craters.push(addCap(localN, 1.15, moltenStops, true));
      return;
    }

    if (d.phys.kind === 'gas') {
      // 슈메이커-레비 9 스타일 검은 멍 — 에너지가 클수록 크게
      const ang = THREE.MathUtils.clamp((Math.log10(res.energy) - 20) * 0.07 + 0.1, 0.07, 0.55);
      mk.craters.push(addCap(localN, ang, scarStops, false));
      return;
    }

    if (res.airburst) return; // 공중 폭발 — 땅에는 흔적이 없다 (정직하게)

    if (res.crater) {
      // 크레이터 크기: 실제 비율, 최소한 눈에 보이게 클램프
      const ang = THREE.MathUtils.clamp((res.crater.Dfr / 2) / d.phys.R, 0.045, 1.1);
      mk.craters.push(addCap(localN, ang, craterStops, false));
      if (res.grade === 'regional' || res.grade === 'extinction') {
        // 큰 충돌: 아직 식지 않은 이글거리는 테두리
        mk.craters.push(addCap(localN, ang * 1.15, moltenStops, true));
      }
    }
  }

  function destroyBody(mk) {
    const d = entry.data;
    const rVis = d.radius;
    const group = entry.group;
    entry.tiltGroup.visible = false; // 본체(+구름/고리) 숨김 — 라벨은 남긴다
    mk.destroyed = true;

    // 파편 구름 — 천천히 퍼지다 멈춘 채 유지
    const N = REDUCED ? 150 : LOW_POWER ? 260 : 550;
    const pos = new Float32Array(N * 3);
    const vel = [];
    for (let i = 0; i < N; i++) {
      const p = new THREE.Vector3().randomDirection().multiplyScalar(rVis * (0.25 + Math.random() * 0.8));
      p.toArray(pos, i * 3);
      vel.push(p.clone().normalize().multiplyScalar(rVis * (0.3 + Math.random() * 0.8)));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const debris = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xd9a071, size: rVis * 0.09, sizeAttenuation: true,
      map: softDot, transparent: true, opacity: 0.9, depthWrite: false,
    }));
    group.add(debris);
    mk.debris = { points: debris, geo, vel, pos };

    // 중심의 잔광
    const core = new THREE.Sprite(new THREE.SpriteMaterial({
      map: softDot, color: 0xff8a4d, blending: THREE.AdditiveBlending,
      depthWrite: false, opacity: 0.9,
    }));
    core.scale.setScalar(rVis * 2.4);
    group.add(core);
    let ct = 0;
    fx.push({
      update(dt) {
        ct += dt;
        const p = Math.min(1, ct / 2.5);
        core.material.opacity = 0.9 * (1 - p);
        core.scale.setScalar(rVis * (2.4 + p * 1.8));
        return p < 1;
      },
      dispose() { group.remove(core); core.material.dispose(); },
    });
  }

  // ---------------- 원래대로 (리셋)
  function restore(e) {
    const mk = marks.get(e.data.id);
    if (!mk) return;
    for (const c of mk.craters) {
      e.mesh.remove(c.holder);
      c.geo.dispose(); c.tex.dispose(); c.mat.dispose();
    }
    mk.craters = [];
    if (mk.matBackup) {
      const mat = e.mesh.material;
      if (mat.emissive && mk.matBackup.emissive) mat.emissive.copy(mk.matBackup.emissive);
      mat.emissiveIntensity = mk.matBackup.emissiveIntensity;
      mat.emissiveMap = mk.matBackup.emissiveMap;
      mat.needsUpdate = true;
      mk.matBackup = null;
    }
    if (mk.cloudsHidden && e.clouds) { e.clouds.visible = true; mk.cloudsHidden = false; }
    if (mk.debris) {
      e.group.remove(mk.debris.points);
      mk.debris.geo.dispose(); mk.debris.points.material.dispose();
      mk.debris = null;
    }
    if (mk.destroyed) { e.tiltGroup.visible = true; mk.destroyed = false; }
    marks.delete(e.data.id);
  }

  // ---------------- 결과 시트
  function showResult() {
    const res = pending;
    const d = entry.data;
    const g = GRADES[res.grade];
    badge.textContent = g.label;
    badge.style.setProperty('--badge', g.color);
    badge.style.color = g.color;
    gradeDescEl.textContent = gradeDesc(res, d);

    const rows = [];
    rows.push(['충돌 에너지', `${fmtExp(res.energy)} J`]);
    rows.push(['TNT 폭약으로', fmtMt(res.megatons)]);
    rows.push(['히로시마 원폭', res.hiroshima >= 0.01 ? `약 ${fmtKo(res.hiroshima)} 배` : '100분의 1도 안 돼요']);
    if (res.airburst) {
      rows.push(['크레이터', '안 생겨요 (공중 폭발)']);
    } else if (res.crater && (res.grade === 'trace' || res.grade === 'crater' || res.grade === 'regional' || res.grade === 'extinction')) {
      rows.push(['크레이터 지름', fmtLen(res.crater.Dfr)]);
      rows.push(['크레이터 깊이', fmtLen(res.crater.depth)]);
    } else if (res.grade === 'remelt') {
      rows.push(['크레이터', '표면 전체가 녹아 셀 수 없어요']);
    } else if (res.grade === 'destroyed') {
      rows.push(['크레이터', '행성 자체가 사라졌어요']);
    } else if (d.phys.kind === 'gas') {
      rows.push(['크레이터', '땅이 없어서 안 생겨요']);
    } else if (d.phys.kind === 'star') {
      rows.push(['크레이터', '닿기 전에 증발해요']);
    }
    if (res.seismicM !== null) {
      rows.push(['지진 규모', res.seismicM > 12
        ? `M ${res.seismicM.toFixed(1)} (지진계 한계 밖)`
        : `M ${res.seismicM.toFixed(1)}`]);
    }
    statsEl.innerHTML = '';
    for (const [k, v] of rows) {
      const row = document.createElement('div');
      row.className = 'stat-row';
      row.innerHTML = '<span class="k"></span><span class="v"></span>';
      row.querySelector('.k').textContent = k;
      row.querySelector('.v').textContent = v;
      statsEl.appendChild(row);
    }
    changesEl.textContent = changesText(res, d);

    phase = 'result';
    showSheet('result');
    // 등장 스태거 애니메이션 (정보 패널과 같은 무브)
    const items = [badge, gradeDescEl, ...statsEl.children, changesEl];
    items.forEach((el, i) => {
      el.classList.remove('anim');
      el.style.setProperty('--i', i); // CSS가 --i로 스태거 딜레이 계산
      void el.offsetWidth;
      el.classList.add('anim');
    });
  }

  // ---------------- 매 프레임 (main 루프에서 호출 — controls.update() 이후)
  function update(dt) {
    // 카메라 흔들림: 지난 프레임 오프셋을 되돌리고 새 오프셋 적용
    camera.position.sub(lastShake);
    lastShake.set(0, 0, 0);
    if (shakeT > 0) {
      shakeT = Math.max(0, shakeT - dt);
      const k = (shakeT / shakeDur) ** 2;
      lastShake.set(
        (Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5),
      ).multiplyScalar(2 * shakeAmp * k);
      camera.position.add(lastShake);
    }

    if (flight && !flight.update(dt)) flight = null;

    for (let i = fx.length - 1; i >= 0; i--) {
      if (!fx[i].update(dt)) { fx[i].dispose(); fx.splice(i, 1); }
    }

    // 파괴된 천체의 파편 구름 — 퍼지다가 서서히 멈춤
    for (const mk of marks.values()) {
      if (!mk.debris) continue;
      const { pos, vel, geo } = mk.debris;
      const damp = Math.pow(0.45, dt);
      let moving = false;
      for (let i = 0; i < vel.length; i++) {
        const v = vel[i];
        if (v.lengthSq() < 1e-6) continue;
        moving = true;
        pos[i * 3] += v.x * dt; pos[i * 3 + 1] += v.y * dt; pos[i * 3 + 2] += v.z * dt;
        v.multiplyScalar(damp);
      }
      if (moving) geo.attributes.position.needsUpdate = true;
    }

    if (resultTimer > 0) {
      resultTimer -= dt;
      if (resultTimer <= 0 && phase === 'boom') showResult();
    }
  }

  return {
    open,
    close,
    isOpen: () => phase !== 'idle',
    sheetOpen: () => phase === 'config' || phase === 'result',
    update,
    currentBody: () => entry,
  };
}
