/**
 * orbits.js — "흐르는 빛"으로 표현한 궤도와 자전 방향 링.
 *
 * · 궤도: 실제 궤도 요소로 만든 닫힌 곡선을 따라 직접 만든 튜브 지오메트리.
 *   정점마다 궤도상 위치 t(0~1, 평균근점이각 기준)를 실어 보내고,
 *   프래그먼트에서 uTime 기반 그라디언트를 흘린다.
 *     - 행성 현재 위치가 가장 밝고, 공전 진행 방향의 **뒤쪽**으로 길게 페이드
 *     - 그 위에 여러 개의 빛 펄스가 공전 방향으로 흐른다
 * · 자전 링: 선택된 행성의 적도 둘레에 자전 방향으로 흐르는 빛.
 *   금성(-243일)·천왕성(-17시간)의 역자전이 그대로 반대 방향으로 흐른다.
 *
 * 전부 additive blending → 블룸에 걸린다.
 */

import * as THREE from 'three';
import { orbitPath, planetElements, norm360, moonGeocentric } from './ephemeris.js';
import { auToScene, eclipticToScene, moonDistToScene } from './scale.js';

/* ══════════════════════════════════════════════════════════════
   셰이더
   ══════════════════════════════════════════════════════════════ */

const FLOW_VERT = /* glsl */ `
  attribute float aT;
  varying float vT;
  varying vec3 vWorldPos;
  void main() {
    vT = aT;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FLOW_FRAG = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uPlanetT;
  uniform vec3  uColor;
  uniform vec3  uHot;
  uniform float uOpacity;
  uniform float uSelected;
  uniform float uPulseCount;
  uniform float uFlowSpeed;
  uniform float uTailLength;

  varying float vT;
  varying vec3 vWorldPos;

  /** 원형(0~1 랩) 좌표에서 center 로부터의 거리 */
  float ringDist(float t, float center) {
    return abs(fract(t - center + 0.5) - 0.5);
  }

  void main() {
    // ── 1. 행성 뒤로 이어지는 혜성 꼬리
    //    fract(uPlanetT - vT) 는 "공전 방향 기준으로 얼마나 뒤에 있나"
    float behind = fract(uPlanetT - vT);
    float tail = exp(-behind / uTailLength);
    // 행성 바로 앞쪽은 아주 짧게만 밝힌다
    float ahead = exp(-(1.0 - behind) / 0.012);
    float head = tail + ahead;

    // ── 2. 공전 방향으로 흐르는 빛 펄스들
    float pulses = 0.0;
    for (int i = 0; i < 6; i++) {
      if (float(i) >= uPulseCount) break;
      float center = fract(uTime * uFlowSpeed + float(i) / uPulseCount);
      float d = ringDist(vT, center);
      // 앞은 날카롭고 뒤는 길게 — 진행 방향이 눈에 보이게
      float back = fract(center - vT);
      float asym = mix(1.0, 2.4, step(0.5, 1.0 - back));
      pulses += exp(-pow(d * 46.0 * asym, 2.0));
    }

    float base = 0.10 + 0.10 * uSelected;
    float intensity = (base + head * 1.35 + pulses * 0.85) * uOpacity;
    intensity *= (1.0 + 0.85 * uSelected);

    vec3 col = mix(uColor, uHot, clamp(head * 0.75 + pulses * 0.9, 0.0, 1.0));

    gl_FragColor = vec4(col * intensity, intensity);
  }
`;

/* ── 자전 방향 링 ───────────────────────────────────────────── */

const SPIN_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec3  uColor;
  uniform vec3  uHot;
  uniform float uDir;      // +1 = 반시계(정자전), -1 = 시계(역자전)
  uniform float uOpacity;
  varying vec2 vUv;

  float ringDist(float t, float center) {
    return abs(fract(t - center + 0.5) - 0.5);
  }

  void main() {
    float t = vUv.x;
    float pulses = 0.0;
    const float N = 5.0;
    for (int i = 0; i < 5; i++) {
      float center = fract(uTime * 0.16 * uDir + float(i) / N);
      float d = ringDist(t, center);
      // 진행 방향 뒤로 늘어지는 꼬리
      float back = fract((center - t) * uDir);
      float asym = mix(3.0, 1.0, exp(-back * 6.0));
      pulses += exp(-pow(d * 34.0 * asym, 2.0));
    }
    float intensity = (0.16 + pulses * 1.15) * uOpacity;
    vec3 col = mix(uColor, uHot, clamp(pulses, 0.0, 1.0));
    gl_FragColor = vec4(col * intensity, intensity);
  }
