/**
 * src/orbits.js — "흐르는 빛" 궤도 · 자전 방향 링
 *
 * 궤도는 TubeGeometry 로 만든 실제 타원(궤도 요소에서 직접 샘플링)이고,
 * 커스텀 셰이더가 그 위로 빛을 흘려보낸다.
 *
 *   · 꼬리(trail) : 행성의 현재 위치가 가장 밝고, 진행 방향 반대쪽으로 페이드
 *   · 펄스(pulse) : 여러 개의 빛 덩어리가 공전 방향으로 계속 흘러간다
 *   · 전부 additive blending → UnrealBloomPass 에 걸려 빛난다
 *
 * TubeGeometry 의 uv.x 는 튜브를 따라 0→1 로 증가하고, 우리는 궤도를
 * 이심근점이각(E) 기준으로 균일 샘플링했으므로 uv.x == E/360 이다.
 * 따라서 행성의 현재 E/360 을 그대로 uHead 로 넘기면 위치가 정확히 맞는다.
 */

import * as THREE from 'three';
import { planetOrbitPath } from './ephemeris.js';
import { auToUnits, eclipticToScene, MOON_DIST_UNITS } from './bodies.js';
import { PLANETS } from './data/bodies.js';

/**
 * 튜브 두께를 "화면상 픽셀 폭 고정"으로 만든다.
 * 월드 반지름을 그대로 쓰면 태양계 전체 뷰에서는 실보다 가늘어 안 보이고,
 * 행성에 가까이 가면 거대한 파이프처럼 보인다.
 *
 * TubeGeometry/TorusGeometry 의 normal 은 튜브 중심선에서 바깥을 향하므로
 * `position - normal * uTubeRadius` 가 중심선 위의 점이 된다.
 */
const ORBIT_VERT = /* glsl */ `
  uniform float uTubeRadius;
  uniform float uThickPx;      // 원하는 화면 두께 (px)
  uniform float uPxToWorld;    // 2·tan(fov/2) / 화면높이(px)
  uniform float uMinR;
  uniform float uMaxR;
  varying vec2 vUv;
  varying float vFogDist;

  void main() {
    vec3 axis = position - normal * uTubeRadius;
    vec4 mvA = modelViewMatrix * vec4(axis, 1.0);
    float viewDist = max(-mvA.z, 0.001);
    float r = clamp(viewDist * uPxToWorld * uThickPx * 0.5, uMinR, uMaxR);

    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(axis + normal * r, 1.0);
    vFogDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const ORBIT_FRAG = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uHead;         // 행성의 현재 위치 (0~1)
  uniform vec3  uColorBase;
  uniform vec3  uColorHot;
  uniform float uBase;         // 궤도 밑선 밝기
  uniform float uTrailLen;     // 꼬리 길이 (0~1, 궤도 둘레 대비)
  uniform float uPulseCount;
  uniform float uPulseSpeed;
  uniform float uPulseSharp;
  uniform float uOpacity;
  uniform float uHighlight;    // 선택/호버 시 1 로 올라간다

  varying vec2 vUv;
  varying float vFogDist;

  void main() {
    float t = vUv.x;

    // ── 꼬리: 행성 뒤쪽(진행 반대 방향)으로 페이드 ──
    // fract(uHead - t) 는 "행성보다 얼마나 뒤에 있는가"
    float behind = fract(uHead - t + 1.0);
    float trail = exp(-behind / max(uTrailLen, 0.0001));

    // 행성 바로 앞쪽에도 아주 짧은 예광
    float ahead = fract(t - uHead + 1.0);
    trail += exp(-ahead / (uTrailLen * 0.16)) * 0.3;

    // ── 펄스: 공전 방향으로 흘러가는 빛 덩어리 ──
    // fract(t·N - time·s) 의 피크가 t 증가 방향으로 이동한다 = 순행
    float q = fract(t * uPulseCount - uTime * uPulseSpeed);
    float pulse = pow(q, uPulseSharp);
    // 두 번째 계열을 다른 속도로 겹쳐서 리듬을 만든다
    float q2 = fract(t * (uPulseCount * 0.5) - uTime * uPulseSpeed * 0.62 + 0.37);
    pulse += pow(q2, uPulseSharp * 1.6) * 0.6;

    // ── 튜브 단면 감쇠: 가운데가 밝고 가장자리가 흐리게 ──
    float cross = sin(vUv.y * 3.14159265);
    cross = pow(clamp(cross, 0.0, 1.0), 0.65);

    float energy = uBase + trail * 1.25 + pulse * 0.7;
    energy *= (1.0 + uHighlight * 1.4);

    vec3 col = mix(uColorBase, uColorHot, clamp(trail * 1.15 + pulse * 0.5, 0.0, 1.0));

    // 아주 먼 궤도는 살짝 옅게 (화면이 선으로 뒤덮이지 않도록)
    float far = clamp(1.0 - (vFogDist - 900.0) / 2600.0, 0.25, 1.0);
    // 카메라 코앞을 지나는 구간은 눈부시지 않게 눌러 준다
    float near = smoothstep(0.6, 6.0, vFogDist);

    float a = energy * cross * uOpacity * far * near;
    gl_FragColor = vec4(col * energy * 0.78 * near, a);
  }
`;

