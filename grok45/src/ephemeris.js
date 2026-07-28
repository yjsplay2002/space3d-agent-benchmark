/**
 * 교육용 태양계 역법 (Ephemeris)
 * - 외부 천문 라이브러리 없이 J2000 궤도 요소 + 세기당 변화율
 * - 케플러 방정식: 뉴턴-랩슨
 * - 달: 주요 섭동항 포함 지심 황경/황위
 * - 각도(황경)는 실제값, 거리는 호출측에서 로그 압축
 *
 * 참고: NASA JPL Approximate Positions of the Planets
 * https://ssd.jpl.nasa.gov/planets/approx_pos.html
 */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** 율리우스일 (UTC) — 그레고리력 */
export function dateToJD(date) {
  const y = date.getUTCFullYear();
  let m = date.getUTCMonth() + 1;
  const D =
    date.getUTCDate() +
    (date.getUTCHours() +
      (date.getUTCMinutes() +
        (date.getUTCSeconds() + date.getUTCMilliseconds() / 1000) / 60) /
        60) /
      24;

  let Y = y;
  if (m <= 2) {
    Y = y - 1;
    m += 12;
  }
  const A = Math.floor(Y / 100);
  const B = 2 - A + Math.floor(A / 4);
  const JD =
    Math.floor(365.25 * (Y + 4716)) +
    Math.floor(30.6001 * (m + 1)) +
    D +
    B -
    1524.5;
  return JD;
}

/** JD → Date (UTC) */
export function jdToDate(jd) {
  const z = Math.floor(jd + 0.5);
  const f = jd + 0.5 - z;
  let A = z;
  if (z >= 2299161) {
    const alpha = Math.floor((z - 1867216.25) / 36524.25);
    A = z + 1 + alpha - Math.floor(alpha / 4);
  }
  const B = A + 1524;
  const C = Math.floor((B - 122.1) / 365.25);
  const D = Math.floor(365.25 * C);
  const E = Math.floor((B - D) / 30.6001);
  const day = B - D - Math.floor(30.6001 * E) + f;
  const month = E < 14 ? E - 1 : E - 13;
  const year = month > 2 ? C - 4716 : C - 4715;
  const dayInt = Math.floor(day);
  const frac = day - dayInt;
  const hours = frac * 24;
  const h = Math.floor(hours);
  const minutes = (hours - h) * 60;
  const min = Math.floor(minutes);
  const seconds = (minutes - min) * 60;
  const sec = Math.floor(seconds);
  const ms = Math.round((seconds - sec) * 1000);
  return new Date(Date.UTC(year, month - 1, dayInt, h, min, sec, ms));
}

/** J2000.0 기준 세기 (T) */
export function centuriesSinceJ2000(jd) {
  return (jd - 2451545.0) / 36525;
}

function wrap360(deg) {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}

function wrap180(deg) {
  let d = wrap360(deg);
  if (d > 180) d -= 360;
  return d;
}

/**
 * Kepler 방정식 해: M = E - e sin E (라디안)
 * 뉴턴-랩슨
 */
export function solveKepler(M, e, tol = 1e-10, maxIter = 30) {
  let m = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (m > Math.PI) m -= 2 * Math.PI;
  let E = e < 0.8 ? m : Math.PI;
  for (let i = 0; i < maxIter; i++) {
    const f = E - e * Math.sin(E) - m;
    const fp = 1 - e * Math.cos(E);
    const dE = f / fp;
    E -= dE;
    if (Math.abs(dE) < tol) break;
  }
  return E;
}

/**
 * JPL 근사 궤도 요소 (a AU, e, I deg, L deg, ϖ deg, Ω deg)
 * 값 = 값0 + 변화율 * T (T = 율리우스 세기)
 * 출처: https://ssd.jpl.nasa.gov/planets/approx_pos.html
 */
