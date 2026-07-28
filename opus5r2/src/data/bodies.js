/**
 * data/bodies.js — 태양 + 8행성 + 달의 과학 데이터 (한국어)
 *
 * 수치는 NASA Planetary Fact Sheet 기준의 실제 값이다.
 *  - diameterKm      : 적도 지름 (km)
 *  - massKg          : 질량 (kg)
 *  - massEarth       : 지구 = 1
 *  - distanceKm      : 태양까지의 평균 거리 (달은 지구까지)
 *  - distanceAu      : 태양까지의 평균 거리 (AU) — 씬 배치의 기준
 *  - orbitalPeriodD  : 공전 주기 (일)
 *  - rotationHours   : 자전 주기 (시간). 음수 = 역자전(시계 방향)
 *  - axialTiltDeg    : 자전축 기울기 (도)
 *  - meanTempC       : 평균 표면 온도 (°C)
 *  - moons           : 위성 수
 *  - gravity         : 표면 중력 (지구 = 1)
 */

export const KO_UNITS = {
  km: 'km',
  day: '일',
  hour: '시간',
  deg: '°',
  c: '°C',
};

/** 큰 수를 한국어 단위(억/만)로 예쁘게 */
export function formatKoreanNumber(n) {
  const abs = Math.abs(n);
  if (abs >= 1e8) {
    const eok = n / 1e8;
    return `${eok.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}억`;
  }
  if (abs >= 1e4) {
    const man = n / 1e4;
    return `${man.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}만`;
  }
  return n.toLocaleString('ko-KR', { maximumFractionDigits: 1 });
}

export const SUN = {
  key: 'sun',
  nameKo: '태양',
  nameEn: 'Sun',
  type: '항성 (별)',
  emoji: '☀️',
  color: '#ffb347',
  labelColor: '#ffd08a',
  diameterKm: 1392700,
  massKg: 1.989e30,
  massEarth: 333000,
  distanceKm: 0,
  distanceAu: 0,
  orbitalPeriodD: null,
  rotationHours: 609.12, // 적도 기준 25.38일
  axialTiltDeg: 7.25,
  meanTempC: 5500,
  moons: 8,
  gravity: 27.9,
  tagline:
    '태양계에서 유일하게 스스로 빛을 내는 별이에요. 태양계 전체 무게의 99.8%가 태양 하나예요.',
  facts: [
    '태양 속에서는 1초마다 수소 6억 톤이 헬륨으로 바뀌면서 빛과 열이 만들어져요.',
    '태양빛이 지구까지 오는 데 약 8분 20초가 걸려요. 우리가 보는 햇빛은 8분 전의 빛이에요.',
    '태양 안에 지구를 130만 개나 넣을 수 있어요.',
    '태양은 가스 덩어리라서 적도는 25일, 극지방은 35일 만에 한 바퀴 돌아요. 부분마다 속도가 달라요!',
  ],
  spinNote:
    '태양은 반시계 방향(지구에서 볼 때 북쪽 위에서 내려다본 기준)으로 약 25일에 한 바퀴 자전해요.',
  textures: { map: 'sun' },
};