/** 자전 방향 링 — 적도 둘레를 도는 흐르는 빛 */
const SPIN_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uDir;          // +1 순행 / -1 역자전
  uniform vec3  uColor;
  uniform float uOpacity;
  uniform float uPulseCount;
  varying vec2 vUv;
  varying float vFogDist;

  void main() {
    float t = vUv.x;
    // 화살촉처럼 뾰족한 펄스가 자전 방향으로 흐른다
    float q = fract(t * uPulseCount - uTime * 0.55 * uDir);
    float head = pow(q, 9.0);
    float tail = pow(q, 2.0) * 0.25;
    float cross = pow(clamp(sin(vUv.y * 3.14159265), 0.0, 1.0), 0.6);
    float e = 0.16 + head * 1.5 + tail;
    float a = e * cross * uOpacity;
    gl_FragColor = vec4(uColor * e * 1.4, a);
  }
`;

// ─────────────────────────────────────────────────────────────────────────────

/** 행성별 궤도 색 (기본 · 핫) */
const ORBIT_COLORS = {
  mercury: [0x4d7f92, 0xd7f4ff],
  venus: [0xa88a4e, 0xffe8b0],
  earth: [0x2f7fd0, 0x9ce8ff],
  mars: [0x9a4526, 0xffb489],
  jupiter: [0x9a7442, 0xffd9a0],
  saturn: [0x9a8f5f, 0xfff0bd],
  uranus: [0x3f8ea3, 0xb9f3ff],
  neptune: [0x35479c, 0xa8bcff],
};

/**
 * 모든 궤도 라인과 자전 링을 만든다.
 * @param {THREE.Object3D} parent
 * @param {object} system createSolarSystem() 결과
 * @param {number} jd 궤도 요소를 뽑을 기준 시각
 */
export function createOrbits(parent, system, jd, opts = {}) {
  const lowPower = Boolean(opts.lowPower);
  const group = new THREE.Group();
  group.name = 'orbits';
  parent.add(group);

  const orbits = {};
  const tubularSegments = lowPower ? 320 : 640;
  const radialSegments = lowPower ? 5 : 8;

  // 화면 두께 계산에 쓰는 값 — 리사이즈/FOV 변경 시 갱신한다
  const pxToWorld = { value: 0.0012 };
  const thickUniforms = [];

  /** 두께 유니폼 묶음 생성 */
  function thicknessUniforms(tubeRadius, thickPx, minR, maxR) {
    const u = {
      uTubeRadius: { value: tubeRadius },
      uThickPx: { value: thickPx },
      uPxToWorld: { value: pxToWorld.value },
      uMinR: { value: minR },
      uMaxR: { value: maxR },
    };
    thickUniforms.push(u);
    return u;
  }

  /** 카메라/화면이 바뀌면 호출 */
  function setPixelScale(camera, heightPx) {
    const v = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / Math.max(1, heightPx);
    pxToWorld.value = v;
    for (const u of thickUniforms) u.uPxToWorld.value = v;
  }

  for (const p of PLANETS) {
    const samples = planetOrbitPath(p.key, jd, 360);
    const pts = samples.map((s) =>
      eclipticToScene(s.lon, s.lat, auToUnits(s.r), new THREE.Vector3()),
    );
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);

    const tubeR = 0.2;   // 실제 두께는 셰이더가 화면 기준으로 다시 잡는다
    const geo = new THREE.TubeGeometry(curve, tubularSegments, tubeR, radialSegments, true);

    const [base, hot] = ORBIT_COLORS[p.key] || [0x3a6f88, 0xbfeaff];
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        ...thicknessUniforms(tubeR, 2.4, 0.012, 1.6),
        uTime: { value: 0 },
        uHead: { value: 0 },
        uColorBase: { value: new THREE.Color(base) },
        uColorHot: { value: new THREE.Color(hot) },
        uBase: { value: 0.075 },
        uTrailLen: { value: 0.14 },
        uPulseCount: { value: 6 },
        uPulseSpeed: { value: 0.055 },
        uPulseSharp: { value: 14 },
        uOpacity: { value: 0.72 },
        uHighlight: { value: 0 },
      },
      vertexShader: ORBIT_VERT,
      fragmentShader: ORBIT_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    group.add(mesh);

    orbits[p.key] = { mesh, material: mat, curve, key: p.key };
  }

  // ── 달의 지구 공전 궤도 (지구를 따라다닌다) ──────────────────────────
  let moonOrbit = null;
  {
    const n = 128;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * MOON_DIST_UNITS, 0, -Math.sin(a) * MOON_DIST_UNITS));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
    const moonTubeR = 0.05;
    const geo = new THREE.TubeGeometry(curve, 256, moonTubeR, 5, true);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        ...thicknessUniforms(moonTubeR, 1.9, 0.004, 0.35),
        uTime: { value: 0 },
        uHead: { value: 0 },
        uColorBase: { value: new THREE.Color(0x9aa6b8) },
        uColorHot: { value: new THREE.Color(0xfff3d6) },
        uBase: { value: 0.1 },
        uTrailLen: { value: 0.2 },
        uPulseCount: { value: 3 },
        uPulseSpeed: { value: 0.12 },
        uPulseSharp: { value: 10 },
        uOpacity: { value: 0.6 },
        uHighlight: { value: 0 },
      },
      vertexShader: ORBIT_VERT,
      fragmentShader: ORBIT_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    group.add(mesh);
    moonOrbit = { mesh, material: mat };
  }

  // ── 자전 방향 링 (선택된 천체에만 표시) ───────────────────────────────
  const spinRings = {};
  for (const entry of system.list) {
    const d = entry.data;
    if (!d.rotationHours) continue;
    const r = entry.radius;
    const tubeR = Math.max(r * 0.028, 0.012);
    const ringR = r * (
      d.key === 'saturn' ? 2.55
        : d.key === 'uranus' ? 2.2
          : d.key === 'moon' ? 1.75      // 터미네이터 보조선과 겹치지 않게
            : 1.28
    );

    const geo = new THREE.TorusGeometry(ringR, tubeR, 6, lowPower ? 128 : 256);
    // 토러스는 XY 평면에 생기므로 적도(XZ)로 눕힌다
    geo.rotateX(Math.PI / 2);

    // 자전 방향: 자전축 기울기가 90°를 넘으면 (금성 177°, 천왕성 98°)
    // 북쪽에서 볼 때 반대로 도는 역자전이다.
    const retrograde = (d.tiltDeg || 0) > 90;

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        ...thicknessUniforms(tubeR, 3.4, 0.004, 0.9),
        uTime: { value: 0 },
        uDir: { value: retrograde ? -1 : 1 },
        uColor: { value: new THREE.Color(retrograde ? 0xff8a5c : 0x7ef0ff) },
        uOpacity: { value: 0 },
        uPulseCount: { value: 4 },
      },
      vertexShader: ORBIT_VERT,
      fragmentShader: SPIN_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    mesh.renderOrder = 7;
    // 자전축 기울기를 그대로 물려받도록 tilt 그룹에 붙인다
    entry.tilt.add(mesh);
    spinRings[d.key] = { mesh, material: mat, retrograde };
  }

  // ───────────────────────────────────────────────────────────────────────

  let activeSpin = null;

  /**
   * @param {number} elapsed 경과 초 (빛 흐름 애니메이션)
   */
  function update(elapsed) {
    for (const p of PLANETS) {
      const o = orbits[p.key];
      if (!o) continue;
      const eph = system.bodies[p.key].eph;
      o.material.uniforms.uTime.value = elapsed;
      // uv.x == E/360 이므로 행성의 현재 E 를 그대로 넣으면 위치가 정확히 맞는다
      o.material.uniforms.uHead.value = (eph.E ?? 0) / 360;
    }

    // 달 궤도는 지구를 따라다니고, 머리는 달의 현재 황경에 맞춘다
    if (moonOrbit) {
      const earth = system.bodies.earth;
      moonOrbit.mesh.position.copy(earth.group.position);
      moonOrbit.material.uniforms.uTime.value = elapsed;
      const mlon = system.bodies.moon.eph.lon || 0;
      // 원을 lon 기준으로 만들었으므로 head = lon/360
      moonOrbit.material.uniforms.uHead.value = ((mlon % 360) + 360) % 360 / 360;
    }

    if (activeSpin) activeSpin.material.uniforms.uTime.value = elapsed;
  }

  /** 선택된 천체의 자전 링만 켠다 */
  function setSpinTarget(key) {
    for (const k in spinRings) {
      const s = spinRings[k];
      s.mesh.visible = k === key;
      s.material.uniforms.uOpacity.value = k === key ? 0.85 : 0;
    }
    activeSpin = key ? spinRings[key] : null;
    return activeSpin;
  }

  /** 궤도 강조 (호버/선택) */
  function setHighlight(key, amount) {
    for (const k in orbits) {
      orbits[k].material.uniforms.uHighlight.value = k === key ? amount : 0;
      orbits[k].material.uniforms.uOpacity.value = k === key ? 0.95 : 0.72;
    }
    if (moonOrbit) {
      moonOrbit.material.uniforms.uHighlight.value = key === 'moon' ? amount : 0;
    }
  }

  /**
   * 궤도 요소는 세기 단위로 아주 천천히 변한다. 날짜를 크게 옮겼을 때만
   * 궤도 지오메트리를 다시 만든다.
   */
  function rebuild(newJd) {
    for (const p of PLANETS) {
      const o = orbits[p.key];
      if (!o) continue;
      const samples = planetOrbitPath(p.key, newJd, 360);
      const pts = samples.map((s) =>
        eclipticToScene(s.lon, s.lat, auToUnits(s.r), new THREE.Vector3()),
      );
      const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
      const geo = new THREE.TubeGeometry(
        curve, tubularSegments, o.material.uniforms.uTubeRadius.value, radialSegments, true,
      );
      o.mesh.geometry.dispose();
      o.mesh.geometry = geo;
      o.curve = curve;
    }
  }

  return {
    group, orbits, moonOrbit, spinRings,
    update, setSpinTarget, setHighlight, rebuild, setPixelScale,
  };
}
