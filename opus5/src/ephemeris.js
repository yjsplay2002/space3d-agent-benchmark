/**
 * ephemeris.js — 실제 천체 위치 계산 (외부 천문 라이브러리 없이 직접 구현)
 *
 * · 8행성: J2000 기준 궤도 요소 + 세기당 변화율 (Standish, JPL "Keplerian Elements
 *   for Approximate Positions of the Major Planets", 1800–2050 구간)
 *   → 케플러 방정식을 뉴턴-랩슨으로 풀어 일심 황경/황위/동경거리를 구한다.
 *   교육용 목표 정확도: 황경 오차 1° 이내.
 * · 달: ELP-2000/82 (Meeus, Astronomical Algorithms 47장) 주요 항 절단 구현.
 *   에벡션·출차(변화)·연차 등 주요 섭동을 포함하며 황경 오차 0.5° 이내.
 * · 시각 기준은 UTC. 율리우스일(JD)로 변환해 계산한다.
 *
 * 브라우저/Node 양쪽에서 그대로 import 되는 순수 모듈 (DOM/Three.js 의존 없음).
 */

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

/** J2000.0 (2000-01-01 12:00 UTC) 의 율리우스일 */
export const J2000 = 2451545.0;

/** 삭망월(신월→신월) 평균 길이 [일] */
export const SYNODIC_MONTH = 29.530588853;

/** 항성월(달이 항성 기준 한 바퀴) [일] */
export const SIDEREAL_MONTH = 27.321661;

/** 1 천문단위 [km] */
export const AU_KM = 149597870.7;

// ─────────────────────────────────────────────────────────────────────────────
// 각도 · 시간 유틸
// ─────────────────────────────────────────────────────────────────────────────

/** 0 이상 360 미만으로 정규화 */
export function mod360(x) {
  const r = x % 360;
  return r < 0 ? r + 360 : r;
}

/** -180 이상 180 미만으로 정규화 */
export function wrap180(x) {
  return mod360(x + 180) - 180;
}

/** JS Date(UTC 기준) → 율리우스일 */
export function dateToJD(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

/** 율리우스일 → JS Date */
export function jdToDate(jd) {
  return new Date(Math.round((jd - 2440587.5) * 86400000));
}

/** 해당 UTC 날짜의 00:00 UTC 에 해당하는 JD */
export function jdFromUTC(year, month, day, hour = 0, minute = 0, second = 0) {
  return dateToJD(new Date(Date.UTC(year, month - 1, day, hour, minute, second)));
}

/** J2000 이후 율리우스 세기 */
export function centuries(jd) {
  return (jd - J2000) / 36525;
}

const sin = (d) => Math.sin(d * DEG);
const cos = (d) => Math.cos(d * DEG);

// ─────────────────────────────────────────────────────────────────────────────
// 케플러 방정식 (뉴턴-랩슨)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * M(도) 과 이심률 e 로부터 이심근점이각 E(라디안)를 구한다.
 * E - e·sinE = M 을 뉴턴-랩슨으로 반복해 푼다.
 */
export function solveKepler(Mdeg, e) {
  // M 을 -π..π 라디안으로
  let M = wrap180(Mdeg) * DEG;
  // 초기값: 이심률이 클수록 보정을 크게
  let E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
  for (let i = 0; i < 80; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-13) break;
  }
  return E;
}

// ─────────────────────────────────────────────────────────────────────────────
// 8행성 궤도 요소 (J2000 값 / 세기당 변화율)
//  a: 궤도 긴반지름[au], e: 이심률, I: 궤도 경사[°],
//  L: 평균황경[°], wbar: 근일점 황경[°], Om: 승교점 황경[°]
// ─────────────────────────────────────────────────────────────────────────────

