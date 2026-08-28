// 유명 혜성 — 실제 궤도 요소(a, e, i, Ω, ω, Tp) + 케플러 방정식으로 날짜 기반 위치 계산.
// 행성 궤도는 교육용 원(임의 시작각)이지만, 혜성은 "긴 타원"이 정체성이므로
// 달 위상 패널처럼 실제 날짜에 맞는 위치를 계산한다 (fable5의 ephemeris 방식 이식).
//
// 거리 압축: 행성들의 (실제 AU → 씬 반지름) 앵커를 ln(r) 구간별 선형 보간으로 이어
// 혜성도 같은 압축 공간에 매핑한다. 핼리의 원일점(35 AU)이 해왕성(165) 바로 바깥
// (~173)에 오고, 근일점(0.59 AU)은 수성 궤도(26) 안쪽(~33)으로 파고든다.
//
// 꼬리: 태양 반대 방향(anti-sunward)이 물리적 사실 — 진행 방향과 무관하다.
//   - 이온 꼬리: 태양 정반대로 곧게 뻗는 푸른 꼬리
//   - 먼지 꼬리: 진행 방향 뒤로 굽는 넓고 노르스름한 꼬리
// 길이·밝기는 태양 거리로 결정 → 근일점에서 자라고 원일점에선 맨 핵만 남는다.
// (이 규칙 자체가 오버뷰 과밀 방지 장치이기도 하다)

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const DAY_MS = 86400000;
const jdUTC = (y, mo, d) => Date.UTC(y, mo - 1, d) / DAY_MS + 2440587.5;

