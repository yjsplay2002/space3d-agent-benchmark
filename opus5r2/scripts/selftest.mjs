#!/usr/bin/env node
/**
 * selftest.mjs — 브라우저 없이 Node 에서 실행되는 역법 검증 스크립트.
 *
 *   npm run selftest
 *
 * src/ephemeris.js 를 직접 import 해서 다음을 검증한다.
 *  1. 삭망월(보름 → 보름 평균 간격) 29.53일 ± 0.3일
 *  2. 지구 일심 황경 하루 평균 전진 0.9856° ± 0.02°
 *  3. 조명률 0~1, 보름에 > 0.99 / 삭에 < 0.01
 *  4. 위상각 항상 0~360, 하루 간격 샘플에서 단조 증가(360에서 랩)
 *  5. 8행성 공전 주기가 알려진 값의 ±1% 이내
 *
 * 하나라도 실패하면 exit 1.
 */

import {
  utcToJD,
  jdToDate,
  planetLongitude,
  moonPhaseAngle,
  moonPhase,
  findPhaseTime,
  measureOrbitalPeriod,
  meanEarthLongitudeRate,
  PLANET_KEYS,
  KNOWN_ORBITAL_PERIODS,
  SYNODIC_MONTH,
  norm360,
} from '../src/ephemeris.js';

/* ------------------------------------------------------------------ */
/* 미니 테스트 러너                                                     */
/* ------------------------------------------------------------------ */

