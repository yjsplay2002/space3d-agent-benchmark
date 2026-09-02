import * as THREE from 'three';

// 궤도 원 (위에서 봤을 때 시계 반대 방향 = +θ)
class CircleCurve extends THREE.Curve {
  constructor(radius) {
    super();
    this.radius = radius;
  }
  getPoint(t, target = new THREE.Vector3()) {
    const a = t * Math.PI * 2;
    return target.set(Math.cos(a) * this.radius, 0, -Math.sin(a) * this.radius);
  }
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

// uv.x = 궤도 진행 방향(0..1). 행성 위상 uPhase 근처가 가장 밝고 뒤(작은 t)로 페이드.
// 빛 펄스 여러 개가 공전 방향(+t)으로 흐름.
const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uPhase;
  uniform vec3 uColor;
  uniform float uPulseCount;
  uniform float uSpeed;
  uniform float uBase;
  uniform float uHeadStrength;
  uniform float uPulseStrength;
  uniform float uTail;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    float t = vUv.x;

    // 튜브 중심이 밝고 가장자리 페이드
    float edge = abs(dot(normalize(vNormal), normalize(vViewDir)));
    edge = pow(edge, 1.6);

    // 행성 머리 글로우 (뒤로 긴 꼬리)
    float behind = fract(uPhase - t);
    float head = exp(-behind * uTail);
    float ahead = fract(t - uPhase);
    head += exp(-ahead * 90.0) * 0.6;

    // 흐르는 펄스
    float pulses = 0.0;
    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      if (fi >= uPulseCount) break;
      float q = fract(uTime * uSpeed + fi / uPulseCount - t);
      pulses += exp(-q * 26.0);
    }

    float b = uBase + head * uHeadStrength + pulses * uPulseStrength;
    vec3 col = uColor * b * edge;
    // 머리 부분은 흰빛으로 과열
    col += vec3(1.0) * head * uHeadStrength * 0.35 * edge;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createOrbitMaterial(color, opts = {}) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uPhase: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uPulseCount: { value: opts.pulseCount ?? 3 },
      uSpeed: { value: opts.speed ?? 0.06 },
      uBase: { value: opts.base ?? 0.07 },
      uHeadStrength: { value: opts.head ?? 1.1 },
      uPulseStrength: { value: opts.pulse ?? 0.75 },
      uTail: { value: opts.tail ?? 9.0 },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/**
 * 행성 궤도: 빛이 흐르는 튜브
 */
export function createOrbit(radius, color) {
  const curve = new CircleCurve(radius);
  const tubeRadius = Math.max(0.08, radius * 0.0016);
  const geo = new THREE.TubeGeometry(curve, 512, tubeRadius, 8, true);
  const mat = createOrbitMaterial(color, {
    pulseCount: 3,
    speed: 0.05,
    base: 0.06,
    head: 1.0,
    pulse: 0.7,
    tail: 8.0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return mesh;
}

/**
 * 선택된 천체 적도 둘레의 자전 방향 빛 링 (행성 tilt 그룹의 자식으로 붙임)
 * TorusGeometry는 XY 평면 → rotation.x = -PI/2 로 XZ 평면, 이때 u 증가 방향 = +y 축 기준 시계 반대(순행 자전과 동일)
 */
export function createSpinRing(radius, color) {
  const geo = new THREE.TorusGeometry(radius * 1.06, Math.max(0.02, radius * 0.018), 6, 256);
  const mat = createOrbitMaterial(color, {
    pulseCount: 4,
    speed: 0.35,
    base: 0.12,
    head: 0.0,
    pulse: 1.4,
    tail: 1.0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 3;
  mesh.visible = false;
  return mesh;
}

export function updateOrbitMaterial(mesh, time, phase) {
  const u = mesh.material.uniforms;
  u.uTime.value = time;
  if (phase !== undefined) u.uPhase.value = phase;
}
