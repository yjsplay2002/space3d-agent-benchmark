/**
 * 교육용 태양계 역법.
 * 행성: JPL의 J2000 평균 궤도요소 + 세기당 변화율, 케플러 방정식.
 * 달: 저정밀 타원궤도에 evection/variation/annual equation 등 주요 섭동항.
 * 모든 입력 시각은 UTC이며 각도는 도(degree) 단위다.
 */

export const J2000 = 2451545.0;
export const SYNODIC_MONTH = 29.530588853;
export const DEG = Math.PI / 180;

export const PLANET_ORDER = [
  'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune',
];

export const PLANET_PERIODS = {
  mercury: 87.969,
  venus: 224.701,
  earth: 365.256,
  mars: 686.980,
  jupiter: 4332.589,
  saturn: 10759.22,
  uranus: 30688.5,
  neptune: 60182,
};

// a(AU), e, I, mean longitude L, longitude of perihelion, longitude ascending node.
// Each pair is [J2000 value, change per Julian century].
export const ORBITAL_ELEMENTS = {
  mercury: [[0.38709927, 0.00000037], [0.20563593, 0.00001906], [7.00497902, -0.00594749], [252.25032350, 149472.67411175], [77.45779628, 0.16047689], [48.33076593, -0.12534081]],
  venus: [[0.72333566, 0.00000390], [0.00677672, -0.00004107], [3.39467605, -0.00078890], [181.97909950, 58517.81538729], [131.60246718, 0.00268329], [76.67984255, -0.27769418]],
  earth: [[1.00000261, 0.00000562], [0.01671123, -0.00004392], [-0.00001531, -0.01294668], [100.46457166, 35999.37244981], [102.93768193, 0.32327364], [0, 0]],
  mars: [[1.52371034, 0.00001847], [0.09339410, 0.00007882], [1.84969142, -0.00813131], [-4.55343205, 19140.30268499], [-23.94362959, 0.44441088], [49.55953891, -0.29257343]],
  jupiter: [[5.20288700, -0.00011607], [0.04838624, -0.00013253], [1.30439695, -0.00183714], [34.39644051, 3034.74612775], [14.72847983, 0.21252668], [100.47390909, 0.20469106]],
  saturn: [[9.53667594, -0.00125060], [0.05386179, -0.00050991], [2.48599187, 0.00193609], [49.95424423, 1222.49362201], [92.59887831, -0.41897216], [113.66242448, -0.28867794]],
  uranus: [[19.18916464, -0.00196176], [0.04725744, -0.00004397], [0.77263783, -0.00242939], [313.23810451, 428.48202785], [170.95427630, 0.40805281], [74.01692503, 0.04240589]],
  neptune: [[30.06992276, 0.00026291], [0.00859048, 0.00005105], [1.77004347, 0.00035372], [-55.12002969, 218.45945325], [44.96476227, -0.32241464], [131.78422574, -0.00508664]],
};

export function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
}

export function signedDegrees(value) {
  const n = normalizeDegrees(value);
  return n > 180 ? n - 360 : n;
}

export function dateToJulian(date = new Date()) {
  return date.getTime() / 86400000 + 2440587.5;
}

export function julianToDate(jd) {
  return new Date((jd - 2440587.5) * 86400000);
}

function solveKepler(meanAnomalyDeg, eccentricity) {
  const m = normalizeDegrees(meanAnomalyDeg) * DEG;
  let e = m + eccentricity * Math.sin(m) * (1 + eccentricity * Math.cos(m));
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const delta = (e - eccentricity * Math.sin(e) - m) / (1 - eccentricity * Math.cos(e));
    e -= delta;
    if (Math.abs(delta) < 1e-12) break;
  }
  return e;
}

export function getOrbitalElements(body, jd) {
  const source = ORBITAL_ELEMENTS[body];
  if (!source) throw new Error(`알 수 없는 행성: ${body}`);
  const t = (jd - J2000) / 36525;
  const [a, e, inclination, meanLongitude, perihelion, node] =
    source.map(([base, rate]) => base + rate * t);
  return {
    a,
    e,
    inclination,
    meanLongitude: normalizeDegrees(meanLongitude),
    perihelion: normalizeDegrees(perihelion),
    node: normalizeDegrees(node),
  };
}

export function getPlanetPosition(body, jd) {
  const el = getOrbitalElements(body, jd);
  const meanAnomaly = normalizeDegrees(el.meanLongitude - el.perihelion);
  const eccentricAnomaly = solveKepler(meanAnomaly, el.e);
  const xv = el.a * (Math.cos(eccentricAnomaly) - el.e);
  const yv = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(eccentricAnomaly);
  const trueAnomaly = Math.atan2(yv, xv);
  const radius = Math.hypot(xv, yv);
  const argumentPerihelion = (el.perihelion - el.node) * DEG;
  const node = el.node * DEG;
  const inc = el.inclination * DEG;
  const u = trueAnomaly + argumentPerihelion;
  const x = radius * (Math.cos(node) * Math.cos(u) - Math.sin(node) * Math.sin(u) * Math.cos(inc));
  const y = radius * (Math.sin(node) * Math.cos(u) + Math.cos(node) * Math.sin(u) * Math.cos(inc));
  const z = radius * Math.sin(u) * Math.sin(inc);
  return {
    x, y, z,
    distance: radius,
    longitude: normalizeDegrees(Math.atan2(y, x) / DEG),
    latitude: Math.asin(z / radius) / DEG,
    meanLongitude: el.meanLongitude,
    trueAnomaly: normalizeDegrees(trueAnomaly / DEG),
  };
}

