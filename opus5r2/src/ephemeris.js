/**
 * ephemeris.js — 실제 천체 위치 계산 (외부 천문 라이브러리 없이 직접 구현)
 *
 *  - 율리우스일(JD) 변환 (기준: UTC)
 *  - 8행성: J2000 궤도 요소 + 세기당 변화율 (Standish, 1800–2050) → 케플러 방정식(뉴턴-랩슨)
 *    → 일심 황경/황위/동경거리. 황경 오차 1° 이내.
 *  - 달: Meeus "Astronomical Algorithms" 47장 절단 급수(주요 섭동항 — 에벡션/출차/이각변화 포함)
 *    → 지심 황경/황위/거리. 황경 오차 0.5° 이내(실제로는 ~0.01° 수준).
 *  - 달 위상: 위상각, 조명률, 월령, 위상 이름(8구간), 다음 보름까지 남은 일수.
 *
 * 이 파일은 three.js / DOM 에 의존하지 않는 순수 모듈이다. (Node 에서 그대로 import 가능)
 */

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

/** 삭망월(평균) */
export const SYNODIC_MONTH = 29.530588853;
/** J2000.0 의 율리우스일 */
export const J2000 = 2451545.0;

const AU_KM = 149597870.7;

/* ------------------------------------------------------------------ *
 * 각도 유틸
 * ------------------------------------------------------------------ */

export function norm360(x) {
  const v = x % 360;
  return v < 0 ? v + 360 : v;
}

export function norm180(x) {
  const v = norm360(x);
  return v > 180 ? v - 360 : v;
}

const sind = (d) => Math.sin(d * DEG);
const cosd = (d) => Math.cos(d * DEG);

/* ------------------------------------------------------------------ *
 * 율리우스일
 * ------------------------------------------------------------------ */

