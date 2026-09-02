// ephemeris.js — 실제 천체 위치 계산 (외부 라이브러리 없음, Node/브라우저 공용)
//
// - 8행성: JPL/Standish "Keplerian Elements for Approximate Positions of the
//   Major Planets" (1800~2050 AD) 궤도 요소 + 세기당 변화율. 케플러 방정식은
//   뉴턴-랩슨 반복으로 푼다. 황경 오차 ~0.1° 수준.
// - 달: 평균 요소 + 주요 섭동항(에벡션, 출차, 연차, 시차 부등 등) — Schlyter 계열
//   간이 이론. 황경 오차 ~0.1° 이하.
// - 시각 기준 UTC, 율리우스일(JD)로 계산. 각도는 도(deg), 거리는 AU.

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export const J2000 = 2451545.0;            // 2000-01-01 12:00 UTC
export const SYNODIC_MONTH = 29.530588853; // 삭망월 (일)

// ---------------------------------------------------------------- 시간 변환
export function toJulianDay(date) {
  return date.getTime() / 86400000 + 2440587.5;
}
export function fromJulianDay(jd) {
  return new Date((jd - 2440587.5) * 86400000);
}
// UTC 자정 기준 JD (날짜 버튼용)
export function jdAtUTCMidnight(jd) {
  return Math.floor(jd - 0.5) + 0.5;
}

export function norm360(a) {
  a = a % 360;
  return a < 0 ? a + 360 : a;
}

