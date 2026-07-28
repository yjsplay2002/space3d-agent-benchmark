#!/usr/bin/env node
/**
 * selftest.mjs — 브라우저 없이 Node 에서 실행하는 역법 검증 스크립트.
 *
 *   npm run selftest
 *
 * src/ephemeris.js 를 직접 import 해서 아래 5가지를 assert 한다. 하나라도
 * 실패하면 exit 1.
 *
 *   1) 삭망월: 400일 구간 보름 시점의 평균 간격 = 29.53일 ± 0.3일
 *   2) 지구 일심 황경의 하루 평균 전진 = 0.9856° ± 0.02°
 *   3) 조명률 ∈ [0,1], 보름 > 0.99, 삭 < 0.01
 *   4) 위상각 ∈ [0,360) 이며 단조 증가(360에서 랩)
 *   5) 8행성 공전 주기가 알려진 값의 ±1% 이내
 */

import {
  dateToJD,
  jdToDate,
  jdFromUTC,
  mod360,
  wrap180,
  planetHeliocentric,
  earthHeliocentricLongitude,
  moonPhaseAngle,
  moonIllumination,
  illuminationFromPhase,
  moonGeocentric,
  sunGeocentric,
  findPhaseTime,
  refinePhaseTime,
  measureOrbitalPeriod,
  moonPhaseName,
  moonAge,
  daysToNextFullMoon,
  PLANET_KEYS,
  KNOWN_SIDEREAL_PERIOD,
  SYNODIC_MONTH,
} from '../src/ephemeris.js';

// ─────────────────────────────────────────────────────────────────────────────
// 미니 테스트 러너
// ─────────────────────────────────────────────────────────────────────────────

const C = process.stdout.isTTY
  ? { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' }
  : { g: '', r: '', y: '', d: '', b: '', x: '' };

let passed = 0;
let failed = 0;
const failures = [];

function check(label, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`  ${C.g}✓${C.x} ${label}${detail ? ` ${C.d}${detail}${C.x}` : ''}`);
  } else {
    failed++;
    failures.push(`${label} ${detail}`);
    console.log(`  ${C.r}✗ ${label}${C.x} ${detail}`);
  }
}

function near(label, actual, expected, tol, unit = '') {
  const diff = Math.abs(actual - expected);
  check(
    label,
    diff <= tol,
    `실측 ${fmt(actual)}${unit} / 기준 ${fmt(expected)}±${fmt(tol)}${unit} (오차 ${fmt(diff)})`,
  );
}

function fmt(n) {
  if (!isFinite(n)) return String(n);
  const a = Math.abs(n);
  if (a !== 0 && a < 0.001) return n.toExponential(3);
  if (a >= 10000) return n.toFixed(2);
  return n.toFixed(a >= 100 ? 3 : 5).replace(/0+$/, '').replace(/\.$/, '');
}

function section(title) {
  console.log(`\n${C.b}${title}${C.x}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 기준일: 고정된 임의의 날짜 (재현 가능하도록 하드코딩)
// ─────────────────────────────────────────────────────────────────────────────

const BASE_JD = jdFromUTC(2026, 1, 1, 0, 0, 0);
const SPAN_DAYS = 400;

console.log(`${C.b}Space3D 역법 자체 검증${C.x}`);
console.log(`${C.d}기준일 ${jdToDate(BASE_JD).toISOString()} (JD ${BASE_JD})  ·  구간 ${SPAN_DAYS}일${C.x}`);

// 하루 간격 샘플 (401개)
const samples = [];
for (let i = 0; i <= SPAN_DAYS; i++) {
  const jd = BASE_JD + i;
  samples.push({ jd, phase: moonPhaseAngle(jd) });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. 삭망월 — 보름 시점의 평균 간격
// ─────────────────────────────────────────────────────────────────────────────

section('1. 삭망월 (보름 → 보름 평균 간격)');

// 하루 간격 표본에서 위상각이 180°를 지나는 구간을 잡고, 선형보간 추정치를
// 뉴턴법으로 정밀화한다.
const fullMoons = [];
for (let i = 1; i < samples.length; i++) {
  const a = samples[i - 1];
  const b = samples[i];
  const da = wrap180(a.phase - 180);
  const db = wrap180(b.phase - 180);
  if (da < 0 && db >= 0) {
    const t = refinePhaseTime(a.jd + (0 - da) / (db - da), 180);
    check(`  보름 #${fullMoons.length + 1} 이 구간 [${a.jd - BASE_JD}, ${b.jd - BASE_JD}] 안에서 수렴`,
      t >= a.jd - 0.05 && t <= b.jd + 0.05,
      jdToDate(t).toISOString().replace('T', ' ').slice(0, 16) + ' UTC');
    fullMoons.push(t);
  }
}

