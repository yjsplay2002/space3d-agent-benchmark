/**
 * src/data/bodies.js — 태양 + 8행성 + 달의 과학 데이터 (한국어, 초등학생 눈높이)
 *
 * 수치는 NASA Planetary Fact Sheet / IAU 값 기준.
 *  · radiusKm     : 적도 반지름 [km]
 *  · tiltDeg      : 자전축 기울기(IAU 황도 기준). 90°를 넘으면 역자전이다.
 *                   금성 177.36° · 천왕성 97.77° → 이 값 자체가 역자전을 표현하므로
 *                   3D 에서는 축을 기울인 뒤 항상 같은 방향으로 돌리면 된다.
 *  · rotationHours: 항성 자전 주기 [시간] (관례상 역자전은 음수로 표기)
 *  · orbitDays    : 항성 공전 주기 [일]
 *  · distanceAu   : 태양까지의 평균 거리 [au]
 */

export const SUN = {
  key: 'sun',
  name: '태양',
  nameEn: 'Sun',
  type: '항성 (스스로 빛나는 별)',
  emoji: '☀️',
  color: 0xffb648,
  radiusKm: 695700,
  tiltDeg: 7.25,
  rotationHours: 609.12,        // 적도 기준 25.38일
  blurb:
    '태양계의 유일한 별이에요. 지구보다 130만 배나 크고, 가운데에서 수소가 헬륨으로 바뀌면서 ' +
    '어마어마한 빛과 열을 만들어 내요. 태양계 모든 것의 무게 중 99.86%가 태양이랍니다.',
  stats: [
    { label: '지름', value: 1392700, unit: 'km', hint: '지구 109개를 나란히 놓은 길이' },
    { label: '질량', value: 1.989e30, unit: 'kg', format: 'sci', hint: '지구의 33만 배' },
    { label: '표면 온도', value: 5505, unit: '°C', hint: '중심은 무려 1,500만 °C' },
    { label: '자전 주기', value: 25.38, unit: '일', decimals: 2, hint: '가스라서 적도가 더 빨리 돌아요' },
    { label: '행성 수', value: 8, unit: '개' },
    { label: '중력', value: 27.9, unit: '배', decimals: 1, hint: '지구를 1로 봤을 때' },
    { label: '나이', value: 46, unit: '억 년' },
  ],
  facts: [
    '태양 빛이 지구까지 오는 데 8분 20초가 걸려요. 지금 보는 햇빛은 8분 전의 빛이에요!',
    '태양은 1초에 수소 6억 톤을 헬륨으로 바꿔요. 그래도 앞으로 50억 년은 더 탈 수 있어요.',
    '태양 표면에 생기는 검은 점(흑점)은 주변보다 1,500°C쯤 차가운 곳이에요.',
    '태양은 가스 덩어리라서 적도는 25일, 극지방은 35일에 한 바퀴 돌아요.',
  ],
  spinNote:
    '태양은 북쪽에서 내려다볼 때 시계 반대 방향으로 자전해요. 태양계의 거의 모든 행성이 같은 방향으로 돌고 있답니다.',
};