export const PLANET_ELEMENTS = {
  mercury: {
    a: [0.38709927, 0.00000037],
    e: [0.20563593, 0.00001906],
    I: [7.00497902, -0.00594749],
    L: [252.2503235, 149472.67411175],
    wbar: [77.45779628, 0.16047689],
    Om: [48.33076593, -0.12534081],
  },
  venus: {
    a: [0.72333566, 0.0000039],
    e: [0.00677672, -0.00004107],
    I: [3.39467605, -0.0007889],
    L: [181.9790995, 58517.81538729],
    wbar: [131.60246718, 0.00268329],
    Om: [76.67984255, -0.27769418],
  },
  // 지구는 실제로는 지구-달 질량중심(EMB)의 요소. 지구 중심과의 차는 각도로 ~6초각.
  earth: {
    a: [1.00000261, 0.00000562],
    e: [0.01671123, -0.00004392],
    I: [-0.00001531, -0.01294668],
    L: [100.46457166, 35999.37244981],
    wbar: [102.93768193, 0.32327364],
    Om: [0.0, 0.0],
  },
  mars: {
    a: [1.52371034, 0.00001847],
    e: [0.0933941, 0.00007882],
    I: [1.84969142, -0.00813131],
    L: [-4.55343205, 19140.30268499],
    wbar: [-23.94362959, 0.44441088],
    Om: [49.55953891, -0.29257343],
  },
  jupiter: {
    a: [5.202887, -0.00011607],
    e: [0.04838624, -0.00013253],
    I: [1.30439695, -0.00183714],
    L: [34.39644051, 3034.74612775],
    wbar: [14.72847983, 0.21252668],
    Om: [100.47390909, 0.20469106],
  },
  saturn: {
    a: [9.53667594, -0.0012506],
    e: [0.05386179, -0.00050991],
    I: [2.48599187, 0.00193609],
    L: [49.95424423, 1222.49362201],
    wbar: [92.59887831, -0.41897216],
    Om: [113.66242448, -0.28867794],
  },
  uranus: {
    a: [19.18916464, -0.00196176],
    e: [0.04725744, -0.00004397],
    I: [0.77263783, -0.00242939],
    L: [313.23810451, 428.48202785],
    wbar: [170.9542763, 0.40805281],
    Om: [74.01692503, 0.04240589],
  },
  neptune: {
    a: [30.06992276, 0.00026291],
    e: [0.00859048, 0.00005105],
    I: [1.77004347, 0.00035372],
    L: [-55.12002969, 218.45945325],
    wbar: [44.96476227, -0.32241464],
    Om: [131.78422574, -0.00508664],
  },
};

export const PLANET_KEYS = Object.freeze([
  'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune',
]);

/** 알려진 항성 공전 주기 [일] — 자체 검증 및 UI 표기에 사용 */
export const KNOWN_SIDEREAL_PERIOD = Object.freeze({
  mercury: 87.9691,
  venus: 224.701,
  earth: 365.256363,
  mars: 686.98,
  jupiter: 4332.589,
  saturn: 10759.22,
  uranus: 30685.4,
  neptune: 60189.0,
});

/** 주어진 시각의 궤도 요소를 계산한다 (내부용) */
function elementsAt(key, jd) {
  const el = PLANET_ELEMENTS[key];
  if (!el) throw new Error(`알 수 없는 행성: ${key}`);
  const T = centuries(jd);
  const Om = el.Om[0] + el.Om[1] * T;
  const wbar = el.wbar[0] + el.wbar[1] * T;
  return {
    a: el.a[0] + el.a[1] * T,
    e: el.e[0] + el.e[1] * T,
    I: el.I[0] + el.I[1] * T,
    L: el.L[0] + el.L[1] * T,
    wbar,
    Om,
    w: wbar - Om,               // 근일점 인수
  };
}