check('400일 구간에서 보름을 13회 이상 검출', fullMoons.length >= 13, `검출 ${fullMoons.length}회`);

const intervals = [];
for (let i = 1; i < fullMoons.length; i++) intervals.push(fullMoons[i] - fullMoons[i - 1]);
const meanInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length;
near('보름 평균 간격 = 삭망월', meanInterval, 29.53, 0.3, '일');

const minI = Math.min(...intervals);
const maxI = Math.max(...intervals);
console.log(`  ${C.d}개별 간격 범위 ${fmt(minI)} ~ ${fmt(maxI)}일 (실제 삭망월은 29.27~29.83일 사이에서 변동)${C.x}`);
check('개별 간격이 모두 29.0~30.1일 범위', minI > 29.0 && maxI < 30.1, `${fmt(minI)} ~ ${fmt(maxI)}일`);

// ─────────────────────────────────────────────────────────────────────────────
// 2. 지구 일심 황경의 하루 평균 전진
// ─────────────────────────────────────────────────────────────────────────────

section('2. 지구 일심 황경 하루 평균 전진');

let totalAdvance = 0;
let prevLon = earthHeliocentricLongitude(BASE_JD);
let minStep = Infinity;
let maxStep = -Infinity;
for (let i = 1; i <= SPAN_DAYS; i++) {
  const lon = earthHeliocentricLongitude(BASE_JD + i);
  const d = wrap180(lon - prevLon);
  totalAdvance += d;
  minStep = Math.min(minStep, d);
  maxStep = Math.max(maxStep, d);
  prevLon = lon;
}
const dailyAdvance = totalAdvance / SPAN_DAYS;
near('하루 평균 전진', dailyAdvance, 0.9856, 0.02, '°');
console.log(`  ${C.d}일별 전진 범위 ${fmt(minStep)} ~ ${fmt(maxStep)}°/일 (원일점 부근 느리고 근일점 부근 빠름)${C.x}`);
check('황경은 항상 전진(역행 없음)', minStep > 0, `최소 ${fmt(minStep)}°/일`);

// ─────────────────────────────────────────────────────────────────────────────
// 3. 조명률
// ─────────────────────────────────────────────────────────────────────────────

section('3. 달 조명률');

let illMin = Infinity;
let illMax = -Infinity;
let illRangeOk = true;
for (const s of samples) {
  const k = illuminationFromPhase(s.phase);
  if (!(k >= 0 && k <= 1) || !isFinite(k)) illRangeOk = false;
  illMin = Math.min(illMin, k);
  illMax = Math.max(illMax, k);
}
check('조명률이 항상 0~1 범위', illRangeOk, `실측 범위 ${fmt(illMin)} ~ ${fmt(illMax)}`);

// 보름 시점
let fullOk = true;
let worstFull = 1;
for (const t of fullMoons) {
  const k = moonIllumination(t);
  if (k <= 0.99) fullOk = false;
  worstFull = Math.min(worstFull, k);
}
check('보름 시점 조명률 > 0.99', fullOk, `최솟값 ${fmt(worstFull)} (${fullMoons.length}회)`);

// 삭 시점
const newMoons = [];
for (let i = 1; i < samples.length; i++) {
  const a = samples[i - 1];
  const b = samples[i];
  if (b.phase < a.phase) {
    // 360 → 0 랩이 일어난 구간 = 삭
    const da = a.phase - 360; // 음수 쪽으로 펴서 선형보간
    const t = refinePhaseTime(a.jd + (0 - da) / (b.phase - da), 0);
    newMoons.push(t);
  }
}
let newOk = newMoons.length > 0;
let worstNew = 0;
for (const t of newMoons) {
  const k = moonIllumination(t);
  if (k >= 0.01) newOk = false;
  worstNew = Math.max(worstNew, k);
}
check('삭 시점 조명률 < 0.01', newOk, `최댓값 ${fmt(worstNew)} (${newMoons.length}회)`);