/** JS Date(UTC 기준 절대시각) → 율리우스일 */
export function dateToJD(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

/** 율리우스일 → JS Date */
export function jdToDate(jd) {
  return new Date((jd - 2440587.5) * 86400000);
}

/** UTC 달력 날짜 → 율리우스일 */
export function utcToJD(year, month, day, hour = 0, minute = 0, second = 0) {
  return dateToJD(new Date(Date.UTC(year, month - 1, day, hour, minute, second)));
}

/** 율리우스세기 (J2000 기준) */
export function centuriesSinceJ2000(jd) {
  return (jd - J2000) / 36525;
}

/**
 * J2000 → 그 시각의 평균 분점까지의 일반세차(황경), 단위 도. (IAU 2006)
 *
 * 행성 궤도 요소(Standish)는 J2000 분점 기준이지만 Meeus 의 달 이론은
 * "그 시각의 평균 분점" 기준이라, 두 값을 그대로 빼면 세기당 약 1.4° 씩
 * 어긋난다(2026년 기준 약 0.37°). 달 황경에서 이 값을 빼서 J2000 으로 맞춘다.
 */
export function precessionFromJ2000(jd) {
  const T = centuriesSinceJ2000(jd);
  return (5028.796195 * T + 1.1054348 * T * T) / 3600;
}

/* ------------------------------------------------------------------ *
 * 행성 궤도 요소 (J2000, 1800–2050 유효)
 *   각 항목: [값(J2000), 세기당 변화율]
 *   a: 궤도 장반경(AU), e: 이심률, I: 궤도 경사(°),
 *   L: 평균 황경(°), peri: 근일점 황경 ϖ(°), node: 승교점 황경 Ω(°)
 * ------------------------------------------------------------------ */

const PLANET_ELEMENTS = {
  mercury: {
    a: [0.38709927, 0.00000037],
    e: [0.20563593, 0.00001906],
    I: [7.00497902, -0.00594749],
    L: [252.2503235, 149472.67411175],
    peri: [77.45779628, 0.16047689],
    node: [48.33076593, -0.12534081],
  },
  venus: {
    a: [0.72333566, 0.0000039],
    e: [0.00677672, -0.00004107],
    I: [3.39467605, -0.0007889],
    L: [181.9790995, 58517.81538729],
    peri: [131.60246718, 0.00268329],
    node: [76.67984255, -0.27769418],
  },
  // 지구는 지구-달 질량중심(EMB). 지구 본체와의 차이는 황경 0.002° 미만.
  earth: {
    a: [1.00000261, 0.00000562],
    e: [0.01671123, -0.00004392],
    I: [-0.00001531, -0.01294668],
    L: [100.46457166, 35999.37244981],
    peri: [102.93768193, 0.32327364],
    node: [0.0, 0.0],
  },
  mars: {
    a: [1.52371034, 0.00001847],
    e: [0.0933941, 0.00007882],
    I: [1.84969142, -0.00813131],
    L: [-4.55343205, 19140.30268499],
    peri: [-23.94362959, 0.44441088],
    node: [49.55953891, -0.29257343],
  },
  jupiter: {
    a: [5.202887, -0.00011607],
    e: [0.04838624, -0.00013253],
    I: [1.30439695, -0.00183714],
    L: [34.39644051, 3034.74612775],
    peri: [14.72847983, 0.21252668],
    node: [100.47390909, 0.20469106],
  },
  saturn: {
    a: [9.53667594, -0.0012506],
    e: [0.05386179, -0.00050991],
    I: [2.48599187, 0.00193609],
    L: [49.95424423, 1222.49362201],
    peri: [92.59887831, -0.41897216],
    node: [113.66242448, -0.28867794],
  },
  uranus: {
    a: [19.18916464, -0.00196176],
    e: [0.04725744, -0.00004397],
    I: [0.77263783, -0.00242939],
    L: [313.23810451, 428.48202785],
    peri: [170.9542763, 0.40805281],
    node: [74.01692503, 0.04240589],
  },
  neptune: {
    a: [30.06992276, 0.00026291],
    e: [0.00859048, 0.00005105],
    I: [1.77004347, 0.00035372],
    L: [-55.12002969, 218.45945325],
    peri: [44.96476227, -0.32241464],
    node: [131.78422574, -0.00508664],
  },
};

export const PLANET_KEYS = [
  'mercury',
  'venus',
  'earth',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
];

/** 알려진 항성 공전 주기(일) — 자체 검증용 참고값 */
export const KNOWN_ORBITAL_PERIODS = {
  mercury: 87.9691,
  venus: 224.701,
  earth: 365.256363,
  mars: 686.98,
  jupiter: 4332.589,
  saturn: 10759.22,
  uranus: 30685.4,
  neptune: 60189.0,
};

/* ------------------------------------------------------------------ *
 * 케플러 방정식 (뉴턴-랩슨)
 * ------------------------------------------------------------------ */

/**
 * M = E - e·sin E 를 E 에 대해 푼다.
 * @param {number} Mdeg 평균 근점 이각(도)
 * @param {number} e    이심률
 * @returns {number} 이심 근점 이각(라디안)
 */
export function solveKepler(Mdeg, e) {
  const M = norm180(Mdeg) * DEG;
  // 초기 추정: 이심률이 클수록 보정을 크게
  let E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
  for (let i = 0; i < 60; i++) {
    const f = E - e * Math.sin(E) - M;
    const fp = 1 - e * Math.cos(E);
    const dE = f / fp;
    E -= dE;
    if (Math.abs(dE) < 1e-14) break;
  }
  return E;
}

/* ------------------------------------------------------------------ *
 * 행성 위치
 * ------------------------------------------------------------------ */

/** 특정 시각의 궤도 요소를 선형 보간해서 얻는다. */
export function planetElements(key, jd) {
  const el = PLANET_ELEMENTS[key];
  if (!el) throw new Error(`알 수 없는 행성: ${key}`);
  const T = centuriesSinceJ2000(jd);
  const a = el.a[0] + el.a[1] * T;
  const e = el.e[0] + el.e[1] * T;
  const I = el.I[0] + el.I[1] * T;
  const L = el.L[0] + el.L[1] * T;
  const peri = el.peri[0] + el.peri[1] * T;
  const node = el.node[0] + el.node[1] * T;
  return {
    a,
    e,
    I,
    L,
    peri,
    node,
    omega: peri - node, // 근일점 인수 ω
    M: norm180(L - peri), // 평균 근점 이각
  };
}

/**
 * 궤도 요소 + (선택) 평균 근점 이각 오버라이드 → J2000 황도 좌표계 일심 위치.
 * @returns {{x:number,y:number,z:number,r:number,lon:number,lat:number}}
 *          x,y,z: AU (황도 직교좌표, +Z = 황북극), r: AU, lon/lat: 도
 */
export function stateFromElements(el, Mdeg = el.M) {
  const { a, e, I, omega, node } = el;
  const E = solveKepler(Mdeg, e);

  // 궤도면 내 좌표
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(Math.max(0, 1 - e * e)) * Math.sin(E);

  const co = cosd(omega);
  const so = sind(omega);
  const cn = cosd(node);
  const sn = sind(node);
  const ci = cosd(I);
  const si = sind(I);

  const x = (co * cn - so * sn * ci) * xp + (-so * cn - co * sn * ci) * yp;
  const y = (co * sn + so * cn * ci) * xp + (-so * sn + co * cn * ci) * yp;
  const z = so * si * xp + co * si * yp;

  const r = Math.hypot(x, y, z);
  return {
    x,
    y,
    z,
    r,
    lon: norm360(Math.atan2(y, x) * RAD),
    lat: r > 0 ? Math.asin(z / r) * RAD : 0,
  };
}

/**
 * 행성의 일심(태양 중심) 황도 좌표.
 * @param {string} key 행성 키 (mercury … neptune)
 * @param {number} jd  율리우스일
 */
export function planetPosition(key, jd) {
  return stateFromElements(planetElements(key, jd));
}

/** 행성의 일심 황경(도) */
export function planetLongitude(key, jd) {
  return planetPosition(key, jd).lon;
}

/**
 * 궤도 곡선 샘플링 — 현재 시각의 궤도 요소로 한 바퀴를 n등분.
 * 공전 방향(황경 증가 방향)을 따라 정렬된 배열을 돌려준다.
 */
export function orbitPath(key, jd, samples = 512) {
  const el = planetElements(key, jd);
  const out = [];
  for (let i = 0; i < samples; i++) {
    out.push(stateFromElements(el, (i / samples) * 360));
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 태양의 겉보기(지심) 위치
 * ------------------------------------------------------------------ */

/**
 * 지구에서 본 태양의 황경 / 거리.
 * @returns {{lon:number, lat:number, r:number, rKm:number}}
 */
export function sunGeocentric(jd) {
  const e = planetPosition('earth', jd);
  return {
    lon: norm360(e.lon + 180),
    lat: -e.lat,
    r: e.r,
    rKm: e.r * AU_KM,
  };
}

/* ------------------------------------------------------------------ *
 * 달 — Meeus, Astronomical Algorithms, 47장
 * ------------------------------------------------------------------ */

// Table 47.A — [D, M, M', F, Σl(1e-6 °), Σr(1e-3 km)]
const MOON_LR = [
  [0, 0, 1, 0, 6288774, -20905355],
  [2, 0, -1, 0, 1274027, -3699111],
  [2, 0, 0, 0, 658314, -2955968],
  [0, 0, 2, 0, 213618, -569925],
  [0, 1, 0, 0, -185116, 48888],
  [0, 0, 0, 2, -114332, -3149],
  [2, 0, -2, 0, 58793, 246158],
  [2, -1, -1, 0, 57066, -152138],
  [2, 0, 1, 0, 53322, -170733],
  [2, -1, 0, 0, 45758, -204586],
  [0, 1, -1, 0, -40923, -129620],
  [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755],
  [2, 0, 0, -2, 15327, 10321],
  [0, 0, 1, 2, -12528, 0],
  [0, 0, 1, -2, 10980, 79661],
  [4, 0, -1, 0, 10675, -34782],
  [0, 0, 3, 0, 10034, -23210],
  [4, 0, -2, 0, 8548, -21636],
  [2, 1, -1, 0, -7888, 24208],
  [2, 1, 0, 0, -6766, 30824],
  [1, 0, -1, 0, -5163, -8379],
  [1, 1, 0, 0, 4987, -16675],
  [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445],
  [4, 0, 0, 0, 3861, -11650],
  [2, 0, -3, 0, 3665, 14403],
  [0, 1, -2, 0, -2689, -7003],
  [2, 0, -1, 2, -2602, 0],
  [2, -1, -2, 0, 2390, 10056],
  [1, 0, 1, 0, -2348, 6322],
  [2, -2, 0, 0, 2236, -9884],
  [0, 1, 2, 0, -2120, 5751],
  [0, 2, 0, 0, -2069, 0],
  [2, -2, -1, 0, 2048, -4950],
  [2, 0, 1, -2, -1773, 4130],
  [2, 0, 0, 2, -1595, 0],
  [4, -1, -1, 0, 1215, -3958],
  [0, 0, 2, 2, -1110, 0],
  [3, 0, -1, 0, -892, 3258],
  [2, 1, 1, 0, -810, 2616],
  [4, -1, -2, 0, 759, -1897],
  [0, 2, -1, 0, -713, -2117],
  [2, 2, -1, 0, -700, 2354],
  [2, 1, -2, 0, 691, 0],
  [2, -1, 0, -2, 596, 0],
  [4, 0, 1, 0, 549, -1423],
  [0, 0, 4, 0, 537, -1117],
  [4, -1, 0, 0, 520, -1571],
  [1, 0, -2, 0, -487, -1739],
  [2, 1, 0, -2, -399, 0],
  [0, 0, 2, -2, -381, -4421],
  [1, 1, 1, 0, 351, 0],
  [3, 0, -2, 0, -340, 0],
  [4, 0, -3, 0, 330, 0],
  [2, -1, 2, 0, 327, 0],
  [0, 2, 1, 0, -323, 1165],
  [1, 1, -1, 0, 299, 0],
  [2, 0, 3, 0, 294, 0],
  [2, 0, -1, -2, 0, 8752],
];

// Table 47.B — [D, M, M', F, Σb(1e-6 °)]
const MOON_B = [
  [0, 0, 0, 1, 5128122],
  [0, 0, 1, 1, 280602],
  [0, 0, 1, -1, 277693],
  [2, 0, 0, -1, 173237],
  [2, 0, -1, 1, 55413],
  [2, 0, -1, -1, 46271],
  [2, 0, 0, 1, 32573],
  [0, 0, 2, 1, 17198],
  [2, 0, 1, -1, 9266],
  [0, 0, 2, -1, 8822],
  [2, -1, 0, -1, 8216],
  [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200],
  [2, 1, 0, -1, -3359],
  [2, -1, -1, 1, 2463],
  [2, -1, 0, 1, 2211],
  [2, -1, -1, -1, 2065],
  [0, 1, -1, -1, -1870],
  [4, 0, -1, -1, 1828],
  [0, 1, 0, 1, -1794],
  [0, 0, 0, 3, -1749],
  [0, 1, -1, 1, -1565],
  [1, 0, 0, 1, -1491],
  [0, 1, 1, 1, -1475],
  [0, 1, 1, -1, -1410],
  [0, 1, 0, -1, -1344],
  [1, 0, 0, -1, -1335],
  [0, 0, 3, 1, 1107],
  [4, 0, 0, -1, 1021],
  [4, 0, -1, 1, 833],
  [0, 0, 1, -3, 777],
  [4, 0, -2, 1, 671],
  [2, 0, 0, -3, 607],
  [2, 0, 2, -1, 596],
  [2, -1, 1, -1, 491],
  [2, 0, -2, 1, -451],
  [0, 0, 3, -1, 439],
  [2, 0, 2, 1, 422],
  [2, 0, -3, -1, 421],
  [2, 1, -1, 1, -366],
  [2, 1, 0, 1, -351],
  [4, 0, 0, 1, 331],
  [2, -1, 1, 1, 315],
  [2, -2, 0, -1, 302],
  [0, 0, 1, 3, -283],
  [2, 1, 1, -1, -229],
  [1, 1, 0, -1, 223],
  [1, 1, 0, 1, 223],
  [0, 1, -2, -1, -220],
  [2, 1, -1, -1, -220],
  [1, 0, 1, 1, -185],
  [2, -1, -2, -1, 181],
  [0, 1, 2, 1, -177],
  [4, 0, -2, -1, 176],
  [4, -1, -1, -1, 166],
  [1, 0, 1, -1, -164],
  [4, 0, 1, -1, 132],
  [1, 0, -1, -1, -119],
  [4, -1, 0, -1, 115],
  [2, -2, 0, 1, 107],
];

/**
 * 달의 지심 황도 좌표.
 * @returns {{lon:number, lat:number, distKm:number, parallax:number,
 *            Lp:number, D:number, M:number, Mp:number, F:number}}
 */
export function moonGeocentric(jd) {
  const T = centuriesSinceJ2000(jd);
  const T2 = T * T;
  const T3 = T2 * T;
  const T4 = T3 * T;

  // 달의 평균 황경
  const Lp =
    218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000;
  // 평균 이각 (달 - 태양)
  const D =
    297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000;
  // 태양의 평균 근점 이각
  const M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000;
  // 달의 평균 근점 이각
  const Mp =
    134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000;
  // 위도 인수
  const F =
    93.272095 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000;

  // 금성/목성 등에 의한 추가 보정항
  const A1 = 119.75 + 131.849 * T;
  const A2 = 53.09 + 479264.29 * T;
  const A3 = 313.45 + 481266.484 * T;

  // 지구 궤도 이심률 보정
  const E = 1 - 0.002516 * T - 0.0000074 * T2;
  const E2 = E * E;

  let sumL = 0;
  let sumR = 0;
  for (let i = 0; i < MOON_LR.length; i++) {
    const t = MOON_LR[i];
    const arg = t[0] * D + t[1] * M + t[2] * Mp + t[3] * F;
    const absM = Math.abs(t[1]);
    const ecc = absM === 1 ? E : absM === 2 ? E2 : 1;
    sumL += t[4] * ecc * sind(arg);
    sumR += t[5] * ecc * cosd(arg);
  }

  let sumB = 0;
  for (let i = 0; i < MOON_B.length; i++) {
    const t = MOON_B[i];
    const arg = t[0] * D + t[1] * M + t[2] * Mp + t[3] * F;
    const absM = Math.abs(t[1]);
    const ecc = absM === 1 ? E : absM === 2 ? E2 : 1;
    sumB += t[4] * ecc * sind(arg);
  }

  // 추가항
  sumL += 3958 * sind(A1) + 1962 * sind(Lp - F) + 318 * sind(A2);
  sumB +=
    -2235 * sind(Lp) +
    382 * sind(A3) +
    175 * sind(A1 - F) +
    175 * sind(A1 + F) +
    127 * sind(Lp - Mp) -
    115 * sind(Lp + Mp);

  // Meeus 47장의 결과는 "그 시각의 평균 분점" 기준 황경이다.
  // 행성(Standish)은 J2000 분점 기준이므로 세차를 빼서 프레임을 맞춘다.
  const lonOfDate = norm360(Lp + sumL / 1e6);
  const lon = norm360(lonOfDate - precessionFromJ2000(jd));
  const lat = sumB / 1e6;
  const distKm = 385000.56 + sumR / 1000;
  const parallax = Math.asin(6378.14 / distKm) * RAD;

  return { lon, lonOfDate, lat, distKm, parallax, Lp, D, M, Mp, F };
}

/* ------------------------------------------------------------------ *
 * 달 위상
 * ------------------------------------------------------------------ */

/** 위상각(도): 0 = 삭, 90 = 상현, 180 = 망, 270 = 하현. 항상 [0, 360) */
export function moonPhaseAngle(jd) {
  return norm360(moonGeocentric(jd).lon - sunGeocentric(jd).lon);
}

/** 위상각 하루 평균 증가율(도/일) — 근찾기 초기값용 */
const PHASE_RATE = 360 / SYNODIC_MONTH; // ≈ 12.1907

/**
 * 위상각이 target(도)이 되는 시각을 찾는다.
 * @param {number} jd0 기준 시각
 * @param {number} targetDeg 목표 위상각
 * @param {number} dir +1 이면 jd0 이후 첫 시각, -1 이면 jd0 이전 마지막 시각
 */
export function findPhaseTime(jd0, targetDeg, dir = 1) {
  const cur = moonPhaseAngle(jd0);
  let t;
  if (dir >= 0) {
    t = jd0 + (norm360(targetDeg - cur) / 360) * SYNODIC_MONTH;
  } else {
    t = jd0 - (norm360(cur - targetDeg) / 360) * SYNODIC_MONTH;
  }
  for (let i = 0; i < 30; i++) {
    const err = norm180(moonPhaseAngle(t) - targetDeg);
    const step = err / PHASE_RATE;
    t -= step;
    if (Math.abs(step) < 1e-8) break;
  }
  return t;
}

const PHASE_NAMES = [
  { name: '삭(신월)', emoji: '🌑' },
  { name: '초승달', emoji: '🌒' },
  { name: '상현달', emoji: '🌓' },
  { name: '차오르는 볼록달', emoji: '🌔' },
  { name: '보름달', emoji: '🌕' },
  { name: '기우는 볼록달', emoji: '🌖' },
  { name: '하현달', emoji: '🌗' },
  { name: '그믐달', emoji: '🌘' },
];

/** 위상각 → 8구간 이름 */
export function phaseNameFromAngle(angleDeg) {
  const a = norm360(angleDeg);
  const idx = Math.floor((a + 22.5) / 45) % 8;
  return PHASE_NAMES[idx];
}

/**
 * 달 위상 정보 일체.
 * @returns {{
 *   phaseAngle:number, illumination:number, age:number,
 *   name:string, emoji:string, waxing:boolean,
 *   nextFullMoonDays:number, nextNewMoonDays:number,
 *   distKm:number, angularDiameter:number,
 *   brightLimbAngle:number, elongation:number,
 *   moon:object, sun:object
 * }}
 */
export function moonPhase(jd) {
  const moon = moonGeocentric(jd);
  const sun = sunGeocentric(jd);

  const phaseAngle = norm360(moon.lon - sun.lon);

  // 이각 ψ (지구에서 본 태양-달 사이각)
  const cosPsi = cosd(moon.lat) * cosd(moon.lon - sun.lon);
  const psi = Math.acos(Math.max(-1, Math.min(1, cosPsi)));

  // 위상각 i (태양-달-지구 사이각)
  const R = sun.rKm;
  const dlt = moon.distKm;
  const i = Math.atan2(R * Math.sin(psi), dlt - R * Math.cos(psi));
  const illumination = (1 + Math.cos(i)) / 2;

  // 월령: 직전 삭으로부터 경과일
  const lastNew = findPhaseTime(jd, 0, -1);
  const age = jd - lastNew;

  const nextFull = findPhaseTime(jd, 180, +1);
  const nextNew = findPhaseTime(jd, 0, +1);

  const info = phaseNameFromAngle(phaseAngle);

  return {
    phaseAngle,
    illumination,
    age,
    name: info.name,
    emoji: info.emoji,
    waxing: phaseAngle < 180,
    nextFullMoonDays: nextFull - jd,
    nextNewMoonDays: nextNew - jd,
    distKm: moon.distKm,
    angularDiameter: (2 * Math.atan(1737.4 / moon.distKm) * RAD * 3600) / 60, // 분(′)
    brightLimbAngle: brightLimbPositionAngle(jd, moon, sun),
    elongation: psi * RAD,
    moon,
    sun,
  };
}

/**
 * 밝은 가장자리(bright limb)의 위치각 χ.
 * 황북극(north)에서 동쪽(east)으로 재는 각도(도).
 * 구면 위 두 단위벡터의 접선 방향으로 정확히 계산한다.
 */
export function brightLimbPositionAngle(jd, moonIn, sunIn) {
  const moon = moonIn || moonGeocentric(jd);
  const sun = sunIn || sunGeocentric(jd);

  const unit = (lonDeg, latDeg) => {
    const cl = cosd(latDeg);
    return [cl * cosd(lonDeg), cl * sind(lonDeg), sind(latDeg)];
  };
  const m = unit(moon.lon, moon.lat);
  const s = unit(sun.lon, sun.lat);

  // 달 위치에서의 국소 기저: 동쪽(황경 증가), 북쪽(황위 증가)
  const east = [-sind(moon.lon), cosd(moon.lon), 0];
  const north = [
    -sind(moon.lat) * cosd(moon.lon),
    -sind(moon.lat) * sind(moon.lon),
    cosd(moon.lat),
  ];

  const dot = m[0] * s[0] + m[1] * s[1] + m[2] * s[2];
  const t = [s[0] - dot * m[0], s[1] - dot * m[1], s[2] - dot * m[2]];

  const te = t[0] * east[0] + t[1] * east[1] + t[2] * east[2];
  const tn = t[0] * north[0] + t[1] * north[1] + t[2] * north[2];

  return norm360(Math.atan2(te, tn) * RAD);
}

/* ------------------------------------------------------------------ *
 * 자체 검증 / 씬에서 함께 쓰는 보조 함수
 * ------------------------------------------------------------------ */

/**
 * 황경이 360° 도는 데 걸리는 일수(공전 주기)를 수치적으로 측정한다.
 * selftest 와 UI 양쪽에서 쓴다.
 */
export function measureOrbitalPeriod(key, jd0, step = 0.25, maxDays = 70000) {
  let prev = planetLongitude(key, jd0);
  let unwrapped = 0;
  let prevUnwrapped = 0;
  for (let d = step; d <= maxDays; d += step) {
    const lon = planetLongitude(key, jd0 + d);
    let delta = lon - prev;
    if (delta < -180) delta += 360;
    else if (delta > 180) delta -= 360;
    prevUnwrapped = unwrapped;
    unwrapped += delta;
    prev = lon;
    if (unwrapped >= 360) {
      // 선형 보간으로 정확한 교차 시점
      const frac = (360 - prevUnwrapped) / (unwrapped - prevUnwrapped);
      return d - step + frac * step;
    }
  }
  return NaN;
}

/** 지구의 일심 황경 하루 평균 전진량(도/일) */
export function meanEarthLongitudeRate(jd0, days = 400) {
  let total = 0;
  let prev = planetLongitude('earth', jd0);
  for (let d = 1; d <= days; d++) {
    const lon = planetLongitude('earth', jd0 + d);
    let delta = lon - prev;
    if (delta < -180) delta += 360;
    else if (delta > 180) delta -= 360;
    total += delta;
    prev = lon;
  }
  return total / days;
}