export const PLANETS = [
  {
    key: 'mercury',
    nameKo: '수성',
    nameEn: 'Mercury',
    type: '암석 행성',
    emoji: '🪨',
    color: '#9c8b7d',
    labelColor: '#cbbcae',
    diameterKm: 4879,
    massKg: 3.3011e23,
    massEarth: 0.055,
    distanceKm: 5.791e7,
    distanceAu: 0.38709927,
    orbitalPeriodD: 87.969,
    rotationHours: 1407.6,
    axialTiltDeg: 0.034,
    meanTempC: 167,
    moons: 0,
    gravity: 0.38,
    tagline:
      '태양에 가장 가까운, 가장 작은 행성이에요. 낮에는 펄펄 끓고 밤에는 꽁꽁 얼어붙어요.',
    facts: [
      '낮에는 430°C, 밤에는 -180°C예요. 하루 사이 온도 차가 600도가 넘어요!',
      '공기(대기)가 거의 없어서 하늘이 낮에도 까맣게 보여요.',
      '수성의 하루(자전 59일)가 1년(공전 88일)의 3분의 2나 돼요.',
      '달처럼 운석 구덩이(크레이터)로 뒤덮여 있어요.',
    ],
    spinNote:
      '공전도 자전도 모두 반시계 방향이지만, 자전이 아주 느려서 한 바퀴 도는 데 59일이 걸려요.',
    textures: { map: 'mercury' },
  },
  {
    key: 'venus',
    nameKo: '금성',
    nameEn: 'Venus',
    type: '암석 행성',
    emoji: '🌕',
    color: '#e6c07a',
    labelColor: '#f4d79b',
    diameterKm: 12104,
    massKg: 4.8675e24,
    massEarth: 0.815,
    distanceKm: 1.082e8,
    distanceAu: 0.72333566,
    orbitalPeriodD: 224.701,
    rotationHours: -5832.5, // 역자전
    axialTiltDeg: 177.4,
    meanTempC: 464,
    moons: 0,
    gravity: 0.91,
    tagline:
      '크기가 지구와 거의 같아서 "지구의 쌍둥이"라고 불려요. 하지만 태양계에서 가장 뜨거운 행성이에요.',
    facts: [
      '금성은 하루(243일)가 1년(225일)보다 길어요! 자전이 공전보다 느려요.',
      '두꺼운 이산화탄소 구름이 열을 가둬서 표면이 464°C예요. 납도 녹아버려요.',
      '다른 행성과 반대로, 거꾸로(시계 방향) 자전해요. 금성에서는 해가 서쪽에서 떠요.',
      '초저녁 서쪽 하늘에서 가장 밝게 보이는 별이 바로 금성이에요. "샛별"이라고 불러요.',
    ],
    spinNote:
      '공전은 반시계 방향이지만 자전은 반대인 시계 방향(역자전)이에요. 그래서 해가 서쪽에서 떠서 동쪽으로 져요.',
    textures: { map: 'venus', clouds: 'venusClouds' },
  },
  {
    key: 'earth',
    nameKo: '지구',
    nameEn: 'Earth',
    type: '암석 행성 · 우리 집',
    emoji: '🌍',
    color: '#4b93d1',
    labelColor: '#8ec8f5',
    diameterKm: 12756,
    massKg: 5.9724e24,
    massEarth: 1,
    distanceKm: 1.496e8,
    distanceAu: 1.00000261,
    orbitalPeriodD: 365.256,
    rotationHours: 23.9345,
    axialTiltDeg: 23.44,
    meanTempC: 15,
    moons: 1,
    gravity: 1,
    tagline:
      '우리가 사는 행성이에요. 지금까지 알려진 우주에서 생명이 사는 유일한 곳이에요.',
    facts: [
      '표면의 71%가 바다예요. 그래서 우주에서 보면 파랗게 보여요.',
      '자전축이 23.4° 기울어져 있어서 봄·여름·가을·겨울이 생겨요.',
      '두꺼운 대기와 자기장이 우주에서 오는 해로운 빛과 돌덩이를 막아 줘요.',
      '지구는 1초에 약 30km씩 태양 주위를 달리고 있어요. 총알보다 30배 빨라요!',
    ],
    spinNote:
      '북극 위에서 내려다보면 공전도 자전도 모두 반시계 방향이에요. 그래서 해가 동쪽에서 떠요.',
    textures: {
      map: 'earth',
      night: 'earthNight',
      clouds: 'earthClouds',
    },
  },
  {
    key: 'mars',
    nameKo: '화성',
    nameEn: 'Mars',
    type: '암석 행성',
    emoji: '🔴',
    color: '#c1502e',
    labelColor: '#e58a6b',
    diameterKm: 6792,
    massKg: 6.4171e23,
    massEarth: 0.107,
    distanceKm: 2.279e8,
    distanceAu: 1.52371034,
    orbitalPeriodD: 686.98,
    rotationHours: 24.6229,
    axialTiltDeg: 25.19,
    meanTempC: -65,
    moons: 2,
    gravity: 0.38,
    tagline:
      '흙에 녹슨 철이 많아서 붉게 보여요. 사람이 가장 먼저 가 볼 행성으로 꼽혀요.',
    facts: [
      '태양계에서 가장 높은 산 "올림푸스 화산"이 있어요. 높이 22km, 에베레스트의 2.5배!',
      '하루가 24시간 37분이라 지구와 거의 같아요.',
      '옛날에는 강과 바다가 있었던 흔적이 남아 있어요.',
      '포보스와 데이모스라는 감자처럼 생긴 작은 위성 두 개가 있어요.',
    ],
    spinNote:
      '지구처럼 반시계 방향으로 공전하고 자전해요. 자전축 기울기도 25°로 지구와 비슷해서 계절이 있어요.',
    textures: { map: 'mars' },
  },
  {
    key: 'jupiter',
    nameKo: '목성',
    nameEn: 'Jupiter',
    type: '가스 행성',
    emoji: '🌀',
    color: '#c8a273',
    labelColor: '#e6c79b',
    diameterKm: 139820,
    massKg: 1.8982e27,
    massEarth: 317.8,
    distanceKm: 7.786e8,
    distanceAu: 5.202887,
    orbitalPeriodD: 4332.589,
    rotationHours: 9.9259,
    axialTiltDeg: 3.13,
    meanTempC: -110,
    moons: 95,
    gravity: 2.53,
    tagline:
      '태양계에서 가장 큰 행성이에요. 나머지 행성을 모두 합친 것보다 2배 넘게 무거워요.',
    facts: [
      '"대적점"이라는 거대한 소용돌이 폭풍이 350년 넘게 불고 있어요. 지구가 통째로 들어가요.',
      '가장 빨리 도는 행성이에요. 그렇게 큰데도 10시간이면 한 바퀴!',
      '땅이 없어요. 대부분 수소와 헬륨 가스라서 발을 디딜 수 없어요.',
      '위성이 95개나 있어요. 그중 가니메데는 수성보다도 커요.',
    ],
    spinNote:
      '반시계 방향으로 아주 빠르게 자전해요(9시간 56분). 너무 빨라서 적도 부분이 볼록하게 부풀어 있어요.',
    textures: { map: 'jupiter' },
  },
  {
    key: 'saturn',
    nameKo: '토성',
    nameEn: 'Saturn',
    type: '가스 행성',
    emoji: '🪐',
    color: '#e0c99a',
    labelColor: '#f2e0b8',
    diameterKm: 116460,
    massKg: 5.6834e26,
    massEarth: 95.2,
    distanceKm: 1.4335e9,
    distanceAu: 9.53667594,
    orbitalPeriodD: 10759.22,
    rotationHours: 10.656,
    axialTiltDeg: 26.73,
    meanTempC: -140,
    moons: 146,
    gravity: 1.07,
    tagline: '아름다운 고리로 유명한 행성이에요. 고리는 수많은 얼음 조각이에요.',
    facts: [
      '고리는 대부분 얼음과 돌 조각이에요. 작은 건 모래알, 큰 건 집채만 해요.',
      '고리는 폭이 28만 km나 되는데 두께는 겨우 10m~1km밖에 안 돼요. 종이처럼 얇아요!',
      '물보다 가벼워요. 아주 큰 욕조가 있다면 토성은 둥둥 뜰 거예요.',
      '위성 타이탄에는 메탄으로 된 강과 호수가 있어요.',
    ],
    spinNote:
      '반시계 방향으로 10시간 39분에 한 바퀴 자전해요. 고리도 행성과 같은 방향으로 함께 돌아요.',
    textures: { map: 'saturn', ring: 'saturnRing' },
    ring: { innerRatio: 1.24, outerRatio: 2.27, opacity: 0.92 },
  },
  {
    key: 'uranus',
    nameKo: '천왕성',
    nameEn: 'Uranus',
    type: '얼음 행성',
    emoji: '🧊',
    color: '#8fd3dd',
    labelColor: '#b6e6ee',
    diameterKm: 50724,
    massKg: 8.681e25,
    massEarth: 14.5,
    distanceKm: 2.8725e9,
    distanceAu: 19.18916464,
    orbitalPeriodD: 30685.4,
    rotationHours: -17.24, // 역자전
    axialTiltDeg: 97.77,
    meanTempC: -195,
    moons: 28,
    gravity: 0.89,
    tagline: '옆으로 누워서 데굴데굴 굴러가듯 도는 신기한 행성이에요.',
    facts: [
      '자전축이 97.8°나 기울어져 있어요. 거의 누워서 굴러가는 셈이에요!',
      '누워 있어서 한쪽 극지방은 42년 동안 낮, 다음 42년은 밤이에요.',
      '메탄 가스가 붉은빛을 흡수해서 청록색으로 보여요.',
      '토성처럼 고리가 있지만 아주 어둡고 얇아서 잘 안 보여요.',
    ],
    spinNote:
      '자전축이 97.8° 기울어 옆으로 누운 채, 다른 행성과 반대인 시계 방향(역자전)으로 돌아요.',
    textures: { map: 'uranus' },
    ring: { innerRatio: 1.64, outerRatio: 2.0, opacity: 0.3, thin: true },
  },
  {
    key: 'neptune',
    nameKo: '해왕성',
    nameEn: 'Neptune',
    type: '얼음 행성',
    emoji: '💙',
    color: '#3b62c4',
    labelColor: '#7f9cf0',
    diameterKm: 49244,
    massKg: 1.02413e26,
    massEarth: 17.1,
    distanceKm: 4.4951e9,
    distanceAu: 30.06992276,
    orbitalPeriodD: 60189,
    rotationHours: 16.11,
    axialTiltDeg: 28.32,
    meanTempC: -200,
    moons: 16,
    gravity: 1.14,
    tagline:
      '태양에서 가장 먼 행성이에요. 눈으로는 절대 안 보이고 계산으로 먼저 찾아낸 행성이에요.',
    facts: [
      '태양계에서 바람이 가장 세요. 시속 2,100km — 소리보다 빨라요!',
      '태양을 한 바퀴 도는 데 165년이 걸려요. 1846년에 발견된 뒤 이제 겨우 한 바퀴 돌았어요.',
      '망원경으로 보기 전에 수학 계산으로 "여기 행성이 있을 거야"라고 예측해서 찾아냈어요.',
      '위성 트리톤은 해왕성이 도는 방향과 반대로 공전해요.',
    ],
    spinNote:
      '반시계 방향으로 16시간에 한 바퀴 자전해요. 자전축이 28° 기울어져 지구처럼 계절이 있어요.',
    textures: { map: 'neptune' },
  },
];