const PLANET_ELEMENTS = {
  mercury: {
    a: [0.38709927, 0.00000037],
    e: [0.20563593, 0.00001906],
    I: [7.00497902, -0.00594749],
    L: [252.2503235, 149472.67411175],
    varpi: [77.45779628, 0.16047689],
    Omega: [48.33076593, -0.12534081],
    periodDays: 87.969,
  },
  venus: {
    a: [0.72333566, 0.0000039],
    e: [0.00677672, -0.00004107],
    I: [3.39467605, -0.0007889],
    L: [181.9790995, 58517.81538729],
    varpi: [131.60246718, 0.00268329],
    Omega: [76.67984255, -0.27769418],
    periodDays: 224.701,
  },
  earth: {
    a: [1.00000261, 0.00000562],
    e: [0.01671123, -0.00004392],
    I: [-0.00001531, -0.01294668],
    L: [100.46457166, 35999.37244981],
    varpi: [102.93768193, 0.32327364],
    Omega: [0.0, 0.0],
    periodDays: 365.256,
  },
  mars: {
    a: [1.52371034, 0.00001847],
    e: [0.0933941, 0.00007882],
    I: [1.84969142, -0.00813131],
    L: [-4.55343205, 19140.30268499],
    varpi: [-23.94362959, 0.44441088],
    Omega: [49.55953891, -0.29257343],
    periodDays: 686.98,
  },
  jupiter: {
    a: [5.202887, -0.00011607],
    e: [0.04838624, -0.00013253],
    I: [1.30439695, -0.00183714],
    L: [34.39644051, 3034.74612775],
    varpi: [14.72847983, 0.21252668],
    Omega: [100.47390909, 0.20469106],
    periodDays: 4332.589,
  },
  saturn: {
    a: [9.53667594, -0.0012506],
    e: [0.05386179, -0.00050991],
    I: [2.48599187, 0.00193609],
    L: [49.95424423, 1222.49362201],
    varpi: [92.59887831, -0.41897216],
    Omega: [113.66242448, -0.28867794],
    periodDays: 10759.22,
  },
  uranus: {
    a: [19.18916464, -0.00196176],
    e: [0.04725744, -0.00004397],
    I: [0.77263783, -0.00242939],
    L: [313.23810451, 428.48202785],
    varpi: [170.9542763, 0.40805281],
    Omega: [74.01692503, 0.04240589],
    periodDays: 30685.4,
  },
  neptune: {
    a: [30.06992276, 0.00026291],
    e: [0.00859048, 0.00005105],
    I: [1.77004347, 0.00035372],
    L: [-55.12002969, 218.45945325],
    varpi: [44.96476227, -0.32241464],
    Omega: [131.78422574, -0.00508664],
    periodDays: 60189.0,
  },
};

function elemAt(pair, T) {
  return pair[0] + pair[1] * T;
}

/**
 * 행성의 일심 황도 좌표
 * @returns {{ lon: number, lat: number, r: number, x: number, y: number, z: number }}
 * lon/lat in degrees, r in AU, x/y/z ecliptic AU
 */
export function planetHeliocentric(planetId, jd) {
  const el = PLANET_ELEMENTS[planetId];
  if (!el) throw new Error(`Unknown planet: ${planetId}`);
  const T = centuriesSinceJ2000(jd);

  const a = elemAt(el.a, T);
  const e = elemAt(el.e, T);
  const I = elemAt(el.I, T) * DEG;
  const L = wrap360(elemAt(el.L, T));
  const varpi = wrap360(elemAt(el.varpi, T));
  const Omega = wrap360(elemAt(el.Omega, T));

  let M = wrap360(L - varpi) * DEG;
  // normalize M to -pi..pi for solver stability
  if (M > Math.PI) M -= 2 * Math.PI;

  const E = solveKepler(M, e);
  const cosE = Math.cos(E);
  const sinE = Math.sin(E);

  // heliocentric coords in orbital plane
  const xOrb = a * (cosE - e);
  const yOrb = a * Math.sqrt(1 - e * e) * sinE;

  const omega = (varpi - Omega) * DEG; // argument of perihelion
  const cosw = Math.cos(omega);
  const sinw = Math.sin(omega);
  const cosO = Math.cos(Omega * DEG);
  const sinO = Math.sin(Omega * DEG);
  const cosI = Math.cos(I);
  const sinI = Math.sin(I);

  // rotation: perihelion -> ecliptic
  const x =
    (cosw * cosO - sinw * sinO * cosI) * xOrb +
    (-sinw * cosO - cosw * sinO * cosI) * yOrb;
  const y =
    (cosw * sinO + sinw * cosO * cosI) * xOrb +
    (-sinw * sinO + cosw * cosO * cosI) * yOrb;
  const z = sinw * sinI * xOrb + cosw * sinI * yOrb;

  const r = Math.sqrt(x * x + y * y + z * z);
  const lon = wrap360(Math.atan2(y, x) * RAD);
  const lat = Math.asin(z / r) * RAD;

  return { lon, lat, r, x, y, z, a, e, M: wrap360(M * RAD), E: E * RAD };
}

