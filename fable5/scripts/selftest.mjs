/**
 * selftest.mjs — 역법(ephemeris) 자체 검증 스크립트
 * Node 에서 브라우저 없이 실행: `npm run selftest`
 * 실패 시 exit 1.
 */
import {
  jdFromUTC,
  planetHelio,
  moonPhaseAngle,
  moonPhase,
  periodDays,
  PLANET_KEYS,
} from "../src/ephemeris.js";

let failures = 0;

function assert(cond, label, detail = "") {
  if (cond) {
    console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures++;
    console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const JD0 = jdFromUTC(2025, 1, 1); // 임의 기준일
const DAYS = 400;

/* ------------------------------------------------------------- */
console.log("\n[1] 달 위상각: 연속성 & 보름 간격 (삭망월)");

// 위상각을 연속(unwrap) 함수로 만든다
function unwrappedPhase() {
  const vals = [];
  let offset = 0;
  let prev = null;
  for (let i = 0; i <= DAYS; i++) {
    const p = moonPhaseAngle(JD0 + i);
    if (prev !== null && p < prev) offset += 360;
    vals.push({ jd: JD0 + i, raw: p, cont: p + offset });
    prev = p;
  }
  return vals;
}
const samples = unwrappedPhase();

// 연속 위상 함수 (이분법 정밀화용)
function contPhaseNear(jd, refJd, refCont) {
  // refJd 근방(±1일)에서 연속값 계산
  let p = moonPhaseAngle(jd);
  const approx = refCont + (jd - refJd) * 12.19; // 평균 위상 진행률
  while (p < approx - 180) p += 360;
  while (p > approx + 180) p -= 360;
  return p;
}

// 목표 연속위상값(target)을 지나는 시각을 이분법으로 찾기
function findCrossing(i, target) {
  let lo = samples[i].jd,
    hi = samples[i + 1].jd;
  let loC = samples[i].cont;
  for (let k = 0; k < 50; k++) {
    const mid = (lo + hi) / 2;
    const v = contPhaseNear(mid, samples[i].jd, loC);
    if (v < target) {
      lo = mid;
      loC = v;
    } else hi = mid;
  }
  return (lo + hi) / 2;
}

const fullTimes = [];
const newTimes = [];
for (let i = 0; i < DAYS; i++) {
  const a = samples[i].cont,
    b = samples[i + 1].cont;
  // 보름: cont ≡ 180 (mod 360)
  const kFull = Math.ceil((a - 180) / 360);
  const tFull = 180 + kFull * 360;
  if (tFull > a && tFull <= b) fullTimes.push(findCrossing(i, tFull));
  // 삭: cont ≡ 0 (mod 360)
  const kNew = Math.ceil(a / 360);
  const tNew = kNew * 360;
  if (tNew > a && tNew <= b) newTimes.push(findCrossing(i, tNew));
}

assert(fullTimes.length >= 12, `보름 시점 ${fullTimes.length}회 검출 (≥12)`);
const intervals = [];
for (let i = 1; i < fullTimes.length; i++)
  intervals.push(fullTimes[i] - fullTimes[i - 1]);
const meanSynodic = intervals.reduce((s, v) => s + v, 0) / intervals.length;
assert(
  Math.abs(meanSynodic - 29.53) <= 0.3,
  "보름 평균 간격 = 삭망월 29.53 ± 0.3일",
  `측정값 ${meanSynodic.toFixed(4)}일`
);

/* ------------------------------------------------------------- */
console.log("\n[2] 지구 일심 황경 진행률");

let lonPrev = planetHelio("earth", JD0).lon;
let lonTotal = 0;
for (let i = 1; i <= DAYS; i++) {
  let lon = planetHelio("earth", JD0 + i).lon;
  let d = lon - lonPrev;
  if (d < -180) d += 360;
  if (d > 180) d -= 360;
  lonTotal += d;
  lonPrev = lon;
}
const meanDaily = lonTotal / DAYS;
assert(
  Math.abs(meanDaily - 0.9856) <= 0.02,
  "지구 황경 하루 평균 전진 0.9856° ± 0.02°",
  `측정값 ${meanDaily.toFixed(5)}°/일`
);

/* ------------------------------------------------------------- */
console.log("\n[3] 조명률 범위 & 보름/삭 시점 값");

let illumOk = true;
for (let i = 0; i <= DAYS; i += 1) {
  const { illum } = moonPhase(JD0 + i * 0.5);
  if (!(illum >= 0 && illum <= 1)) illumOk = false;
}
assert(illumOk, "조명률이 항상 0~1 범위");

let fullIllumMin = 1;
for (const t of fullTimes) fullIllumMin = Math.min(fullIllumMin, moonPhase(t).illum);
assert(fullIllumMin > 0.99, "보름 시점 조명률 > 0.99", `최소 ${fullIllumMin.toFixed(5)}`);

let newIllumMax = 0;
for (const t of newTimes) newIllumMax = Math.max(newIllumMax, moonPhase(t).illum);
assert(newIllumMax < 0.01, "삭 시점 조명률 < 0.01", `최대 ${newIllumMax.toFixed(5)}`);

/* ------------------------------------------------------------- */
console.log("\n[4] 위상각 범위 & 단조 증가(360 랩)");

let rangeOk = true;
let monoOk = true;
for (let i = 0; i <= DAYS; i++) {
  const p = samples[i].raw;
  if (!(p >= 0 && p < 360)) rangeOk = false;
  if (i > 0) {
    const step = (samples[i].raw - samples[i - 1].raw + 360) % 360;
    if (!(step > 0 && step < 180)) monoOk = false; // 하루 ~12.2° 전진
  }
}
assert(rangeOk, "위상각이 항상 0~360 범위");
assert(monoOk, "위상각이 단조 증가 (360에서 랩)");

/* ------------------------------------------------------------- */
console.log("\n[5] 8행성 공전 주기 재현 (±1%)");

const KNOWN_PERIODS = {
  mercury: 87.969,
  venus: 224.701,
  earth: 365.256,
  mars: 686.98,
  jupiter: 4332.589,
  saturn: 10759.22,
  uranus: 30688.5,
  neptune: 60182,
};

for (const key of PLANET_KEYS) {
  const known = KNOWN_PERIODS[key];
  // 황경이 360° 도는 데 걸리는 일수를 실측: 주기 추정치 근방을 촘촘히 스캔
  const guess = periodDays(key);
  const step = guess / 720;
  let prev = planetHelio(key, JD0).lon;
  let acc = 0;
  let t = JD0;
  let measured = null;
  while (acc < 360 && t < JD0 + guess * 1.2) {
    t += step;
    const lon = planetHelio(key, t).lon;
    let d = lon - prev;
    if (d < -180) d += 360;
    if (d > 180) d -= 360;
    if (acc + d >= 360) {
      // 선형 보간으로 교차 시각 정밀화
      const frac = (360 - acc) / d;
      measured = t - step + step * frac - JD0;
      acc += d;
      break;
    }
    acc += d;
    prev = lon;
  }
  const errPct = measured === null ? Infinity : (Math.abs(measured - known) / known) * 100;
  assert(
    measured !== null && errPct <= 1,
    `${key} 공전 주기 ±1%`,
    `측정 ${measured?.toFixed(1)}일 / 실제 ${known}일 (오차 ${errPct.toFixed(3)}%)`
  );
}

/* ------------------------------------------------------------- */
console.log("");
if (failures > 0) {
  console.error(`❌ selftest 실패: ${failures}개 항목`);
  process.exit(1);
} else {
  console.log("✅ selftest 전체 통과");
  process.exit(0);
}
