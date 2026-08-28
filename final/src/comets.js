import * as THREE from 'three';

// JPL Small-Body Database의 J2000 황도면 기준 궤도 요소.
// 화면에서는 태양계 전체를 한 장면에 담기 위해 거리를 비선형 압축하지만,
// 시간에 따른 위치는 실제 이심률과 주기로 케플러 방정식을 풀어 계산한다.
export const COMETS = [
  {
    id: 'halley', name: '핼리', short: '핼리', eng: '1P/Halley', emoji: '☄️', type: '주기 혜성 · 역행 궤도',
    radius: 0.62, rotationHours: 52.8, tilt: 0, retrograde: true, isComet: true,
    e: 0.9679359956953211, a: 17.92863504856923, q: 0.5748638313743413, ad: 35.28240626576412,
    i: 162.1905300439129, om: 59.09894720612437, w: 112.2414314637764,
    tp: 2446469.9736161467, period: 27728.04608790421, activeAU: 4.2, color: 0x8fe8ff,
    forecastTp: '2061-07-29',
    diameter: '약 11 km', lastPerihelion: '1986년 2월',
    desc: '가장 유명한 주기 혜성이에요. 궤도가 162° 기울어져 있어 행성들과 거의 반대 방향으로 태양 둘레를 돌아요.',
    spin: '꼬리는 달려온 방향이 아니라 언제나 태양의 반대쪽을 향해요. 파란 이온 꼬리는 더 곧고, 먼지 꼬리는 궤도를 따라 휘어요.',
    facts: ['약 76년마다 돌아와요.', '다음 근일점은 2061년 무렵이에요.', '1986년에 여러 탐사선이 핵 가까이를 지나갔어요.'],
  },
  {
    id: 'encke', name: '엥케', short: '엥케', eng: '2P/Encke', emoji: '☄️', type: '단주기 혜성',
    radius: 0.48, rotationHours: 11.083, tilt: 0, retrograde: false, isComet: true,
    e: 0.8475034197640028, a: 2.219671347799601, q: 0.3384922897872659, ad: 4.100850405811936,
    i: 11.3868073505599, om: 334.1498910332493, w: 187.1740630668253,
    tp: 2460239.797748443, period: 1207.901278589101, activeAU: 3.2, color: 0x75dfff,
    forecastTp: '2027-02-10',
    diameter: '약 4.8 km', lastPerihelion: '2023년 10월',
    desc: '알려진 주기 혜성 가운데 가장 짧은 축에 드는 3.3년 주기로 태양을 찾아와요. 목성 궤도 안쪽을 빠르게 반복해 돌아요.',
    spin: '태양에 가까워지면 얼음이 기체로 변해 코마와 꼬리가 밝아지고, 멀어지면 다시 작고 어두운 핵처럼 보여요.',
    facts: ['주기는 약 3.3년이에요.', '엥케 혜성이 남긴 먼지는 황소자리 유성우와 관련 있어요.', '1819년 요한 엥케가 주기 혜성임을 계산했어요.'],
  },
  {
    id: 'hale-bopp', name: '헤일-밥', short: '헤일-밥', eng: 'C/1995 O1 Hale-Bopp', emoji: '☄️', type: '장주기 혜성',
    radius: 0.86, rotationHours: 11.35, tilt: 0, retrograde: false, isComet: true,
    e: 0.9949810027633206, a: 177.4333839117583, q: 0.890537663547794, ad: 353.9762301599687,
    i: 89.28759424740302, om: 282.7334213961641, w: 130.4146670659176,
    tp: 2450537.134907144, period: 863279.5034870314, activeAU: 7, color: 0xa9ecff,
    diameter: '약 60 km', lastPerihelion: '1997년 4월',
    desc: '1997년에 여러 달 동안 맨눈으로 보였던 거대한 혜성이에요. 궤도면이 거의 수직이라 태양계를 위아래로 가르는 모습이 두드러져요.',
    spin: '큰 핵은 태양에서 멀리 떨어져 있을 때도 활동할 수 있어요. 근일점 부근에서는 푸른 이온 꼬리와 누런 먼지 꼬리가 함께 보여요.',
    facts: ['핵 지름은 약 60 km로 추정돼요.', '1997년의 대표적인 대혜성이에요.', '다시 돌아오는 데 약 2,300년이 걸려요.'],
  },
  {
    id: 'hyakutake', name: '햐쿠타케', short: '햐쿠타케', eng: 'C/1996 B2 Hyakutake', emoji: '☄️', type: '장주기 혜성 · 역행 궤도',
    radius: 0.46, rotationHours: 6, tilt: 0, retrograde: true, isComet: true,
    e: 0.9998916470450123, a: 2124.755444393889, q: 0.2302235310262354, ad: 4249.280665256751,
    i: 124.9220493922234, om: 188.045131992156, w: 130.1751209780967,
    tp: 2450204.8941449965, period: 35773534.62343365, activeAU: 4.5, color: 0x78d8ff,
    diameter: '약 4.2 km', lastPerihelion: '1996년 5월',
    desc: '1996년에 지구 가까이 지나가며 하늘을 길게 가로지른 대혜성이에요. 아주 긴 궤도 때문에 다음 방문은 먼 미래예요.',
    spin: '태양풍이 이온 꼬리를 곧게 밀어내요. 1996년에는 이온 꼬리가 하늘에서 매우 길게 관측됐어요.',
    facts: ['1996년 지구에서 약 1,500만 km까지 가까워졌어요.', 'X선으로 빛나는 혜성이라는 사실이 처음 확인됐어요.', '다음 귀환은 수만 년 뒤로 추정돼요.'],
  },
  {
    id: 'neowise', name: '니오와이즈', short: 'NEOWISE', eng: 'C/2020 F3 NEOWISE', emoji: '☄️', type: '장주기 혜성 · 역행 궤도',
    radius: 0.5, rotationHours: 7.58, tilt: 0, retrograde: true, isComet: true,
    e: 0.9991780262531292, a: 358.4679565529321, q: 0.2946512493809196, ad: 716.6412618564832,
    i: 128.9375027594809, om: 61.01042818536988, w: 37.2786584481257,
    tp: 2459034.1788980444, period: 2478985.217997125, activeAU: 4.8, color: 0x8de5ff,
    diameter: '약 5 km', lastPerihelion: '2020년 7월',
    desc: 'NASA의 NEOWISE 우주망원경이 발견했고 2020년 여름 맨눈으로도 볼 수 있었던 혜성이에요.',
    spin: '태양 가까이에서는 뜨거워진 먼지가 넓고 누런 곡선 꼬리를, 이온화된 기체가 가늘고 푸른 직선 꼬리를 만들어요.',
    facts: ['2020년 북반구의 대표적인 맨눈 혜성이었어요.', '태양에 수성 궤도보다 가깝게 다가갔어요.', '다음 방문은 약 6,800년 뒤예요.'],
  },
  {
    id: '67p', name: '67P', short: '67P', eng: '67P/Churyumov–Gerasimenko', emoji: '☄️', type: '목성족 혜성',
    radius: 0.52, rotationHours: 12.76129, tilt: 0, retrograde: false, isComet: true,
    e: 0.6409081306555051, a: 3.462249489765068, q: 1.243265641416762, ad: 5.681233338113374,
    i: 7.040294906760007, om: 50.13557380441372, w: 12.79824973415729,
    tp: 2457247.5886578634, period: 2353.076067532089, activeAU: 3.5, color: 0x91dcff,
    forecastTp: '2028-04-10',
    diameter: '약 3.4 km', lastPerihelion: '2021년 11월',
    desc: '로제타 탐사선이 2년 넘게 함께 날고 필레 착륙선까지 내려보낸 오리 모양의 혜성이에요.',
    spin: '울퉁불퉁한 핵 표면에서 가스와 먼지 제트가 솟아나 코마와 꼬리를 만들어요. 태양에서 멀어지면 활동이 크게 줄어요.',
    facts: ['로제타는 혜성 주위를 돈 최초의 탐사선이에요.', '필레는 혜성 핵에 착륙한 최초의 탐사선이에요.', '주기는 약 6.45년이에요.'],
  },
];