/**
 * 8행성 일심 위치 맵
 */
export function allPlanets(jd) {
  const out = {};
  for (const id of Object.keys(PLANET_ELEMENTS)) {
    out[id] = planetHeliocentric(id, jd);
  }
  return out;
}

/**
 * 달의 지심 황경/황위/거리 (Meeus 간략 + 주요 섭동)
 * 황경 오차 ~0.5° 목표
 * @returns {{ lon: number, lat: number, rKm: number, x: number, y: number, z: number }}
 * 지구 중심 황도 좌표 (AU로 환산 x,y,z도 제공)
 */
export function moonGeocentric(jd) {
  const T = centuriesSinceJ2000(jd);
  const T2 = T * T;
  const T3 = T2 * T;
  const T4 = T3 * T;

  // Meeus Astronomical Algorithms Ch.47 (simplified fundamental args)
  // Mean longitude of the Moon
  let Lp = 218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000;
  // Mean elongation
  let D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000;
  // Sun mean anomaly
  let M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000;
  // Moon mean anomaly
  let Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000;
  // Moon argument of latitude
  let F = 93.272095 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000;

  // Additional arguments for larger terms
  const A1 = 119.75 + 131.849 * T;
  const A2 = 53.09 + 479264.29 * T;
  const A3 = 313.45 + 481266.484 * T;

  Lp = wrap360(Lp);
  D = wrap360(D);
  M = wrap360(M);
  Mp = wrap360(Mp);
  F = wrap360(F);

  const E = 1 - 0.002516 * T - 0.0000074 * T2;
  const E2 = E * E;

  // Periodic terms for longitude (sigma l) and distance (sigma r) — leading terms
  // Format: [coeff_lon (0.000001 deg), coeff_dist (km), D, M, Mp, F]
  const termsLR = [
    [6288774, -20905355, 0, 0, 1, 0],
    [1274027, -3699111, 2, 0, -1, 0],
    [658314, -2955968, 2, 0, 0, 0],
    [213618, -569925, 0, 0, 2, 0],
    [-185116, 48888, 0, 1, 0, 0],
    [-114332, -3149, 0, 0, 0, 2],
    [58793, 246158, 2, 0, -2, 0],
    [57066, -152138, 2, -1, -1, 0],
    [53322, -170733, 2, 0, 1, 0],
    [45758, -204586, 2, -1, 0, 0],
    [-40923, -129620, 0, 1, -1, 0],
    [-34720, 108743, 1, 0, 0, 0],
    [-30383, 104755, 0, 1, 1, 0],
    [15327, 10321, 2, 0, 0, -2],
    [-12528, 0, 0, 0, 1, 2],
    [10980, 79661, 0, 0, 1, -2],
    [10675, -34782, 4, 0, -1, 0],
    [10034, -23210, 0, 0, 3, 0],
    [8548, -21636, 4, 0, -2, 0],
    [-7888, 24208, 2, 1, -1, 0],
    [-6766, 30824, 2, 1, 0, 0],
    [-5163, -8379, 1, 0, -1, 0],
    [4987, -16675, 1, 1, 0, 0],
    [4036, -12831, 2, -1, 1, 0],
    [3994, -10445, 2, 0, 2, 0],
    [3861, -11650, 4, 0, 0, 0],
    [3665, 14403, 2, 0, -3, 0],
    [-2689, -7003, 0, 1, -2, 0],
    [-2602, 10056, 2, 0, -1, 2],
    [2390, 6322, 2, -1, -2, 0],
    [-2348, 5751, 1, 0, 1, 0],
    [2236, -4950, 2, -2, 0, 0],
    [-2120, 4130, 0, 1, 2, 0],
    [-2069, 0, 0, 2, 0, 0],
    [2048, -3958, 2, -2, -1, 0],
    [-1773, 3258, 2, 0, 1, -2],
    [-1595, 0, 2, 0, 0, 2],
    [1215, -2618, 4, -1, -1, 0],
    [-1110, 0, 0, 0, 2, 2],
    [-892, 2354, 3, 0, -1, 0],
    [-810, 2236, 2, 1, 1, 0],
    [759, -2120, 4, -1, -2, 0],
    [-713, -1129, 0, 2, -1, 0],
    [-700, 0, 2, 2, -1, 0],
    [691, 0, 2, 1, -2, 0],
    [596, 0, 2, -1, 0, -2],
    [549, -1788, 4, 0, 1, 0],
    [537, -1749, 0, 0, 4, 0],
    [520, -1619, 4, -1, 0, 0],
    [-487, 0, 1, 0, -2, 0],
    [-399, 0, 2, 1, 0, -2],
    [-381, 0, 0, 0, 2, -2],
    [351, 0, 1, 1, 1, 0],
    [-340, 0, 3, 0, -2, 0],
    [330, 0, 4, 0, -3, 0],
    [327, 0, 2, -1, 2, 0],
    [-323, 1165, 0, 2, 1, 0],
    [299, 0, 1, 1, -1, 0],
    [294, 0, 2, 0, 3, 0],
  ];

  // Latitude terms (sigma b)
  const termsB = [
    [5128122, 0, 0, 0, 1],
    [280602, 0, 0, 1, 1],
    [277693, 0, 0, 1, -1],
    [173237, 2, 0, 0, -1],
    [55413, 2, 0, -1, 1],
    [46271, 2, 0, -1, -1],
    [32573, 2, 0, 0, 1],
    [17198, 0, 0, 2, 1],
    [9266, 2, 0, 1, -1],
    [8822, 0, 0, 2, -1],
    [8216, 2, -1, 0, -1],
    [4324, 2, 0, -2, -1],
    [4200, 2, 0, 1, 1],
    [-3359, 2, 1, 0, -1],
    [2463, 2, -1, -1, 1],
    [2211, 2, -1, 0, 1],
    [2065, 2, -1, -1, -1],
    [-1870, 0, 1, -1, -1],
    [1828, 4, 0, -1, -1],
    [-1794, 0, 1, 0, 1],
    [-1749, 0, 0, 0, 3],
    [-1565, 0, 1, -1, 1],
    [-1491, 1, 0, 0, 1],
    [-1475, 0, 1, 1, 1],
    [-1410, 0, 1, 1, -1],
    [-1344, 0, 1, 0, -1],
    [-1335, 1, 0, 0, -1],
    [1107, 0, 0, 3, 1],
    [1021, 4, 0, 0, -1],
    [833, 4, 0, -1, 1],
  ];

  let sumL = 0;
  let sumR = 0;
  for (const t of termsLR) {
    const [lonC, distC, dD, dM, dMp, dF] = t;
    let arg = (dD * D + dM * M + dMp * Mp + dF * F) * DEG;
    let ec = 1;
    if (Math.abs(dM) === 1) ec = E;
    else if (Math.abs(dM) === 2) ec = E2;
    sumL += lonC * ec * Math.sin(arg);
    sumR += distC * ec * Math.cos(arg);
  }

  let sumB = 0;
  for (const t of termsB) {
    const [latC, dD, dM, dMp, dF] = t;
    let arg = (dD * D + dM * M + dMp * Mp + dF * F) * DEG;
    let ec = 1;
    if (Math.abs(dM) === 1) ec = E;
    else if (Math.abs(dM) === 2) ec = E2;
    sumB += latC * ec * Math.sin(arg);
  }

  // Additive corrections (Meeus)
  sumL += 3958 * Math.sin(A1 * DEG) + 1962 * Math.sin((Lp - F) * DEG) + 318 * Math.sin(A2 * DEG);
  sumB +=
    -2235 * Math.sin(Lp * DEG) +
    382 * Math.sin(A3 * DEG) +
    175 * Math.sin((A1 - F) * DEG) +
    175 * Math.sin((A1 + F) * DEG) +
    127 * Math.sin((Lp - Mp) * DEG) -
    115 * Math.sin((Lp + Mp) * DEG);

  const lon = wrap360(Lp + sumL / 1e6);
  const lat = sumB / 1e6;
  const rKm = 385000.56 + sumR / 1000;

  const lonR = lon * DEG;
  const latR = lat * DEG;
  const rAu = rKm / 149597870.7;
  const x = rAu * Math.cos(latR) * Math.cos(lonR);
  const y = rAu * Math.cos(latR) * Math.sin(lonR);
  const z = rAu * Math.sin(latR);

  return { lon, lat, rKm, rAu, x, y, z, Lp, D, M, Mp, F };
}

