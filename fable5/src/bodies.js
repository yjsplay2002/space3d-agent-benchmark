/**
 * bodies.js — 태양/행성/달/소행성대/별 생성 및 위치·자전 갱신
 *
 * 스케일 정책 (교육용 압축):
 *  - 행성 크기: 실제 상대비 유지 (지구 = 0.5 유닛), 태양만 축소
 *  - 거리: 로그 압축 — 각도(황경)는 실제값 그대로, 거리만 압축
 */
import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { DEG, J2000, planetHelio, moonGeo, PLANET_KEYS } from "./ephemeris.js";
import { makeSoftCircleTexture } from "./textures.js";

/* ---------------- 스케일 ---------------- */

export const EARTH_R = 0.5; // 지구 시각 반지름 (유닛)
export const SUN_R = 6.0; // 태양 (실제 비율 아님 — 축소)
export const MOON_ORBIT_R = 1.9; // 달 궤도 시각 반지름

/** AU → 씬 거리 (로그 압축) */
export function compressAU(rAU) {
  return 22 * Math.log2(1 + rAU * 2.2);
}

/** 일심 황경/황위/거리 → 씬 좌표 (+Y 위에서 내려다볼 때 반시계 = 실제 방향) */
export function helioToScene(lonDeg, latDeg, rAU, out = new THREE.Vector3()) {
  const R = compressAU(rAU);
  const lam = lonDeg * DEG;
  const beta = latDeg * DEG;
  out.set(
    R * Math.cos(beta) * Math.cos(lam),
    R * Math.sin(beta),
    -R * Math.cos(beta) * Math.sin(lam)
  );
  return out;
}

/* ---------------- 시각 설정 ---------------- */

export const VISUALS = {
  mercury: { radius: 0.19, tilt: 0.03, rotHours: 1407.6, color: 0x9c9c9c, tex: "2k_mercury.jpg" },
  venus: { radius: 0.475, tilt: 2.64, rotHours: -5832.5, color: 0xe8c37a, tex: "2k_venus_atmosphere.jpg" },
  earth: { radius: 0.5, tilt: 23.44, rotHours: 23.93, color: 0x4a9fe8, tex: "2k_earth_daymap.jpg" },
  mars: { radius: 0.27, tilt: 25.19, rotHours: 24.62, color: 0xe07a4f, tex: "2k_mars.jpg" },
  jupiter: { radius: 5.49, tilt: 3.13, rotHours: 9.93, color: 0xd8b48a, tex: "2k_jupiter.jpg" },
  saturn: { radius: 4.57, tilt: 26.73, rotHours: 10.66, color: 0xe8d3a0, tex: "2k_saturn.jpg" },
  uranus: { radius: 1.99, tilt: 97.77, rotHours: -17.24, color: 0x8fd8dd, tex: "2k_uranus.jpg" },
  neptune: { radius: 1.93, tilt: 28.32, rotHours: 16.11, color: 0x5a7ae8, tex: "2k_neptune.jpg" },
};

/* ---------------- 지구 주/야 셰이더 ---------------- */

const EARTH_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vPosW = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const EARTH_FRAG = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform vec3 uSunDir;      // 지구 → 태양 방향 (월드)
  uniform vec3 uCamPos;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec3 n = normalize(vNormalW);
    float ndotl = dot(n, uSunDir);
    vec3 day = texture2D(dayMap, vUv).rgb * (max(ndotl, 0.0) * 1.5 + 0.02);
    vec3 night = texture2D(nightMap, vUv).rgb * vec3(1.6, 1.45, 1.1);
    float dayMix = smoothstep(-0.12, 0.2, ndotl);
    vec3 color = mix(night, day, dayMix);
    // 낮 지역 대기 산란빛 살짝
    vec3 v = normalize(uCamPos - vPosW);
    float rim = pow(1.0 - max(dot(v, n), 0.0), 3.0);
    color += vec3(0.15, 0.35, 0.8) * rim * max(ndotl, 0.0) * 0.6;
    gl_FragColor = vec4(color, 1.0);
  }