/** 궤도 요소 + 이심근점이각(라디안) → 일심 황도좌표 (내부용) */
function stateFromE(el, E) {
  const { a, e, I, w, Om } = el;

  // 궤도면 내 좌표
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);

  const cw = cos(w), sw = sin(w);
  const cO = cos(Om), sO = sin(Om);
  const cI = cos(I), sI = sin(I);

  const x = (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp;
  const y = (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp;
  const z = (sw * sI) * xp + (cw * sI) * yp;

  const r = Math.sqrt(x * x + y * y + z * z);
  return {
    lon: mod360(Math.atan2(y, x) * RAD),
    lat: Math.asin(z / r) * RAD,
    r,
    x, y, z,
  };
}

/**
 * 행성의 일심(태양 중심) 황도좌표.
 * @returns {{lon:number, lat:number, r:number, x:number, y:number, z:number, E:number, M:number}}
 *          lon/lat/E/M 은 도, r 은 au, x/y/z 는 J2000 황도 직교좌표[au]
 */
export function planetHeliocentric(key, jd) {
  const el = elementsAt(key, jd);
  const M = el.L - el.wbar;               // 평균근점이각
  const E = solveKepler(M, el.e);
  const s = stateFromE(el, E);
  s.E = mod360(E * RAD);
  s.M = mod360(M);
  return s;
}

/**
 * 궤도 전체를 이심근점이각 기준으로 균일 샘플링한다.
 * 반환 배열의 인덱스 i 는 E = 360·i/n 에 해당하므로,
 * planetHeliocentric(...).E / 360 이 곧 궤도 위 정규화 위치(0~1)가 된다.
 * → 궤도 셰이더에서 "행성이 지금 어디쯤인지"를 그대로 쓸 수 있다.
 * @returns {Array<{lon:number, lat:number, r:number}>}
 */
export function planetOrbitPath(key, jd, n = 512) {
  const el = elementsAt(key, jd);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = stateFromE(el, (i / n) * Math.PI * 2);
  }
  return out;
}

/** 지구의 일심 황경 [°] — 자체 검증 2번 항목에서 사용 */
export function earthHeliocentricLongitude(jd) {
  return planetHeliocentric('earth', jd).lon;
}

/**
 * 태양의 지심(지구 중심) 황도좌표. 지구 일심 좌표를 180° 뒤집어 얻는다.
 * @returns {{lon:number, lat:number, r:number}} lon/lat 도, r au
 */