/**
 * 태양 지심 황경 (지구 일심의 반대, 간단한 근사)
 * 달 위상 계산용
 */
export function sunGeocentricLongitude(jd) {
  const earth = planetHeliocentric('earth', jd);
  // Sun as seen from Earth = opposite of Earth's heliocentric vector
  return wrap360(earth.lon + 180);
}

/**
 * 달 위상 계산
 * phaseAngle: 태양-달 시차 황경 (0=삭, 180=보름), 0~360 단조 증가
 * illumination: 조명률 0~1
 * ageDays: 삭 이후 일수 (0~29.53)
 */
export function moonPhase(jd) {
  const moon = moonGeocentric(jd);
  const sunLon = sunGeocentricLongitude(jd);

  // elongation (phase angle in ecliptic longitude difference)
  // 0 = new moon, 180 = full moon
  let phaseAngle = wrap360(moon.lon - sunLon);

  // geometric illumination fraction (spherical): (1 - cos i) / 2
  // where i is phase angle between sun-moon as seen from earth
  // Using elongation as approximation for phase angle
  const i = phaseAngle * DEG;
  // More accurate: use 3D vectors
  const sunLonR = sunLon * DEG;
  // sun direction from earth (unit, distance ignored for phase)
  const sx = Math.cos(sunLonR);
  const sy = Math.sin(sunLonR);
  const sz = 0;
  const mx = moon.x;
  const my = moon.y;
  const mz = moon.z;
  const mr = Math.sqrt(mx * mx + my * my + mz * mz);
  const mnx = mx / mr;
  const mny = my / mr;
  const mnz = mz / mr;
  // cos of elongation
  const cosElong = sx * mnx + sy * mny + sz * mnz;
  const elong = Math.acos(Math.max(-1, Math.min(1, cosElong))) * RAD;

  // For phase angle used in selftest: ecliptic longitude difference 0-360
  // illumination from spherical geometry: (1 + cos phase) / 2 where phase=0 full? 
  // Convention: phase angle ψ = angle at Moon between Earth and Sun
  // illuminated fraction k = (1 + cos ψ) / 2
  // elongation η ≈ ψ for distant sun, k = (1 - cos η) / 2 if η is sun-moon angle from earth
  // At new moon: moon near sun, elongation ~0, dark → k ~ 0
  // At full moon: moon opposite sun, elongation ~180, bright → k ~ 1
  // So k = (1 - cos(elongation)) / 2 ? 
  // cos(0)=1 → k=0 new ✓
  // cos(180)=-1 → k=1 full ✓
  let illumination = (1 - cosElong) / 2;
  illumination = Math.max(0, Math.min(1, illumination));

  // Synodic age: phaseAngle / 360 * synodic month
  const SYNODIC = 29.530588853;
  const ageDays = (phaseAngle / 360) * SYNODIC;

  // Days to next full moon (phase 180)
  let toFull;
  if (phaseAngle <= 180) {
    toFull = ((180 - phaseAngle) / 360) * SYNODIC;
  } else {
    toFull = ((360 - phaseAngle + 180) / 360) * SYNODIC;
  }

  const phaseName = phaseNameFromAngle(phaseAngle);

  return {
    phaseAngle,
    elongation: elong,
    illumination,
    ageDays,
    daysToFull: toFull,
    phaseName,
    moonLon: moon.lon,
    sunLon,
    moon,
  };
}