export const PLANETS = [
  {
    key: 'mercury',
    name: '수성',
    nameEn: 'Mercury',
    type: '암석형 행성',
    emoji: '🪨',
    color: 0x9c8b7d,
    radiusKm: 2439.7,
    distanceAu: 0.38709893,
    orbitDays: 87.969,
    rotationHours: 1407.6,
    tiltDeg: 0.034,
    moons: 0,
    texture: 'mercury',
    blurb:
      '태양에서 가장 가까운, 태양계에서 제일 작은 행성이에요. 공기가 거의 없어서 낮에는 펄펄 끓고 ' +
      '밤에는 꽁꽁 얼어붙어요. 달처럼 운석 구덩이(크레이터)가 잔뜩 나 있답니다.',
    stats: [
      { label: '지름', value: 4879, unit: 'km', hint: '지구의 0.38배' },
      { label: '질량', value: 3.301e23, unit: 'kg', format: 'sci' },
      { label: '태양까지 거리', value: 5791, unit: '만 km', hint: '0.39 au' },
      { label: '공전 주기', value: 87.97, unit: '일', decimals: 2, hint: '수성의 1년' },
      { label: '자전 주기', value: 58.65, unit: '일', decimals: 2 },
      { label: '평균 온도', value: 167, unit: '°C', hint: '낮 430°C / 밤 -180°C' },
      { label: '위성 수', value: 0, unit: '개' },
      { label: '중력', value: 0.38, unit: '배', decimals: 2, hint: '지구를 1로 봤을 때' },
    ],
    facts: [
      '수성의 하루(해가 뜨고 다시 뜰 때까지)는 176일! 1년(88일)보다 두 배나 길어요.',
      '낮과 밤의 온도 차이가 600°C나 돼요. 태양계에서 가장 심한 일교차예요.',
      '몸무게가 30kg인 친구가 수성에 가면 11kg밖에 안 나가요.',
      '태양과 가까워서 태양계에서 가장 빠르게 달려요 — 1초에 47km!',
    ],
    spinNote:
      '태양 주위를 시계 반대 방향(순행)으로 돌고, 자전도 같은 방향이에요. 다만 두 바퀴 도는 동안 세 번만 자전하는 특별한 리듬을 가지고 있어요.',
  },
  {
    key: 'venus',
    name: '금성',
    nameEn: 'Venus',
    type: '암석형 행성',
    emoji: '🌕',
    color: 0xe8c98a,
    radiusKm: 6051.8,
    distanceAu: 0.72333199,
    orbitDays: 224.701,
    rotationHours: -5832.5,
    tiltDeg: 177.36,
    moons: 0,
    texture: 'venus',
    blurb:
      '크기가 지구와 가장 비슷해서 "지구의 쌍둥이"라고 불려요. 하지만 두꺼운 이산화탄소 구름이 ' +
      '열을 가둬서 표면은 납이 녹을 만큼 뜨거워요. 태양계에서 가장 뜨거운 행성이랍니다.',
    stats: [
      { label: '지름', value: 12104, unit: 'km', hint: '지구의 0.95배' },
      { label: '질량', value: 4.867e24, unit: 'kg', format: 'sci' },
      { label: '태양까지 거리', value: 10820, unit: '만 km', hint: '0.72 au' },
      { label: '공전 주기', value: 224.7, unit: '일', decimals: 1 },
      { label: '자전 주기', value: 243.02, unit: '일', decimals: 2, hint: '거꾸로 돌아요 (역자전)' },
      { label: '평균 온도', value: 464, unit: '°C', hint: '태양계에서 가장 뜨거워요' },
      { label: '위성 수', value: 0, unit: '개' },
      { label: '중력', value: 0.9, unit: '배', decimals: 2, hint: '지구를 1로 봤을 때' },
    ],
    facts: [
      '금성의 하루(243일)는 1년(225일)보다 길어요! 하루가 1년보다 긴 유일한 행성이에요.',
      '금성에서는 해가 서쪽에서 떠서 동쪽으로 져요. 거꾸로 돌기 때문이에요.',
      '표면 기압이 지구의 92배예요. 바다 속 900m 깊이에 들어간 것과 같아요.',
      '해 뜨기 전이나 해 진 직후에 가장 밝게 보이는 별이 바로 금성 — 샛별이에요.',
    ],
    spinNote:
      '공전은 다른 행성들과 같은 방향(순행)이지만, 자전은 거꾸로 도는 역자전이에요. 자전축이 177° 뒤집혀 있기 때문이에요.',
  },
  {
    key: 'earth',
    name: '지구',
    nameEn: 'Earth',
    type: '암석형 행성 · 우리 집',
    emoji: '🌏',
    color: 0x4a90d9,
    radiusKm: 6371.0,
    distanceAu: 1.00000011,
    orbitDays: 365.256,
    rotationHours: 23.9345,
    tiltDeg: 23.44,
    moons: 1,
    texture: 'earth',
    blurb:
      '우리가 사는 행성이에요. 표면의 71%가 바다이고, 생명이 살고 있다고 알려진 유일한 곳이에요. ' +
      '자전축이 23.4° 기울어져 있어서 봄·여름·가을·겨울 사계절이 생겨요.',
    stats: [
      { label: '지름', value: 12756, unit: 'km' },
      { label: '질량', value: 5.972e24, unit: 'kg', format: 'sci' },
      { label: '태양까지 거리', value: 14960, unit: '만 km', hint: '1 au — 거리의 기준' },
      { label: '공전 주기', value: 365.26, unit: '일', decimals: 2, hint: '그래서 4년마다 윤년!' },
      { label: '자전 주기', value: 23.93, unit: '시간', decimals: 2 },
      { label: '평균 온도', value: 15, unit: '°C' },
      { label: '위성 수', value: 1, unit: '개', hint: '달' },
      { label: '중력', value: 1, unit: '배', decimals: 2, hint: '모든 비교의 기준' },
    ],
    facts: [
      '지구는 1초에 30km씩 태양 주위를 달리고 있어요. 서울에서 부산까지 12초면 가는 속도예요!',
      '자전축이 23.4° 기울어진 덕분에 계절이 생겨요. 안 기울어졌다면 사계절이 없었을 거예요.',
      '지구의 자기장이 태양에서 오는 위험한 입자를 막아 줘요. 그 흔적이 바로 오로라예요.',
      '밤 지도(도시 불빛)를 보면 사람들이 어디에 모여 사는지 한눈에 보여요.',
    ],
    spinNote:
      '북극 위에서 내려다보면 공전도 자전도 모두 시계 반대 방향이에요. 그래서 해가 동쪽에서 떠요.',
  },
  {
    key: 'mars',
    name: '화성',
    nameEn: 'Mars',
    type: '암석형 행성',
    emoji: '🔴',
    color: 0xc1440e,
    radiusKm: 3389.5,
    distanceAu: 1.52366231,
    orbitDays: 686.98,
    rotationHours: 24.6229,
    tiltDeg: 25.19,
    moons: 2,
    texture: 'mars',
    blurb:
      '땅에 녹슨 철이 많아서 붉게 보이는 행성이에요. 지구처럼 하루가 24시간쯤이고 사계절도 있어서, ' +
      '사람이 가장 먼저 가 볼 행성으로 꼽혀요. 지금도 로버들이 돌아다니고 있어요.',
    stats: [
      { label: '지름', value: 6792, unit: 'km', hint: '지구의 0.53배' },
      { label: '질량', value: 6.417e23, unit: 'kg', format: 'sci' },
      { label: '태양까지 거리', value: 22790, unit: '만 km', hint: '1.52 au' },
      { label: '공전 주기', value: 687, unit: '일', hint: '화성의 1년은 지구의 약 1.9년' },
      { label: '자전 주기', value: 24.62, unit: '시간', decimals: 2, hint: '지구와 거의 같아요' },
      { label: '평균 온도', value: -65, unit: '°C' },
      { label: '위성 수', value: 2, unit: '개', hint: '포보스, 데이모스' },
      { label: '중력', value: 0.38, unit: '배', decimals: 2, hint: '지구를 1로 봤을 때' },
    ],
    facts: [
      '태양계에서 가장 높은 산 올림푸스 몬스가 있어요. 높이 22km — 에베레스트의 2.5배!',
      '화성의 하루는 24시간 37분. 지구와 거의 똑같아서 화성 시계도 만들 수 있어요.',
      '가끔 행성 전체를 뒤덮는 거대한 모래 폭풍이 몇 달씩 이어져요.',
      '양쪽 극지방에 하얀 얼음 모자가 있어요. 물 얼음과 드라이아이스가 섞여 있답니다.',
    ],
    spinNote:
      '공전과 자전 모두 순행(시계 반대 방향)이에요. 자전축이 25° 기울어 지구처럼 사계절이 있어요.',
  },
  {
    key: 'jupiter',
    name: '목성',
    nameEn: 'Jupiter',
    type: '가스형 행성',
    emoji: '🌀',
    color: 0xd8a56b,
    radiusKm: 69911,
    distanceAu: 5.20336301,
    orbitDays: 4332.589,
    rotationHours: 9.925,
    tiltDeg: 3.13,
    moons: 95,
    texture: 'jupiter',
    blurb:
      '태양계에서 가장 큰 행성이에요. 나머지 행성을 다 합친 것보다도 두 배 넘게 무거워요. ' +
      '땅이 없는 가스 덩어리이고, 줄무늬는 엄청난 속도로 부는 바람이에요.',
    stats: [
      { label: '지름', value: 142984, unit: 'km', hint: '지구 11개를 나란히!' },
      { label: '질량', value: 1.898e27, unit: 'kg', format: 'sci', hint: '지구의 318배' },
      { label: '태양까지 거리', value: 77860, unit: '만 km', hint: '5.20 au' },
      { label: '공전 주기', value: 11.86, unit: '년', decimals: 2, hint: '4,333일' },
      { label: '자전 주기', value: 9.93, unit: '시간', decimals: 2, hint: '태양계에서 가장 빨라요' },
      { label: '평균 온도', value: -110, unit: '°C', hint: '구름 꼭대기 기준' },
      { label: '위성 수', value: 95, unit: '개' },
      { label: '중력', value: 2.53, unit: '배', decimals: 2, hint: '지구를 1로 봤을 때' },
    ],
    facts: [
      '대적점(큰 붉은 점)은 지구가 통째로 들어가는 거대한 폭풍이에요. 최소 190년째 불고 있어요!',
      '가장 큰 행성인데 하루가 제일 짧아요. 딱 10시간 만에 한 바퀴 돌아요.',
      '위성이 95개나 있어요. 그중 가니메데는 수성보다도 큰 태양계 최대 위성이에요.',
      '목성의 강한 중력이 소행성을 대신 막아 줘서 "태양계의 수호신"이라고도 불려요.',
    ],
    spinNote:
      '공전·자전 모두 순행이에요. 너무 빨리 돌아서 적도가 볼록하게 부풀어 있어요.',
  },
  {
    key: 'saturn',
    name: '토성',
    nameEn: 'Saturn',
    type: '가스형 행성',
    emoji: '💍',
    color: 0xe3d3a3,
    radiusKm: 58232,
    distanceAu: 9.53707032,
    orbitDays: 10759.22,
    rotationHours: 10.656,
    tiltDeg: 26.73,
    moons: 274,
    texture: 'saturn',
    ring: { inner: 1.24, outer: 2.27, tex: 'saturnRing' },
    blurb:
      '눈부신 고리로 유명한 행성이에요. 고리는 통짜 판이 아니라 먼지부터 집채만 한 크기까지 ' +
      '수많은 얼음 조각이 줄지어 돌고 있는 거예요. 두께는 겨우 10m~1km밖에 안 돼요.',
    stats: [
      { label: '지름', value: 120536, unit: 'km', hint: '고리까지 하면 27만 km' },
      { label: '질량', value: 5.683e26, unit: 'kg', format: 'sci', hint: '지구의 95배' },
      { label: '태양까지 거리', value: 143350, unit: '만 km', hint: '9.54 au' },
      { label: '공전 주기', value: 29.46, unit: '년', decimals: 2, hint: '10,759일' },
      { label: '자전 주기', value: 10.66, unit: '시간', decimals: 2 },
      { label: '평균 온도', value: -140, unit: '°C' },
      { label: '위성 수', value: 274, unit: '개', hint: '태양계에서 가장 많아요' },
      { label: '중력', value: 1.06, unit: '배', decimals: 2, hint: '지구를 1로 봤을 때' },
    ],
    facts: [
      '토성은 물보다 가벼워요! 지구만 한 욕조가 있다면 둥둥 뜰 거예요.',
      '고리의 두께는 대부분 10m 정도예요. 지름 27만 km에 비하면 종이보다 얇은 셈이에요.',
      '위성이 274개로 태양계 1등이에요. 그중 타이탄에는 메탄으로 된 강과 호수가 있어요.',
      '북극에 육각형 모양의 거대한 구름 소용돌이가 있어요. 왜 육각형인지는 아직 연구 중!',
    ],
    spinNote:
      '공전·자전 모두 순행이에요. 자전축이 26.7° 기울어져 있어서 지구에서 볼 때 고리가 벌어졌다 좁아졌다 해요.',
  },
  {
    key: 'uranus',
    name: '천왕성',
    nameEn: 'Uranus',
    type: '얼음형 행성',
    emoji: '🧊',
    color: 0x8fd3e8,
    radiusKm: 25362,
    distanceAu: 19.19126393,
    orbitDays: 30685.4,
    rotationHours: -17.24,
    tiltDeg: 97.77,
    moons: 28,
    texture: 'uranus',
    ring: { inner: 1.64, outer: 2.0, thin: true },
    blurb:
      '거의 옆으로 누운 채 굴러가듯 도는 신기한 행성이에요. 메탄 가스 때문에 맑은 청록색으로 ' +
      '보여요. 망원경으로 발견된 최초의 행성이기도 해요.',
    stats: [
      { label: '지름', value: 51118, unit: 'km', hint: '지구의 4배' },
      { label: '질량', value: 8.681e25, unit: 'kg', format: 'sci', hint: '지구의 14.5배' },
      { label: '태양까지 거리', value: 287250, unit: '만 km', hint: '19.19 au' },
      { label: '공전 주기', value: 84.01, unit: '년', decimals: 2, hint: '30,685일' },
      { label: '자전 주기', value: 17.24, unit: '시간', decimals: 2, hint: '거꾸로 돌아요 (역자전)' },
      { label: '자전축 기울기', value: 97.77, unit: '°', decimals: 2, hint: '거의 옆으로 누웠어요' },
      { label: '위성 수', value: 28, unit: '개' },
      { label: '중력', value: 0.89, unit: '배', decimals: 2, hint: '지구를 1로 봤을 때' },
    ],
    facts: [
      '자전축이 97.8° — 거의 완전히 누워서 공처럼 굴러가듯 태양을 돌아요.',
      '누워 있어서 극지방의 낮이 42년, 밤이 42년이나 계속돼요!',
      '태양계에서 가장 추운 곳이 천왕성이에요. 최저 -224°C까지 내려가요.',
      '천왕성에도 고리가 13개 있어요. 아주 어둡고 얇아서 1977년에야 발견됐어요.',
    ],
    spinNote:
      '공전은 순행이지만 자전축이 97.8° 넘어가 있어서 자전은 역자전이에요. 옆으로 누운 채 굴러가는 모습을 3D에서 확인해 보세요.',
  },
  {
    key: 'neptune',
    name: '해왕성',
    nameEn: 'Neptune',
    type: '얼음형 행성',
    emoji: '🌊',
    color: 0x3f5ef0,
    radiusKm: 24622,
    distanceAu: 30.06896348,
    orbitDays: 60189.0,
    rotationHours: 16.11,
    tiltDeg: 28.32,
    moons: 16,
    texture: 'neptune',
    blurb:
      '태양계의 마지막 행성이에요. 태양에서 너무 멀어 아주 어둡고 춥지만, 태양계에서 가장 ' +
      '빠른 바람이 부는 곳이에요. 계산으로 위치를 먼저 예측하고 찾아낸 행성이랍니다.',
    stats: [
      { label: '지름', value: 49528, unit: 'km', hint: '지구의 3.9배' },
      { label: '질량', value: 1.024e26, unit: 'kg', format: 'sci', hint: '지구의 17배' },
      { label: '태양까지 거리', value: 449510, unit: '만 km', hint: '30.07 au' },
      { label: '공전 주기', value: 164.8, unit: '년', decimals: 1, hint: '60,189일' },
      { label: '자전 주기', value: 16.11, unit: '시간', decimals: 2 },
      { label: '평균 온도', value: -200, unit: '°C' },
      { label: '위성 수', value: 16, unit: '개', hint: '가장 큰 위성은 트리톤' },
      { label: '중력', value: 1.14, unit: '배', decimals: 2, hint: '지구를 1로 봤을 때' },
    ],
    facts: [
      '초속 600m, 시속 2,100km의 바람이 불어요. 태양계에서 가장 빠른 바람이에요!',
      '1846년 발견 이후 2011년에야 겨우 태양을 한 바퀴 돌았어요. 1년이 165년이거든요.',
      '망원경으로 찾은 게 아니라 수학 계산으로 위치를 예측해서 발견한 행성이에요.',
      '가장 큰 위성 트리톤은 해왕성과 반대 방향으로 돌아요. 붙잡혀 온 천체로 보여요.',
    ],
    spinNote:
      '공전·자전 모두 순행이에요. 자전축 기울기가 28°로 지구와 비슷해서 계절도 있어요 — 다만 한 계절이 41년!',
  },
];