export function sunGeocentric(jd) {
  const e = planetHeliocentric('earth', jd);
  return {
    lon: mod360(e.lon + 180),
    lat: -e.lat,
    r: e.r,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 달 — ELP-2000/82 절단 급수 (Meeus, Astronomical Algorithms, 47장)
//   각 행: [D, M, M', F, Σl(1e-6°), Σr(1e-3 km)]
// ─────────────────────────────────────────────────────────────────────────────

const MOON_LR = [
  [0, 0, 1, 0, 6288774, -20905355],
  [2, 0, -1, 0, 1274027, -3699111],   // 출차(evection)
  [2, 0, 0, 0, 658314, -2955968],     // 변화(variation)
  [0, 0, 2, 0, 213618, -569925],
  [0, 1, 0, 0, -185116, 48888],       // 연차(annual equation)
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
  [2, 1, -1, 0, -7888, -24208],
  [2, 1, 0, 0, -6766, -30824],
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
 * J2000 에서 T 세기 후까지의 황경 일반세차 [도].
 * ELP 급수는 "그 시점의 평균 춘분점" 기준이므로, Standish 행성 요소(J2000 기준)와
 * 같은 좌표계로 맞추기 위해 이 값을 빼 준다.
 */
function precessionInLongitude(T) {
  return (5029.0966 * T + 1.11113 * T * T - 0.000006 * T * T * T) / 3600;
}

/**
 * 달의 지심 황도좌표 (J2000 황도/춘분점 기준).
 * @returns {{lon:number, lat:number, distKm:number, r:number}}
 *          lon/lat 도, distKm 킬로미터, r 은 au
 */
export function moonGeocentric(jd) {
  const T = centuries(jd);
  const T2 = T * T, T3 = T2 * T, T4 = T3 * T;

  // 달의 평균황경
  const Lp = mod360(218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000);
  // 평균 이각 (달 - 태양)
  const D = mod360(297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000);
  // 태양의 평균근점이각
  const M = mod360(357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000);
  // 달의 평균근점이각
  const Mp = mod360(134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000);
  // 위도 인수 (승교점으로부터의 각거리)
  const F = mod360(93.272095 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000);

  // 금성/목성에 의한 섭동 및 지구 궤도 이심률 보정
  const A1 = mod360(119.75 + 131.849 * T);
  const A2 = mod360(53.09 + 479264.29 * T);
  const A3 = mod360(313.45 + 481266.484 * T);
  const E = 1 - 0.002516 * T - 0.0000074 * T2;
  const E2 = E * E;

  let sumL = 0, sumR = 0, sumB = 0;

  for (let i = 0; i < MOON_LR.length; i++) {
    const t = MOON_LR[i];
    const arg = t[0] * D + t[1] * M + t[2] * Mp + t[3] * F;
    const ecc = t[1] === 0 ? 1 : (Math.abs(t[1]) === 1 ? E : E2);
    sumL += t[4] * ecc * sin(arg);
    sumR += t[5] * ecc * cos(arg);
  }
  for (let i = 0; i < MOON_B.length; i++) {
    const t = MOON_B[i];
    const arg = t[0] * D + t[1] * M + t[2] * Mp + t[3] * F;
    const ecc = t[1] === 0 ? 1 : (Math.abs(t[1]) === 1 ? E : E2);
    sumB += t[4] * ecc * sin(arg);
  }

  // 가법 보정항
  sumL += 3958 * sin(A1) + 1962 * sin(Lp - F) + 318 * sin(A2);
  sumB += -2235 * sin(Lp)
    + 382 * sin(A3)
    + 175 * sin(A1 - F)
    + 175 * sin(A1 + F)
    + 127 * sin(Lp - Mp)
    - 115 * sin(Lp + Mp);

  const lon = mod360(Lp + sumL / 1e6 - precessionInLongitude(T));
  const lat = sumB / 1e6;
  const distKm = 385000.56 + sumR / 1000;

  return { lon, lat, distKm, r: distKm / AU_KM };
}

// ─────────────────────────────────────────────────────────────────────────────
// 달의 위상
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 위상각 D [0,360) — 달과 태양의 지심 황경차.
 * 0° = 삭(신월), 90° = 상현, 180° = 망(보름), 270° = 하현.
 * 달의 황경 변화율(약 13.18°/일)이 태양(약 0.99°/일)보다 항상 크므로
 * 이 값은 항상 단조 증가하며 360°에서 0°으로 랩된다.
 */
export function moonPhaseAngle(jd) {
  return mod360(moonGeocentric(jd).lon - sunGeocentric(jd).lon);
}

/** 조명률 (밝게 보이는 면적 비율) 0~1 */
export function moonIllumination(jd) {
  return illuminationFromPhase(moonPhaseAngle(jd));
}

/** 위상각(도) → 조명률 0~1 */
export function illuminationFromPhase(phaseDeg) {
  const k = (1 - Math.cos(phaseDeg * DEG)) / 2;
  return Math.min(1, Math.max(0, k));
}

/** 위상각 → 8구간 한국어 위상 이름 */
export function moonPhaseName(phaseDeg) {
  const p = mod360(phaseDeg);
  if (p < 22.5 || p >= 337.5) return '삭 (신월)';
  if (p < 67.5) return '초승달';
  if (p < 112.5) return '상현달';
  if (p < 157.5) return '차오르는 볼록달';
  if (p < 202.5) return '보름달';
  if (p < 247.5) return '기우는 볼록달';
  if (p < 292.5) return '하현달';
  return '그믐달';
}

/** 위상각 → 8구간 인덱스 (0=삭 … 7=그믐달) */
export function moonPhaseIndex(phaseDeg) {
  return Math.floor((mod360(phaseDeg) + 22.5) % 360 / 45);
}

/** 위상각의 평균 변화율 [°/일] — 약 12.19 */
const PHASE_RATE = 360 / SYNODIC_MONTH;

/**
 * 추정 시각 근처에서 위상각이 목표값이 되는 시각을 뉴턴법으로 정밀화한다.
 * 추정값이 목표의 ±반달 이내에 있어야 올바른 해로 수렴한다.
 * @param {number} tGuess 초기 추정 시각 (JD)
 * @param {number} targetDeg 목표 위상각 (0=삭, 180=망)
 */
export function refinePhaseTime(tGuess, targetDeg) {
  let t = tGuess;
  const h = 0.02;
  for (let i = 0; i < 40; i++) {
    const d = wrap180(moonPhaseAngle(t) - targetDeg);
    // 국소 변화율을 중심차분으로 (11.8 ~ 15.4 °/일 사이에서 변한다)
    let dp = wrap180(moonPhaseAngle(t + h) - moonPhaseAngle(t - h)) / (2 * h);
    if (!(dp > 1)) dp = PHASE_RATE;
    const step = d / dp;
    t -= step;
    if (Math.abs(step) < 1e-8) break;
  }
  return t;
}

/**
 * 위상각이 목표값이 되는 시각을 찾는다.
 * @param {number} jd 탐색 기준 시각
 * @param {number} targetDeg 목표 위상각 (0=삭, 180=망)
 * @param {number} dir +1 이면 jd 이후 첫 시각, -1 이면 jd 이전 마지막 시각
 */
export function findPhaseTime(jd, targetDeg, dir = 1) {
  const raw = mod360(targetDeg - moonPhaseAngle(jd));
  // dir<0 일 때는 한 주기 뒤로 (단, 이미 목표 위상이면 그대로)
  const diff = dir >= 0 ? raw : (raw < 1e-9 ? 0 : raw - 360);
  let t = refinePhaseTime(jd + diff / PHASE_RATE, targetDeg);
  // 뉴턴 반복이 경계를 넘어갔으면 한 삭망월만큼 되돌린다
  if (dir >= 0 && t < jd - 1e-6) t = refinePhaseTime(t + SYNODIC_MONTH, targetDeg);
  if (dir < 0 && t > jd + 1e-6) t = refinePhaseTime(t - SYNODIC_MONTH, targetDeg);
  return t;
}

/** 월령 — 직전 삭으로부터 지난 일수 */
export function moonAge(jd) {
  const lastNew = findPhaseTime(jd, 0, -1);
  return jd - lastNew;
}

/** 다음 보름달까지 남은 일수 */
export function daysToNextFullMoon(jd) {
  return findPhaseTime(jd, 180, 1) - jd;
}

/**
 * 달 관측 패널용 통합 정보.
 */
export function moonPhaseInfo(jd) {
  const phase = moonPhaseAngle(jd);
  const moon = moonGeocentric(jd);
  const sun = sunGeocentric(jd);
  return {
    jd,
    phase,
    illumination: illuminationFromPhase(phase),
    name: moonPhaseName(phase),
    index: moonPhaseIndex(phase),
    age: moonAge(jd),
    toFullMoon: daysToNextFullMoon(jd),
    waxing: phase < 180,       // 차오르는 중
    distKm: moon.distKm,
    moonLon: moon.lon,
    moonLat: moon.lat,
    sunLon: sun.lon,
    // 시직경 [도] — 달 지름 3474.8 km
    angularDiameter: 2 * Math.atan2(1737.4, moon.distKm) * RAD,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 자전 (씬에서 사용)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 주어진 JD 에서 천체의 자전 위상(0~1). 음수 주기(역자전)를 그대로 반영한다.
 * @param {number} periodDays 항성일 기준 자전 주기 [일]. 음수면 역자전.
 */
export function rotationPhase(jd, periodDays) {
  if (!periodDays) return 0;
  return ((jd - J2000) / periodDays) % 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// 검증 보조: 황경이 360° 도는 데 걸리는 일수로 공전 주기 측정
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 일심 황경을 누적 추적해 360° 를 도는 데 걸리는 일수를 반환한다.
 * @param {string} key 행성 키
 * @param {number} jd0 측정 시작 JD
 * @param {number} step 적분 간격 [일]
 */
export function measureOrbitalPeriod(key, jd0, step) {
  const h = step || Math.max(0.05, (KNOWN_SIDEREAL_PERIOD[key] || 365) / 2000);
  let prev = planetHeliocentric(key, jd0).lon;
  let acc = 0;
  let t = jd0;
  const maxSteps = 4000000;
  for (let i = 0; i < maxSteps; i++) {
    t += h;
    const cur = planetHeliocentric(key, t).lon;
    const d = wrap180(cur - prev);
    if (acc + d >= 360) {
      // 마지막 구간을 선형 보간
      const frac = (360 - acc) / d;
      return (t - h + frac * h) - jd0;
    }
    acc += d;
    prev = cur;
  }
  throw new Error(`${key}: 공전 주기 측정 실패`);
}