/**
 * 8구간 위상 이름 (한국어)
 * 0 삭, 45 초승, 90 상현, 135 차오르는 볼록, 180 보름,
 * 225 기우는 볼록, 270 하현, 315 그믐
 */
export function phaseNameFromAngle(phaseAngle) {
  const a = wrap360(phaseAngle);
  if (a < 22.5 || a >= 337.5) return '삭(신월)';
  if (a < 67.5) return '초승달';
  if (a < 112.5) return '상현달';
  if (a < 157.5) return '차오르는 볼록달';
  if (a < 202.5) return '보름달';
  if (a < 247.5) return '기우는 볼록달';
  if (a < 292.5) return '하현달';
  return '그믐달';
}

/**
 * 위상에 따른 교육용 설명
 */
export function moonPhaseExplanation(phase) {
  const name = phase.phaseName;
  const illumPct = (phase.illumination * 100).toFixed(0);
  const lines = [
    `지금 달은 태양 빛 중 약 ${illumPct}%가 지구 쪽으로 보여요.`,
  ];
  if (name.includes('삭')) {
    lines.push('달이 태양과 같은 방향에 있어서 어두운 면이 우리를 향해요 (신월).');
    lines.push('하늘에서 거의 보이지 않아요.');
  } else if (name.includes('초승')) {
    lines.push('달이 태양 오른쪽(동쪽)으로 조금 벗어나 가느다란 초승달이 보여요.');
    lines.push('밝은 쪽이 태양이 있는 쪽을 향해요.');
  } else if (name.includes('상현')) {
    lines.push('달이 태양에서 약 90° 떨어져 오른쪽 절반이 밝아요.');
    lines.push('지구-달-태양이 직각을 이룰 때예요.');
  } else if (name.includes('차오르는')) {
    lines.push('보름에 가까워지며 점점 더 많은 면이 밝아지고 있어요.');
    lines.push('곧 둥근 보름달이 됩니다.');
  } else if (name.includes('보름')) {
    lines.push('달이 태양 반대편에 있어서 전체 밝은 면이 지구를 향해요.');
    lines.push('지구가 태양과 달 사이에 있을 때예요.');
  } else if (name.includes('기우는')) {
    lines.push('보름이 지나 밝은 면이 조금씩 줄어들고 있어요.');
    lines.push('밝은 쪽은 여전히 태양 방향을 향합니다.');
  } else if (name.includes('하현')) {
    lines.push('달이 태양에서 약 270° 위치에 있어 왼쪽 절반이 밝아요.');
    lines.push('새벽 하늘에서 잘 보이기도 해요.');
  } else {
    lines.push('다시 삭에 가까워지며 가느다란 그믐달이 보여요.');
    lines.push('밝은 쪽이 태양 방향을 향합니다.');
  }
  return lines;
}