`;

/* ══════════════════════════════════════════════════════════════
   튜브 지오메트리 (궤도 파라미터 t 를 그대로 보존)
   ══════════════════════════════════════════════════════════════ */

const UP = new THREE.Vector3(0, 1, 0);

/**
 * 닫힌 곡선을 따라 튜브를 만든다.
 * TubeGeometry 는 호길이 기준으로 다시 매개화해 버려서 t 가 어긋나므로 직접 만든다.
 * @param {THREE.Vector3[]} points 균등한 평균근점이각 간격의 점들
 */
function buildFlowTube(points, radius, radialSegments = 7) {
  const N = points.length;
  const R = radialSegments;
  const vertCount = (N + 1) * (R + 1);

  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const tParam = new Float32Array(vertCount);

  const tangent = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const bin = new THREE.Vector3();
  const p = new THREE.Vector3();

  let v = 0;
  for (let i = 0; i <= N; i++) {
    const idx = i % N;
    const prev = points[(idx - 1 + N) % N];
    const next = points[(idx + 1) % N];
    const cur = points[idx];

    tangent.subVectors(next, prev).normalize();
    nrm.crossVectors(tangent, UP);
    if (nrm.lengthSq() < 1e-8) nrm.set(1, 0, 0);
    nrm.normalize();
    bin.crossVectors(tangent, nrm).normalize();

    const t = i / N;
    for (let j = 0; j <= R; j++) {
      const a = (j / R) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      p.copy(cur)
        .addScaledVector(nrm, ca * radius)
        .addScaledVector(bin, sa * radius);
      positions[v * 3] = p.x;
      positions[v * 3 + 1] = p.y;
      positions[v * 3 + 2] = p.z;
      normals[v * 3] = ca;
      normals[v * 3 + 1] = 0;
      normals[v * 3 + 2] = sa;
      tParam[v] = t;
      v++;
    }
  }

  const indices = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < R; j++) {
      const a = i * (R + 1) + j;
      const b = a + R + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('aT', new THREE.BufferAttribute(tParam, 1));
  geo.setIndex(indices);
  return geo;
}

/* ══════════════════════════════════════════════════════════════
   궤도 시스템
   ══════════════════════════════════════════════════════════════ */

const ORBIT_STYLE = {
  mercury: { color: '#8fb6c9', hot: '#dff6ff', speed: 0.075, pulses: 3 },
  venus: { color: '#e8c98f', hot: '#fff3d2', speed: 0.062, pulses: 3 },
  earth: { color: '#5fe8ff', hot: '#ffffff', speed: 0.055, pulses: 4 },
  mars: { color: '#e0724c', hot: '#ffd0b0', speed: 0.048, pulses: 4 },
  jupiter: { color: '#dbb98a', hot: '#fff0cf', speed: 0.036, pulses: 5 },
  saturn: { color: '#f0dcae', hot: '#fff8e2', speed: 0.03, pulses: 5 },
  uranus: { color: '#8fe6f0', hot: '#e2fbff', speed: 0.024, pulses: 6 },
  neptune: { color: '#6f8ff0', hot: '#d6e2ff', speed: 0.02, pulses: 6 },
};

const SAMPLES = 512;
const _p = new THREE.Vector3();

function orbitPoints(key, jd) {
  const path = orbitPath(key, jd, SAMPLES);
  return path.map((s) => eclipticToScene(s.lon, s.lat, auToScene(s.r), new THREE.Vector3()));
}

/**
 * 모든 행성의 궤도 + 달 궤도 + 자전 링을 만든다.
 * @param {ReturnType<import('./bodies.js').createSolarSystem>} system
 * @param {number} jd
 */
export function createOrbits(system, jd) {
  const group = new THREE.Group();
  group.name = 'orbits';

  const orbits = [];

  for (const planet of system.planets) {
    const style = ORBIT_STYLE[planet.key];
    const pts = orbitPoints(planet.key, jd);
    const radius = THREE.MathUtils.clamp(planet.orbitRadius * 0.0032, 0.16, 0.78);
    const geo = buildFlowTube(pts, radius);

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPlanetT: { value: 0 },
        uColor: { value: new THREE.Color(style.color) },
        uHot: { value: new THREE.Color(style.hot) },
        uOpacity: { value: 1 },
        uSelected: { value: 0 },
        uPulseCount: { value: style.pulses },
        uFlowSpeed: { value: style.speed },
        uTailLength: { value: 0.19 },
      },
      vertexShader: FLOW_VERT,
      fragmentShader: FLOW_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    group.add(mesh);

    orbits.push({ key: planet.key, mesh, mat, planet });
  }

  // ── 달 궤도 (지구에 붙는다)
  const moonOrbit = (() => {
    const pts = [];
    const step = 360 / 128;
    // 실제 달 궤도의 기울기/모양을 대략 반영한 원
    const m0 = moonGeocentric(jd);
    const rBase = moonDistToScene(m0.distKm);
    for (let i = 0; i < 128; i++) {
      const lon = i * step;
      // 백교점 기준 5.15° 경사
      const lat = 5.145 * Math.sin((lon - m0.lon + 90) * (Math.PI / 180));
      pts.push(eclipticToScene(lon, lat, rBase, new THREE.Vector3()));
    }
    const geo = buildFlowTube(pts, 0.035, 5);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPlanetT: { value: 0 },
        uColor: { value: new THREE.Color('#ffe2b0') },
        uHot: { value: new THREE.Color('#ffffff') },
        uOpacity: { value: 0.85 },
        uSelected: { value: 0 },
        uPulseCount: { value: 3 },
        uFlowSpeed: { value: 0.2 },
        uTailLength: { value: 0.16 },
      },
      vertexShader: FLOW_VERT,
      fragmentShader: FLOW_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    system.earth.anchor.add(mesh);
    return { mesh, mat };
  })();

  // ── 자전 방향 링 (선택된 천체에만 표시)
  const spinRings = {};
  for (const body of [...system.planets, system.moon]) {
    const style = ORBIT_STYLE[body.key] || { color: '#ffe2b0', hot: '#ffffff' };
    const tube = Math.max(body.radius * 0.022, 0.012);
    const geo = new THREE.TorusGeometry(body.radius * 1.28, tube, 8, 220);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(style.color) },
        uHot: { value: new THREE.Color('#ffffff') },
        uDir: { value: body.spinSign },
        uOpacity: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main(){
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: SPIN_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2; // 적도면
    mesh.visible = false;
    mesh.renderOrder = 4;
    body.tilt.add(mesh); // 자전축 기울기를 그대로 따라간다
    spinRings[body.key] = { mesh, mat };
  }

  let builtJd = jd;
  let selected = null;

  return {
    group,
    orbits,
    moonOrbit,
    spinRings,

    /** 날짜/시간이 바뀔 때: 행성의 궤도상 위치 t 갱신 */
    update(jdNow, elapsed) {
      for (const o of orbits) {
        const el = planetElements(o.key, jdNow);
        o.mat.uniforms.uPlanetT.value = norm360(el.M) / 360;
        o.mat.uniforms.uTime.value = elapsed;
      }
      // 달: 궤도 위상 = 지심 황경
      const m = moonGeocentric(jdNow);
      moonOrbit.mat.uniforms.uPlanetT.value = norm360(m.lon) / 360;
      moonOrbit.mat.uniforms.uTime.value = elapsed;

      for (const key in spinRings) {
        spinRings[key].mat.uniforms.uTime.value = elapsed;
      }

      // 수 세기 이상 흐르면 궤도 요소가 눈에 띄게 바뀌므로 다시 만든다
      if (Math.abs(jdNow - builtJd) > 36525 * 3) {
        this.rebuild(jdNow);
      }
    },

    rebuild(jdNow) {
      builtJd = jdNow;
      for (const o of orbits) {
        const pts = orbitPoints(o.key, jdNow);
        const radius = THREE.MathUtils.clamp(o.planet.orbitRadius * 0.0032, 0.16, 0.78);
        const next = buildFlowTube(pts, radius);
        o.mesh.geometry.dispose();
        o.mesh.geometry = next;
      }
    },

    /** 선택 상태 반영 */
    setSelected(key) {
      selected = key;
      for (const o of orbits) {
        o.mat.uniforms.uSelected.value = o.key === key ? 1 : 0;
        o.mat.uniforms.uOpacity.value = key && o.key !== key ? 0.5 : 1;
      }
      moonOrbit.mat.uniforms.uSelected.value = key === 'moon' ? 1 : 0;
      for (const k in spinRings) {
        const on = k === key;
        spinRings[k].mesh.visible = on;
        spinRings[k].mat.uniforms.uOpacity.value = on ? 1 : 0;
      }
    },

    getSelected: () => selected,
  };
}
