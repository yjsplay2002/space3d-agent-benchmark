// orbits.js — "흐르는 빛" 궤도 셰이더 (커스텀 튜브 지오메트리 + additive 셰이더)
//   - aProgress: 궤도 진행률(0~1, 평균 근점 이각 기준). uHead = 행성 현재 진행률
//   - 행성 위치 근처가 가장 밝고 뒤로 페이드 + 공전 방향으로 흐르는 빛 펄스 여러 개
import * as THREE from 'three';

const ORBIT_VERT = /* glsl */`
  attribute float aProgress;
  varying float vProg;
  varying float vFacing;
  varying float vDist;
  void main() {
    vProg = aProgress;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    vFacing = abs(dot(n, normalize(-mv.xyz)));
    vDist = length(mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const ORBIT_FRAG = /* glsl */`
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uHead;
  uniform float uOpacity;
  uniform float uPulseSpeed;
  uniform float uHighlight;
  uniform float uFadeNear;   // 카메라가 궤도에 너무 가까우면 페이드 (근접 뷰에서 빛기둥 방지)
  varying float vProg;
  varying float vFacing;
  varying float vDist;
  void main() {
    float camFade = smoothstep(uFadeNear, uFadeNear * 4.0, vDist);
    // 행성 뒤로 페이드되는 긴 꼬리 (head 에서 가장 밝음)
    float behind = fract(uHead - vProg);
    float tail = exp(-behind * 7.0);
    float headGlow = exp(-behind * 60.0) * 1.2;
    // 공전 방향으로 흐르는 빛 펄스 4개
    float pulses = 0.0;
    for (int i = 0; i < 4; i++) {
      float pos = fract(uTime * uPulseSpeed + float(i) * 0.25);
      float g = fract(pos - vProg);        // 펄스 바로 뒤에서 작은 값
      pulses += exp(-g * 38.0);
    }
    float base = 0.10 + 0.08 * uHighlight;
    float intensity = base + tail * (0.9 + 0.5 * uHighlight) + headGlow + pulses * (0.55 + 0.35 * uHighlight);
    // 튜브 가장자리 부드럽게
    float edge = pow(vFacing, 1.4) * camFade;
    vec3 col = uColor * intensity + vec3(1.0) * (headGlow * 0.35 + pulses * 0.12);
    gl_FragColor = vec4(col * edge, edge * uOpacity);
  }
`;

// 닫힌 점열을 따라 튜브 지오메트리 생성 (aProgress 포함)
export function buildTubeGeometry(points, radius = 0.15, radial = 6) {
  const n = points.length;
  const pos = new Float32Array((n + 1) * radial * 3);
  const nor = new Float32Array((n + 1) * radial * 3);
  const prog = new Float32Array((n + 1) * radial);
  const idx = [];
  const up = new THREE.Vector3(0, 1, 0);
  const tangent = new THREE.Vector3(), binormal = new THREE.Vector3(), normal = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const p = points[i % n], prev = points[(i - 1 + n) % n], next = points[(i + 1) % n];
    tangent.subVectors(next, prev).normalize();
    binormal.crossVectors(tangent, up);
    if (binormal.lengthSq() < 1e-6) binormal.set(1, 0, 0);
    binormal.normalize();
    normal.crossVectors(binormal, tangent).normalize();
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      tmp.copy(normal).multiplyScalar(Math.cos(a)).addScaledVector(binormal, Math.sin(a));
      const k = (i * radial + j);
      pos[k * 3] = p.x + tmp.x * radius; pos[k * 3 + 1] = p.y + tmp.y * radius; pos[k * 3 + 2] = p.z + tmp.z * radius;
      nor[k * 3] = tmp.x; nor[k * 3 + 1] = tmp.y; nor[k * 3 + 2] = tmp.z;
      prog[k] = i / n; // 마지막 링은 1.0 (=0.0 과 동일 위치)
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + (j + 1) % radial;
      const c = (i + 1) * radial + j, d = (i + 1) * radial + (j + 1) % radial;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('aProgress', new THREE.BufferAttribute(prog, 1));
  geo.setIndex(idx);
  return geo;
}

export function createOrbitLine({ points, color, radius = 0.15, pulseSpeed = 0.05, opacity = 1, fadeNear = 1.0 }) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uHead: { value: 0 },
      uOpacity: { value: opacity },
      uPulseSpeed: { value: pulseSpeed },
      uHighlight: { value: 0 },
      uFadeNear: { value: fadeNear },
    },
    vertexShader: ORBIT_VERT,
    fragmentShader: ORBIT_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(buildTubeGeometry(points, radius), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  let targetHighlight = 0;
  return {
    mesh, material,
    setHead(p) { material.uniforms.uHead.value = p; },
    setHighlight(v) { targetHighlight = v; },
    update(time) {
      material.uniforms.uTime.value = time;
      const u = material.uniforms.uHighlight;
      u.value += (targetHighlight - u.value) * 0.08;
    },
    rebuild(newPoints) {
      mesh.geometry.dispose();
      mesh.geometry = buildTubeGeometry(newPoints, radius);
    },
  };
}

// ---------------------------------------------------------------- 자전 방향 빛 링
const RING_VERT = /* glsl */`
  varying vec2 vUv;
  varying float vFacing;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    vFacing = abs(dot(n, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv;
  }
`;
const RING_FRAG = /* glsl */`
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uSpeed;     // 양수: u 증가 방향(= 기울어진 축 기준 +자전)
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vFacing;
  void main() {
    float pulses = 0.0;
    for (int i = 0; i < 3; i++) {
      float pos = fract(uTime * uSpeed + float(i) / 3.0);
      float g = fract(pos - vUv.x);
      pulses += exp(-g * 14.0);
    }
    float intensity = 0.25 + pulses * 1.4;
    float edge = pow(vFacing, 1.2);
    gl_FragColor = vec4(uColor * intensity * edge + vec3(1.0) * pulses * 0.25 * edge, edge * uOpacity);
  }
`;

// 토러스: rotation.x = -PI/2 로 XZ 평면에 눕힘 → u 증가 방향 = +Y 축에서 볼 때 반시계(= 순행 자전)
export function createSpinRing({ radius, color, tube = 0.02, speed = 0.35 }) {
  const geo = new THREE.TorusGeometry(radius, tube, 8, 128);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uSpeed: { value: speed },
      uOpacity: { value: 0 },
    },
    vertexShader: RING_VERT, fragmentShader: RING_FRAG,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 3;
  let target = 0;
  return {
    mesh, material,
    show(v) { target = v ? 1 : 0; },
    update(time) {
      material.uniforms.uTime.value = time;
      const o = material.uniforms.uOpacity;
      o.value += (target - o.value) * 0.1;
      mesh.visible = o.value > 0.01;
    },
  };
}