export const MOON = {
  key: 'moon',
  nameKo: '달',
  nameEn: 'Moon',
  type: '지구의 위성',
  emoji: '🌙',
  color: '#cfcabc',
  labelColor: '#f0ead8',
  diameterKm: 3475,
  massKg: 7.342e22,
  massEarth: 0.0123,
  distanceKm: 384400, // 지구까지
  distanceAu: null,
  orbitalPeriodD: 27.3217, // 항성월
  synodicPeriodD: 29.530589, // 삭망월
  rotationHours: 655.72, // 27.32일 — 공전과 같음(조석 고정)
  axialTiltDeg: 6.68,
  meanTempC: -20,
  moons: 0,
  gravity: 0.166,
  parentKey: 'earth',
  tagline:
    '지구의 하나뿐인 위성이에요. 항상 같은 얼굴만 보여 주고, 매일 조금씩 모양이 바뀌어요.',
  facts: [
    '달은 스스로 빛나지 않아요. 태양빛을 반사해서 밝게 보이는 거예요.',
    '자전 주기와 공전 주기가 똑같이 27.3일이라, 지구에서는 늘 같은 면만 보여요(조석 고정).',
    '달의 중력이 바닷물을 끌어당겨서 밀물과 썰물이 생겨요.',
    '달은 매년 3.8cm씩 지구에서 멀어지고 있어요.',
  ],
  spinNote:
    '반시계 방향으로 27.3일에 한 바퀴 공전하는데, 자전 주기도 똑같아서 늘 같은 면만 보여요.',
  textures: { map: 'moon' },
};

