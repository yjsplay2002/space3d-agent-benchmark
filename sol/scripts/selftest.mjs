import assert from 'node:assert/strict';
import {
  J2000, PLANET_ORDER, PLANET_PERIODS, dateToJulian,
  getMoonPhase, getPlanetPosition, normalizeDegrees,
} from '../src/ephemeris.js';

const ok = (label, detail = '') => console.log(`✓ ${label}${detail ? ` — ${detail}` : ''}`);
const circularDelta = (a, b) => normalizeDegrees(b - a);
const start = dateToJulian(new Date('2025-01-01T00:00:00Z'));
const samples = Array.from({ length: 401 }, (_, day) => getMoonPhase(start + day));

for (let i = 0; i < samples.length; i += 1) {
  const phase = samples[i];
  assert(phase.angle >= 0 && phase.angle < 360, `위상각 범위 오류 day ${i}: ${phase.angle}`);
  assert(phase.illumination >= 0 && phase.illumination <= 1, `조명률 범위 오류 day ${i}`);
  if (i > 0) {
    const step = circularDelta(samples[i - 1].angle, phase.angle);
    assert(step > 8 && step < 18, `위상각 비단조 진행 day ${i}: ${step}`);
  }
}
ok('달 위상각 0~360°, 랩을 포함해 단조 증가');

function refineCrossing(jd0, target, getter) {
  let lo = jd0;
  let hi = jd0 + 1;
  for (let n = 0; n < 36; n += 1) {
    const mid = (lo + hi) / 2;
    const before = normalizeDegrees(getter(lo) - target);
    const atMid = normalizeDegrees(getter(mid) - target);
    if (atMid < before) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

const fullMoons = [];
const newMoons = [];
for (let i = 1; i < samples.length; i += 1) {
  if (samples[i - 1].angle < 180 && samples[i].angle >= 180) {
    fullMoons.push(refineCrossing(start + i - 1, 180, (jd) => getMoonPhase(jd).angle));
  }
  if (samples[i].angle < samples[i - 1].angle) {
    newMoons.push(refineCrossing(start + i - 1, 0, (jd) => getMoonPhase(jd).angle));
  }
}
const fullIntervals = fullMoons.slice(1).map((jd, i) => jd - fullMoons[i]);
const averageFullInterval = fullIntervals.reduce((sum, value) => sum + value, 0) / fullIntervals.length;
assert(Math.abs(averageFullInterval - 29.53) <= 0.3, `삭망월 오류: ${averageFullInterval}`);
for (const jd of fullMoons) assert(getMoonPhase(jd).illumination > 0.99, '보름 조명률이 0.99 이하');
for (const jd of newMoons) assert(getMoonPhase(jd).illumination < 0.01, '삭 조명률이 0.01 이상');
ok('삭망월과 삭/보름 조명률', `평균 ${averageFullInterval.toFixed(3)}일`);

let earthTravel = 0;
for (let day = 1; day <= 400; day += 1) {
  const previous = getPlanetPosition('earth', start + day - 1).longitude;
  const current = getPlanetPosition('earth', start + day).longitude;
  earthTravel += circularDelta(previous, current);
}
const earthDaily = earthTravel / 400;
assert(Math.abs(earthDaily - 0.9856) <= 0.02, `지구 일일 전진 오류: ${earthDaily}`);
ok('지구 일심 황경 일일 평균 전진', `${earthDaily.toFixed(5)}°`);

for (const body of PLANET_ORDER) {
  const expected = PLANET_PERIODS[body];
  let travel = 0;
  let jd = J2000;
  let previous = getPlanetPosition(body, jd).longitude;
  let elapsed = 0;
  const step = Math.max(0.25, expected / 8000);
  while (travel < 360 && elapsed < expected * 1.2) {
    jd += step;
    elapsed += step;
    const current = getPlanetPosition(body, jd).longitude;
    travel += circularDelta(previous, current);
    previous = current;
  }
  const overshoot = travel - 360;
  const lastSpeed = circularDelta(
    getPlanetPosition(body, jd - step).longitude,
    getPlanetPosition(body, jd).longitude,
  ) / step;
  const measured = elapsed - overshoot / lastSpeed;
  const error = Math.abs(measured - expected) / expected;
  assert(error <= 0.01, `${body} 공전주기 오류: ${measured} vs ${expected} (${error * 100}%)`);
  ok(`${body} 공전주기 ±1%`, `${measured.toFixed(2)}일`);
}

console.log('\nSpace3D 역법 자체 검증을 모두 통과했습니다.');
