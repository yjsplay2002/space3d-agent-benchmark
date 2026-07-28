/**
 * Space3D 역법 자체 검증 (브라우저 없이 Node에서 실행)
 * 실패 시 exit 1
 */
import {
  dateToJD,
  planetHeliocentric,
  moonPhase,
  knownPeriodDays,
  PLANET_IDS,
  wrap360,
} from '../src/ephemeris.js';

let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  } else if (
    !msg.startsWith('illum in') &&
    !msg.startsWith('phase in') &&
    !msg.startsWith('phase monotonically') &&
    !msg.startsWith('phase daily')
  ) {
    console.log('OK  :', msg);
  }
}

function approx(a, b, tol, msg) {
  const d = Math.abs(a - b);
  assert(d <= tol, `${msg} (got ${a}, expected ${b} ± ${tol}, Δ=${d})`);
}

// Reference start: 2020-01-01 12:00 UTC
const start = new Date(Date.UTC(2020, 0, 1, 12, 0, 0));
const startJd = dateToJD(start);

// ─── 1. Full moon mean interval ≈ 29.53 ± 0.3 ───────────────────────────
{
  const phases = [];
  for (let d = 0; d <= 400; d++) {
    const jd = startJd + d;
    phases.push({ d, jd, ...moonPhase(jd) });
  }

  // Detect full moons: phaseAngle crosses 180°
  const fullDays = [];
  for (let i = 1; i < phases.length; i++) {
    const prev = phases[i - 1].phaseAngle;
    const curr = phases[i].phaseAngle;
    // crossing 180: prev < 180 <= curr, or wrap cases near full
    if (prev < 180 && curr >= 180) {
      // linear interpolate
      const f = (180 - prev) / (curr - prev);
      fullDays.push(phases[i - 1].d + f);
    }
    // also handle wrap: e.g. 350 -> 10 shouldn't count as full
  }

  assert(fullDays.length >= 10, `found enough full moons (${fullDays.length})`);

  const intervals = [];
  for (let i = 1; i < fullDays.length; i++) {
    intervals.push(fullDays[i] - fullDays[i - 1]);
  }
  const mean =
    intervals.reduce((a, b) => a + b, 0) / intervals.length;
  approx(mean, 29.53, 0.3, `full-moon mean interval ${mean.toFixed(4)} d`);
}

// ─── 2. Earth heliocentric longitude mean daily advance 0.9856° ± 0.02° ─
{
  let sum = 0;
  let count = 0;
  for (let d = 0; d < 400; d++) {
    const a = planetHeliocentric('earth', startJd + d).lon;
    const b = planetHeliocentric('earth', startJd + d + 1).lon;
    let delta = wrap360(b - a);
    if (delta > 180) delta -= 360; // shouldn't happen for earth
    sum += delta;
    count++;
  }
  const mean = sum / count;
  approx(mean, 0.9856, 0.02, `earth mean daily lon advance ${mean.toFixed(5)}°`);
}

// ─── 3. Illumination 0..1, full > 0.99, new < 0.01 ──────────────────────
{
  let minIll = 1;
  let maxIll = 0;
  let fullIll = 0;
  let newIll = 1;
  let bestFull = 1e9;
  let bestNew = 1e9;

  for (let d = 0; d <= 400; d++) {
    const p = moonPhase(startJd + d);
    if (!(p.illumination >= 0 && p.illumination <= 1)) {
      assert(false, `illum in [0,1] day ${d}: ${p.illumination}`);
    }
    minIll = Math.min(minIll, p.illumination);
    maxIll = Math.max(maxIll, p.illumination);

    // near full (phase ~180)
    const distFull = Math.min(
      Math.abs(p.phaseAngle - 180),
      Math.abs(p.phaseAngle - 180 + 360),
      Math.abs(p.phaseAngle - 180 - 360)
    );
    if (distFull < bestFull) {
      bestFull = distFull;
      fullIll = p.illumination;
    }
    const distNew = Math.min(p.phaseAngle, 360 - p.phaseAngle);
    if (distNew < bestNew) {
      bestNew = distNew;
      newIll = p.illumination;
    }
  }
  assert(fullIll > 0.99, `full moon illumination ${fullIll} > 0.99`);
  assert(newIll < 0.01, `new moon illumination ${newIll} < 0.01`);
  assert(minIll >= 0 && maxIll <= 1, `illumination stays in [0,1] (min=${minIll}, max=${maxIll})`);
}

// ─── 4. Phase angle always 0..360, monotonically increasing (with wrap) ─
{
  let prev = moonPhase(startJd).phaseAngle;
  assert(prev >= 0 && prev < 360, `phase in range at start: ${prev}`);
  let monoOk = true;
  for (let d = 1; d <= 400; d++) {
    const p = moonPhase(startJd + d);
    if (!(p.phaseAngle >= 0 && p.phaseAngle < 360 + 1e-9)) {
      assert(false, `phase in [0,360) day ${d}: ${p.phaseAngle}`);
      monoOk = false;
    }
    let delta = p.phaseAngle - prev;
    if (delta < -180) delta += 360;
    if (!(delta > 0 && delta < 20)) {
      assert(false, `phase mono/step day ${d}: prev=${prev} curr=${p.phaseAngle} delta=${delta}`);
      monoOk = false;
    }
    prev = p.phaseAngle;
  }
  if (monoOk) assert(true, 'phase angle 0..360 and monotonically increasing (with wrap)');
}

// ─── 5. Planet orbital periods within ±1% of known ──────────────────────
{
  for (const id of PLANET_IDS) {
    const known = knownPeriodDays(id);
    // Measure days for longitude to advance 360°
    // Sample: find when lon returns near start + 360
    const lon0 = planetHeliocentric(id, startJd).lon;
    // Step until we accumulate ~360°
    let accumulated = 0;
    let days = 0;
    const maxDays = known * 1.05 + 50;
    let prevLon = lon0;
    while (days < maxDays && accumulated < 360) {
      days += 1;
      const lon = planetHeliocentric(id, startJd + days).lon;
      let step = wrap360(lon - prevLon);
      if (step > 180) step -= 360; // retrograde shouldn't happen much for mean
      // mean motion is always prograde for heliocentric
      if (step < 0) step += 360; // if small numerical backward, treat carefully
      // Actually for planets mean motion is always positive; use shortest? No use unwrapped
      // Better: use continuous unwrapping
      let dLon = lon - prevLon;
      if (dLon < -180) dLon += 360;
      if (dLon > 180) dLon -= 360;
      accumulated += dLon;
      prevLon = lon;
    }
    // refine last day fraction
    if (accumulated >= 360) {
      // overshoot
      const overshoot = accumulated - 360;
      // approximate last day contribution
      const lonPrev = planetHeliocentric(id, startJd + days - 1).lon;
      const lonCurr = planetHeliocentric(id, startJd + days).lon;
      let lastStep = lonCurr - lonPrev;
      if (lastStep < -180) lastStep += 360;
      if (lastStep > 180) lastStep -= 360;
      if (lastStep > 0) {
        days = days - overshoot / lastStep;
      }
    }
    const err = Math.abs(days - known) / known;
    assert(
      err <= 0.01,
      `${id} period ${days.toFixed(3)} d vs known ${known} (err ${(err * 100).toFixed(3)}%)`
    );
  }
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll selftests passed.');
process.exit(0);
