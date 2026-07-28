/**
 * orbits.js — "흐르는 빛" 궤도
 * 각 행성의 실제 역법 위치를 1주기 샘플링해 튜브를 만들고,
 * 커스텀 셰이더로 공전 방향으로 흐르는 빛 펄스 + 행성 위치 헤드 글로우를 그린다.
 * 전부 additive → 블룸에 걸린다.
 */
import * as THREE from "three";
import { planetHelio, periodDays, PLANET_KEYS, J2000 } from "./ephemeris.js";
import { helioToScene, MOON_ORBIT_R, VISUALS } from "./bodies.js";

const ORBIT_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ORBIT_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uHead;       // 행성 현재 위치 (궤도 arc-length 분율 0~1)
  uniform float uFlow;       // 펄스 흐름 속도
  uniform float uBoost;      // 호버 하이라이트
  uniform float uFade;       // 카메라 근접 페이드 (튜브 안에서 띠처럼 보이는 것 방지)
  uniform vec3 uColor;
  varying vec2 vUv;

  void main() {
    float x = vUv.x;
    // 행성 바로 뒤로 길게 페이드되는 꼬리 (공전 방향 반대로)
    float behind = fract(uHead - x);
    float head = exp(-behind * 7.0) * 1.7;
    // 공전 방향(+x)으로 흐르는 빛 펄스 여러 개
    float p = fract((uTime * uFlow - x) * 5.0);
    float pulse = exp(-p * 9.0) * 0.55;
    // 은은한 기본 라인
    float base = 0.045;
    vec3 c = uColor * (base + head + pulse) * uBoost * uFade;
    gl_FragColor = vec4(c, 1.0);
  }
`;

export function createOrbits(scene) {
  const orbits = {}; // key → { mesh, sTable, period, t0 }
  const t0 = J2000;

  for (const key of PLANET_KEYS) {
    const period = periodDays(key);
    const N = 256;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const { lon, lat, r } = planetHelio(key, t0 + (i / N) * period);
      pts.push(helioToScene(lon, lat, r, new THREE.Vector3()));
    }

    // 시간 분율 → arc-length 분율 변환 테이블
    // (이심 궤도에서 헤드 글로우가 행성과 정확히 겹치도록)
    const sTable = new Float32Array(N + 1);
    let total = 0;
    for (let i = 1; i <= N; i++) {
      total += pts[i % N].distanceTo(pts[i - 1]);
      sTable[i] = total;
    }
    for (let i = 0; i <= N; i++) sTable[i] /= total;

    const curve = new THREE.CatmullRomCurve3(pts, true, "centripetal");
    const orbitR = pts[0].length();
    const tubeR = Math.min(0.055 + orbitR * 0.0011, 0.22);
    const geo = new THREE.TubeGeometry(curve, 384, tubeR, 6, true);

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uHead: { value: 0 },
        uFlow: { value: 0.06 * Math.pow(365 / period, 0.35) },
        uBoost: { value: 1 },
        uFade: { value: 1 },
        uColor: { value: new THREE.Color(VISUALS[key].color) },
      },
      vertexShader: ORBIT_VERT,
      fragmentShader: ORBIT_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = -1;
    scene.add(mesh);
    orbits[key] = { mesh, sTable, period, mat, meanR: orbitR };
  }

  // 달 궤도 (지구를 따라다니는 은은한 원)
  const moonOrbit = (() => {
    const N = 128;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * MOON_ORBIT_R, 0, Math.sin(a) * MOON_ORBIT_R));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({
        color: 0x88aaff,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    scene.add(line);
    return line;
  })();

  /** 시간 분율 → arc 분율 */
  function timeToArc(sTable, f) {
    const N = sTable.length - 1;
    const x = f * N;
    const i = Math.floor(x);
    const t = x - i;
    return sTable[Math.min(i, N)] * (1 - t) + sTable[Math.min(i + 1, N)] * t;
  }

  function update(jd, time, earthPos, hoveredKey, cameraPos) {
    for (const key of PLANET_KEYS) {
      const o = orbits[key];
      const f = ((((jd - t0) / o.period) % 1) + 1) % 1;
      o.mat.uniforms.uHead.value = timeToArc(o.sTable, f);
      o.mat.uniforms.uTime.value = time;
      o.mat.uniforms.uBoost.value = hoveredKey === key ? 2.1 : 1;
      // 카메라가 궤도 링에 가까우면 페이드 (근접 뷰에서 화면을 덮는 띠 방지)
      if (cameraPos) {
        const rXZ = Math.hypot(cameraPos.x, cameraPos.z);
        const ringDist = Math.hypot(rXZ - o.meanR, cameraPos.y);
        o.mat.uniforms.uFade.value = Math.min(Math.max((ringDist - 4) / 8, 0), 1);
      }
    }
    moonOrbit.position.copy(earthPos);
  }

  return { orbits, update };
}