/**
 * 주어진 날짜의 전체 천체 상태
 */
export function computeState(dateOrJd) {
  const jd = typeof dateOrJd === 'number' ? dateOrJd : dateToJD(dateOrJd);
  const planets = allPlanets(jd);
  const moon = moonGeocentric(jd);
  const phase = moonPhase(jd);
  const earth = planets.earth;

  // Moon heliocentric ≈ earth heliocentric + moon geocentric
  const moonHelio = {
    x: earth.x + moon.x,
    y: earth.y + moon.y,
    z: earth.z + moon.z,
    lon: 0,
    lat: 0,
    r: 0,
  };
  moonHelio.r = Math.sqrt(
    moonHelio.x * moonHelio.x + moonHelio.y * moonHelio.y + moonHelio.z * moonHelio.z
  );
  moonHelio.lon = wrap360(Math.atan2(moonHelio.y, moonHelio.x) * RAD);
  moonHelio.lat = Math.asin(moonHelio.z / moonHelio.r) * RAD;

  return {
    jd,
    date: jdToDate(jd),
    planets,
    moon,
    moonHelio,
    phase,
    sun: { lon: 0, lat: 0, r: 0, x: 0, y: 0, z: 0 },
  };
}

/**
 * 알려진 공전 주기 (일) — selftest 및 UI용
 */
export function knownPeriodDays(planetId) {
  return PLANET_ELEMENTS[planetId]?.periodDays ?? null;
}

export const PLANET_IDS = Object.keys(PLANET_ELEMENTS);

export { PLANET_ELEMENTS, wrap360, wrap180, DEG, RAD };
