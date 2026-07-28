/**
 * bodies.js — 태양 / 행성 / 달 / 소행성대 / 별밭 생성 및 갱신.
 *
 * 구조 (행성 1개 기준)
 *   anchor(Group, 궤도 위치)
 *     └ tilt(Group, 자전축 기울기)
 *         └ mesh(Mesh, 자전)
 *         └ clouds / atmosphere / ring …
 *
 * 위치는 ephemeris 가 계산한 **실제 황경/황위**를 쓰고, 거리만 압축한다.
 */

import * as THREE from 'three';
import {
  SUN,
  PLANETS,
  MOON,
  BODY_BY_KEY,
} from './data/bodies.js';
import {
  auToScene,
  radiusToScene,
  eclipticToScene,
  moonDistToScene,
  SUN_RADIUS,
  BELT_INNER_AU,
  BELT_OUTER_AU,
} from './scale.js';
import {
  planetPosition,
  moonGeocentric,
  DEG,
} from './ephemeris.js';
import { softCircleTexture, starSpriteTexture } from './textures.js';

/* ══════════════════════════════════════════════════════════════
   셰이더 조각
   ══════════════════════════════════════════════════════════════ */

const WORLD_VARYINGS_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const SRGB_HELPER = /* glsl */ `
  vec3 toLinearRGB(vec3 c) { return pow(max(c, vec3(0.0)), vec3(2.2)); }
`;

/* ── 태양 표면 ──────────────────────────────────────────────── */

const SUN_SURFACE_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uTime;
  uniform vec3 uHot;
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  ${SRGB_HELPER}

  void main() {
    // 표면이 느리게 흐르도록 UV 를 미세하게 흔든다
    vec2 uv = vUv;
    uv.x += sin(vUv.y * 18.0 + uTime * 0.06) * 0.0035;
    uv.y += cos(vUv.x * 22.0 + uTime * 0.045) * 0.0022;
    vec3 base = toLinearRGB(texture2D(uMap, uv).rgb);

    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float rim = pow(1.0 - max(dot(N, V), 0.0), 2.0);

    // 가장자리로 갈수록 더 뜨겁게 (림 브라이트닝)
    vec3 col = base * 2.4 + uHot * rim * 2.6;
    // 맥동
    col *= 1.0 + 0.045 * sin(uTime * 0.9);
    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ── 태양 코로나 (외곽 글로우) ──────────────────────────────── */

const CORONA_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColorInner;
  uniform vec3 uColorOuter;
  uniform float uIntensity;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  // 값 노이즈
  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
  }
  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = mix(
      mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
    return n;
  }
  float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.05; a *= 0.5; }
    return v;
  }

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    // 실루엣(가장자리)에서 가장 밝은 링
    float edge = 1.0 - abs(dot(N, V));
    float glow = pow(clamp(edge, 0.0, 1.0), 2.6);

    // 방사상으로 피어오르는 플라즈마 결
    float n = fbm(N * 3.4 + vec3(0.0, uTime * 0.05, uTime * 0.03));
    float streak = fbm(N * 9.0 - vec3(uTime * 0.09));
    float plasma = mix(n, streak, 0.45);

    float a = glow * (0.45 + 0.85 * plasma) * uIntensity;
    vec3 col = mix(uColorOuter, uColorInner, clamp(glow * 1.35, 0.0, 1.0));
    col *= (0.75 + 0.9 * plasma);

    gl_FragColor = vec4(col * a, a);
  }
`;

/* ── 지구 (주간/야간 + 대기) ────────────────────────────────── */

const EARTH_FRAG = /* glsl */ `
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform vec3 uSunPos;
  uniform vec3 uAtmo;
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  ${SRGB_HELPER}

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 L = normalize(uSunPos - vWorldPos);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float d = dot(N, L);

    vec3 day   = toLinearRGB(texture2D(uDay, vUv).rgb);
    vec3 night = toLinearRGB(texture2D(uNight, vUv).rgb);

    float dayAmt = smoothstep(-0.16, 0.24, d);
    vec3 lit = day * (0.06 + 1.15 * max(d, 0.0));
    // 야간 도시 불빛 — 그림자 쪽에서만
    vec3 dark = night * 2.6 * (1.0 - dayAmt);

    vec3 col = mix(dark, lit, dayAmt);

    // 새벽/황혼 띠
    float terminator = exp(-pow(d * 5.5, 2.0));
    col += vec3(1.0, 0.42, 0.14) * terminator * 0.22;

    // 프레넬 대기 산란
    float fres = pow(1.0 - max(dot(N, V), 0.0), 2.6);
    col += uAtmo * fres * (0.22 + 1.25 * max(d, 0.0));

    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ── 대기 헤일로 (지구/금성/천왕성/해왕성) ──────────────────── */