let failures = 0;
let checks = 0;
const C = {
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  no: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[90m${s}\x1b[0m`,
  hl: (s) => `\x1b[36m${s}\x1b[0m`,
};

function section(title) {
  console.log(`\n${C.hl('▍' + title)}`);
}

function assert(cond, label, detail = '') {
  checks++;
  if (cond) {
    console.log(`  ${C.ok('✔')} ${label} ${detail ? C.dim(detail) : ''}`);
  } else {
    failures++;
    console.log(`  ${C.no('✘')} ${label} ${C.no(detail)}`);
  }
}

function near(actual, expected, tol, label, unit = '') {
  const d = Math.abs(actual - expected);
  assert(
    d <= tol,
    label,
    `측정 ${actual.toFixed(5)}${unit} / 기대 ${expected}±${tol}${unit} (차이 ${d.toFixed(5)})`
  );
}

/* ------------------------------------------------------------------ */
/* 기준일: 임의로 고른 날 (2024-03-01 UTC) + 오늘 날짜로도 한 번 더      */
/* ------------------------------------------------------------------ */

const BASE_DATES = [
  utcToJD(2024, 3, 1),
  utcToJD(2026, 7, 27),
  utcToJD(2019, 11, 14),
];
const SPAN_DAYS = 400;

console.log(C.hl('\n═══ Space3D 역법 자체 검증 (ephemeris selftest) ═══'));

/* ------------------------------------------------------------------ */
/* 1. 삭망월                                                            */
/* ------------------------------------------------------------------ */

section('1. 삭망월 — 보름 시점의 평균 간격이 29.53일 ± 0.3일');

for (const jd0 of BASE_DATES) {
  // 하루 간격으로 위상각을 계산하고, 180°를 지나는 순간을 선형 보간으로 잡는다.
  const fullMoons = [];
  let prevAngle = moonPhaseAngle(jd0);
  for (let d = 1; d <= SPAN_DAYS; d++) {
    const jd = jd0 + d;
    const a = moonPhaseAngle(jd);
    // 위상각이 180°를 넘어가는 순간 (랩 구간은 180을 포함하지 않으므로 안전)
    if (prevAngle < 180 && a >= 180) {
      const frac = (180 - prevAngle) / (a - prevAngle);
      fullMoons.push(jd0 + (d - 1) + frac);
    }
    prevAngle = a;
  }

  assert(
    fullMoons.length >= 13,
    `${jdToDate(jd0).toISOString().slice(0, 10)} 부터 ${SPAN_DAYS}일간 보름 ${fullMoons.length}회 검출`,
    `(기대 13회 이상)`
  );

  const gaps = [];
  for (let i = 1; i < fullMoons.length; i++) gaps.push(fullMoons[i] - fullMoons[i - 1]);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  near(mean, SYNODIC_MONTH, 0.3, `  평균 보름 간격`, '일');

  // 개별 간격도 삭망월 변동폭(29.27~29.83) 안에 있어야 한다.
  const min = Math.min(...gaps);
  const max = Math.max(...gaps);
  assert(
    min > 29.0 && max < 30.1,
    `  개별 간격 범위`,
    `${min.toFixed(3)} ~ ${max.toFixed(3)}일`
  );
}

/* ------------------------------------------------------------------ */
/* 2. 지구 일심 황경 전진율                                             */
/* ------------------------------------------------------------------ */

section('2. 지구 일심 황경 — 하루 평균 0.9856° ± 0.02° 전진');

for (const jd0 of BASE_DATES) {
  const rate = meanEarthLongitudeRate(jd0, SPAN_DAYS);
  near(rate, 0.9856, 0.02, `${jdToDate(jd0).toISOString().slice(0, 10)} 기준 ${SPAN_DAYS}일 평균`, '°/일');
}

// 항상 전진(역행 없음)인지도 확인
{
  const jd0 = BASE_DATES[0];
  let prev = planetLongitude('earth', jd0);
  let allForward = true;
  for (let d = 1; d <= SPAN_DAYS; d++) {
    const lon = planetLongitude('earth', jd0 + d);
    let delta = lon - prev;
    if (delta < -180) delta += 360;
    if (delta <= 0) allForward = false;
    prev = lon;
  }
  assert(allForward, '지구 황경은 하루 단위로 항상 전진');
}

/* ------------------------------------------------------------------ */
/* 3. 조명률                                                            */
/* ------------------------------------------------------------------ */

section('3. 조명률 — 0~1 범위, 보름 > 0.99, 삭 < 0.01');

{
  const jd0 = BASE_DATES[0];
  let minK = Infinity;
  let maxK = -Infinity;
  let inRange = true;
  for (let d = 0; d <= SPAN_DAYS; d++) {
    const k = moonPhase(jd0 + d).illumination;
    if (!(k >= 0 && k <= 1) || Number.isNaN(k)) inRange = false;
    minK = Math.min(minK, k);
    maxK = Math.max(maxK, k);
  }
  assert(inRange, '400일 전체 구간에서 조명률이 0~1 범위', `최소 ${minK.toFixed(4)} / 최대 ${maxK.toFixed(4)}`);

  // 정확한 망 / 삭 시점을 찾아 검사
  let worstFull = 1;
  let worstNew = 0;
  let n = 0;
  let t = jd0;
  while (t < jd0 + SPAN_DAYS) {
    const full = findPhaseTime(t, 180, +1);
    const nw = findPhaseTime(t, 0, +1);
    if (full > jd0 + SPAN_DAYS) break;
    worstFull = Math.min(worstFull, moonPhase(full).illumination);
    if (nw <= jd0 + SPAN_DAYS) worstNew = Math.max(worstNew, moonPhase(nw).illumination);
    n++;
    t = full + 1;
  }
  assert(n >= 13, `망/삭 시점 ${n}쌍 검사`);
  assert(worstFull > 0.99, '모든 보름 시점에서 조명률 > 0.99', `최악값 ${worstFull.toFixed(5)}`);
  assert(worstNew < 0.01, '모든 삭 시점에서 조명률 < 0.01', `최악값 ${worstNew.toFixed(5)}`);
}

/* ------------------------------------------------------------------ */
/* 4. 위상각 범위 / 단조성                                              */
/* ------------------------------------------------------------------ */

section('4. 위상각 — 0~360 범위, 하루 간격에서 단조 증가(360에서 랩)');

for (const jd0 of BASE_DATES) {
  let inRange = true;
  let monotonic = true;
  let wraps = 0;
  let minStep = Infinity;
  let maxStep = -Infinity;
  let prev = moonPhaseAngle(jd0);
  if (!(prev >= 0 && prev < 360)) inRange = false;

  for (let d = 1; d <= SPAN_DAYS; d++) {
    const a = moonPhaseAngle(jd0 + d);
    if (!(a >= 0 && a < 360) || Number.isNaN(a)) inRange = false;
    let step = a - prev;
    if (step < 0) {
      // 360 → 0 랩. 랩은 정확히 한 번의 삭에서만 일어나야 한다.
      wraps++;
      step += 360;
    }
    if (step <= 0) monotonic = false;
    minStep = Math.min(minStep, step);
    maxStep = Math.max(maxStep, step);
    prev = a;
  }
  const label = jdToDate(jd0).toISOString().slice(0, 10);
  assert(inRange, `${label} — 위상각이 항상 [0, 360)`);
  assert(monotonic, `${label} — 랩을 고려하면 항상 증가`, `하루 증가량 ${minStep.toFixed(3)}° ~ ${maxStep.toFixed(3)}°`);
  // 400일 / 삭망월 = 13.54 → 시작 위상에 따라 13회 또는 14회
  assert(
    wraps === Math.floor(SPAN_DAYS / SYNODIC_MONTH) ||
      wraps === Math.ceil(SPAN_DAYS / SYNODIC_MONTH),
    `${label} — 랩 횟수 ${wraps}회`,
    `(400일 / 삭망월 = ${(SPAN_DAYS / SYNODIC_MONTH).toFixed(2)})`
  );
}

/* ------------------------------------------------------------------ */
/* 5. 8행성 공전 주기                                                   */
/* ------------------------------------------------------------------ */

section('5. 8행성 공전 주기 — 알려진 값의 ±1% 이내');

{
  const jd0 = BASE_DATES[1];
  for (const key of PLANET_KEYS) {
    const measured = measureOrbitalPeriod(key, jd0);
    const known = KNOWN_ORBITAL_PERIODS[key];
    const errPct = Math.abs(measured / known - 1) * 100;
    assert(
      Number.isFinite(measured) && errPct <= 1,
      `${key.padEnd(8)} 주기 ${measured.toFixed(2)}일`,
      `(알려진 값 ${known}일, 오차 ${errPct.toFixed(4)}%)`
    );
  }
}

/* ------------------------------------------------------------------ */
/* 보너스: 위상 이름 8구간 일관성 / 알려진 보름 시각과 대조              */
/* ------------------------------------------------------------------ */

section('보너스 — 위상 이름 8구간, 알려진 삭 시각 대조');

{
  const names = new Set();
  const jd0 = BASE_DATES[0];
  for (let d = 0; d <= 30; d += 0.25) names.add(moonPhase(jd0 + d).name);
  assert(names.size === 8, '한 삭망월 안에서 8개 위상 이름이 모두 등장', `[${[...names].join(', ')}]`);

  // 실제 삭/망 시각(UTC)과 비교. UTC 를 TT 로 그대로 쓰므로(ΔT≈70초)
  // 광행차까지 합쳐 수 분의 오차는 정상 — 15분 이내면 역법이 맞다고 본다.
  const knownPhases = [
    [utcToJD(2024, 3, 10, 9, 0), 0, '삭 2024-03-10 09:00 UTC'],
    [utcToJD(2025, 1, 29, 12, 36), 0, '삭 2025-01-29 12:36 UTC'],
    [utcToJD(2026, 8, 12, 17, 37), 0, '삭 2026-08-12 17:37 UTC'],
    [utcToJD(2024, 3, 25, 7, 0), 180, '망 2024-03-25 07:00 UTC'],
    [utcToJD(2026, 7, 29, 14, 36), 180, '망 2026-07-29 14:36 UTC'],
  ];
  for (const [jdRef, target, label] of knownPhases) {
    const found = findPhaseTime(jdRef - 5, target, +1);
    const diffMin = Math.abs(found - jdRef) * 24 * 60;
    assert(diffMin < 15, label, `오차 ${diffMin.toFixed(1)}분`);
  }
}

/* ------------------------------------------------------------------ */

console.log(
  `\n${failures === 0 ? C.ok('■ 모든 검증 통과') : C.no('■ 검증 실패')} — ${checks - failures}/${checks} 항목 통과\n`
);

process.exit(failures === 0 ? 0 : 1);