// ---------------------------------------------------------------- 혜성 데이터
// els: a(AU), e, i/Om/w(°), TpJD(근일점 통과 시각). periodDays는 init에서 계산.
// 핼리만 다음 회귀 예측일(2061-07-28)에 정확히 닿도록 주기를 역산한다.
export const COMETS = [
  {
    id: 'halley', name: '핼리 혜성', eng: '1P/Halley', emoji: '☄️', type: '혜성',
    radius: 0.3, dist: 0, orbitDays: 0, rotationHours: 52.8, tilt: 0, color: 0x9fd4ff,
    comet: true, tailLen: 30,
    els: { a: 17.834, e: 0.96714, i: 162.2627, Om: 58.42, w: 111.33,
      TpJD: jdUTC(1986, 2, 9), nextTpJD: jdUTC(2061, 7, 28) },
    desc: '76년마다 지구를 찾아오는 세상에서 가장 유명한 혜성이에요. 운이 좋으면 한 사람이 평생 두 번 만날 수 있답니다.',
    stats: {
      '공전 주기': '약 76년',
      '근일점 거리': '0.59 AU (8,800만 km)',
      '원일점 거리': '35.1 AU (해왕성 바깥!)',
      '이심률': '0.967',
      '궤도 기울기': '162.3° (거꾸로 돌아요)',
      '핵 크기': '약 15 × 8 km',
      '지난 방문': '1986년',
    },
    spin: '핼리 혜성은 행성들과 반대 방향으로(역행) 태양을 돌아요. 그런데 꼬리는 나는 방향과 상관없이 언제나 태양 반대쪽을 향한답니다.',
    facts: [
      '기원전 240년부터 중국 기록에 남아 있는 아주 오래된 손님이에요.',
      '1705년 에드먼드 핼리가 "이 혜성은 76년마다 돌아온다"고 처음 알아냈어요.',
      '핼리가 흘린 부스러기가 매년 10월 오리온자리 유성우가 되어 떨어져요.',
      '다음 방문은 2061년 여름 — 그때 여러분은 몇 살일까요?',
    ],
  },
  {
    id: 'encke', name: '엥케 혜성', eng: '2P/Encke', emoji: '💫', type: '혜성',
    radius: 0.24, dist: 0, orbitDays: 0, rotationHours: 11.1, tilt: 0, color: 0xa8e0d0,
    comet: true, tailLen: 13,
    els: { a: 2.215, e: 0.8473, i: 11.34, Om: 334.01, w: 187.28,
      TpJD: jdUTC(2023, 10, 22) },
    desc: '혜성 중에서 가장 빨리 태양을 도는 부지런한 혜성이에요. 3년 4개월마다 한 바퀴씩, 벌써 수천 바퀴를 돌았답니다.',
    stats: {
      '공전 주기': '3.3년 (혜성 중 최단)',
      '근일점 거리': '0.34 AU (수성보다 안쪽)',
      '원일점 거리': '4.1 AU (목성 안쪽)',
      '이심률': '0.848',
      '궤도 기울기': '11.3°',
      '핵 크기': '약 4.8 km',
      '지난 방문': '2023년',
    },
    spin: '태양 곁을 하도 자주 지나서 얼음이 많이 닳았어요. 그래서 꼬리가 짧고 희미한, 나이 많은 혜성이에요.',
    facts: [
      '1786년 프랑스의 메셍이 처음 발견했어요.',
      '이름은 발견자가 아니라 "다시 온다"를 계산으로 맞힌 수학자 엥케에게서 왔어요.',
      '엥케의 부스러기가 매년 11월 황소자리 유성우로 떨어져요.',
      '워낙 자주 와서 지금까지 60번 넘게 관측됐어요.',
    ],
  },
  {
    id: 'c67p', name: '추류모프-게라시멘코', eng: '67P/C-G', emoji: '🦆', type: '혜성',
    radius: 0.22, dist: 0, orbitDays: 0, rotationHours: 12.4, tilt: 0, color: 0xd8c8a0,
    comet: true, tailLen: 12,
    els: { a: 3.457, e: 0.64989, i: 3.8719, Om: 36.33, w: 22.15,
      TpJD: jdUTC(2021, 11, 2) },
    desc: '인류가 처음으로 탐사 로봇을 내려앉힌 혜성이에요. 오리 인형처럼 생긴 두 덩어리가 붙은 모양이랍니다.',
    stats: {
      '공전 주기': '6.4년',
      '근일점 거리': '1.21 AU',
      '원일점 거리': '5.7 AU (목성 근처)',
      '이심률': '0.650',
      '궤도 기울기': '3.9°',
      '핵 크기': '약 4.3 × 4.1 km',
      '지난 방문': '2021년',
    },
    spin: '약 12시간에 한 바퀴 자전해요. 로제타 탐사선이 2년 동안 곁을 돌며 지켜봤어요.',
    facts: [
      '2014년 로제타 탐사선이 10년을 날아가 이 혜성에 도착했어요.',
      '착륙 로봇 필래가 사상 처음으로 혜성 표면에 내려앉았어요.',
      '1969년 천문학자 추류모프와 게라시멘코가 발견했어요.',
      '오리 모양은 작은 혜성 두 개가 아주 천천히 부딪혀 붙은 거래요.',
    ],
  },
  {
    id: 'halebopp', name: '헤일-밥 혜성', eng: 'C/1995 O1', emoji: '🌠', type: '혜성',
    radius: 0.34, dist: 0, orbitDays: 0, rotationHours: 11.35, tilt: 0, color: 0xcfe0ff,
    comet: true, tailLen: 36,
    els: { a: 177.43, e: 0.995108, i: 89.43, Om: 282.471, w: 130.591,
      TpJD: jdUTC(1997, 4, 1) },
    desc: '1997년 온 세상 밤하늘을 밝힌 "세기의 혜성"이에요. 무려 18개월 동안 맨눈으로 보여서 기록을 세웠어요.',
    stats: {
      '공전 주기': '약 2,400년',
      '근일점 거리': '0.91 AU (지구 궤도 근처)',
      '원일점 거리': '약 370 AU',
      '이심률': '0.995',
      '궤도 기울기': '89.4° (거의 수직!)',
      '핵 크기': '약 60 km (혜성 중 최대급)',
      '지난 방문': '1997년',
    },
    spin: '궤도가 행성들의 판에 거의 수직으로 세워져 있어요. 태양계를 위아래로 가로질러 다니는 셈이에요.',
    facts: [
      '1995년 헤일과 밥, 두 사람이 같은 밤에 각자 발견했어요.',
      '핵의 지름이 60km — 보통 혜성의 10배가 넘는 왕혜성이에요.',
      '파란 가스 꼬리와 하얀 먼지 꼬리 두 개가 또렷이 보였어요.',
      '다음 방문은 약 2,400년 뒤 — 서기 4300년대 사람들이 보게 될 거예요.',
    ],
  },
  {
    id: 'neowise', name: '네오와이즈 혜성', eng: 'C/2020 F3', emoji: '📡', type: '혜성',
    radius: 0.26, dist: 0, orbitDays: 0, rotationHours: 7.9, tilt: 0, color: 0xffd9a0,
    comet: true, tailLen: 28,
    els: { a: 358.5, e: 0.999178, i: 128.937, Om: 61.01, w: 37.279,
      TpJD: jdUTC(2020, 7, 3) },
    desc: '2020년 여름 새벽 하늘을 수놓은 황금빛 혜성이에요. 우주 망원경 네오와이즈가 발견해서 같은 이름이 붙었어요.',
    stats: {
      '공전 주기': '약 6,800년',
      '근일점 거리': '0.29 AU (수성보다 안쪽)',
      '원일점 거리': '약 710 AU',
      '이심률': '0.9992',
      '궤도 기울기': '128.9° (거꾸로 돌아요)',
      '핵 크기': '약 5 km',
      '지난 방문': '2020년',
    },
    spin: '이 혜성도 행성들과 반대 방향으로 돌아요. 태양 곁을 지날 때 긴 황금 먼지 꼬리와 파란 가스 꼬리를 함께 펼쳤어요.',
    facts: [
      '헤일-밥 이후 북반구에서 가장 밝았던 혜성이에요.',
      '적외선 우주 망원경 "네오와이즈"가 2020년 3월에 발견했어요.',
      '전 세계 사람들이 새벽하늘로 나가 황금 꼬리를 사진에 담았어요.',
      '이번에 놓쳤다면 다음 기회는 약 6,800년 뒤예요.',
    ],
  },
];