const ATMOSPHERE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uSunPos;
  uniform float uIntensity;
  uniform float uPower;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 L = normalize(uSunPos - vWorldPos);
    float f = pow(clamp(1.0 - abs(dot(N, V)), 0.0, 1.0), uPower);
    float lit = smoothstep(-0.45, 0.35, dot(N, L));
    float a = f * uIntensity * (0.12 + 0.95 * lit);
    gl_FragColor = vec4(uColor * a, a);
  }
`;

/* ── 고리 (본체 그림자 포함) ────────────────────────────────── */

const RING_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uSunPos;
  uniform vec3 uCenter;
  uniform float uPlanetRadius;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  ${SRGB_HELPER}

  void main() {
    vec4 t = texture2D(uMap, vUv);
    float alpha = t.a * uOpacity;
    if (alpha < 0.004) discard;

    vec3 col = toLinearRGB(t.rgb);

    // 행성 본체가 만드는 그림자
    vec3 toSun = normalize(uSunPos - vWorldPos);
    vec3 toCenter = uCenter - vWorldPos;
    float proj = dot(toCenter, toSun);
    float shade = 1.0;
    if (proj > 0.0) {
      float dist = length(toCenter - toSun * proj);
      shade = mix(0.18, 1.0, smoothstep(uPlanetRadius * 0.96, uPlanetRadius * 1.18, dist));
    }
    col *= shade;

    // 보는 각도가 얕을수록 진하게 (광학 두께)
    gl_FragColor = vec4(col * 1.15, alpha);
  }
`;

const RING_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

/* ══════════════════════════════════════════════════════════════
   생성기
   ══════════════════════════════════════════════════════════════ */

const SPHERE_SEG = [72, 48];

function makeSun(textures) {
  const group = new THREE.Group();
  group.name = 'sun';

  const surfaceMat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: textures.sun },
      uTime: { value: 0 },
      uHot: { value: new THREE.Color('#ffd79a') },
    },
    vertexShader: WORLD_VARYINGS_VERT,
    fragmentShader: SUN_SURFACE_FRAG,
    toneMapped: true,
  });

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(SUN_RADIUS, 96, 64),
    surfaceMat
  );
  mesh.userData.bodyKey = 'sun';
  mesh.name = 'sun-surface';
  group.add(mesh);

  // 코로나 껍질 2겹
  const coronaMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColorInner: { value: new THREE.Color('#fff0c4') },
      uColorOuter: { value: new THREE.Color('#ff6a10') },
      uIntensity: { value: 1.5 },
    },
    vertexShader: WORLD_VARYINGS_VERT,
    fragmentShader: CORONA_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide,
  });
  const corona = new THREE.Mesh(
    new THREE.SphereGeometry(SUN_RADIUS * 1.42, 64, 40),
    coronaMat
  );
  corona.renderOrder = 3;
  group.add(corona);

  const coronaOuterMat = coronaMat.clone();
  coronaOuterMat.uniforms = THREE.UniformsUtils.clone(coronaMat.uniforms);
  coronaOuterMat.uniforms.uIntensity.value = 0.55;
  coronaOuterMat.uniforms.uColorOuter.value = new THREE.Color('#ff9430');
  const coronaOuter = new THREE.Mesh(
    new THREE.SphereGeometry(SUN_RADIUS * 2.35, 48, 32),
    coronaOuterMat
  );
  coronaOuter.renderOrder = 2;
  group.add(coronaOuter);

  // 픽킹 보조 (라벨/클릭)
  const pick = new THREE.Mesh(
    new THREE.SphereGeometry(SUN_RADIUS * 1.12, 16, 12),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pick.userData.bodyKey = 'sun';
  group.add(pick);

  return {
    key: 'sun',
    data: SUN,
    group,
    mesh,
    pick,
    radius: SUN_RADIUS,
    materials: [surfaceMat, coronaMat, coronaOuterMat],
    coronaMaterials: [coronaMat, coronaOuterMat],
  };
}