// 삭 간격도 삭망월이어야 한다
if (newMoons.length >= 2) {
  const nIv = [];
  for (let i = 1; i < newMoons.length; i++) nIv.push(newMoons[i] - newMoons[i - 1]);
  const nMean = nIv.reduce((s, v) => s + v, 0) / nIv.length;
  near('삭 → 삭 평균 간격 = 삭망월', nMean, 29.53, 0.3, '일');
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. 위상각의 범위와 단조 증가성
// ─────────────────────────────────────────────────────────────────────────────

section('4. 위상각 범위 · 단조 증가');

let rangeOk = true;
for (const s of samples) {
  if (!(s.phase >= 0 && s.phase < 360) || !isFinite(s.phase)) rangeOk = false;
}
check('위상각이 항상 0 이상 360 미만', rangeOk);

// 하루 간격에서의 단조성 (랩 허용)
let monoDailyOk = true;
let dMin = Infinity;
let dMax = -Infinity;
let wraps = 0;
for (let i = 1; i < samples.length; i++) {
  let d = samples[i].phase - samples[i - 1].phase;
  if (d < 0) { d += 360; wraps++; }
  if (!(d > 0 && d < 30)) monoDailyOk = false;
  dMin = Math.min(dMin, d);
  dMax = Math.max(dMax, d);
}
check('하루 간격 위상각이 단조 증가 (360에서 랩)', monoDailyOk,
  `증가량 ${fmt(dMin)} ~ ${fmt(dMax)}°/일, 랩 ${wraps}회`);

// 더 촘촘한 간격(1/8일)에서도 단조성 유지
let monoFineOk = true;
let fMin = Infinity;
const fineStep = 0.125;
let prevP = moonPhaseAngle(BASE_JD);
for (let t = fineStep; t <= SPAN_DAYS; t += fineStep) {
  const p = moonPhaseAngle(BASE_JD + t);
  let d = p - prevP;
  if (d < -180) d += 360;
  if (d <= 0) monoFineOk = false;
  fMin = Math.min(fMin, d);
  prevP = p;
}
check('3시간 간격에서도 단조 증가', monoFineOk, `최소 증가량 ${fmt(fMin)}°`);

check('랩 횟수가 삭 검출 횟수와 일치', wraps === newMoons.length, `랩 ${wraps} / 삭 ${newMoons.length}`);

// ─────────────────────────────────────────────────────────────────────────────
// 5. 8행성 공전 주기
// ─────────────────────────────────────────────────────────────────────────────

section('5. 8행성 공전 주기 (황경 360° 소요 일수)');

for (const key of PLANET_KEYS) {
  const known = KNOWN_SIDEREAL_PERIOD[key];
  const measured = measureOrbitalPeriod(key, BASE_JD);
  const errPct = Math.abs(measured - known) / known * 100;
  check(
    `${key.padEnd(8)} 공전 주기 ±1% 이내`,
    errPct <= 1,
    `실측 ${fmt(measured)}일 / 실제 ${fmt(known)}일 (오차 ${errPct.toFixed(4)}%)`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 보너스: 정합성 점검 (실패해도 채점 항목 5개와 별개로 함께 표시)
// ─────────────────────────────────────────────────────────────────────────────

section('보조 점검');

// 달까지의 거리는 356,400 ~ 406,700 km 사이
let dMinKm = Infinity, dMaxKm = -Infinity;
for (let t = 0; t <= SPAN_DAYS; t += 0.25) {
  const km = moonGeocentric(BASE_JD + t).distKm;
  dMinKm = Math.min(dMinKm, km);
  dMaxKm = Math.max(dMaxKm, km);
}
check('지구-달 거리가 356,000~407,000 km 범위', dMinKm > 356000 && dMaxKm < 407000,
  `${Math.round(dMinKm).toLocaleString('ko-KR')} ~ ${Math.round(dMaxKm).toLocaleString('ko-KR')} km`);

// 달의 황위는 ±5.4° 이내
let latMax = 0;
for (let t = 0; t <= SPAN_DAYS; t += 0.25) {
  latMax = Math.max(latMax, Math.abs(moonGeocentric(BASE_JD + t).lat));
}
check('달의 황위 |β| < 5.5°', latMax < 5.5, `최대 ${fmt(latMax)}°`);

// 지구-태양 거리 0.983 ~ 1.017 au
let rMin = Infinity, rMax = -Infinity;
for (let t = 0; t <= 366; t += 0.5) {
  const r = sunGeocentric(BASE_JD + t).r;
  rMin = Math.min(rMin, r);
  rMax = Math.max(rMax, r);
}
check('지구-태양 거리 0.983~1.017 au', rMin > 0.9825 && rMax < 1.0175, `${fmt(rMin)} ~ ${fmt(rMax)} au`);

// 독립적으로 잘 알려진 실제 관측 사실과 대조한다.
// · 2017-08-21 개기일식 최대식 18:26 UTC → 그 시각은 삭
// · 2018-01-31 개기월식 최대식 13:30 UTC → 그 시각은 망
for (const ref of [
  { label: '2017-08-21 개기일식(삭)', jd: jdFromUTC(2017, 8, 21, 18, 26), target: 0 },
  { label: '2018-01-31 개기월식(망)', jd: jdFromUTC(2018, 1, 31, 13, 30), target: 180 },
  { label: '2024-04-08 개기일식(삭)', jd: jdFromUTC(2024, 4, 8, 18, 18), target: 0 },
]) {
  const t = refinePhaseTime(ref.jd, ref.target);
  const errHours = Math.abs(t - ref.jd) * 24;
  check(`${ref.label} 시각 오차 < 3시간`, errHours < 3,
    `오차 ${fmt(errHours)}시간 → ${jdToDate(t).toISOString().replace('T', ' ').slice(0, 16)} UTC`);
}

// 월령·다음 보름 정보가 정상 범위
{
  const jd = BASE_JD + 137.3;
  const age = moonAge(jd);
  const toFull = daysToNextFullMoon(jd);
  check('월령이 0~29.9일 범위', age >= 0 && age < 29.9, `${fmt(age)}일`);
  check('다음 보름까지 0~29.9일', toFull >= 0 && toFull < 29.9, `${fmt(toFull)}일`);
  check('위상 이름이 8구간 중 하나', typeof moonPhaseName(moonPhaseAngle(jd)) === 'string',
    moonPhaseName(moonPhaseAngle(jd)));
}

// 행성 황경 표본 (오늘 날짜) — 값이 유한하고 범위 안인지
{
  const today = dateToJD(new Date());
  let ok = true;
  const parts = [];
  for (const key of PLANET_KEYS) {
    const p = planetHeliocentric(key, today);
    if (!isFinite(p.lon) || !isFinite(p.lat) || !isFinite(p.r)) ok = false;
    if (!(p.lon >= 0 && p.lon < 360)) ok = false;
    if (Math.abs(p.lat) > 8) ok = false;
    parts.push(`${key} ${p.lon.toFixed(1)}°`);
  }
  check('오늘 날짜 8행성 황경 계산 정상', ok);
  console.log(`  ${C.d}${parts.join('  ')}${C.x}`);
  const mi = moonGeocentric(today);
  const su = sunGeocentric(today);
  console.log(`  ${C.d}달 λ ${mi.lon.toFixed(2)}° β ${mi.lat.toFixed(2)}°  ·  태양 λ ${su.lon.toFixed(2)}°  ·  위상 ${mod360(mi.lon - su.lon).toFixed(1)}° (${moonPhaseName(mod360(mi.lon - su.lon))})${C.x}`);
}

// ─────────────────────────────────────────────────────────────────────────────

console.log('');
if (failed === 0) {
  console.log(`${C.g}${C.b}모든 검증 통과 — ${passed}개 항목${C.x}\n`);
  process.exit(0);
} else {
  console.log(`${C.r}${C.b}검증 실패 — ${failed}개 실패 / ${passed}개 통과${C.x}`);
  for (const f of failures) console.log(`${C.r}  · ${f}${C.x}`);
  console.log('');
  process.exit(1);
}