// ---------------------------------------------------------------- 행성 궤도 요소
// [a, e, I, L, varpi(근일점 황경), Omega(승교점 황경)] + 세기당 변화율
export const PLANET_ELEMENTS = {
  mercury: {
    base: [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593],
    rate: [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  },
  venus: {
    base: [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255],
    rate: [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418],
  },
  earth: { // 지구-달 질량중심
    base: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
    rate: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
  },
  mars: {
    base: [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    rate: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  },
  jupiter: {
    base: [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    rate: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  },
  saturn: {
    base: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    rate: [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
  },
  uranus: {
    base: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503],
    rate: [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
  },
  neptune: {
    base: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
    rate: [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
  },
};

export const PLANET_NAMES = Object.keys(PLANET_ELEMENTS);

// 특정 시각의 궤도 요소
export function orbitalElements(name, jd) {
  const el = PLANET_ELEMENTS[name];
  if (!el) throw new Error(`unknown planet: ${name}`);
  const T = (jd - J2000) / 36525;
  const [a, e, I, L, varpi, Omega] = el.base.map((b, i) => b + el.rate[i] * T);
  return {
    a, e, I, L, varpi, Omega,
    omega: varpi - Omega,        // 근일점 인수
    M: norm360(L - varpi),       // 평균 근점 이각
  };
}

// 케플러 방정식 M = E - e sin E (뉴턴-랩슨), 입력/출력 라디안
export function solveKepler(M, e) {
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 30; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  return E;
}

// 궤도 요소 → 일심 황도 직교좌표 (AU) 및 황경/황위/거리
function elementsToState(a, e, I, omega, Omega, Mdeg) {
  const M = norm360(Mdeg) * DEG;
  const E = solveKepler(M, e);
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(omega * DEG), sw = Math.sin(omega * DEG);
  const cO = Math.cos(Omega * DEG), sO = Math.sin(Omega * DEG);
  const cI = Math.cos(I * DEG), sI = Math.sin(I * DEG);
  const x = (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp;
  const y = (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp;
  const z = (sw * sI) * xp + (cw * sI) * yp;
  const r = Math.sqrt(x * x + y * y + z * z);
  return {
    x, y, z, r,
    lon: norm360(Math.atan2(y, x) * RAD),
    lat: Math.asin(z / r) * RAD,
    trueAnomaly: norm360(Math.atan2(yp, xp) * RAD),
    meanAnomaly: norm360(Mdeg),
    E: E * RAD,
  };
}

// 행성의 일심 황도 좌표 { lon, lat, r, x, y, z } (deg, AU)
export function planetPosition(name, jd) {
  const el = orbitalElements(name, jd);
  return elementsToState(el.a, el.e, el.I, el.omega, el.Omega, el.M);
}

// 같은 시각의 궤도 요소를 고정하고 평균 근점 이각만 바꿔 궤도 곡선을 샘플링
export function planetOrbitPath(name, jd, samples = 256) {
  const el = orbitalElements(name, jd);
  const pts = [];
  for (let i = 0; i < samples; i++) {
    const M = (i / samples) * 360;
    const s = elementsToState(el.a, el.e, el.I, el.omega, el.Omega, M);
    pts.push({ ...s, progress: i / samples });
  }
  return { points: pts, elements: el };
}

// 행성의 공전 위상(평균 근점 이각 기준 0~1)
export function planetProgress(name, jd) {
  return orbitalElements(name, jd).M / 360;
}

// 태양의 지심 황경 (= 지구 일심 황경 + 180°)
export function sunGeocentricLongitude(jd) {
  const e = planetPosition('earth', jd);
  return norm360(e.lon + 180);
}

// ---------------------------------------------------------------- 달
// 지심 황도 좌표 { lon, lat, dist(지구 반지름), distKm, distAU }
export function moonPosition(jd) {
  const d = jd - 2451543.5; // 1999-12-31 0:00 UTC 기준 경과일
  const N = norm360(125.1228 - 0.0529538083 * d);   // 승교점 황경
  const i = 5.1454;                                  // 궤도 경사
  const w = norm360(318.0634 + 0.1643573223 * d);    // 근지점 인수
  const a = 60.2666;                                 // 장반경 (지구 반지름)
  const e = 0.054900;
  const M = norm360(115.3654 + 13.0649929509 * d);   // 평균 근점 이각

  // 태양 평균 요소 (섭동 계산용)
  const ws = norm360(282.9404 + 4.70935e-5 * d);
  const Ms = norm360(356.0470 + 0.9856002585 * d);
  const Ls = norm360(ws + Ms);                       // 태양 평균 황경

  const E = solveKepler(M * DEG, e);
  const xv = a * (Math.cos(E) - e);
  const yv = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const v = Math.atan2(yv, xv) * RAD;                // 진근점 이각
  const r = Math.sqrt(xv * xv + yv * yv);

  const vw = (v + w) * DEG;
  const cN = Math.cos(N * DEG), sN = Math.sin(N * DEG);
  const ci = Math.cos(i * DEG), si = Math.sin(i * DEG);
  const xh = r * (cN * Math.cos(vw) - sN * Math.sin(vw) * ci);
  const yh = r * (sN * Math.cos(vw) + cN * Math.sin(vw) * ci);
  const zh = r * (Math.sin(vw) * si);

  let lon = norm360(Math.atan2(yh, xh) * RAD);
  let lat = Math.atan2(zh, Math.sqrt(xh * xh + yh * yh)) * RAD;
  let dist = r;

  // 섭동
  const Lm = norm360(N + w + M);   // 달 평균 황경
  const D = (Lm - Ls);             // 평균 이각(달-태양 평균 황경 차)
  const F = (Lm - N);              // 위도 인수
  const s = (deg) => Math.sin(deg * DEG);
  const c = (deg) => Math.cos(deg * DEG);

  lon += -1.274 * s(M - 2 * D)      // 에벡션
       + 0.658 * s(2 * D)           // 출차(Variation)
       - 0.186 * s(Ms)              // 연차(Annual equation)
       - 0.059 * s(2 * M - 2 * D)
       - 0.057 * s(M - 2 * D + Ms)
       + 0.053 * s(M + 2 * D)
       + 0.046 * s(2 * D - Ms)
       + 0.041 * s(M - Ms)
       - 0.035 * s(D)               // 시차 부등(Parallactic)
       - 0.031 * s(M + Ms)
       - 0.015 * s(2 * F - 2 * D)
       + 0.011 * s(M - 4 * D);

  lat += -0.173 * s(F - 2 * D)
       - 0.055 * s(M - F - 2 * D)
       - 0.046 * s(M + F - 2 * D)
       + 0.033 * s(F + 2 * D)
       + 0.017 * s(2 * M + F);

  dist += -0.58 * c(M - 2 * D) - 0.46 * c(2 * D);

  const distKm = dist * 6378.14;
  return {
    lon: norm360(lon), lat, dist, distKm, distAU: distKm / 149597870.7,
    meanAnomaly: M, node: N,
  };
}

// ---------------------------------------------------------------- 달 위상
// 위상각: (달 지심 황경 - 태양 지심 황경) mod 360. 0=삭, 90=상현, 180=보름, 270=하현
export function moonPhaseAngle(jd) {
  return norm360(moonPosition(jd).lon - sunGeocentricLongitude(jd));
}

export function illuminationFromAngle(angleDeg) {
  return (1 - Math.cos(angleDeg * DEG)) / 2;
}

export const PHASE_NAMES = [
  '삭 (신월)', '초승달', '상현달', '차오르는 볼록달',
  '보름달', '기우는 볼록달', '하현달', '그믐달',
];
export const PHASE_EMOJI = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];

export function phaseIndex(angleDeg) {
  return Math.floor(norm360(angleDeg + 22.5) / 45) % 8;
}
export function phaseName(angleDeg) {
  return PHASE_NAMES[phaseIndex(angleDeg)];
}

// 위상각 unwrap 도우미: 이전 값 기준 누적 각도
export function unwrapFrom(prev, cur) {
  let d = cur - prev;
  while (d < -180) d += 360;
  while (d > 180) d -= 360;
  return prev + d;
}

// 위상각이 목표값(target)을 통과하는 가장 가까운 시각을 탐색 (direction: +1 앞, -1 뒤)
function findPhaseCrossing(jd, targetDeg, direction = 1) {
  const step = 0.25 * direction;
  let t0 = jd;
  let a0 = norm360(moonPhaseAngle(t0) - targetDeg); // target 기준 0
  for (let n = 0; n < 200; n++) {
    const t1 = t0 + step;
    const a1 = norm360(moonPhaseAngle(t1) - targetDeg);
    // target 을 지나면 각도가 0 근처에서 랩됨: 앞으로 갈 땐 큰 값→작은 값, 뒤로 갈 땐 작은→큰
    const crossed = direction > 0 ? a1 < a0 : a1 > a0;
    if (crossed) {
      let lo = Math.min(t0, t1), hi = Math.max(t0, t1);
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        const am = norm360(moonPhaseAngle(mid) - targetDeg);
        // lo 쪽은 target 직전(큰 값), hi 쪽은 target 직후(작은 값)
        if (am > 180) lo = mid; else hi = mid;
      }
      return (lo + hi) / 2;
    }
    t0 = t1; a0 = a1;
  }
  return null;
}

export function nextFullMoon(jd) { return findPhaseCrossing(jd, 180, 1); }
export function nextNewMoon(jd) { return findPhaseCrossing(jd, 0, 1); }
export function previousNewMoon(jd) { return findPhaseCrossing(jd, 0, -1); }

// 달 위상 종합 정보
export function moonPhase(jd) {
  const angle = moonPhaseAngle(jd);
  const illumination = illuminationFromAngle(angle);
  const prevNew = previousNewMoon(jd);
  const age = prevNew != null ? jd - prevNew : (angle / 360) * SYNODIC_MONTH;
  const full = nextFullMoon(jd);
  const daysToFull = full != null ? full - jd : ((180 - angle + 360) % 360) / 360 * SYNODIC_MONTH;
  const nextNew = nextNewMoon(jd);
  const idx = phaseIndex(angle);
  return {
    angle,
    illumination,
    age,
    daysToFull,
    daysToNew: nextNew != null ? nextNew - jd : ((360 - angle) % 360) / 360 * SYNODIC_MONTH,
    index: idx,
    name: PHASE_NAMES[idx],
    emoji: PHASE_EMOJI[idx],
    waxing: angle < 180,
  };
}

// ---------------------------------------------------------------- 도우미
// 표시용 날짜 (사용자 로컬 시간대 기준 — 계산은 UTC/JD, 표시는 아이가 보는 달력 날짜)
export function formatKoreanDate(jd, utc = false) {
  const d = fromJulianDay(jd);
  if (utc) return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function isSameLocalDay(jd, date = new Date()) {
  const d = fromJulianDay(jd);
  return d.getFullYear() === date.getFullYear() && d.getMonth() === date.getMonth() && d.getDate() === date.getDate();
}