/** 씬에 등장하는 모든 천체 (태양 + 8행성 + 달) */
export const ALL_BODIES = [SUN, ...PLANETS, MOON];

export const BODY_BY_KEY = Object.fromEntries(ALL_BODIES.map((b) => [b.key, b]));

/**
 * 정보 패널에 뿌릴 수치 테이블 항목을 만든다.
 * value 는 숫자(카운트업 대상), display 는 포맷 함수.
 */
export function statRows(body) {
  const rows = [];

  rows.push({
    label: '지름',
    value: body.diameterKm,
    unit: 'km',
    format: (v) => Math.round(v).toLocaleString('ko-KR'),
  });

  rows.push({
    label: '질량',
    value: body.massEarth,
    unit: '× 지구',
    format: (v) =>
      v >= 100
        ? Math.round(v).toLocaleString('ko-KR')
        : v >= 1
          ? v.toFixed(1)
          : v.toFixed(3),
  });

  if (body.key === 'sun') {
    rows.push({
      label: '태양계 중심까지',
      value: 0,
      unit: '',
      format: () => '태양계의 중심',
      static: true,
    });
  } else if (body.key === 'moon') {
    rows.push({
      label: '지구까지 거리',
      value: body.distanceKm,
      unit: 'km',
      format: (v) => Math.round(v).toLocaleString('ko-KR'),
    });
  } else {
    rows.push({
      label: '태양까지 거리',
      value: body.distanceKm,
      unit: 'km',
      format: (v) => formatKoreanNumber(v),
    });
  }

  if (body.key === 'moon') {
    rows.push({
      label: '공전 주기',
      value: body.orbitalPeriodD,
      unit: '일',
      format: (v) => v.toFixed(2),
    });
    rows.push({
      label: '위상 주기(삭망월)',
      value: body.synodicPeriodD,
      unit: '일',
      format: (v) => v.toFixed(2),
    });
  } else if (body.orbitalPeriodD) {
    rows.push({
      label: '공전 주기',
      value: body.orbitalPeriodD,
      unit: '일',
      format: (v) =>
        v >= 700
          ? `${(v / 365.25).toFixed(1)}년 (${Math.round(v).toLocaleString('ko-KR')}`
          : v.toFixed(1),
      unitOverride: (v) => (v >= 700 ? '일)' : '일'),
    });
  }

  rows.push({
    label: '자전 주기',
    value: Math.abs(body.rotationHours),
    unit: body.rotationHours < 0 ? '시간 (역자전)' : '시간',
    format: (v) =>
      v >= 48 ? `${(v / 24).toFixed(1)}일 (${v.toFixed(0)}` : v.toFixed(2),
    unitOverride: (v) =>
      v >= 48
        ? body.rotationHours < 0
          ? '시간, 역자전)'
          : '시간)'
        : body.rotationHours < 0
          ? '시간 (역자전)'
          : '시간',
  });

  rows.push({
    label: '평균 온도',
    value: body.meanTempC,
    unit: '°C',
    format: (v) => Math.round(v).toLocaleString('ko-KR'),
  });

  rows.push({
    label: body.key === 'sun' ? '행성 수' : '위성 수',
    value: body.moons,
    unit: body.key === 'sun' ? '개' : '개',
    format: (v) => Math.round(v).toLocaleString('ko-KR'),
  });

  rows.push({
    label: '중력 (지구=1)',
    value: body.gravity,
    unit: '배',
    format: (v) => (v >= 10 ? v.toFixed(1) : v.toFixed(2)),
  });

  rows.push({
    label: '자전축 기울기',
    value: body.axialTiltDeg,
    unit: '°',
    format: (v) => v.toFixed(v < 1 ? 3 : 1),
  });

  return rows;
}
