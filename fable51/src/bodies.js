// bodies.js — 태양/행성/달/소행성대 생성 + 실제 역법 기반 위치·자전 갱신
import * as THREE from 'three';
import { BODIES, BODY_MAP, PLANET_IDS } from './data/bodies.js';
import { planetPosition, planetOrbitPath, moonPosition, J2000 } from './ephemeris.js';
import { makeSoftParticleTexture } from './textures.js';

const DEG = Math.PI / 180;

// ---- 교육용 압축 스케일: 행성 크기 상대비 유지, 거리는 로그 압축
export const EARTH_R = 1.2;          // 지구 반지름 (씬 단위)
export const SUN_R = 16;             // 태양은 별도 축소 (실제는 지구의 109배)
export const MOON_DIST = 4.4;        // 지구-달 평균 거리 (씬 단위, 과장)
export const MOON_MEAN_ER = 60.2666; // 달 평균 거리 (지구 반지름)

export function compressAU(au) {
  return 55 * Math.log(1 + au / 0.3);
}

// 황경/황위/거리 → 씬 좌표. 황도면 = XZ, +Y = 황도 북극. 황경은 +Y 에서 볼 때 반시계 방향.
export function eclipticToScene(lonDeg, latDeg, r, out = new THREE.Vector3()) {
  const lon = lonDeg * DEG, lat = latDeg * DEG;
  return out.set(r * Math.cos(lat) * Math.cos(lon), r * Math.sin(lat), -r * Math.cos(lat) * Math.sin(lon));
}

export function planetOrbitScenePoints(name, jd, samples = 256) {
  const { points } = planetOrbitPath(name, jd, samples);
  return points.map((p) => eclipticToScene(p.lon, p.lat, compressAU(p.r)));
}

export function moonOrbitScenePoints(samples = 128) {
  const pts = [];
  for (let i = 0; i < samples; i++) pts.push(eclipticToScene((i / samples) * 360, 0, MOON_DIST));
  return pts;
}

// ---------------------------------------------------------------- 셰이더
const FRESNEL_VERT = /* glsl */`
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const ATMOSPHERE_FRAG = /* glsl */`
  uniform vec3 uColor;
  uniform vec3 uSunDir;
  uniform float uStrength;
  uniform float uPower;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vPosW);
    float rim = pow(1.0 - max(dot(n, v), 0.0), uPower);
    float lit = 0.25 + 0.75 * smoothstep(-0.35, 0.45, dot(n, uSunDir));
    gl_FragColor = vec4(uColor * rim * lit * uStrength, rim * lit);
  }
`;

const EARTH_VERT = /* glsl */`
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const EARTH_FRAG = /* glsl */`
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform vec3 uSunDir;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec2 vUv;
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vPosW);
    float ndl = dot(n, uSunDir);
    float day = smoothstep(-0.10, 0.22, ndl);
    vec3 dayC = texture2D(uDay, vUv).rgb * (0.04 + 1.15 * max(ndl, 0.0));
    vec3 nightC = texture2D(uNight, vUv).rgb;
    nightC = nightC * vec3(1.0, 0.85, 0.6) * 1.8;
    vec3 col = dayC * day + nightC * (1.0 - day);
    // 황혼 띠
    col += vec3(1.0, 0.45, 0.15) * pow(1.0 - abs(ndl), 10.0) * 0.12;
    // 대기 프레넬 (밝은 쪽 위주)
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    col += vec3(0.35, 0.65, 1.0) * fres * (0.15 + 0.85 * day) * 0.45;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const CORONA_VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const CORONA_FRAG = /* glsl */`
  uniform float uTime;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.1; a *= 0.5; }
    return s;
  }
  void main() {
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;           // 0 중심 ~ 1 가장자리
    float a = atan(p.y, p.x);
    // 각도 방향 노이즈 (심 있는 코로나 줄기)
    float n = fbm(vec2(a * 2.5 + uTime * 0.03, r * 3.0 - uTime * 0.12));
    float n2 = fbm(vec2(a * 6.0 - uTime * 0.05, r * 8.0));
    float core = exp(-r * 4.5) * 1.6;
    float streaks = pow(max(0.0, 1.0 - r), 2.2) * (0.35 + 0.65 * n) * (0.6 + 0.4 * n2);
    float glow = (core + streaks * 0.9) * smoothstep(1.0, 0.15, r);
    vec3 col = mix(vec3(1.0, 0.42, 0.08), vec3(1.0, 0.86, 0.55), clamp(core, 0.0, 1.0));
    gl_FragColor = vec4(col * glow * 1.1, 1.0);
  }
