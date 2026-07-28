/**
 * ephemeris.js — 실제 천체 위치 계산 (외부 라이브러리 없이 직접 구현)
 *
 * - 8행성: J2000 궤도 요소 + 세기당 변화율 (Standish, JPL "Approximate
 *   Positions of the Planets", 1800AD~2050AD 유효). 케플러 방정식은
 *   뉴턴-랩슨 반복으로 풀어 일심 황경/황위/동경거리를 구한다. (오차 << 1°)
 * - 달: 지심 위치. 주요 섭동항(에벡션·출차·이각변화·연차 등 Meeus 축약
 *   급수)까지 반영. (황경 오차 ~0.05° 수준)
 * - 시각 기준 UTC, 율리우스일(JD)로 계산.
 *
 * 이 모듈은 순수 수학만 포함하며 브라우저/three.js 에 의존하지 않는다.
 * (scripts/selftest.mjs 가 Node 에서 직접 import 한다)
 */

export const DEG = Math.PI / 180;
export const J2000 = 2451545.0;
export const SYNODIC_MONTH = 29.530588853; // 평균 삭망월 (일)

/* ------------------------------------------------------------------ */
/* 시간 변환                                                           */
/* ------------------------------------------------------------------ */

/** JS Date(UTC) → 율리우스일 */
export function jdFromDate(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

/** 율리우스일 → JS Date(UTC) */
export function dateFromJD(jd) {
  return new Date((jd - 2440587.5) * 86400000);
}

/** UTC 년/월/일(+시각) → JD */
export function jdFromUTC(y, m, d, h = 0, min = 0, s = 0) {
  return jdFromDate(new Date(Date.UTC(y, m - 1, d, h, min, s)));
}

function norm360(a) {
  a %= 360;
  return a < 0 ? a + 360 : a;
}

/* ------------------------------------------------------------------ */
/* 행성: J2000 궤도 요소 (Standish Table 1)                            */
/* [값, 세기당 변화율] — a(AU) e I(°) L(°) ϖ(°) Ω(°)                   */
/* ------------------------------------------------------------------ */

export const PLANET_ELEMENTS = {
  mercury: {
    a: [0.38709927, 0.00000037],
    e: [0.20563593, 0.00001906],
    I: [7.00497902, -0.00594749],
    L: [252.2503235, 149472.67411175],
    w: [77.45779628, 0.16047689],
    O: [48.33076593, -0.12534081],
  },
  venus: {
    a: [0.72333566, 0.0000039],
    e: [0.00677672, -0.00004107],
    I: [3.39467605, -0.0007889],
    L: [181.9790995, 58517.81538729],
    w: [131.60246718, 0.00268329],
    O: [76.67984255, -0.27769418],
  },
  earth: {
    // 지구-달 질량중심(EMB) — 태양 방향 각도 오차 0.002° 미만이라 지구로 사용
    a: [1.00000261, 0.00000562],
    e: [0.01671123, -0.00004392],
    I: [-0.00001531, -0.01294668],
    L: [100.46457166, 35999.37244981],
    w: [102.93768193, 0.32327364],
    O: [0.0, 0.0],
  },
  mars: {
    a: [1.52371034, 0.00001847],
    e: [0.0933941, 0.00007882],
    I: [1.84969142, -0.00813131],
    L: [-4.55343205, 19140.30268499],
    w: [-23.94362959, 0.44441088],
    O: [49.55953891, -0.29257343],
  },
  jupiter: {
    a: [5.202887, -0.00011607],
    e: [0.04838624, -0.00013253],
    I: [1.30439695, -0.00183714],
    L: [34.39644051, 3034.74612775],
    w: [14.72847983, 0.21252668],
    O: [100.47390909, 0.20469106],
  },
  saturn: {
    a: [9.53667594, -0.0012506],
    e: [0.05386179, -0.00050991],
    I: [2.48599187, 0.00193609],
    L: [49.95424423, 1222.49362201],
    w: [92.59887831, -0.41897216],
    O: [113.66242448, -0.28867794],
  },
  uranus: {
    a: [19.18916464, -0.00196176],
    e: [0.04725744, -0.00004397],
    I: [0.77263783, -0.00242939],
    L: [313.23810451, 428.48202785],
    w: [170.9542763, 0.40805281],
    O: [74.01692503, 0.04240589],
  },
  neptune: {
    a: [30.06992276, 0.00026291],
    e: [0.00859048, 0.00005105],
    I: [1.77004347, 0.00035372],
    L: [-55.12002969, 218.45945325],
    w: [44.96476227, -0.32241464],
    O: [131.78422574, -0.00508664],
  },
};

export const PLANET_KEYS = Object.keys(PLANET_ELEMENTS);

/** 케플러 방정식 M = E - e·sinE 를 뉴턴-랩슨으로 풀기 (라디안) */
export function solveKepler(M, e) {
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 20; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-9) break;
  }
  return E;
}