`;

/* 대기 글로우 (프레넬) — BackSide 쉘 */
const ATMO_VERT = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vPosW = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const ATMO_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uCamPos;
  uniform float uPower;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec3 v = normalize(uCamPos - vPosW);
    float fres = pow(1.0 - abs(dot(v, normalize(vNormalW))), uPower);
    gl_FragColor = vec4(uColor, 1.0) * fres;
  }
`;

function makeAtmosphere(radius, color, power = 2.6) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uCamPos: { value: new THREE.Vector3() },
      uPower: { value: power },
    },
    vertexShader: ATMO_VERT,
    fragmentShader: ATMO_FRAG,
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), mat);
}

/* ---------------- 태양 코로나 셰이더 ---------------- */

const CORONA_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uCamPos;
  uniform float uTime;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec3 v = normalize(uCamPos - vPosW);
    float fres = pow(1.0 - abs(dot(v, normalize(vNormalW))), 2.0);
    float flicker = 0.9 + 0.1 * sin(uTime * 2.0 + vPosW.x * 3.0) * sin(uTime * 1.3 + vPosW.z * 2.0);
    gl_FragColor = vec4(uColor * fres * flicker * 2.2, 1.0);
  }
`;

/* ---------------- 자전 방향 빛 링 셰이더 ---------------- */

const SPIN_RING_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uDir;      // +1 순행 / -1 역행
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    // 토러스 길이 방향(uv.x)을 따라 흐르는 빛 혜성 3개
    float t = fract(vUv.x * 3.0 - uTime * 0.6 * uDir);
    float b = exp(-t * 6.0) * 1.8 + 0.06;
    gl_FragColor = vec4(uColor * b, 1.0);
  }
`;