function makeRing(planet, textures, planetRadius, sunPosRef) {
  const cfg = planet.ring;
  const inner = planetRadius * cfg.innerRatio;
  const outer = planetRadius * cfg.outerRatio;

  const geo = new THREE.RingGeometry(inner, outer, 220, 2);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const t = (v.length() - inner) / (outer - inner);
    uv.setXY(i, THREE.MathUtils.clamp(t, 0.001, 0.999), 0.5);
  }
  uv.needsUpdate = true;

  let map = textures.saturnRing;
  if (cfg.thin) {
    // 천왕성의 얇고 어두운 고리 — 전용 알파 램프
    map = makeThinRingTexture();
  }

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uSunPos: { value: sunPosRef },
      uCenter: { value: new THREE.Vector3() },
      uPlanetRadius: { value: planetRadius },
      uOpacity: { value: cfg.opacity },
    },
    vertexShader: RING_VERT,
    fragmentShader: RING_FRAG,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2; // 적도면에 눕힌다
  mesh.renderOrder = 1;
  return { mesh, mat };
}

let _thinRing = null;
function makeThinRingTexture() {
  if (_thinRing) return _thinRing;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 4;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 4);
  // 천왕성 고리 = 아주 좁은 띠 몇 개
  const bands = [0.08, 0.22, 0.35, 0.52, 0.7, 0.86, 0.95];
  for (const b of bands) {
    const x = b * 512;
    const grd = g.createLinearGradient(x - 5, 0, x + 5, 0);
    grd.addColorStop(0, 'rgba(190,220,230,0)');
    grd.addColorStop(0.5, 'rgba(200,232,240,0.85)');
    grd.addColorStop(1, 'rgba(190,220,230,0)');
    g.fillStyle = grd;
    g.fillRect(x - 5, 0, 10, 4);
  }
  _thinRing = new THREE.CanvasTexture(c);
  _thinRing.colorSpace = THREE.SRGBColorSpace;
  return _thinRing;
}

function makePlanet(data, textures, sunPosRef) {
  const radius = radiusToScene(data.diameterKm / 2);

  const anchor = new THREE.Group();
  anchor.name = `anchor-${data.key}`;

  const tilt = new THREE.Group();
  // 자전축 기울기 — 황도면 기준으로 기울인다
  tilt.rotation.z = data.axialTiltDeg * DEG;
  anchor.add(tilt);

  const materials = [];
  let mesh;

  if (data.key === 'earth') {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uDay: { value: textures.earth },
        uNight: { value: textures.earthNight },
        uSunPos: { value: sunPosRef },
        uAtmo: { value: new THREE.Color('#5aa8ff') },
      },
      vertexShader: WORLD_VARYINGS_VERT,
      fragmentShader: EARTH_FRAG,
    });
    materials.push(mat);
    mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), mat);
  } else {
    const mat = new THREE.MeshStandardMaterial({
      map: textures[data.textures.map],
      roughness: data.key === 'venus' ? 0.95 : 0.88,
      metalness: 0.02,
      emissive: new THREE.Color(data.color).multiplyScalar(0.055),
    });
    materials.push(mat);
    mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, SPHERE_SEG[0], SPHERE_SEG[1]),
      mat
    );
  }

  mesh.name = data.key;
  mesh.userData.bodyKey = data.key;
  tilt.add(mesh);

  // ── 구름 레이어
  let clouds = null;
  if (data.textures.clouds) {
    const cloudMat = new THREE.MeshStandardMaterial({
      map: textures[data.textures.clouds],
      alphaMap: data.key === 'earth' ? textures.earthClouds : null,
      transparent: true,
      opacity: data.key === 'earth' ? 0.62 : 0.5,
      depthWrite: false,
      roughness: 1,
      metalness: 0,
      blending: data.key === 'earth' ? THREE.NormalBlending : THREE.NormalBlending,
    });
    if (data.key === 'earth') {
      // 흑백 구름 맵을 알파로 쓰고 색은 흰색
      cloudMat.map = null;
      cloudMat.color = new THREE.Color('#ffffff');
      cloudMat.alphaMap = textures.earthClouds;
    }
    materials.push(cloudMat);
    clouds = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.012, 64, 40),
      cloudMat
    );
    clouds.renderOrder = 1;
    tilt.add(clouds);
  }

  // ── 대기 헤일로
  let atmosphere = null;
  const ATMO = {
    earth: { color: '#63b4ff', intensity: 1.15, power: 3.0, scale: 1.09 },
    venus: { color: '#ffe1a3', intensity: 0.85, power: 3.2, scale: 1.07 },
    mars: { color: '#ff9a6b', intensity: 0.4, power: 3.4, scale: 1.05 },
    jupiter: { color: '#ffd9a8', intensity: 0.5, power: 3.4, scale: 1.035 },
    saturn: { color: '#ffeec2', intensity: 0.42, power: 3.4, scale: 1.035 },
    uranus: { color: '#9ff0ff', intensity: 0.7, power: 3.2, scale: 1.06 },
    neptune: { color: '#7fa4ff', intensity: 0.75, power: 3.2, scale: 1.06 },
  }[data.key];
  if (ATMO) {
    const aMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(ATMO.color) },
        uSunPos: { value: sunPosRef },
        uIntensity: { value: ATMO.intensity },
        uPower: { value: ATMO.power },
      },
      vertexShader: WORLD_VARYINGS_VERT,
      fragmentShader: ATMOSPHERE_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.BackSide,
    });
    materials.push(aMat);
    atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(radius * ATMO.scale, 48, 32),
      aMat
    );
    atmosphere.renderOrder = 2;
    tilt.add(atmosphere);
  }

  // ── 고리
  let ring = null;
  if (data.ring) {
    ring = makeRing(data, textures, radius, sunPosRef);
    materials.push(ring.mat);
    tilt.add(ring.mesh);
  }

  // ── 픽킹 보조 구 (작은 행성도 쉽게 클릭)
  const pickRadius = Math.max(radius * 1.35, 2.6);
  const pick = new THREE.Mesh(
    new THREE.SphereGeometry(pickRadius, 14, 10),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pick.userData.bodyKey = data.key;
  anchor.add(pick);

  // ── 호버 하이라이트 링 (빌보드)
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(radius * 1.55, radius * 1.72, 64),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(data.labelColor),
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    })
  );
  halo.renderOrder = 5;
  anchor.add(halo);

  return {
    key: data.key,
    data,
    anchor,
    tilt,
    mesh,
    clouds,
    atmosphere,
    ring,
    pick,
    halo,
    radius,
    materials,
    spinSign: data.rotationHours < 0 ? -1 : 1,
    rotationDays: Math.abs(data.rotationHours) / 24,
    orbitRadius: auToScene(data.distanceAu),
  };
}