export function getSunGeocentricLongitude(jd) {
  return normalizeDegrees(getPlanetPosition('earth', jd).longitude + 180);
}

export function getMoonPosition(jd) {
  const d = jd - 2451543.5;
  const node = normalizeDegrees(125.1228 - 0.0529538083 * d);
  const inclination = 5.1454;
  const periapsis = normalizeDegrees(318.0634 + 0.1643573223 * d);
  const eccentricity = 0.0549;
  const meanAnomaly = normalizeDegrees(115.3654 + 13.0649929509 * d);
  const eccentricAnomaly = solveKepler(meanAnomaly, eccentricity);
  const xv = Math.cos(eccentricAnomaly) - eccentricity;
  const yv = Math.sqrt(1 - eccentricity * eccentricity) * Math.sin(eccentricAnomaly);
  const trueAnomaly = Math.atan2(yv, xv) / DEG;
  const radiusEarthRadii = 60.2666 * Math.hypot(xv, yv);
  const n = node * DEG;
  const i = inclination * DEG;
  const u = (trueAnomaly + periapsis) * DEG;
  const x = radiusEarthRadii * (Math.cos(n) * Math.cos(u) - Math.sin(n) * Math.sin(u) * Math.cos(i));
  const y = radiusEarthRadii * (Math.sin(n) * Math.cos(u) + Math.cos(n) * Math.sin(u) * Math.cos(i));
  const z = radiusEarthRadii * Math.sin(u) * Math.sin(i);
  let longitude = normalizeDegrees(Math.atan2(y, x) / DEG);
  let latitude = Math.atan2(z, Math.hypot(x, y)) / DEG;
  const sunMeanAnomaly = normalizeDegrees(356.0470 + 0.9856002585 * d);
  const sunPeriapsis = normalizeDegrees(282.9404 + 4.70935e-5 * d);
  const sunMeanLongitude = normalizeDegrees(sunMeanAnomaly + sunPeriapsis);
  const moonMeanLongitude = normalizeDegrees(meanAnomaly + periapsis + node);
  const elongation = normalizeDegrees(moonMeanLongitude - sunMeanLongitude);
  const argumentLatitude = normalizeDegrees(moonMeanLongitude - node);
  const sin = (angle) => Math.sin(angle * DEG);
  longitude +=
    -1.274 * sin(meanAnomaly - 2 * elongation) + 0.658 * sin(2 * elongation)
    - 0.186 * sin(sunMeanAnomaly) - 0.059 * sin(2 * meanAnomaly - 2 * elongation)
    - 0.057 * sin(meanAnomaly - 2 * elongation + sunMeanAnomaly)
    + 0.053 * sin(meanAnomaly + 2 * elongation) + 0.046 * sin(2 * elongation - sunMeanAnomaly)
    + 0.041 * sin(meanAnomaly - sunMeanAnomaly) - 0.035 * sin(elongation)
    - 0.031 * sin(meanAnomaly + sunMeanAnomaly)
    - 0.015 * sin(2 * argumentLatitude - 2 * elongation) + 0.011 * sin(meanAnomaly - 4 * elongation);
  latitude +=
    -0.173 * sin(argumentLatitude - 2 * elongation)
    - 0.055 * sin(meanAnomaly - argumentLatitude - 2 * elongation)
    - 0.046 * sin(meanAnomaly + argumentLatitude - 2 * elongation)
    + 0.033 * sin(argumentLatitude + 2 * elongation)
    + 0.017 * sin(2 * meanAnomaly + argumentLatitude);
  longitude = normalizeDegrees(longitude);
  const lon = longitude * DEG;
  const lat = latitude * DEG;
  const distanceAU = radiusEarthRadii * 6378.137 / 149597870.7;
  return {
    x: distanceAU * Math.cos(lat) * Math.cos(lon),
    y: distanceAU * Math.cos(lat) * Math.sin(lon),
    z: distanceAU * Math.sin(lat),
    longitude, latitude, distance: distanceAU,
    distanceKm: radiusEarthRadii * 6378.137,
  };
}

export function getMoonPhase(jd) {
  const moon = getMoonPosition(jd);
  const sunLongitude = getSunGeocentricLongitude(jd);
  const angle = normalizeDegrees(moon.longitude - sunLongitude);
  const illumination = Math.max(0, Math.min(1, (1 - Math.cos(angle * DEG)) / 2));
  const age = angle / 360 * SYNODIC_MONTH;
  const waxing = angle < 180;
  const phaseNames = [
    '삭(신월)', '초승달', '상현달', '차오르는 볼록달',
    '보름달', '기우는 볼록달', '하현달', '그믐달',
  ];
  const phaseIndex = Math.floor(normalizeDegrees(angle + 22.5) / 45) % 8;
  return {
    angle, illumination, age, waxing, phaseIndex, name: phaseNames[phaseIndex],
    daysToFull: normalizeDegrees(180 - angle) / 360 * SYNODIC_MONTH,
    moonLongitude: moon.longitude,
    sunLongitude,
    brightLimbAngle: signedDegrees(sunLongitude - moon.longitude),
  };
}

export function getEphemeris(jd) {
  const planets = Object.fromEntries(PLANET_ORDER.map((id) => [id, getPlanetPosition(id, jd)]));
  const moon = getMoonPosition(jd);
  return { jd, planets, moon, phase: getMoonPhase(jd) };
}

export const calculateEphemeris = getEphemeris;
export const calculateMoonPhase = getMoonPhase;