export const MOON = {
  key: 'moon',
  name: '달',
  nameEn: 'Moon',
  type: '지구의 위성',
  emoji: '🌙',
  color: 0xd8d3cb,
  radiusKm: 1737.4,
  orbitDays: 27.321661,
  rotationHours: 655.72,   // 27.32일 — 공전과 정확히 같다 (조석 고정)
  tiltDeg: 6.68,
  parent: 'earth',
  distanceKm: 384400,
  texture: 'moon',
  blurb:
    '지구의 하나뿐인 위성이에요. 지구를 27.3일에 한 바퀴 돌면서, 자전도 딱 같은 시간에 하기 ' +
    '때문에 우리는 언제나 달의 같은 면만 볼 수 있어요. 달의 모양이 매일 바뀌는 건 햇빛을 ' +
    '받는 부분이 달라지기 때문이에요.',
  stats: [
    { label: '지름', value: 3475, unit: 'km', hint: '지구의 0.27배' },
    { label: '질량', value: 7.342e22, unit: 'kg', format: 'sci' },
    { label: '지구까지 거리', value: 384400, unit: 'km', hint: '빛으로 1.3초' },
    { label: '공전 주기', value: 27.32, unit: '일', decimals: 2, hint: '항성월' },
    { label: '위상 주기', value: 29.53, unit: '일', decimals: 2, hint: '삭망월 — 달 모양이 한 바퀴' },
    { label: '자전 주기', value: 27.32, unit: '일', decimals: 2, hint: '공전과 똑같아요!' },
    { label: '평균 온도', value: -23, unit: '°C', hint: '낮 127°C / 밤 -173°C' },
    { label: '중력', value: 0.17, unit: '배', decimals: 2, hint: '지구를 1로 봤을 때' },
  ],
  facts: [
    '달은 공전과 자전 시간이 똑같아요(조석 고정). 그래서 지구에서는 영원히 달의 뒷면을 볼 수 없어요.',
    '달의 어두운 무늬는 "바다"라고 부르지만 물은 한 방울도 없어요. 옛날에 흘러나온 용암이 굳은 거예요.',
    '달이 매년 3.8cm씩 지구에서 멀어지고 있어요. 손톱이 자라는 속도와 비슷해요.',
    '달의 중력이 바닷물을 끌어당겨서 밀물과 썰물이 생겨요.',
    '몸무게 30kg인 친구가 달에 가면 5kg! 그래서 우주인들이 껑충껑충 뛰어다녔어요.',
  ],
  spinNote:
    '달은 지구 둘레를 시계 반대 방향(순행)으로 돌고, 자전도 같은 방향·같은 주기예요. 그래서 항상 같은 면만 지구를 향하고 있어요.',
};