function makeMoon(textures) {
  const radius = radiusToScene(MOON.diameterKm / 2);
  const anchor = new THREE.Group();
  anchor.name = 'anchor-moon';

  const tilt = new THREE.Group();
  tilt.rotation.z = MOON.axialTiltDeg * DEG;
  anchor.add(tilt);

  const mat = new THREE.MeshStandardMaterial({
    map: textures.moon,
    roughness: 0.96,
    metalness: 0,
    emissive: new THREE.Color('#1a1a20'),
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 44), mat);
  mesh.name = 'moon';
  mesh.userData.bodyKey = 'moon';
  tilt.add(mesh);

  const pick = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(radius * 2.2, 1.4), 14, 10),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pick.userData.bodyKey = 'moon';
  anchor.add(pick);

  const halo = new THREE.Mesh(
    new THREE.RingGeometry(radius * 2.0, radius * 2.25, 48),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(MOON.labelColor),
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    })
  );
  halo.renderOrder = 5;
  anchor.add(halo);

  return {
    key: 'moon',
    data: MOON,
    anchor,
    tilt,
    mesh,
    pick,
    halo,
    radius,
    materials: [mat],
    spinSign: 1,
    rotationDays: MOON.rotationHours / 24,
  };
}

/* ── 소행성대 (InstancedMesh 1 드로우콜) ────────────────────── */

