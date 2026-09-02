// npm run selftest — 브라우저 없이 Node 에서 역법(ephemeris) 검증
import assert from 'node:assert/strict';
import {
  toJulianDay, moonPhaseAngle, illuminationFromAngle, planetPosition,
  PLANET_NAMES, unwrapFrom, norm360,
} from '../src/ephemeris.js';

let failures = 0;
function check(label, fn) {
  try {
    fn();
    console.log(`  ✔ ${label}`);
  } catch (e) {
    failures++;
    console.log(`  ✘ ${label}\n      ${e.message}`);
  }
}

const START = toJulianDay(new Date(Date.UTC(2026, 2, 14)));
const DAYS = 400;

// ---- 1~4: 달 위상 -------------------------------------------------------
console.log('달 위상 (400일, 하루 간격)');
const angles = [];
for (let i = 0; i <= DAYS; i++) angles.push(moonPhaseAngle(START + i));

// unwrap 된 누적 각도
const unwrapped = [angles[0]];
for (let i = 1; i < angles.length; i++) unwrapped.push(unwrapFrom(unwrapped[i - 1], angles[i]));

// 보름(180° + k·360°) 통과 시각을 선형 보간
const fullTimes = [];
for (let i = 1; i < unwrapped.length; i++) {
  const a0 = unwrapped[i - 1], a1 = unwrapped[i];
  const k0 = Math.floor((a0 - 180) / 360), k1 = Math.floor((a1 - 180) / 360);
  if (k1 > k0) {
    const target = 180 + k1 * 360;
    const f = (target - a0) / (a1 - a0);
    fullTimes.push(START + (i - 1) + f);
  }
}

check(`1. 보름 평균 간격 = 29.53 ± 0.3일 (보름 ${fullTimes.length}회)`, () => {
  assert.ok(fullTimes.length >= 12, `보름이 너무 적음: ${fullTimes.length}`);
  const mean = (fullTimes[fullTimes.length - 1] - fullTimes[0]) / (fullTimes.length - 1);
  assert.ok(Math.abs(mean - 29.53) <= 0.3, `평균 간격 ${mean.toFixed(4)}일`);
  console.log(`      평균 삭망월 = ${mean.toFixed(4)}일`);
});

check('2. 지구 일심 황경 하루 평균 전진 = 0.9856° ± 0.02°', () => {
  let lon = planetPosition('earth', START).lon;
  const first = lon;
  let acc = lon;
  for (let i = 1; i <= DAYS; i++) {
    lon = planetPosition('earth', START + i).lon;
    acc = unwrapFrom(acc, lon);
  }
  const perDay = (acc - first) / DAYS;
  assert.ok(Math.abs(perDay - 0.9856) <= 0.02, `하루 평균 ${perDay.toFixed(5)}°`);
  console.log(`      하루 평균 전진 = ${perDay.toFixed(5)}°`);
});

check('3. 조명률 0~1, 보름 > 0.99, 삭 < 0.01', () => {
  for (const a of angles) {
    const il = illuminationFromAngle(a);
    assert.ok(il >= 0 && il <= 1, `조명률 범위 밖: ${il}`);
  }
  // 보름 시점(보간된 시각)의 조명률
  for (const t of fullTimes) {
    const il = illuminationFromAngle(moonPhaseAngle(t));
    assert.ok(il > 0.99, `보름 조명률 ${il.toFixed(4)} (JD ${t.toFixed(2)})`);
  }
  // 삭 시점: 0°/360° 통과 시각 보간
  let newCount = 0;
  for (let i = 1; i < unwrapped.length; i++) {
    const a0 = unwrapped[i - 1], a1 = unwrapped[i];
    const k0 = Math.floor(a0 / 360), k1 = Math.floor(a1 / 360);
    if (k1 > k0) {
      const target = k1 * 360;
      const f = (target - a0) / (a1 - a0);
      const t = START + (i - 1) + f;
      const il = illuminationFromAngle(moonPhaseAngle(t));
      assert.ok(il < 0.01, `삭 조명률 ${il.toFixed(4)} (JD ${t.toFixed(2)})`);
      newCount++;
    }
  }
  assert.ok(newCount >= 12, `삭이 너무 적음: ${newCount}`);
});

check('4. 위상각 0~360 범위, 단조 증가(360에서 랩)', () => {
  for (let i = 0; i < angles.length; i++) {
    assert.ok(angles[i] >= 0 && angles[i] < 360, `범위 밖: ${angles[i]}`);
    if (i > 0) {
      let d = angles[i] - angles[i - 1];
      if (d < 0) d += 360; // 랩
      assert.ok(d > 0 && d < 30, `하루 변화 이상: ${d.toFixed(3)}° (i=${i})`);
    }
  }
});

// ---- 5: 행성 공전 주기 ----------------------------------------------------
console.log('행성 공전 주기 (황경 360° 회전 소요일)');
const KNOWN_PERIOD = {
  mercury: 87.969, venus: 224.701, earth: 365.256, mars: 686.980,
  jupiter: 4332.59, saturn: 10759.22, uranus: 30688.5, neptune: 60182,
};
for (const name of PLANET_NAMES) {
  check(`5. ${name} 공전 주기 ±1% (기준 ${KNOWN_PERIOD[name]}일)`, () => {
    const step = Math.max(0.25, Math.min(1, KNOWN_PERIOD[name] / 2000));
    const start = planetPosition(name, START).lon;
    let acc = start;
    let t = START;
    let prevAcc = acc, prevT = t;
    let measured = null;
    const limit = KNOWN_PERIOD[name] * 1.2;
    while (t - START < limit) {
      prevAcc = acc; prevT = t;
      t += step;
      acc = unwrapFrom(acc, planetPosition(name, t).lon);
      if (acc - start >= 360) {
        const f = (start + 360 - prevAcc) / (acc - prevAcc);
        measured = (prevT + f * step) - START;
        break;
      }
    }
    assert.ok(measured != null, '360° 회전을 찾지 못함');
    const err = Math.abs(measured - KNOWN_PERIOD[name]) / KNOWN_PERIOD[name];
    assert.ok(err <= 0.01, `측정 ${measured.toFixed(2)}일, 오차 ${(err * 100).toFixed(3)}%`);
    console.log(`      측정 ${measured.toFixed(2)}일 (오차 ${(err * 100).toFixed(3)}%)`);
  });
}

// 보너스: 실제 관측 이벤트 대조 (2025-01-13 22:27 UTC 보름)
check('보너스. 2025-01-13 보름 ±3시간 이내', () => {
  const jd = toJulianDay(new Date(Date.UTC(2025, 0, 10)));
  let t = jd, prev = norm360(moonPhaseAngle(t) - 180);
  let found = null;
  for (let i = 0; i < 400 && found == null; i++) {
    const nt = t + 0.05;
    const cur = norm360(moonPhaseAngle(nt) - 180);
    if (cur < prev) found = nt;
    t = nt; prev = cur;
  }
  const known = toJulianDay(new Date(Date.UTC(2025, 0, 13, 22, 27)));
  assert.ok(found != null && Math.abs(found - known) < 3 / 24, `오차 ${found == null ? '?' : ((found - known) * 24).toFixed(2)}시간`);
});

if (failures > 0) {
  console.log(`\n${failures}개 검사 실패`);
  process.exit(1);
}
console.log('\n모든 검사 통과');
process.exit(0);