// ---------------------------------------------------------------- 궤도 수학
// 행성 (실제 AU → 씬 반지름) 앵커 — data.js의 압축 스케일과 동일
const ANCHORS = [
  [0.387, 26], [0.723, 36], [1.0, 47], [1.524, 60],
  [5.203, 88], [9.537, 116], [19.19, 142], [30.07, 165],
];
// ln(r) 구간별 선형 보간 + 양끝 외삽 → 단조 증가, 행성 사이에 자연스럽게 끼어든다
export function compressAU(r) {
  const x = Math.log(Math.max(r, 0.02));
  let i = 0;
  while (i < ANCHORS.length - 2 && x > Math.log(ANCHORS[i + 1][0])) i++;
  const x0 = Math.log(ANCHORS[i][0]), x1 = Math.log(ANCHORS[i + 1][0]);
  const y0 = ANCHORS[i][1], y1 = ANCHORS[i + 1][1];
  return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
}

// 케플러 방정식 M = E - e·sinE — 브래킷 뉴턴 (e≥0.99에서도 안전하게 수렴)
export function solveKepler(M, e) {
  M = ((M % TAU) + TAU) % TAU;
  let lo = 0, hi = TAU;
  let E = e < 0.8 ? M : Math.PI;
  for (let k = 0; k < 60; k++) {
    const f = E - e * Math.sin(E) - M;
    if (Math.abs(f) < 1e-10) break;
    if (f > 0) hi = E; else lo = E;
    E -= f / (1 - e * Math.cos(E));
    if (!(E > lo && E < hi)) E = (lo + hi) / 2; // 뉴턴이 튀면 이분법
  }
  return E;
}

// 황도 좌표(x=춘분점, z=북쪽) → 씬 좌표(XZ 평면, +Y 위, 위에서 봐서 CCW = 순행)
function eclToScene(out, x, y, z, scale) {
  return out.set(x * scale, z * scale, -y * scale);
}