function makeAsteroidBelt(count = 2600) {
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x8b7f6f,
    roughness: 1,
    metalness: 0.05,
    flatShading: true,
    emissive: 0x1a1712,
  });

  // 인스턴스별 공전 각속도(라디안/일)를 GPU 에서 적용 → 드로우콜 1개 유지
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSimDays = { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         attribute float aOrbitSpeed;
         uniform float uSimDays;`
      )
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition = vec4( transformed, 1.0 );
         #ifdef USE_INSTANCING
           mvPosition = instanceMatrix * mvPosition;
         #endif
         float aAng = uSimDays * aOrbitSpeed;
         float aCos = cos(aAng);
         float aSin = sin(aAng);
         mvPosition.xz = vec2(
           mvPosition.x * aCos + mvPosition.z * aSin,
          -mvPosition.x * aSin + mvPosition.z * aCos
         );
         mvPosition = modelViewMatrix * mvPosition;
         gl_Position = projectionMatrix * mvPosition;`
      );
    mat.userData.shader = shader;
  };

  const inst = new THREE.InstancedMesh(geo, mat, count);
  inst.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  inst.frustumCulled = false;

  const speeds = new Float32Array(count);
  const dummy = new THREE.Object3D();
  const innerR = auToScene(BELT_INNER_AU);
  const outerR = auToScene(BELT_OUTER_AU);

  for (let i = 0; i < count; i++) {
    // 실제 소행성대처럼 안쪽에 살짝 더 몰리게
    const t = Math.pow(Math.random(), 0.85);
    const au = BELT_INNER_AU + (BELT_OUTER_AU - BELT_INNER_AU) * t;
    const r = innerR + (outerR - innerR) * t;
    const lon = Math.random() * Math.PI * 2;
    const inc = (Math.random() - 0.5) * 0.16;
    const jitter = (Math.random() - 0.5) * 2.4;

    dummy.position.set(
      Math.cos(lon) * (r + jitter),
      Math.sin(inc) * (r * 0.055) + (Math.random() - 0.5) * 1.6,
      -Math.sin(lon) * (r + jitter)
    );
    const s = 0.035 + Math.pow(Math.random(), 3) * 0.32;
    dummy.scale.set(s, s * (0.6 + Math.random() * 0.7), s * (0.7 + Math.random() * 0.6));
    dummy.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);

    // 케플러 제3법칙: 주기 = a^1.5 년
    const periodDays = 365.25 * Math.pow(au, 1.5);
    speeds[i] = (Math.PI * 2) / periodDays;
  }
  inst.instanceMatrix.needsUpdate = true;
  geo.setAttribute('aOrbitSpeed', new THREE.InstancedBufferAttribute(speeds, 1));

  // 먼지 — 소프트 원형 스프라이트 (기본 사각형 금지)
  const dustCount = 5000;
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    const t = Math.random();
    const r = innerR + (outerR - innerR) * t + (Math.random() - 0.5) * 4;
    const lon = Math.random() * Math.PI * 2;
    dustPos[i * 3] = Math.cos(lon) * r;
    dustPos[i * 3 + 1] = (Math.random() - 0.5) * 2.6;
    dustPos[i * 3 + 2] = -Math.sin(lon) * r;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      size: 0.6,
      map: softCircleTexture(),
      alphaMap: softCircleTexture(),
      color: 0xb9a98f,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })
  );
  dust.frustumCulled = false;

  const group = new THREE.Group();
  group.name = 'asteroid-belt';
  group.add(inst, dust);

  return { group, inst, dust, mat };
}

/* ── 배경 (은하수 스카이박스 + 별 파티클) ───────────────────── */