/**
 * 행성의 일심 황도 좌표.
 * @returns {{lon:number, lat:number, r:number}} lon/lat 도(°), r AU
 */
export function planetHelio(key, jd) {
  const el = PLANET_ELEMENTS[key];
  if (!el) throw new Error(`unknown planet: ${key}`);
  const T = (jd - J2000) / 36525;

  const a = el.a[0] + el.a[1] * T;
  const e = el.e[0] + el.e[1] * T;
  const I = (el.I[0] + el.I[1] * T) * DEG;
  const L = el.L[0] + el.L[1] * T;
  const wbar = el.w[0] + el.w[1] * T;
  const O = el.O[0] + el.O[1] * T;

  const w = (wbar - O) * DEG; // 근일점 편각
  const Om = O * DEG;
  const M = norm360(L - wbar) * DEG; // 평균 근점이각

  const E = solveKepler(M, e);
  const xp = a * (Math.cos(E) - e); // 궤도면 좌표
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);

  const cw = Math.cos(w), sw = Math.sin(w);
  const cO = Math.cos(Om), sO = Math.sin(Om);
  const cI = Math.cos(I), sI = Math.sin(I);

  const x = (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp;
  const y = (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp;
  const z = sw * sI * xp + cw * sI * yp;

  const r = Math.sqrt(x * x + y * y + z * z);
  return {
    lon: norm360(Math.atan2(y, x) / DEG),
    lat: Math.asin(z / r) / DEG,
    r,
  };
}

/** 평균 공전 주기(일) — 평균 황경 변화율에서 유도 */
export function periodDays(key) {
  return 360 / (PLANET_ELEMENTS[key].L[1] / 36525);
}

/** 태양의 지심 황경(°) = 지구 일심 황경 + 180° */
export function sunGeoLon(jd) {
  return norm360(planetHelio("earth", jd).lon + 180);
}

/* ------------------------------------------------------------------ */
/* 달: 지심 위치 (Meeus 축약 급수 — 에벡션/출차/이각변화/연차 포함)      */
/* ------------------------------------------------------------------ */

/**
 * 달의 지심 황도 좌표.
 * @returns {{lon:number, lat:number, rKm:number}}
 */
export function moonGeo(jd) {
  const T = (jd - J2000) / 36525;

  const Lp = norm360(218.3164477 + 481267.88123421 * T) * DEG; // 평균 황경
  const D = norm360(297.8501921 + 445267.1114034 * T) * DEG; // 평균 이각
  const M = norm360(357.5291092 + 35999.0502909 * T) * DEG; // 태양 평균 근점이각
  const Mp = norm360(134.9633964 + 477198.8675055 * T) * DEG; // 달 평균 근점이각
  const F = norm360(93.272095 + 483202.0175233 * T) * DEG; // 위도 편각

  const E = 1 - 0.002516 * T - 0.0000074 * T * T; // 이심률 보정
  const s = Math.sin, c = Math.cos;

  // 황경 섭동 (도): 중심차, 에벡션(1.274), 출차(0.658), 연차(-0.186), 월각차 등
  let dLon =
    6.288774 * s(Mp) +
    1.274027 * s(2 * D - Mp) +
    0.658314 * s(2 * D) +
    0.213618 * s(2 * Mp) -
    0.185116 * E * s(M) -
    0.114332 * s(2 * F) +
    0.058793 * s(2 * D - 2 * Mp) +
    0.057066 * E * s(2 * D - M - Mp) +
    0.053322 * s(2 * D + Mp) +
    0.045758 * E * s(2 * D - M) -
    0.040923 * E * s(M - Mp) -
    0.03472 * s(D) -
    0.030383 * E * s(M + Mp) +
    0.015327 * s(2 * D - 2 * F) -
    0.012528 * s(Mp + 2 * F) +
    0.01098 * s(Mp - 2 * F) +
    0.010675 * s(4 * D - Mp) +
    0.010034 * s(3 * Mp) +
    0.008548 * s(4 * D - 2 * Mp) -
    0.00791 * E * s(M - Mp + 2 * D) -
    0.006783 * E * s(2 * D + M);

  // 황위 섭동 (도)
  const lat =
    5.128122 * s(F) +
    0.280602 * s(Mp + F) +
    0.277693 * s(Mp - F) +
    0.173237 * s(2 * D - F) +
    0.055413 * s(2 * D - Mp + F) +
    0.046271 * s(2 * D - Mp - F) +
    0.032573 * s(2 * D + F) +
    0.017198 * s(2 * Mp + F);

  // 거리 (km)
  const rKm =
    385000.56 -
    20905.355 * c(Mp) -
    3699.111 * c(2 * D - Mp) -
    2955.968 * c(2 * D) -
    569.925 * c(2 * Mp);

  return { lon: norm360(Lp / DEG + dLon), lat, rKm };
}

/* ------------------------------------------------------------------ */
/* 달 위상                                                             */
/* ------------------------------------------------------------------ */

export const PHASE_NAMES = [
  "삭 (신월)",
  "초승달",
  "상현달",
  "차오르는 볼록달",
  "보름달",
  "기우는 볼록달",
  "하현달",
  "그믐달",
];

/**
 * 위상각(°) = 달 황경 − 태양 황경 (0=삭, 90=상현, 180=보름, 270=하현).
 * 0~360 범위이며 시간에 따라 단조 증가(360에서 랩)한다.
 */
export function moonPhaseAngle(jd) {
  return norm360(moonGeo(jd).lon - sunGeoLon(jd));
}

/**
 * 달 위상 종합 정보.
 * @returns {{
 *  angle:number,      // 위상각(이각) 0~360°
 *  illum:number,      // 조명률 0~1 (황위 포함한 실제 각거리 기준)
 *  age:number,        // 월령 (삭 이후 일수)
 *  nextFullDays:number, // 다음 보름달까지 남은 일수
 *  phaseIndex:number, // 0~7 (8구간)
 *  phaseName:string,  // 한국어 위상 이름
 *  waxing:boolean,    // 차오르는 중인가
 * }}
 */
export function moonPhase(jd) {
  const moon = moonGeo(jd);
  const sunLon = sunGeoLon(jd);
  const angle = norm360(moon.lon - sunLon);

  // 조명률: 황위까지 포함한 태양-달 실제 각거리 ψ 로 계산
  const cosPsi =
    Math.cos(moon.lat * DEG) * Math.cos((moon.lon - sunLon) * DEG);
  const psi = Math.acos(Math.min(1, Math.max(-1, cosPsi)));
  const illum = (1 - Math.cos(psi)) / 2;

  const age = (angle / 360) * SYNODIC_MONTH;
  const nextFullDays = (norm360(180 - angle) / 360) * SYNODIC_MONTH;
  const phaseIndex = Math.floor(norm360(angle + 22.5) / 45) % 8;

  return {
    angle,
    illum,
    age,
    nextFullDays,
    phaseIndex,
    phaseName: PHASE_NAMES[phaseIndex],
    waxing: angle < 180,
  };
}