const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;

export function dateToJulian(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

export function julianToDate(jd) {
  return new Date((jd - 2440587.5) * 86400000);
}

export function nextPerihelionAfter(comet, jd) {
  const reference = comet.forecastTp
    ? dateToJulian(new Date(`${comet.forecastTp}T00:00:00Z`))
    : comet.tp;
  const turns = Math.ceil((jd - reference + 1e-7) / comet.period);
  return reference + Math.max(0, turns) * comet.period;
}

export function solveEccentricAnomaly(meanAnomaly, eccentricity) {
  let m = ((meanAnomaly + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
  let eAnomaly = eccentricity > 0.8 ? (m < 0 ? -Math.PI : Math.PI) : m;
  for (let n = 0; n < 18; n++) {
    const f = eAnomaly - eccentricity * Math.sin(eAnomaly) - m;
    const step = f / (1 - eccentricity * Math.cos(eAnomaly));
    eAnomaly -= step;
    if (Math.abs(step) < 1e-10) break;
  }
  return eAnomaly;
}

// 실제 AU를 현재 장면의 교육용 압축 거리로 바꾼다.
// 0~30 AU는 행성 배치와 비슷하게, 그 바깥은 로그로 눌러 장주기 혜성도 한 장면에 담는다.
export function visualDistance(au) {
  const anchors = [
    [0, 14], [0.387, 26], [0.723, 36], [1, 47], [1.524, 60],
    [5.203, 88], [9.54, 116], [19.2, 142], [30.1, 165],
  ];
  if (au <= 0) return anchors[0][1];
  for (let i = 1; i < anchors.length; i++) {
    if (au <= anchors[i][0]) {
      const [a0, d0] = anchors[i - 1];
      const [a1, d1] = anchors[i];
      const t = (Math.log1p(au) - Math.log1p(a0)) / (Math.log1p(a1) - Math.log1p(a0));
      return THREE.MathUtils.lerp(d0, d1, t);
    }
  }
  return Math.min(380, 165 + Math.log2(au / 30.1) * 28);
}

function orbitalToWorld(comet, px, py, out = new THREE.Vector3()) {
  const O = comet.om * DEG, w = comet.w * DEG, i = comet.i * DEG;
  const cO = Math.cos(O), sO = Math.sin(O), cw = Math.cos(w), sw = Math.sin(w);
  const ci = Math.cos(i), si = Math.sin(i);
  const x = (cO * cw - sO * sw * ci) * px + (-cO * sw - sO * cw * ci) * py;
  const y = (sO * cw + cO * sw * ci) * px + (-sO * sw + cO * cw * ci) * py;
  const z = (sw * si) * px + (cw * si) * py;
  return out.set(x, z, -y);
}

function visualEllipse(comet) {
  const q = visualDistance(comet.q);
  const ad = visualDistance(comet.ad);
  return { a: (q + ad) / 2, e: (ad - q) / (ad + q) };
}

export function cometStateAtJD(comet, jd, out = {}) {
  const phaseTp = comet.forecastTp
    ? dateToJulian(new Date(`${comet.forecastTp}T00:00:00Z`))
    : comet.tp;
  const mean = TWO_PI * (jd - phaseTp) / comet.period;
  const E = solveEccentricAnomaly(mean, comet.e);
  const ellipse = visualEllipse(comet);
  const px = ellipse.a * (Math.cos(E) - ellipse.e);
  const py = ellipse.a * Math.sqrt(1 - ellipse.e * ellipse.e) * Math.sin(E);
  out.position = orbitalToWorld(comet, px, py, out.position || new THREE.Vector3());
  out.rAU = comet.a * (1 - comet.e * Math.cos(E));
  out.activity = Math.pow(THREE.MathUtils.clamp((comet.activeAU - out.rAU) / (comet.activeAU - comet.q), 0, 1), 1.35);
  out.E = E;
  return out;
}

function makeOrbit(comet, lowPower) {
  const seg = lowPower ? 220 : 420;
  const pos = new Float32Array((seg + 1) * 3);
  const ellipse = visualEllipse(comet);
  const p = new THREE.Vector3();
  for (let n = 0; n <= seg; n++) {
    const E = n / seg * TWO_PI;
    orbitalToWorld(
      comet,
      ellipse.a * (Math.cos(E) - ellipse.e),
      ellipse.a * Math.sqrt(1 - ellipse.e * ellipse.e) * Math.sin(E),
      p,
    );
    p.toArray(pos, n * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({
    color: comet.color, transparent: true, opacity: 0.1, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Line(geo, mat);
}

function makeDustTail(comet, lowPower, dotTexture) {
  const count = lowPower ? 18 : 34;
  const pos = new Float32Array(count * 3);
  const alpha = new Float32Array(count);
  const size = new Float32Array(count);
  for (let n = 0; n < count; n++) {
    const t = n / (count - 1);
    alpha[n] = Math.pow(1 - t, 1.25);
    size[n] = THREE.MathUtils.lerp(7, 20, t);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uMap: { value: dotTexture }, uOpacity: { value: 0 }, uDpr: { value: Math.min(devicePixelRatio, 2) } },
    vertexShader: `
      attribute float aAlpha, aSize;
      varying float vAlpha;
      uniform float uDpr;
      void main() {
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uDpr * clamp(120.0 / -mv.z, 0.45, 2.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform float uOpacity;
      varying float vAlpha;
      void main() {
        float a = texture2D(uMap, gl_PointCoord).a * vAlpha * uOpacity;
        gl_FragColor = vec4(vec3(1.0, 0.68, 0.28) * a, a);
      }`,
  });
  return new THREE.Points(geo, mat);
}

export function createComets({ scene, labelClass, dotTexture, lowPower, onSelect, makeLabel }) {
  const entries = [];
  for (const comet of COMETS) {
    const group = new THREE.Group();
    const nucleus = new THREE.Mesh(
      new THREE.IcosahedronGeometry(comet.radius, 2),
      new THREE.MeshStandardMaterial({
        color: 0x403b36, roughness: 1, metalness: 0,
        emissive: new THREE.Color(0x6f8490), emissiveIntensity: 0.16,
        flatShading: true,
      }),
    );
    nucleus.scale.set(1.25, 0.76, 0.9);
    nucleus.userData.bodyId = comet.id;
    group.add(nucleus);

    const coma = new THREE.Sprite(new THREE.SpriteMaterial({
      map: dotTexture, color: comet.color, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    coma.scale.setScalar(comet.radius * 8);
    group.add(coma);

    const labelEl = document.createElement('div');
    labelEl.className = `${labelClass} comet-label`;
    labelEl.textContent = comet.short;
    labelEl.addEventListener('click', () => onSelect(comet.id));
    // CSS2DObject는 main.js가 쓰는 Three.js 애드온 생성자로 만든다.
    const cssLabel = makeLabel(labelEl);
    cssLabel.position.set(0, comet.radius * 2.3 + 0.8, 0);
    group.add(cssLabel);

    const orbitLine = makeOrbit(comet, lowPower);
    const ionPos = new Float32Array((lowPower ? 9 : 18) * 3);
    const ionGeo = new THREE.BufferGeometry();
    ionGeo.setAttribute('position', new THREE.BufferAttribute(ionPos, 3));
    const ionTail = new THREE.Line(ionGeo, new THREE.LineBasicMaterial({
      color: 0x65cfff, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    const dustTail = makeDustTail(comet, lowPower, dotTexture);
    scene.add(orbitLine, ionTail, dustTail, group);

    entries.push({
      data: comet, group, tiltGroup: group, mesh: nucleus, label: cssLabel, labelEl,
      orbitLine: null, cometOrbit: orbitLine, ionTail, dustTail, coma,
      gatedMoon: false, moonVis: 1, angle: 0, state: {}, previous: {},
    });
  }
  return entries;
}

const antiSun = new THREE.Vector3();
const velocity = new THREE.Vector3();
const side = new THREE.Vector3();

export function updateComets(entries, jd, elapsed, reducedMotion = false) {
  for (const entry of entries) {
    const { data: comet, group, mesh, coma, ionTail, dustTail, state, previous } = entry;
    cometStateAtJD(comet, jd, state);
    cometStateAtJD(comet, jd - Math.max(0.05, Math.min(6, comet.period / 5000)), previous);
    group.position.copy(state.position);
    if (!reducedMotion) {
      mesh.rotation.x = elapsed * 0.17;
      mesh.rotation.y = elapsed * 0.11;
    }

    const activity = state.activity;
    coma.material.opacity = 0.08 + activity * 0.62;
    coma.scale.setScalar(comet.radius * (4 + activity * 13));

    antiSun.copy(state.position).normalize();
    velocity.copy(state.position).sub(previous.position).normalize();
    side.crossVectors(antiSun, velocity).cross(antiSun).normalize();
    const tailLen = (4 + 33 * activity) * (1 + Math.min(0.55, 1 / Math.max(0.35, state.rAU) * 0.12));

    const ionAttr = ionTail.geometry.attributes.position;
    for (let n = 0; n < ionAttr.count; n++) {
      const u = n / (ionAttr.count - 1);
      const flutter = reducedMotion ? 0 : Math.sin(elapsed * 1.7 + u * 11) * u * 0.16;
      ionAttr.setXYZ(
        n,
        state.position.x + antiSun.x * tailLen * u + side.x * flutter,
        state.position.y + antiSun.y * tailLen * u + side.y * flutter,
        state.position.z + antiSun.z * tailLen * u + side.z * flutter,
      );
    }
    ionAttr.needsUpdate = true;
    ionTail.material.opacity = activity * 0.78;

    const dustAttr = dustTail.geometry.attributes.position;
    for (let n = 0; n < dustAttr.count; n++) {
      const u = n / (dustAttr.count - 1);
      const curve = tailLen * 0.42 * Math.pow(u, 1.45);
      dustAttr.setXYZ(
        n,
        state.position.x + antiSun.x * tailLen * 0.82 * u - velocity.x * curve,
        state.position.y + antiSun.y * tailLen * 0.82 * u - velocity.y * curve,
        state.position.z + antiSun.z * tailLen * 0.82 * u - velocity.z * curve,
      );
    }
    dustAttr.needsUpdate = true;
    dustTail.material.uniforms.uOpacity.value = activity * 0.58;
  }
}

export function cometStats(comet, currentJD) {
  const next = nextPerihelionAfter(comet, currentJD);
  const date = julianToDate(next);
  const year = date.getUTCFullYear();
  return {
    '핵 지름': comet.diameter,
    '공전 주기': comet.period < 5000 ? `${(comet.period / 365.25).toFixed(2)}년` : `약 ${Math.round(comet.period / 365.25).toLocaleString('ko-KR')}년`,
    '근일점 거리': `${comet.q.toFixed(3)} AU`,
    '원일점 거리': `${Math.round(comet.ad).toLocaleString('ko-KR')} AU`,
    '궤도 경사': `${comet.i.toFixed(1)}°${comet.i > 90 ? ' (역행)' : ''}`,
    '최근 근일점': comet.lastPerihelion,
    '다음 근일점': `${year.toLocaleString('ko-KR')}년경 · ${comet.forecastTp ? 'JPL 예측' : '2체 근사'}`,
  };
}