function makeBackground(textures) {
  const group = new THREE.Group();
  group.name = 'background';

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(11000, 64, 40),
    new THREE.MeshBasicMaterial({
      map: textures.stars,
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: false,
      color: 0x9fb4d8,
    })
  );
  sky.name = 'skybox';
  // 은하면을 황도면에 대해 기울여 놓는다 (실제 약 60°)
  sky.rotation.set(-0.35, 1.1, -1.05);
  sky.renderOrder = -100;
  group.add(sky);

  // 추가 별 파티클 3겹
  const layers = [
    { n: 5200, rMin: 2600, rMax: 5200, size: 5.5, color: 0xdce9ff, op: 0.85 },
    { n: 3200, rMin: 1400, rMax: 2800, size: 3.4, color: 0xfff0d8, op: 0.6 },
    { n: 2000, rMin: 700, rMax: 1500, size: 2.2, color: 0xcfe4ff, op: 0.42 },
  ];
  const starMeshes = [];
  for (const L of layers) {
    const pos = new Float32Array(L.n * 3);
    const scale = new Float32Array(L.n);
    for (let i = 0; i < L.n; i++) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const r = L.rMin + Math.random() * (L.rMax - L.rMin);
      pos[i * 3] = Math.cos(th) * s * r;
      pos[i * 3 + 1] = u * r;
      pos[i * 3 + 2] = Math.sin(th) * s * r;
      scale[i] = 0.35 + Math.pow(Math.random(), 2.4) * 1.9;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({
      size: L.size,
      map: starSpriteTexture(),
      alphaMap: starSpriteTexture(),
      color: L.color,
      transparent: true,
      opacity: L.op,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const p = new THREE.Points(g, m);
    p.frustumCulled = false;
    p.renderOrder = -50;
    group.add(p);
    starMeshes.push(p);
  }

  return { group, sky, starMeshes };
}

/* ══════════════════════════════════════════════════════════════
   태양계 조립
   ══════════════════════════════════════════════════════════════ */

export function createSolarSystem(textures) {
  const root = new THREE.Group();
  root.name = 'solar-system';

  const sunPosRef = new THREE.Vector3(0, 0, 0);

  const sun = makeSun(textures);
  root.add(sun.group);

  // 태양 = 광원
  const sunLight = new THREE.PointLight(0xfff2dc, 4.2, 0, 0.0);
  sunLight.position.set(0, 0, 0);
  root.add(sunLight);
  root.add(new THREE.AmbientLight(0x2a3550, 0.42));

  const planets = PLANETS.map((d) => makePlanet(d, textures, sunPosRef));
  for (const p of planets) root.add(p.anchor);

  const moon = makeMoon(textures);
  const earth = planets.find((p) => p.key === 'earth');
  earth.anchor.add(moon.anchor);

  const belt = makeAsteroidBelt();
  root.add(belt.group);

  const bg = makeBackground(textures);
  root.add(bg.group);

  const pickables = [
    sun.pick,
    ...planets.map((p) => p.pick),
    moon.pick,
    sun.mesh,
    ...planets.map((p) => p.mesh),
    moon.mesh,
  ];

  const byKey = { sun, moon };
  for (const p of planets) byKey[p.key] = p;

  return {
    root,
    sun,
    sunLight,
    planets,
    moon,
    earth,
    belt,
    background: bg,
    pickables,
    byKey,
    sunPosRef,
    /** 마지막으로 계산한 천체별 월드 좌표 */
    worldPos: {},
  };
}

/* ══════════════════════════════════════════════════════════════
   달 보조선 — 지구·달·태양 관계 설명용
   ══════════════════════════════════════════════════════════════ */

const HEMI_FRAG = /* glsl */ `
  uniform vec3 uSunPos;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 L = normalize(uSunPos - vWorldPos);
    float lit = smoothstep(-0.02, 0.16, dot(N, L));
    if (lit < 0.01) discard;
    float rim = pow(1.0 - abs(dot(N, V)), 2.2);
    float a = (0.10 + rim * 0.9) * lit * uOpacity;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

/**
 * 달을 선택했을 때 보이는 보조선 묶음.
 *  · 태양광 방향 화살표
 *  · 밝은 반구(햇빛 받는 쪽) 표시 + 명암 경계 링
 *  · 지구에서 달을 보는 시선
 */
export function createMoonHelpers(system) {
  const group = new THREE.Group();
  group.name = 'moon-helpers';
  group.visible = false;
  const R = system.moon.radius;

  // 태양광 방향 화살표 (달 → 태양)
  const arrow = new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 0, 0),
    R * 9,
    0xffb45c,
    R * 2.2,
    R * 1.1
  );
  arrow.line.material.transparent = true;
  arrow.line.material.opacity = 0.9;
  arrow.line.material.blending = THREE.AdditiveBlending;
  arrow.cone.material.transparent = true;
  arrow.cone.material.blending = THREE.AdditiveBlending;
  group.add(arrow);

  // 햇빛 받는 반구
  const hemiMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunPos: { value: system.sunPosRef },
      uColor: { value: new THREE.Color('#ffd79a') },
      uOpacity: { value: 1 },
    },
    vertexShader: WORLD_VARYINGS_VERT,
    fragmentShader: HEMI_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  const hemi = new THREE.Mesh(new THREE.SphereGeometry(R * 1.06, 48, 32), hemiMat);
  hemi.renderOrder = 4;
  group.add(hemi);

  // 명암 경계(터미네이터) 링 — 축이 태양 방향
  const term = new THREE.Mesh(
    new THREE.TorusGeometry(R * 1.06, R * 0.028, 6, 96),
    new THREE.MeshBasicMaterial({
      color: 0xfff0cc,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  term.renderOrder = 5;
  group.add(term);

  // 지구에서 달을 보는 시선
  const sightGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(),
    new THREE.Vector3(0, 0, 1),
  ]);
  const sight = new THREE.Line(
    sightGeo,
    new THREE.LineDashedMaterial({
      color: 0x5fe8ff,
      transparent: true,
      opacity: 0.55,
      dashSize: 0.35,
      gapSize: 0.25,
      blending: THREE.AdditiveBlending,
    })
  );
  group.add(sight);

  system.moon.anchor.add(group);
  return { group, arrow, hemi, term, sight, sightGeo };
}

const _sunDir = new THREE.Vector3();
const _earthLocal = new THREE.Vector3();

/** 매 프레임 보조선 방향 갱신 */
export function updateMoonHelpers(helpers, system) {
  if (!helpers.group.visible) return;
  const moonPos = system.worldPos.moon;
  const earthPos = system.worldPos.earth;
  if (!moonPos || !earthPos) return;

  // 달 로컬 기준 태양 방향
  _sunDir.copy(system.worldPos.sun).sub(moonPos).normalize();
  const inv = system.moon.anchor.matrixWorld.clone().invert();
  const localSun = _sunDir.clone().transformDirection(inv).normalize();
  helpers.arrow.setDirection(localSun);

  // 터미네이터 링: 링의 기본 축은 +Z 이므로 태양 방향으로 맞춘다
  helpers.term.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), localSun);

  // 지구 방향 시선
  _earthLocal.copy(earthPos).sub(moonPos);
  const len = _earthLocal.length();
  _earthLocal.transformDirection(inv).multiplyScalar(len);
  const pos = helpers.sightGeo.attributes.position;
  pos.setXYZ(1, _earthLocal.x, _earthLocal.y, _earthLocal.z);
  pos.needsUpdate = true;
  helpers.sight.computeLineDistances();
}

/* ══════════════════════════════════════════════════════════════
   갱신
   ══════════════════════════════════════════════════════════════ */

const _v = new THREE.Vector3();

/**
 * 주어진 율리우스일로 모든 천체를 배치한다.
 * 각도(황경/황위)는 실제값, 거리만 압축.
 */
export function updateBodies(system, jd) {
  // ── 행성
  for (const p of system.planets) {
    const st = planetPosition(p.key, jd);
    const r = auToScene(st.r);
    eclipticToScene(st.lon, st.lat, r, _v);
    p.anchor.position.copy(_v);
    p.currentAu = st.r;
    p.currentLon = st.lon;

    // 자전 (실제 방향/주기 반영)
    const spin = ((jd / p.rotationDays) % 1) * Math.PI * 2 * p.spinSign;
    p.mesh.rotation.y = spin;
    if (p.clouds) p.clouds.rotation.y = spin * 1.06;

    if (p.ring) {
      p.ring.mat.uniforms.uCenter.value.copy(p.anchor.position);
    }
  }

  // ── 달 (지구 기준 지심 좌표)
  const m = moonGeocentric(jd);
  const mr = moonDistToScene(m.distKm);
  eclipticToScene(m.lon, m.lat, mr, _v);
  system.moon.anchor.position.copy(_v);
  system.moon.currentGeo = m;
  // 조석 고정: 항상 지구를 향한 면이 보이도록
  system.moon.mesh.rotation.y = -m.lon * DEG - Math.PI / 2;

  // ── 월드 좌표 캐시
  system.root.updateMatrixWorld(true);
  const wp = system.worldPos;
  wp.sun = system.sun.group.getWorldPosition(wp.sun || new THREE.Vector3());
  for (const p of system.planets) {
    wp[p.key] = p.anchor.getWorldPosition(wp[p.key] || new THREE.Vector3());
  }
  wp.moon = system.moon.anchor.getWorldPosition(wp.moon || new THREE.Vector3());
}

/** 프레임마다 호출되는 시각 효과 갱신 */
export function updateBodyEffects(system, elapsed, simDays) {
  for (const mat of system.sun.materials) {
    if (mat.uniforms?.uTime) mat.uniforms.uTime.value = elapsed;
  }
  const shader = system.belt.mat.userData.shader;
  if (shader) shader.uniforms.uSimDays.value = simDays;
}

/** 천체의 씬 반지름 */
export function bodyRadius(system, key) {
  const b = system.byKey[key];
  return b ? b.radius : 1;
}

export { BODY_BY_KEY };