/** 태양 + 8행성 + 달 전체 */
export const ALL_BODIES = [SUN, ...PLANETS, MOON];

/** key → 데이터 */
export const BODY_BY_KEY = Object.fromEntries(ALL_BODIES.map((b) => [b.key, b]));

/**
 * 위상 구간별 "지금 달이 이렇게 보이는 이유" 설명.
 * moonview / 정보 패널에서 위상에 따라 동적으로 골라 쓴다.
 */
export const MOON_PHASE_EXPLAIN = [
  {
    // 0 — 삭
    short: '달이 태양과 같은 쪽에 있어서, 햇빛을 받는 면이 전부 반대쪽(지구 반대편)을 향해요.',
    long:
      '지금 달은 태양과 거의 같은 방향에 있어요. 그래서 햇빛이 닿는 밝은 반쪽이 모두 지구 반대편을 ' +
      '향하고 있고, 우리 쪽으로는 그늘진 면만 보여요. 게다가 낮 하늘에 태양과 함께 떠 있어서 ' +
      '눈으로는 거의 찾을 수 없어요. 오늘부터 조금씩 오른쪽부터 밝아지기 시작할 거예요.',
  },
  {
    // 1 — 초승달
    short: '달이 태양에서 조금 옆으로 비켜나서, 오른쪽 가장자리에만 햇빛이 살짝 걸쳐요.',
    long:
      '달이 태양에서 옆으로 조금 비켜났어요. 덕분에 햇빛을 받는 부분의 가장자리가 아주 가늘게 ' +
      '보이기 시작해요. 밝은 쪽이 오른쪽인 이유는 태양이 그쪽에 있기 때문이에요. ' +
      '해가 진 직후 서쪽 하늘 낮은 곳에서 잠깐 볼 수 있어요.',
  },
  {
    // 2 — 상현달
    short: '지구에서 볼 때 달이 태양과 90° 떨어져 있어서, 딱 절반만 밝게 보여요.',
    long:
      '지구에서 보면 달과 태양이 정확히 90° 떨어져 있어요. 그래서 햇빛을 받는 반쪽 중 절반이 ' +
      '우리 쪽을 향해, 오른쪽 반원이 밝게 보여요. 명암 경계선(터미네이터)이 곧은 직선처럼 보이는 게 ' +
      '특징이에요. 해 질 무렵 남쪽 하늘 높이 떠 있어요.',
  },
  {
    // 3 — 차오르는 볼록달
    short: '달이 태양 반대쪽으로 더 돌아가서, 밝은 부분이 절반을 넘어 부풀어 올랐어요.',
    long:
      '달이 태양 반대편 쪽으로 더 돌아갔어요. 이제 햇빛을 받는 면이 절반보다 많이 보여서 ' +
      '한쪽이 볼록한 모양이 됐어요. 며칠 뒤면 완전히 꽉 찬 보름달이 돼요. ' +
      '해가 진 뒤 동쪽 하늘에서 밝게 빛나는 걸 볼 수 있어요.',
  },
  {
    // 4 — 보름달
    short: '지구가 태양과 달 사이에 놓여서, 햇빛 받는 면이 우리 쪽을 정면으로 향해요.',
    long:
      '태양 — 지구 — 달이 거의 일직선으로 늘어섰어요. 달에서 햇빛을 받는 밝은 반쪽이 정확히 ' +
      '우리 쪽을 향하고 있어서 동그랗게 꽉 찬 모습이에요. 해가 질 때 뜨고 해가 뜰 때 지기 ' +
      '때문에 밤새도록 볼 수 있어요.',
  },
  {
    // 5 — 기우는 볼록달
    short: '보름을 지나 달이 되돌아가는 중이라, 이번엔 오른쪽부터 조금씩 그늘이 져요.',
    long:
      '보름을 지나 달이 다시 태양 쪽으로 돌아가고 있어요. 이번에는 오른쪽부터 그늘이 지기 시작해서 ' +
      '밝은 부분이 조금씩 줄어들어요. 밝은 쪽이 왼쪽으로 옮겨 간 것을 확인해 보세요. ' +
      '밤 늦게 떠서 아침까지 하늘에 남아 있어요.',
  },
  {
    // 6 — 하현달
    short: '다시 태양과 90° 떨어졌어요. 이번엔 왼쪽 절반이 밝게 보여요.',
    long:
      '달이 태양과 다시 90° 떨어졌어요. 상현달과 똑같이 절반만 보이지만, 이번에는 밝은 쪽이 ' +
      '왼쪽이에요. 태양이 반대쪽에 있기 때문이에요. 한밤중에 떠서 아침 하늘에 높이 떠 있어요.',
  },
  {
    // 7 — 그믐달
    short: '달이 태양에 거의 다가가서, 왼쪽 가장자리만 가늘게 남았어요.',
    long:
      '달이 태양 쪽으로 거의 다 돌아왔어요. 햇빛 받는 면이 대부분 반대쪽으로 넘어가서 ' +
      '왼쪽 가장자리만 실처럼 가늘게 남았어요. 해 뜨기 직전 동쪽 하늘에서 잠깐 볼 수 있고, ' +
      '며칠 뒤면 삭이 되어 보이지 않게 돼요.',
  },
];