// ---------------------------------------------------------------- 초기화
export function initComets(ctx) {
  const { scene, bodyMap, clickables, flowMats, flowMaterial, renderer, LOW_POWER, REDUCED, selectBody } = ctx;

  const ORBIT_N = LOW_POWER ? 256 : 384;
  const ION_N = LOW_POWER ? 220 : 560;
  const DUST_N = LOW_POWER ? 170 : 420;

  // 결정적 해시 — 새로고침해도 같은 모습 (moon-textures.js와 같은 방식)
  const hash = (a, b, c = 0) => {
    const h = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
    return h - Math.floor(h);
  };

  // 소프트 원형 파티클 텍스처 (main.js softDot과 동일 발상)
  function softTex(edge = 1) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.25, 'rgba(255,255,255,0.7)');
    rg.addColorStop(edge, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  const dotTex = softTex();

  // 코마(핵 주변 뿌연 빛) 스프라이트 텍스처
  function comaTex() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(64, 64, 2, 64, 64, 64);
    rg.addColorStop(0, 'rgba(255,255,255,0.95)');
    rg.addColorStop(0.22, 'rgba(210,235,255,0.5)');
    rg.addColorStop(0.6, 'rgba(160,200,255,0.14)');
    rg.addColorStop(1, 'rgba(120,170,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }
  const glowTex = comaTex();

  // 혜성 핵 표면 — 아주 어두운 얼음+먼지 (프로시저럴 캔버스)
  function nucleusTexture(seed) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#5c574e';
    g.fillRect(0, 0, 128, 64);
    for (let i = 0; i < 90; i++) {
      const x = hash(i, 0, seed) * 128, y = hash(i, 1, seed) * 64;
      const r = 2 + hash(i, 2, seed) * 10;
      const v = 60 + hash(i, 3, seed) * 60;
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, `rgba(${v},${v - 4},${v - 10},0.55)`);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg;
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // 울퉁불퉁한 감자 모양 핵 (위치 기반 결정적 해시 → 이음새 안전)
  function nucleusGeometry(r, seed) {
    const geo = new THREE.SphereGeometry(r, 18, 12);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const h = hash(Math.round(v.x * 991) / 991, Math.round(v.y * 991) / 991,
        seed + Math.round(v.z * 991) / 991);
      const s = 1 + (h - 0.5) * 0.5;
      pos.setXYZ(i, v.x * s, v.y * s, v.z * s);
    }
    geo.computeVertexNormals();
    return geo;
  }

  // ---------------------------------------------------------------- 꼬리 셰이더
  // 위치를 전부 버텍스 셰이더에서 계산 → CPU는 프레임당 유니폼 몇 개만 갱신
  const TAIL_VERT = /* glsl */`
    attribute float aT;      // 꼬리 길이 방향 0(핵)~1(끝)
    attribute vec3 aRnd;     // (측면1, 측면2, 위상)
    uniform vec3 uApex;      // 혜성 위치 (월드)
    uniform vec3 uAnti;      // 태양 반대 방향 (단위)
    uniform vec3 uB1, uB2;   // 측면 기저
    uniform vec3 uCurveDir;  // 먼지 꼬리 굽는 방향 (진행 반대, 궤도면 안)
    uniform float uLen, uWidth, uBend, uTime, uStream, uScale, uSize;
    varying float vFade;
    void main() {
      float t = aT;
      // 핵에서 흘러나가는 스트리밍 (모션 최소화 설정이면 정지)
      t = fract(t + uTime * uStream * (0.05 + 0.05 * aRnd.z));
      float w = uWidth * uLen * (0.05 + t);
      vec3 p = uApex
        + uAnti * (t * uLen)
        + uB1 * (aRnd.x * w)
        + uB2 * (aRnd.y * w)
        + uCurveDir * (uBend * uLen * t * t);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      float ws = uSize * (0.4 + 1.9 * t);                       // 월드 크기
      gl_PointSize = min(ws * uScale / max(0.5, -mv.z), 80.0);  // 근접 시 픽셀 폭 제한
      vFade = (1.0 - t) * (1.0 - t);
    }`;
  const TAIL_FRAG = /* glsl */`
    uniform vec3 uColor;
    uniform float uAct;
    uniform sampler2D uMap;
    varying float vFade;
    void main() {
      float a = texture2D(uMap, gl_PointCoord).a;
      float b = vFade * uAct;
      gl_FragColor = vec4(uColor * b, b * a);
    }`;

  // 이온 꼬리 "빛줄기" 코어 — 파티클만으론 근접 시 방울방울 끊겨 보여서,
  // 부드러운 원뿔 글로우를 깔아 연속된 광선으로 읽히게 한다 (코로나와 같은 림 셰이딩)
  const coreGeo = (() => {
    const g = new THREE.CylinderGeometry(1, 0.02, 1, LOW_POWER ? 10 : 16, 1, true);
    g.translate(0, 0.5, 0); // 좁은 끝(핵)이 원점, +Y로 퍼진다
    return g;
  })();
  const CORE_VERT = /* glsl */`
    varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main() {
      vUv = uv;
      vN = normalize(normalMatrix * normal);
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`;
  const CORE_FRAG = /* glsl */`
    uniform vec3 uColor;
    uniform float uAct;
    varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main() {
      float along = pow(1.0 - vUv.y, 1.6);            // 핵 쪽이 밝고 끝으로 스러진다
      float rim = abs(dot(normalize(vN), vV));         // 실루엣 가장자리 소프트
      float b = along * pow(rim, 1.3) * uAct * 0.55;
      gl_FragColor = vec4(uColor * b, b);
    }`;
  function makeCore(color) {
    const mesh = new THREE.Mesh(coreGeo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(color) }, uAct: { value: 0 } },
      vertexShader: CORE_VERT, fragmentShader: CORE_FRAG,
    }));
    mesh.frustumCulled = false;
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  }

  function makeTail(n, color, width, bend, size) {
    const pos = new Float32Array(n * 3); // 실제 위치는 셰이더가 계산 — 버퍼는 자리만
    const ts = new Float32Array(n);
    const rnd = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // 층화 샘플링(뭉침 방지) + 핵 쪽에 촘촘하게
      ts[i] = Math.pow((i + hash(i, 7, n)) / n, 0.75);
      // 가우시안 근사 측면 퍼짐 (두 해시 평균)
      rnd[i * 3] = (hash(i, 11, n) + hash(i, 13, n) - 1);
      rnd[i * 3 + 1] = (hash(i, 17, n) + hash(i, 19, n) - 1);
      rnd[i * 3 + 2] = hash(i, 23, n);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aT', new THREE.BufferAttribute(ts, 1));
    geo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 3));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
      uniforms: {
        uApex: { value: new THREE.Vector3() },
        uAnti: { value: new THREE.Vector3(1, 0, 0) },
        uB1: { value: new THREE.Vector3(0, 1, 0) },
        uB2: { value: new THREE.Vector3(0, 0, 1) },
        uCurveDir: { value: new THREE.Vector3() },
        uLen: { value: 1 }, uWidth: { value: width }, uBend: { value: bend },
        uTime: { value: 0 }, uStream: { value: REDUCED ? 0 : 1 },
        uScale: { value: 400 }, uSize: { value: size },
        uColor: { value: new THREE.Color(color) },
        uAct: { value: 0 },
        uMap: { value: dotTex },
      },
      vertexShader: TAIL_VERT, fragmentShader: TAIL_FRAG,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false; // 지오메트리 바운드가 원점 — 컬링 금지
    pts.visible = false;
    scene.add(pts);
    return pts;
  }

  // ---------------------------------------------------------------- 혜성 생성
  const list = [];

  for (const d of COMETS) {
    const els = d.els;
    // 주기: 핼리는 다음 회귀 예측일에 정확히 닿게 역산, 나머지는 케플러 제3법칙
    els.periodDays = els.nextTpJD
      ? els.nextTpJD - els.TpJD
      : Math.pow(els.a, 1.5) * 365.25;

    // PQW → 황도 회전 기저 (fable5 planetHelio와 동일한 표준 회전)
    const cw = Math.cos(els.w * DEG), sw = Math.sin(els.w * DEG);
    const cO = Math.cos(els.Om * DEG), sO = Math.sin(els.Om * DEG);
    const ci = Math.cos(els.i * DEG), si = Math.sin(els.i * DEG);
    const P = [cw * cO - sw * sO * ci, cw * sO + sw * cO * ci, sw * si];
    const Q = [-sw * cO - cw * sO * ci, -sw * sO + cw * cO * ci, cw * si];

    // 황도 좌표(AU) — out에 (x, y, z)ecl
    function helioEcl(out, jd) {
      const M = TAU * ((jd - els.TpJD) / els.periodDays);
      const E = solveKepler(M, els.e);
      const xp = els.a * (Math.cos(E) - els.e);
      const yp = els.a * Math.sqrt(1 - els.e * els.e) * Math.sin(E);
      return out.set(
        P[0] * xp + Q[0] * yp,
        P[1] * xp + Q[1] * yp,
        P[2] * xp + Q[2] * yp,
      );
    }
    // 씬 좌표 — 방향 유지, 반지름만 압축
    function helioScene(out, jd) {
      helioEcl(out, jd);
      const r = out.length();
      const s = compressAU(r) / Math.max(r, 1e-9);
      return eclToScene(out, out.x, out.y, out.z, s);
    }

    // ----- 궤도선: 진근점이각 균등 샘플 → 씬 좌표, 호길이 테이블(aT) 구축
    const pts = [];
    for (let k = 0; k <= ORBIT_N; k++) {
      const nu = (k / ORBIT_N) * TAU;
      const r = els.a * (1 - els.e * els.e) / (1 + els.e * Math.cos(nu));
      const xp = r * Math.cos(nu), yp = r * Math.sin(nu);
      const ex = P[0] * xp + Q[0] * yp, ey = P[1] * xp + Q[1] * yp, ez = P[2] * xp + Q[2] * yp;
      const rr = Math.sqrt(ex * ex + ey * ey + ez * ez);
      const s = compressAU(rr) / Math.max(rr, 1e-9);
      pts.push(eclToScene(new THREE.Vector3(), ex, ey, ez, s));
    }
    const sTable = new Float32Array(ORBIT_N + 1);
    let total = 0;
    for (let k = 1; k <= ORBIT_N; k++) {
      total += pts[k].distanceTo(pts[k - 1]);
      sTable[k] = total;
    }
    for (let k = 0; k <= ORBIT_N; k++) sTable[k] /= total;

    const oPos = new Float32Array((ORBIT_N + 1) * 3);
    const oT = new Float32Array(ORBIT_N + 1);
    for (let k = 0; k <= ORBIT_N; k++) {
      oPos.set([pts[k].x, pts[k].y, pts[k].z], k * 3);
      oT[k] = sTable[k];
    }
    const oGeo = new THREE.BufferGeometry();
    oGeo.setAttribute('position', new THREE.BufferAttribute(oPos, 3));
    oGeo.setAttribute('aT', new THREE.BufferAttribute(oT, 1));
    const orbitLine = new THREE.Line(oGeo, flowMaterial(d.color, 0.6));
    orbitLine.userData.baseOpacity = 0.6;
    orbitLine.material.uniforms.uOpacity.value = 0; // 조용히 시작 — 선택/근접/활동 시 페이드인
    orbitLine.material.uniforms.uPulses.value = 3;
    flowMats.push(orbitLine.material);
    scene.add(orbitLine);

    // ----- 핵 + 픽킹 + 코마 + 라벨
    const group = new THREE.Group();
    const seed = d.id.length * 3.7 + d.radius * 91;
    const mesh = new THREE.Mesh(
      nucleusGeometry(d.radius, seed),
      new THREE.MeshStandardMaterial({
        map: nucleusTexture(seed), roughness: 1, metalness: 0,
        emissive: new THREE.Color(0x9aa0a8), emissiveIntensity: 0.16,
      }),
    );
    mesh.userData.bodyId = d.id;
    group.add(mesh);
    clickables.push(mesh);

    // 손가락 픽킹용 투명 히트 스피어 (핵이 너무 작아서)
    const pick = new THREE.Mesh(
      new THREE.SphereGeometry(1.15, 8, 6),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    pick.userData.bodyId = d.id;
    group.add(pick);
    clickables.push(pick);

    const coma = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
      color: new THREE.Color(d.color).lerp(new THREE.Color(0xffffff), 0.5),
    }));
    coma.scale.setScalar(d.radius * 3);
    group.add(coma);

    const labelEl = document.createElement('div');
    labelEl.className = 'body-label moon-label comet-label';
    labelEl.textContent = d.name;
    labelEl.addEventListener('click', () => selectBody(d.id));
    const label = new CSS2DObject(labelEl);
    label.position.set(0, 1.7, 0);
    group.add(label);
    scene.add(group);

    // ----- 꼬리 두 개: 곧은 푸른 이온 꼬리 + 굽는 노르스름한 먼지 꼬리
    const ion = makeTail(ION_N, 0x7fc4ff, 0.10, 0.02, 0.55);
    const dust = makeTail(DUST_N, 0xffdca4, 0.3, 0.4, 0.8);
    const ionCore = makeCore(0x6ab4ff);

    const c = {
      d, els, helioEcl, helioScene, group, mesh, coma, orbitLine, sTable,
      ion, dust, ionCore, labelEl,
      vis: 0, // moonVis에 해당하는 과밀 방지 페이드
      state: { rAU: 99, act: 0, nu: 0 },
      tmpA: new THREE.Vector3(), tmpB: new THREE.Vector3(),
      anti: new THREE.Vector3(1, 0, 0), velDir: new THREE.Vector3(0, 0, 1),
      b1: new THREE.Vector3(), b2: new THREE.Vector3(), curveDir: new THREE.Vector3(),
    };
    list.push(c);

    // bodyMap 등록 — 기존 선택/카메라/패널 파이프라인에 그대로 올라탄다
    const entry = bodyMap.get(d.id) || {};
    Object.assign(entry, {
      data: d, group, tiltGroup: group, mesh, label, labelEl, orbitLine,
      gatedMoon: false, moonVis: 1, comet: true, angle: 0, cometRef: c,
    });
    bodyMap.set(d.id, entry);
  }

  const UP_Y = new THREE.Vector3(0, 1, 0);

  // 시간 분율(진근점이각) → 호길이 분율
  function arcFrac(sTable, nu) {
    const N = sTable.length - 1;
    const x = (((nu / TAU) % 1) + 1) % 1 * N;
    const i = Math.floor(x), t = x - i;
    return sTable[Math.min(i, N)] * (1 - t) + sTable[Math.min(i + 1, N)] * t;
  }

  const smooth01 = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);

  // ---------------------------------------------------------------- 프레임 갱신
  // jd: 시뮬레이션 율리우스일, t: 셰이더 시계, selected: 현재 선택된 bodyMap 엔트리
  function update(jd, t, dt, camera, selected, prox) {
    const hScale = renderer.domElement.height * 0.5;
    for (const c of list) {
      const els = c.els;
      // 현재 위치
      const pos = c.helioScene(c.tmpA, jd);
      c.group.position.copy(pos);
      const M = TAU * ((jd - els.TpJD) / els.periodDays);
      const E = solveKepler(M, els.e);
      const nu = Math.atan2(
        Math.sqrt(1 - els.e * els.e) * Math.sin(E),
        Math.cos(E) - els.e,
      );
      const rAU = els.a * (1 - els.e * Math.cos(E));
      c.state.rAU = rAU;
      c.state.nu = nu;

      // 진행 방향 (씬 공간 유한차분 — 주기에 비례한 스텝)
      const step = THREE.MathUtils.clamp(els.periodDays / 20000, 0.2, 200);
      const prev = c.helioScene(c.tmpB, jd - step);
      c.velDir.copy(pos).sub(prev);
      if (c.velDir.lengthSq() > 1e-12) c.velDir.normalize();

      // 태양 반대 방향 (태양은 원점) — 꼬리의 물리
      c.anti.copy(pos).normalize();
      // 측면 기저: 궤도면 밖 / 안
      c.b1.crossVectors(c.anti, c.velDir);
      if (c.b1.lengthSq() < 1e-8) c.b1.set(0, 1, 0).cross(c.anti);
      c.b1.normalize();
      c.b2.crossVectors(c.anti, c.b1).normalize();
      // 먼지 꼬리가 굽는 방향: 진행 반대 성분 (궤도면 안)
      c.curveDir.copy(c.velDir).addScaledVector(c.anti, -c.velDir.dot(c.anti)).negate();
      if (c.curveDir.lengthSq() > 1e-8) c.curveDir.normalize();

      // 활동도: 태양에 다가올수록 깨어난다 (원일점에선 맨 핵)
      const act = 1 - smooth01(rAU, 1.15, 3.9);
      const actL = Math.pow(act, 1.35);
      const comaAct = 1 - smooth01(rAU, 1.5, 5.5);
      c.state.act = act;

      const dist = camera.position.distanceTo(pos);
      const isSel = selected && selected.data.id === c.d.id;
      // 카메라가 이 혜성 곁에 있으면 자기 꼬리는 죽이지 않는다 —
      // prox 페이드는 "다른 천체를 구경하는 중" 보호용
      const nearMe = dist < 12;
      const fade = nearMe ? 1 : 1 - 0.75 * prox;

      // 과밀 방지 페이드 (moonVis 전례): 선택 / 근접 / 활동 시에만 궤도선 표시
      const target = Math.max(isSel ? 1 : 0, 1 - smooth01(dist, 70, 130), act * 0.9);
      c.vis += (target - c.vis) * (1 - Math.exp(-4 * dt));

      // 라벨: 항상 은은하게 (발견 가능), 관련 있을 때 밝게
      const labelO = THREE.MathUtils.clamp(1.35 - dist / 600, 0.35, 1) * (0.5 + 0.5 * c.vis);
      c.labelEl.style.opacity = labelO.toFixed(2);

      // 궤도선
      const ou = c.orbitLine.material.uniforms;
      ou.uOpacity.value = c.orbitLine.userData.baseOpacity * c.vis * (1 - 0.7 * prox);
      ou.uHead.value = arcFrac(c.sTable, nu);

      // 코마 — 태양 거리로 커지고, 핵 코앞에선 살짝 비켜서 표면이 보이게
      const comaNear = 0.3 + 0.7 * smooth01(dist, 2.5, 12);
      c.coma.material.opacity = 0.5 * comaAct * fade * comaNear;
      c.coma.scale.setScalar(c.d.radius * (3 + 8 * comaAct));

      // 꼬리 유니폼
      const Lion = c.d.tailLen * actL;
      const Ldust = c.d.tailLen * 0.62 * actL;
      for (const [pts, L, actMul] of [[c.ion, Lion, 1], [c.dust, Ldust, 0.85]]) {
        const u = pts.material.uniforms;
        u.uApex.value.copy(pos);
        u.uAnti.value.copy(c.anti);
        u.uB1.value.copy(c.b1);
        u.uB2.value.copy(c.b2);
        u.uCurveDir.value.copy(c.curveDir);
        u.uLen.value = Math.max(L, 0.001);
        u.uTime.value = t * 0.5;
        u.uScale.value = hScale;
        u.uAct.value = act * actMul * fade;
        pts.visible = act > 0.01 && fade > 0.02;
      }
      // 이온 꼬리 코어 원뿔 — 핵에서 태양 반대쪽으로
      c.ionCore.position.copy(pos);
      c.ionCore.quaternion.setFromUnitVectors(UP_Y, c.anti);
      c.ionCore.scale.set(Lion * 0.14 + 0.001, Lion + 0.001, Lion * 0.14 + 0.001);
      c.ionCore.material.uniforms.uAct.value = act * fade;
      c.ionCore.visible = act > 0.01 && fade > 0.02;
    }
  }

  // 다음 근일점 (jd 이후 첫 통과)
  function nextPerihelionJD(id, jd) {
    const c = list.find((x) => x.d.id === id);
    if (!c) return jd;
    const { TpJD, periodDays } = c.els;
    let tp = TpJD + Math.ceil((jd - TpJD) / periodDays) * periodDays;
    if (tp <= jd + 1e-6) tp += periodDays;
    return tp;
  }

  // 검증용 — 꼬리 방향/역행/이심 궤도 수치 확인
  function debug(id, jd) {
    const c = list.find((x) => x.d.id === id);
    if (!c) return null;
    const pos = c.group.position;
    const anti = c.ion.material.uniforms.uAnti.value;
    const len = c.ion.material.uniforms.uLen.value;
    // 이온 꼬리 끝점 → 꼬리 방향과 (혜성→태양) 방향 사이 각도 (180°가 정답)
    const tip = pos.clone().addScaledVector(anti, Math.max(len, 1));
    const tailDir = tip.clone().sub(pos).normalize();
    const toSun = pos.clone().negate().normalize();
    const tailAngle = Math.acos(THREE.MathUtils.clamp(tailDir.dot(toSun), -1, 1)) / DEG;
    // 먼지 꼬리 끝점 각도 (굽어서 180°보다 작아야 함)
    const du = c.dust.material.uniforms;
    const dTip = pos.clone()
      .addScaledVector(du.uAnti.value, du.uLen.value)
      .addScaledVector(du.uCurveDir.value, du.uBend.value * du.uLen.value);
    const dustAngle = Math.acos(THREE.MathUtils.clamp(
      dTip.sub(pos).normalize().dot(toSun), -1, 1)) / DEG;
    // 황도 공간 각운동량 z성분 부호 — 순행 +, 역행 - (핼리·네오와이즈는 음수여야 함)
    const e0 = c.helioEcl(new THREE.Vector3(), jd ?? 0);
    const e1 = c.helioEcl(new THREE.Vector3(), (jd ?? 0) + 1);
    const Lz = e0.x * (e1.y - e0.y) - e0.y * (e1.x - e0.x);
    return {
      rAU: +c.state.rAU.toFixed(3),
      act: +c.state.act.toFixed(3),
      sceneR: +pos.length().toFixed(1),
      yOff: +pos.y.toFixed(1),
      tailAngleDeg: +tailAngle.toFixed(2),
      dustAngleDeg: +dustAngle.toFixed(2),
      dustLagDot: +du.uCurveDir.value.dot(c.velDir).toFixed(3),
      ionLen: +len.toFixed(2),
      prograde: Lz > 0,
      vis: +c.vis.toFixed(2),
    };
  }

  return { update, nextPerihelionJD, debug, ids: COMETS.map((d) => d.id) };
}