`;

function fresnelShell(radius, color, { sunDirUniform, strength = 1.0, power = 3.0, side = THREE.FrontSide, segments = 48 } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uSunDir: sunDirUniform || { value: new THREE.Vector3(1, 0, 0) },
      uStrength: { value: strength },
      uPower: { value: power },
    },
    vertexShader: FRESNEL_VERT, fragmentShader: ATMOSPHERE_FRAG,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, segments, segments / 2), mat);
  mesh.renderOrder = 1;
  return mesh;
}

// ---------------------------------------------------------------- 생성
export function createBodies(scene, textures) {
  const list = [];
  const map = {};
  const sunDirUniform = { value: new THREE.Vector3(1, 0, 0) }; // 지구용 (지구→태양 방향)

  // ---- 조명
  const sunLight = new THREE.PointLight(0xfff2dc, 2.6, 0, 0);
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0x38424f, 0.45));

  // ---- 태양
  const sunData = BODY_MAP.sun;
  const sunGroup = new THREE.Group();
  const sunMat = new THREE.MeshBasicMaterial({ map: textures.sun, color: new THREE.Color(2.2, 1.9, 1.55) });
  const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(SUN_R, 96, 64), sunMat);
  sunGroup.add(sunMesh);
  const sunShell = fresnelShell(SUN_R * 1.03, 0xff9a33, { strength: 1.6, power: 2.2 });
  sunShell.material.uniforms.uSunDir.value.set(0, 0, 0); // lit 항상 0.25 → 균일
  sunShell.material.uniforms.uStrength.value = 4.0;
  sunGroup.add(sunShell);
  const coronaMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } }, vertexShader: CORONA_VERT, fragmentShader: CORONA_FRAG,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const corona = new THREE.Mesh(new THREE.PlaneGeometry(SUN_R * 6.5, SUN_R * 6.5), coronaMat);
  corona.renderOrder = 1;
  sunGroup.add(corona);
  scene.add(sunGroup);
  const sun = {
    id: 'sun', data: sunData, group: sunGroup, tilt: sunGroup, mesh: sunMesh, radius: SUN_R, isSun: true,
    corona, coronaMat, highlight: null,
    worldPosition(out = new THREE.Vector3()) { return out.set(0, 0, 0); },
  };
  list.push(sun); map.sun = sun;

  // ---- 행성
  const ringTex = textures.saturnRing;
  for (const id of PLANET_IDS) {
    const data = BODY_MAP[id];
    const radius = data.radiusEarth * EARTH_R;
    const group = new THREE.Group();        // 궤도 위치
    const tilt = new THREE.Group();         // 자전축 기울기
    tilt.rotation.z = data.axialTilt * DEG;
    group.add(tilt);

    let mesh;
    const geo = new THREE.SphereGeometry(radius, 96, 64);
    const extra = {};
    if (id === 'earth') {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uDay: { value: textures.earthDay }, uNight: { value: textures.earthNight }, uSunDir: sunDirUniform },
        vertexShader: EARTH_VERT, fragmentShader: EARTH_FRAG,
      });
      mesh = new THREE.Mesh(geo, mat);
      // 구름
      const clouds = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 1.012, 96, 64),
        new THREE.MeshLambertMaterial({ color: 0xffffff, alphaMap: textures.earthClouds, transparent: true, depthWrite: false, opacity: 0.9 }),
      );
      clouds.renderOrder = 1;
      tilt.add(clouds);
      extra.clouds = clouds;
      // 대기 글로우 (프레넬)
      const atmo = fresnelShell(radius * 1.07, 0x5fb6ff, { sunDirUniform, strength: 1.4, power: 3.2 });
      tilt.add(atmo);
      const atmoOuter = fresnelShell(radius * 1.16, 0x3f8cff, { sunDirUniform, strength: 0.7, power: 6.0, side: THREE.BackSide });
      tilt.add(atmoOuter);
      extra.atmo = atmo;
    } else {
      const mat = new THREE.MeshStandardMaterial({ map: textures[data.texture], roughness: 0.92, metalness: 0.0 });
      if (id === 'venus') { mat.roughness = 0.75; }
      mesh = new THREE.Mesh(geo, mat);
    }
    tilt.add(mesh);

    // 고리
    if (data.ring) {
      const inner = radius * data.ring.inner, outer = radius * data.ring.outer;
      const rg = new THREE.RingGeometry(inner, outer, 160, 1);
      const pos = rg.attributes.position, uv = rg.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const r = Math.hypot(pos.getX(i), pos.getY(i));
        uv.setXY(i, (r - inner) / (outer - inner), 0.5);
      }
      let rmat;
      if (data.ring.thin) {
        rmat = new THREE.MeshBasicMaterial({ color: 0xa8e8ee, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
      } else {
        rmat = new THREE.MeshBasicMaterial({ map: ringTex, color: 0xd9d0bf, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.95 });
      }
      const ring = new THREE.Mesh(rg, rmat);
      ring.rotation.x = -Math.PI / 2;
      ring.renderOrder = 1;
      tilt.add(ring);
      extra.ring = ring;
    }

    // 호버/선택 하이라이트 셸
    const highlight = fresnelShell(radius * 1.05, data.color, { strength: 0, power: 2.5 });
    highlight.material.uniforms.uSunDir.value.set(0, 0, 0);
    tilt.add(highlight);

    scene.add(group);
    const body = {
      id, data, group, tilt, mesh, radius, extra, highlight,
      worldPosition(out = new THREE.Vector3()) { return group.getWorldPosition(out); },
    };
    list.push(body); map[id] = body;
  }

  // ---- 달 (지구 시스템의 자식)
  {
    const data = BODY_MAP.moon;
    const earth = map.earth;
    const radius = data.radiusEarth * EARTH_R;
    const group = new THREE.Group();
    const tilt = new THREE.Group();
    group.add(tilt);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 64, 48),
      new THREE.MeshStandardMaterial({ map: textures.moon, roughness: 0.95, metalness: 0 }),
    );
    tilt.add(mesh);
    const highlight = fresnelShell(radius * 1.06, data.color, { strength: 0, power: 2.5 });
    highlight.material.uniforms.uSunDir.value.set(0, 0, 0);
    tilt.add(highlight);
    earth.group.add(group);

    // 지구-달-태양 보조선 (달 선택 시)
    const helpers = new THREE.Group();
    helpers.visible = false;
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), radius * 5, 0xffb347, radius * 1.2, radius * 0.6);
    helpers.add(arrow);
    const rayMat = new THREE.LineBasicMaterial({ color: 0xffc766, transparent: true, opacity: 0.55 });
    const rays = [];
    for (let i = 0; i < 5; i++) {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const line = new THREE.Line(g, rayMat);
      helpers.add(line);
      rays.push(line);
    }
    // 밝은 반구 표시 (태양을 향한 반구)
    const hemi = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.12, 48, 24, 0, Math.PI),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    hemi.renderOrder = 2;
    helpers.add(hemi);
    // 지구-달 연결선
    const linkGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const link = new THREE.Line(linkGeo, new THREE.LineDashedMaterial({ color: 0x5ee7ff, dashSize: 0.15, gapSize: 0.1, transparent: true, opacity: 0.6 }));
    helpers.add(link);
    earth.group.add(helpers);

    const body = {
      id: 'moon', data, group, tilt, mesh, radius, extra: { helpers, arrow, rays, hemi, link }, highlight, parent: earth,
      worldPosition(out = new THREE.Vector3()) { return group.getWorldPosition(out); },
    };
    list.push(body); map.moon = body;
  }

  // ---- 소행성대 (InstancedMesh 1 드로우콜 + 소프트 파티클 먼지)
  const belt = new THREE.Group();
  const rockCount = 3600;
  const rockGeo = new THREE.IcosahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x9a9083, roughness: 1, metalness: 0, flatShading: true });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
  const rIn = compressAU(2.1), rOut = compressAU(3.35);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  for (let i = 0; i < rockCount; i++) {
    const r = rIn + (rOut - rIn) * (0.5 + 0.5 * gauss());
    const a = Math.random() * Math.PI * 2;
    v3.set(r * Math.cos(a), gauss() * 2.2, -r * Math.sin(a));
    e.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
    q.setFromEuler(e);
    const s = 0.06 + Math.pow(Math.random(), 2.5) * 0.32;
    s3.set(s * (0.7 + Math.random() * 0.6), s, s * (0.7 + Math.random() * 0.6));
    m4.compose(v3, q, s3);
    rocks.setMatrixAt(i, m4);
  }
  rocks.instanceMatrix.needsUpdate = true;
  belt.add(rocks);
  const dustCount = 5000;
  const dp = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    const r = rIn + (rOut - rIn) * (0.5 + 0.5 * gauss());
    const a = Math.random() * Math.PI * 2;
    dp[i * 3] = r * Math.cos(a); dp[i * 3 + 1] = gauss() * 2.6; dp[i * 3 + 2] = -r * Math.sin(a);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    map: makeSoftParticleTexture(32), color: 0xb0a898, size: 0.9, sizeAttenuation: true,
    transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  belt.add(dust);
  scene.add(belt);

  // ---------------------------------------------------------------- 갱신
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), earthW = new THREE.Vector3(), moonW = new THREE.Vector3();
  const sunDirLocal = new THREE.Vector3();

  function update(jd, elapsed, camera) {
    const days = jd - J2000;
    // 행성 위치 + 자전
    for (const id of PLANET_IDS) {
      const b = map[id];
      const p = planetPosition(id, jd);
      eclipticToScene(p.lon, p.lat, compressAU(p.r), b.group.position);
      let spin = (days * 24 / b.data.rotationHours) * Math.PI * 2;
      if (id === 'earth') {
        // 그리니치(텍스처 중앙, 로컬 +X)가 UTC 12:00 에 태양을 향하도록
        const psiSun = Math.atan2(b.group.position.z, -b.group.position.x); // 지구→태양 방향의 씬 경도
        spin = psiSun + (jd - Math.floor(jd)) * Math.PI * 2;
      }
      b.mesh.rotation.y = spin % (Math.PI * 2);
      if (b.extra.clouds) b.extra.clouds.rotation.y = (spin * 1.03 + 0.4) % (Math.PI * 2);
    }
    // 지구→태양 방향 (지구 셰이더용)
    const earth = map.earth;
    earth.worldPosition(earthW);
    sunDirUniform.value.copy(earthW).multiplyScalar(-1).normalize();

    // 달: 지심 황경/황위 실제값, 거리는 과장 스케일
    const moon = map.moon;
    const mp = moonPosition(jd);
    eclipticToScene(mp.lon, mp.lat, MOON_DIST * (mp.dist / MOON_MEAN_ER), moon.group.position);
    // 조석 고정: 근접면(텍스처 중앙 = 로컬 +X)이 항상 지구를 향함
    const toEarth = tmp.copy(moon.group.position).multiplyScalar(-1);
    moon.mesh.rotation.y = Math.atan2(-toEarth.z, toEarth.x);

    // 달 보조선
    const h = moon.extra;
    if (h.helpers.visible) {
      // 태양 방향 (지구 시스템 로컬 = 월드 방향)
      sunDirLocal.copy(earthW).add(moon.group.position).multiplyScalar(-1).normalize();
      h.arrow.position.copy(moon.group.position);
      h.arrow.setDirection(sunDirLocal);
      h.hemi.position.copy(moon.group.position);
      h.hemi.lookAt(tmp2.copy(moon.group.position).add(sunDirLocal));
      // 평행 광선: 태양 방향에 수직인 평면에서 여러 줄
      const side = tmp2.crossVectors(sunDirLocal, new THREE.Vector3(0, 1, 0)).normalize();
      for (let i = 0; i < h.rays.length; i++) {
        const off = (i - (h.rays.length - 1) / 2) * moon.radius * 0.55;
        const a = h.rays[i].geometry.attributes.position;
        const base = tmp.copy(moon.group.position).addScaledVector(side, off);
        a.setXYZ(0, base.x + sunDirLocal.x * moon.radius * 6, base.y + sunDirLocal.y * moon.radius * 6, base.z + sunDirLocal.z * moon.radius * 6);
        a.setXYZ(1, base.x + sunDirLocal.x * moon.radius * 1.1, base.y + sunDirLocal.y * moon.radius * 1.1, base.z + sunDirLocal.z * moon.radius * 1.1);
        a.needsUpdate = true;
      }
      const la = h.link.geometry.attributes.position;
      la.setXYZ(0, 0, 0, 0);
      la.setXYZ(1, moon.group.position.x, moon.group.position.y, moon.group.position.z);
      la.needsUpdate = true;
      h.link.computeLineDistances();
    }

    // 태양
    coronaMat.uniforms.uTime.value = elapsed;
    if (camera) corona.quaternion.copy(camera.quaternion);
    sunMesh.rotation.y = (days * 24 / sunData.rotationHours) * Math.PI * 2;

    // 소행성대 천천히 공전 (평균 ~4.6년)
    belt.rotation.y = (days / (4.6 * 365.25)) * Math.PI * 2;
  }

  return { list, map, sun, belt, sunLight, update };
}

export { BODIES };
