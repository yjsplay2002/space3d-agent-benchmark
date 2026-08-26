// 소행성 충돌 물리 — 순수 계산만 모아 둔 모듈 (THREE 의존 없음 → node로 단독 테스트 가능)
//
// 근거 공식 (실제 논문/교과서 값, 임의로 만든 식 없음):
//  - 질량:            m = ρ · (4/3)π r³
//  - 운동 에너지:      E = ½ m v²
//  - 크레이터 스케일링: Collins, Melosh & Marcus 2005 "Earth Impact Effects Program" π-스케일링
//      D_tc = 1.161 (ρi/ρt)^(1/3) L^0.78 v^0.44 g^(-0.22) (sinθ)^(1/3)   [SI, m]
//      단순 크레이터: D_fr = 1.25 D_tc  /  복합 크레이터: D_fr = 1.17 D_tc^1.13 D_c^(-0.13)
//      (D_c = 단순→복합 전이 지름, 지구 3.2 km, 중력에 반비례)
//  - 지진 규모:        M = 0.67 log₁₀(E) − 5.87                (Collins et al. 2005 식 [34])
//  - 중력 결합 에너지:  U = 3GM²/(5R)  — E ≥ U 이면 행성이 다시 뭉치지 못하고 부서진다
//  - 자전 변화:        적도를 스치듯 맞았을 때의 최대치 ΔL = m·v·cosθ·R,  I = moi·M·R²

export const G = 6.674e-11;           // 중력 상수
export const TNT_MEGATON_J = 4.184e15; // TNT 1메가톤 = 4.184×10¹⁵ J
export const HIROSHIMA_J = 6.3e13;     // 히로시마 원폭 ≈ 15킬로톤
export const SUN_WATT = 3.828e26;      // 태양이 1초에 내보내는 에너지 (광도)
export const CHICXULUB_J = 3.1e23;     // 공룡을 멸종시킨 칙술루브 충돌 에너지 (약 10km 소행성)

// 조성 — density: kg/m³, burst: 지구 대기 기준 공중 폭발 한계 지름(m).
// 이보다 작으면 땅에 닿기 전에 대기에서 부서져 폭발한다 (철은 단단해서 한계가 작다).
export const COMPOSITIONS = {
  rock: { label: '암석', density: 3000, burst: 100 },
  iron: { label: '철',   density: 7900, burst: 20 },
  ice:  { label: '얼음', density: 920,  burst: 150 },
};

// 슬라이더(0~1) ↔ 지름(m) 로그 매핑: 10 m ~ 1,000 km
export function sliderToDiameter(x) { return Math.pow(10, 1 + 5 * x); }

/**
 * 충돌 결과 계산.
 * @param {number} diameter  소행성 지름 (m)
 * @param {number} speed     충돌 속도 (m/s)
 * @param {number} angleDeg  충돌 각도 — 지면 기준 (15°=스치듯, 90°=수직)
 * @param {object} comp      COMPOSITIONS 항목
 * @param {object} phys      data.js의 phys (R, M, g, rhoT, kind, moi, atm)
 * @param {number} rotationHours 대상 천체 자전 주기 (시간, 역방향은 음수)
 */
export function computeImpact({ diameter, speed, angleDeg, comp, phys, rotationHours }) {
  const r = diameter / 2;
  const mass = comp.density * (4 / 3) * Math.PI * r ** 3;
  const energy = 0.5 * mass * speed ** 2;
  const megatons = energy / TNT_MEGATON_J;
  const hiroshima = energy / HIROSHIMA_J;

  // 중력 결합 에너지 — 행성을 산산조각 내려면 이보다 큰 에너지가 필요하다
  const U = (3 * G * phys.M * phys.M) / (5 * phys.R);
  const bindingRatio = energy / U;

  // 대기 공중 폭발 — 암석 행성 + 대기가 있고, 조성별 한계 지름보다 작을 때
  const airburst = phys.kind === 'rock' && phys.atm > 0 && diameter < comp.burst * phys.atm;

  // 크레이터 (암석 표면 + 공중 폭발 아님 + 행성이 부서지지 않을 때만)
  let crater = null;
  if (phys.kind === 'rock' && !airburst && bindingRatio < 1) {
    const sinT = Math.sin((angleDeg * Math.PI) / 180);
    const Dtc = 1.161 * Math.cbrt(comp.density / phys.rhoT) *
      diameter ** 0.78 * speed ** 0.44 * phys.g ** -0.22 * Math.cbrt(sinT);
    const Dc = 3200 * (9.81 / phys.g); // 단순→복합 전이 지름 (지구 3.2km, ∝1/g)
    let Dfr, depth, complex;
    if (1.25 * Dtc < Dc) {
      complex = false;
      Dfr = 1.25 * Dtc;
      depth = Dfr / 5;                          // 단순 크레이터 깊이 ≈ 지름의 1/5
    } else {
      complex = true;
      Dfr = 1.17 * Dtc ** 1.13 * Dc ** -0.13;   // 지수 합 = 1 → 단위(m) 그대로 사용 가능
      depth = 400 * (Dfr / 1000) ** 0.3;        // 복합: d = 0.4·D^0.3 (km) → m
    }
    crater = { Dtc, Dfr, depth, complex };
  }

  // 지진 규모 — 단단한 표면에 직접 부딪혔을 때만 의미 있다
  const seismicM = (phys.kind === 'rock' && !airburst)
    ? 0.67 * Math.log10(energy) - 5.87
    : null;

  // 자전 주기 변화 — 적도를 스치듯(접선 성분 최대) 맞았을 때의 최대치
  const periodSec = Math.abs(rotationHours) * 3600;
  const I = phys.moi * phys.M * phys.R ** 2;
  const Lspin = I * (2 * Math.PI / periodSec);
  const Limp = mass * speed * Math.cos((angleDeg * Math.PI) / 180) * phys.R;
  const spinRel = Limp / Lspin;              // 상대 변화 최대값 (Δω/ω)
  const spinDT = periodSec * spinRel;        // 주기 변화 (초, 작은 변화 근사)

  const massGain = mass / phys.M;

  // 결과 등급
  let grade;
  if (phys.kind === 'star') grade = 'sun';
  else if (bindingRatio >= 1) grade = 'destroyed';
  else if (phys.kind === 'gas') grade = 'gas-scar';
  else if (bindingRatio >= 1e-3 || (crater && crater.Dfr >= phys.R)) grade = 'remelt';
  else if (energy >= 1e22) grade = 'extinction';   // 칙술루브(3×10²³J)급 언저리부터
  else if (energy >= 1e19) grade = 'regional';     // 수천 메가톤 — 지역이 뒤집히는 급
  else if (airburst) grade = 'airburst';
  else if (crater && crater.Dfr >= 150) grade = 'crater';
  else grade = 'trace';

  return {
    diameter, speed, angleDeg, comp,
    mass, energy, megatons, hiroshima,
    airburst, crater, seismicM,
    binding: { U, ratio: bindingRatio },
    spin: { rel: spinRel, dTsec: spinDT, periodSec },
    massGain,
    sunSeconds: energy / SUN_WATT,
    chicxulubRatio: energy / CHICXULUB_J,
    grade,
  };
}