function makeSpinRing(radius, dir, color) {
  const geo = new THREE.TorusGeometry(radius, Math.max(radius * 0.02, 0.02), 8, 128);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDir: { value: dir },
      uColor: { value: new THREE.Color(color) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: SPIN_RING_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = Math.PI / 2; // 적도면(XZ)으로
  ring.visible = false;
  return ring;
}

/* ---------------- 라벨 ---------------- */

function makeLabel(nameKo, key) {
  const el = document.createElement("div");
  el.className = "body-label";
  el.dataset.key = key;
  el.textContent = nameKo;
  const obj = new CSS2DObject(el);
  obj.center.set(0.5, 1.6);
  return { el, obj };
}

/* ================================================================== */

export function createBodies(scene, textures) {
  const bodies = {}; // key → { group, mesh, tiltGroup, label, visual, hit }
  const hitTargets = [];

  const NAMES = {
    sun: "태양", mercury: "수성", venus: "금성", earth: "지구", moon: "달",
    mars: "화성", jupiter: "목성", saturn: "토성", uranus: "천왕성", neptune: "해왕성",
  };

  /* ----- 태양 ----- */
  {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ map: textures["2k_sun.jpg"] });
    mat.color.setRGB(4.0, 3.3, 2.4); // HDR 오버드라이브 → 블룸/플레어 코어
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(SUN_R, 64, 48), mat);
    group.add(mesh);

    // 코로나 쉘
    const coronaMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0xffa030) },
        uCamPos: { value: new THREE.Vector3() },
        uTime: { value: 0 },
      },
      vertexShader: ATMO_VERT,
      fragmentShader: CORONA_FRAG,
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const corona = new THREE.Mesh(new THREE.SphereGeometry(SUN_R * 1.45, 64, 48), coronaMat);
    group.add(corona);

    // 넓은 소프트 글로우 스프라이트 (코로나 확산광)
    const glowMat = new THREE.SpriteMaterial({
      map: makeSoftCircleTexture(256, "rgba(255,190,90,1)"),
      color: 0xffb050,
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(SUN_R * 2.6);
    group.add(glow);

    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(SUN_R * 1.2, 12, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hit.userData.key = "sun";
    group.add(hit);
    hitTargets.push(hit);

    const label = makeLabel(NAMES.sun, "sun");
    group.add(label.obj);

    scene.add(group);
    bodies.sun = { group, mesh, corona, glow, label, hit, visual: { radius: SUN_R, rotHours: 609.12 } };
  }

  /* ----- 행성 8개 ----- */
  for (const key of PLANET_KEYS) {
    const v = VISUALS[key];
    const group = new THREE.Group(); // 궤도 위치
    const tiltGroup = new THREE.Group(); // 자전축 기울기
    tiltGroup.rotation.z = -v.tilt * DEG;
    group.add(tiltGroup);

    let mesh;
    if (key === "earth") {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          dayMap: { value: textures["2k_earth_daymap.jpg"] },
          nightMap: { value: textures["2k_earth_nightmap.jpg"] },
          uSunDir: { value: new THREE.Vector3(1, 0, 0) },
          uCamPos: { value: new THREE.Vector3() },
        },
        vertexShader: EARTH_VERT,
        fragmentShader: EARTH_FRAG,
      });
      mesh = new THREE.Mesh(new THREE.SphereGeometry(v.radius, 64, 48), mat);

      // 구름 레이어
      const clouds = new THREE.Mesh(
        new THREE.SphereGeometry(v.radius * 1.015, 48, 32),
        new THREE.MeshLambertMaterial({
          map: textures["2k_earth_clouds.jpg"],
          alphaMap: textures["2k_earth_clouds.jpg"],
          transparent: true,
          depthWrite: false,
        })
      );
      tiltGroup.add(clouds);
      bodies._earthClouds = clouds;

      // 대기 글로우 (프레넬)
      tiltGroup.add(makeAtmosphere(v.radius * 1.07, 0x3a7fff, 2.8));
    } else {
      const mat = new THREE.MeshStandardMaterial({
        map: textures[v.tex],
        roughness: 1.0,
        metalness: 0.0,
      });
      mesh = new THREE.Mesh(new THREE.SphereGeometry(v.radius, 64, 48), mat);
      if (key === "venus") tiltGroup.add(makeAtmosphere(v.radius * 1.06, 0xd8a040, 3.0));
      if (key === "mars") tiltGroup.add(makeAtmosphere(v.radius * 1.07, 0xc06030, 3.2));
    }
    tiltGroup.add(mesh);

    // 토성 고리
    if (key === "saturn") {
      const inner = v.radius * 1.24, outer = v.radius * 2.27;
      const geo = new THREE.RingGeometry(inner, outer, 128, 1);
      // UV 를 반지름 방향으로 재매핑 (고리 텍스처는 가로 스트립)
      const pos = geo.attributes.position;
      const uv = geo.attributes.uv;
      const vec = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        vec.fromBufferAttribute(pos, i);
        uv.setXY(i, (vec.length() - inner) / (outer - inner), 0.5);
      }
      const ringTex = textures["2k_saturn_ring_alpha.png"];
      const ring = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          map: ringTex,
          transparent: true,
          side: THREE.DoubleSide,
          opacity: 0.95,
          depthWrite: false,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      tiltGroup.add(ring);
    }

    // 천왕성 얇은 고리
    if (key === "uranus") {
      const inner = v.radius * 1.65, outer = v.radius * 1.95;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(inner, outer, 96, 1),
        new THREE.MeshBasicMaterial({
          color: 0xaad4dd,
          transparent: true,
          opacity: 0.28,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      tiltGroup.add(ring);
    }

    // 자전 방향 빛 링 (선택 시 표시)
    const spinRing = makeSpinRing(v.radius * 1.45, Math.sign(v.rotHours), 0xffc266);
    tiltGroup.add(spinRing);

    // 히트 스피어 (클릭 판정 확대)
    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(v.radius * 1.8, 0.9), 12, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hit.userData.key = key;
    group.add(hit);
    hitTargets.push(hit);

    const label = makeLabel(NAMES[key], key);
    group.add(label.obj);

    scene.add(group);
    bodies[key] = { group, tiltGroup, mesh, spinRing, label, hit, visual: v };
  }

  /* ----- 달 ----- */
  {
    const v = { radius: 0.15, tilt: 6.7, rotHours: 655.7, color: 0xcccccc };
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(v.radius, 48, 32),
      new THREE.MeshStandardMaterial({ map: textures["2k_moon.jpg"], roughness: 1 })
    );
    group.add(mesh);

    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 12, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hit.userData.key = "moon";
    group.add(hit);
    hitTargets.push(hit);

    const label = makeLabel(NAMES.moon, "moon");
    group.add(label.obj);

    // 교육 보조선: 태양광 화살표 + 밝은 반구 표시 (달 선택 시 표시)
    const helper = new THREE.Group();
    helper.visible = false;
    const arrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(),
      2.2,
      0xffcc44,
      0.45,
      0.22
    );
    helper.add(arrow);
    // 밝은 반구: x ≤ 0 반구 쉘 → refDir (-1,0,0)
    const hemi = new THREE.Mesh(
      new THREE.SphereGeometry(v.radius * 1.045, 32, 16, -Math.PI / 2, Math.PI),
      new THREE.MeshBasicMaterial({
        color: 0xffdd66,
        transparent: true,
        opacity: 0.13,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    helper.add(hemi);
    group.add(helper);

    scene.add(group);
    bodies.moon = { group, mesh, label, hit, helper, arrow, hemi, visual: v };
  }

  /* ----- 소행성대 (InstancedMesh, 드로우콜 1개) ----- */
  const beltGroup = new THREE.Group();
  {
    const COUNT = 3500;
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a7a68, roughness: 1 });
    const belt = new THREE.InstancedMesh(geo, mat, COUNT);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const e = new THREE.Euler();
    // 화성(46.7) ~ 목성(80) 사이
    for (let i = 0; i < COUNT; i++) {
      const r = 53 + Math.random() * 18;
      const a = Math.random() * Math.PI * 2;
      p.set(r * Math.cos(a), (Math.random() - 0.5) * 2.4 * Math.pow(Math.random(), 0.5), -r * Math.sin(a));
      e.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      q.setFromEuler(e);
      const sc = 0.035 + Math.random() * 0.12;
      s.set(sc, sc * (0.6 + Math.random() * 0.8), sc);
      m.compose(p, q, s);
      belt.setMatrixAt(i, m);
    }
    belt.instanceMatrix.needsUpdate = true;
    beltGroup.add(belt);
    scene.add(beltGroup);
  }

  /* ----- 별 파티클 (소프트 원형 텍스처 — 사각형 금지) ----- */
  {
    const COUNT = 3000;
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const col = new THREE.Color();
    for (let i = 0; i < COUNT; i++) {
      const r = 1200 + Math.random() * 1600;
      const th = Math.acos(2 * Math.random() - 1);
      const ph = Math.random() * Math.PI * 2;
      positions[i * 3] = r * Math.sin(th) * Math.cos(ph);
      positions[i * 3 + 1] = r * Math.cos(th);
      positions[i * 3 + 2] = r * Math.sin(th) * Math.sin(ph);
      const t = Math.random();
      col.setHSL(t < 0.7 ? 0.6 : 0.08, 0.4, 0.7 + Math.random() * 0.3);
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const stars = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 2.2,
        map: makeSoftCircleTexture(64),
        transparent: true,
        vertexColors: true,
        sizeAttenuation: false,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    scene.add(stars);
  }

  /* ----- 스카이박스 (8k 은하수) ----- */
  {
    const tex = textures["8k_stars_milky_way.jpg"];
    tex.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = tex;
    scene.backgroundIntensity = 0.3;
  }

  /* ---------------- 갱신 함수 ---------------- */

  const _v = new THREE.Vector3();
  const _sunDir = new THREE.Vector3();

  /** JD 기준 자전각 (라디안, 부호 포함) */
  function spinAngle(jd, rotHours) {
    return ((jd - J2000) * 24 / rotHours) * Math.PI * 2;
  }

  function updatePositions(jd) {
    // 행성
    for (const key of PLANET_KEYS) {
      const { lon, lat, r } = planetHelio(key, jd);
      helioToScene(lon, lat, r, bodies[key].group.position);
      const v = VISUALS[key];
      bodies[key].mesh.rotation.y = spinAngle(jd, v.rotHours);
    }
    if (bodies._earthClouds) {
      bodies._earthClouds.rotation.y = spinAngle(jd, VISUALS.earth.rotHours * 1.18);
    }
    bodies.sun.mesh.rotation.y = spinAngle(jd, 609.12);

    // 달 — 방향(황경/황위)은 실제, 거리는 시각 반지름 고정
    const earthPos = bodies.earth.group.position;
    const mg = moonGeo(jd);
    const lam = mg.lon * DEG, beta = mg.lat * DEG;
    _v.set(
      Math.cos(beta) * Math.cos(lam),
      Math.sin(beta),
      -Math.cos(beta) * Math.sin(lam)
    ).multiplyScalar(MOON_ORBIT_R);
    bodies.moon.group.position.copy(earthPos).add(_v);
    // 조석 고정 — 항상 같은 면이 지구를 향함
    bodies.moon.mesh.lookAt(earthPos);
    bodies.moon.mesh.rotateY(Math.PI / 2);

    // 지구 셰이더 태양 방향
    _sunDir.copy(earthPos).multiplyScalar(-1).normalize();
    bodies.earth.mesh.material.uniforms.uSunDir.value.copy(_sunDir);

    // 달 교육 보조선: 태양광 방향 + 밝은 반구
    const helper = bodies.moon.helper;
    if (helper.visible) {
      const toSun = _v.copy(bodies.moon.group.position).multiplyScalar(-1).normalize();
      bodies.moon.arrow.position.copy(toSun).multiplyScalar(3.4);
      bodies.moon.arrow.setDirection(toSun.clone().multiplyScalar(-1));
      bodies.moon.arrow.setLength(1.6, 0.28, 0.13);
      bodies.moon.hemi.quaternion.setFromUnitVectors(new THREE.Vector3(-1, 0, 0), toSun);
    }
  }

  function updateFrame(time, camera) {
    // 카메라 의존 유니폼
    bodies.earth.mesh.material.uniforms.uCamPos.value.copy(camera.position);
    bodies.sun.corona.material.uniforms.uCamPos.value.copy(camera.position);
    bodies.sun.corona.material.uniforms.uTime.value = time;
    for (const key of PLANET_KEYS) {
      const sr = bodies[key].spinRing;
      if (sr.visible) sr.material.uniforms.uTime.value = time;
    }
    // 대기 쉘 uCamPos
    scene.traverse((o) => {
      if (o.material?.uniforms?.uCamPos && o.material.uniforms.uPower) {
        o.material.uniforms.uCamPos.value.copy(camera.position);
      }
    });
  }

  /** 소행성대 느린 회전 (시뮬레이션 일수 기준) */
  function updateBelt(jd) {
    beltGroup.rotation.y = ((jd - J2000) / 1800) * Math.PI * 2;
  }

  function setSelected(key) {
    for (const k of PLANET_KEYS) bodies[k].spinRing.visible = k === key;
    bodies.moon.helper.visible = key === "moon";
  }

  return { bodies, hitTargets, updatePositions, updateFrame, updateBelt, setSelected };
}
