/**
 * src/bodies.js — 태양 · 행성 · 달 · 소행성대 생성과 매 프레임 갱신
 *
 * 스케일 정책 (교육용 압축):
 *   · 행성 크기는 서로의 "상대비를 그대로" 유지한다 (지구 반지름 = 1 유닛).
 *     태양만은 실제 비율(109배)로 그리면 아무것도 안 보이므로 22 유닛으로 줄였다.
 *   · 거리는 로그/멱 압축한다: r = 26 + 30 · au^0.62
 *   · **각도(황경)는 압축하지 않고 실제값을 그대로 쓴다.** 그래서 위에서 내려다본
 *     행성들의 배치각이 실제 하늘과 일치한다.
 */

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

import { SUN, PLANETS, MOON } from './data/bodies.js';
import { planetHeliocentric, moonGeocentric, J2000, DEG } from './ephemeris.js';
import { softDotTexture, ringGlowTexture } from './textures.js';

// ─────────────────────────────────────────────────────────────────────────────
// 스케일
// ─────────────────────────────────────────────────────────────────────────────

export const EARTH_RADIUS_UNITS = 1.2;
export const SUN_RADIUS_UNITS = 20;
const EARTH_RADIUS_KM = 6371;

/**
 * 천문단위 → 씬 유닛 (거리만 압축).
 *   수성 50.9 · 금성 59.2 · 지구 65 · 화성 74.6 · 목성 123 ·
 *   토성 165 · 천왕성 239 · 해왕성 308
 * 태양(반지름 24)과 수성 사이, 목성(반지름 13.2)과 토성(고리 25) 사이가
 * 서로 겹치지 않도록 잡은 값이다.
 */
export function auToUnits(au) {
  return 34 + 31 * Math.pow(Math.max(au, 0), 0.64);
}

/** 실제 반지름[km] → 씬 유닛 (행성끼리의 상대비는 그대로) */
export function kmToUnits(km) {
  return (km / EARTH_RADIUS_KM) * EARTH_RADIUS_UNITS;
}

/** 지구-달 거리도 압축한다 (실제로는 지구 반지름의 60배) */
export const MOON_DIST_UNITS = 5.8;
const MOON_DIST_KM_REF = 384400;

/**
 * 일심 황도좌표(lon°, lat°, r au) → 씬 좌표.
 * +Y 가 황도 북극. 황경이 커질수록 북쪽에서 볼 때 시계 반대 방향(순행)으로 돈다.
 */
export function eclipticToScene(lonDeg, latDeg, radiusUnits, out = new THREE.Vector3()) {
  const lon = lonDeg * DEG;
  const lat = latDeg * DEG;
  const cl = Math.cos(lat);
  return out.set(
    radiusUnits * cl * Math.cos(lon),
    radiusUnits * Math.sin(lat),
    -radiusUnits * cl * Math.sin(lon),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 셰이더 조각
// ─────────────────────────────────────────────────────────────────────────────

/** 태양 표면 — 톤매핑 전 선형 HDR 로 아주 밝게 내보내 블룸·렌즈플레어에 걸리게 한다 */
const SUN_SURFACE = {
  vert: /* glsl */ `
    varying vec2 vUv;
    varying vec3 vNormal;
    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  frag: /* glsl */ `
    precision highp float;
    uniform sampler2D uMap;
    uniform float uTime;
    uniform float uIntensity;
    varying vec2 vUv;
    varying vec3 vNormal;

    void main() {
      // 표면이 아주 천천히 끓는 느낌 — UV 를 미세하게 흔든다
      vec2 uv = vUv;
      uv.x += sin(vUv.y * 24.0 + uTime * 0.09) * 0.0016;
      uv.y += cos(vUv.x * 19.0 - uTime * 0.07) * 0.0011;
      vec3 base = texture2D(uMap, uv).rgb;

      // 가장자리(림)가 더 밝게 — 주연증광
      float rim = pow(1.0 - abs(vNormal.z), 2.2);
      vec3 col = base * uIntensity * (1.0 + rim * 0.9);
      col = mix(col, vec3(1.0, 0.72, 0.32) * uIntensity * 1.35, rim * 0.42);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

/** 코로나 — 프레넬 + 흔들리는 노이즈, additive */
const CORONA = {
  vert: /* glsl */ `
    varying vec3 vNormalW;
    varying vec3 vViewDir;
    varying vec3 vPos;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vNormalW = normalize(mat3(modelMatrix) * normal);
      vViewDir = normalize(cameraPosition - wp.xyz);
      vPos = position;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  frag: /* glsl */ `
    precision highp float;
    uniform float uTime;
    uniform vec3  uColorHot;
    uniform vec3  uColorCool;
    uniform float uPower;
    uniform float uIntensity;
    varying vec3 vNormalW;
    varying vec3 vViewDir;
    varying vec3 vPos;

    // 값 노이즈 기반 간단 fbm
    float hash(vec3 p) {
      p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }
    float noise(vec3 x) {
      vec3 i = floor(x), f = fract(x);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
            mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
        mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
            mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
    }
    float fbm(vec3 p) {
      float s = 0.0, a = 0.5;
      for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
      return s;
    }

    void main() {
      float fres = 1.0 - abs(dot(normalize(vNormalW), normalize(vViewDir)));
      float rim = pow(clamp(fres, 0.0, 1.0), uPower);

      vec3 q = normalize(vPos) * 3.2;
      float n = fbm(q + vec3(0.0, uTime * 0.05, uTime * 0.03));
      float flick = 0.72 + 0.55 * n;

      float a = rim * flick;
      vec3 col = mix(uColorCool, uColorHot, clamp(rim * 1.3, 0.0, 1.0));
      gl_FragColor = vec4(col * a * uIntensity, a);
    }
  `,
};

/** 지구 — 낮/밤 텍스처 블렌딩 + 터미네이터 산란 */
const EARTH = {
  vert: /* glsl */ `
    varying vec2 vUv;
    varying vec3 vNormalW;
    varying vec3 vViewDir;
    void main() {
      vUv = uv;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vNormalW = normalize(mat3(modelMatrix) * normal);
      vViewDir = normalize(cameraPosition - wp.xyz);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  frag: /* glsl */ `
    precision highp float;
    uniform sampler2D uDay;
    uniform sampler2D uNight;
    uniform vec3 uSunDir;      // 월드 공간에서 지구 → 태양 방향
    uniform float uAmbient;
    varying vec2 vUv;
    varying vec3 vNormalW;
    varying vec3 vViewDir;

    void main() {
      vec3 n = normalize(vNormalW);
      float d = dot(n, normalize(uSunDir));

      // 밤낮 전환 — 터미네이터를 조금 부드럽게
      float lit = smoothstep(-0.14, 0.22, d);
      float diff = max(d, 0.0);

      vec3 day = texture2D(uDay, vUv).rgb;
      vec3 night = texture2D(uNight, vUv).rgb;

      // 도시 불빛은 밤쪽에서만, 살짝 과장해서
      vec3 cityGlow = night * 2.4 * (1.0 - lit);
      vec3 dayCol = day * (uAmbient + 1.25 * diff);

      // 터미네이터 부근의 붉은 산란
      float term = exp(-abs(d) * 9.0) * 0.5;
      vec3 scatter = vec3(1.0, 0.45, 0.18) * term;

      // 바다 스펙큘러 (파란 픽셀에서만 살짝)
      vec3 h = normalize(normalize(uSunDir) + normalize(vViewDir));
      float ocean = clamp((day.b - max(day.r, day.g)) * 3.2, 0.0, 1.0);
      float spec = pow(max(dot(n, h), 0.0), 62.0) * ocean * 0.55 * step(0.0, d);

      gl_FragColor = vec4(dayCol + cityGlow + scatter + vec3(spec), 1.0);
    }
  `,
};

/** 대기 글로우 — 프레넬, BackSide, additive */
const ATMOSPHERE = {
  vert: CORONA.vert,
  frag: /* glsl */ `
    precision highp float;
    uniform vec3  uColor;
    uniform vec3  uSunDir;
    uniform float uPower;
    uniform float uIntensity;
    varying vec3 vNormalW;
    varying vec3 vViewDir;
    varying vec3 vPos;

    void main() {
      vec3 n = normalize(vNormalW);
      float fres = pow(clamp(1.0 - abs(dot(n, normalize(vViewDir))), 0.0, 1.0), uPower);
      // 태양을 등진 쪽은 대기도 어둡게
      float lit = smoothstep(-0.45, 0.35, dot(n, normalize(uSunDir)));
      float a = fres * (0.12 + 0.88 * lit);
      gl_FragColor = vec4(uColor * a * uIntensity, a);
    }
  `,
};

// ─────────────────────────────────────────────────────────────────────────────
// 생성 헬퍼
// ─────────────────────────────────────────────────────────────────────────────

function makeLabel(data, extraClass = '') {
  const el = document.createElement('div');
  el.className = `body-label${extraClass ? ' ' + extraClass : ''}`;
  el.dataset.key = data.key;
  el.innerHTML = `${data.name}<span class="lbl-en">${data.nameEn.toUpperCase()}</span>`;
  const obj = new CSS2DObject(el);
  obj.center.set(0, 0.5);
  return obj;
}

function makeHoverHalo(radius) {
  const mat = new THREE.SpriteMaterial({
    map: ringGlowTexture(),
    color: 0x9ceeff,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    opacity: 0,
  });
  const s = new THREE.Sprite(mat);
  const k = Math.max(radius * 4.2, 2.6);
  s.scale.set(k, k, 1);
  s.renderOrder = 900;
  return s;
}

/** 고리 지오메트리 — UV 를 반경 방향으로 다시 매핑해 링 텍스처가 제대로 깔리게 한다 */
function makeRingGeometry(inner, outer, segments = 256) {
  const geo = new THREE.RingGeometry(inner, outer, segments, 4);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const r = v.length();
    uv.setXY(i, (r - inner) / (outer - inner), 0.5);
  }
  uv.needsUpdate = true;
  return geo;
}

// ─────────────────────────────────────────────────────────────────────────────
// 메인 팩토리
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 태양계의 모든 3D 객체를 만든다.
 * @returns {{root:THREE.Group, bodies:Object, list:Array, pickables:Array, update:Function}}
 */
export function createSolarSystem(scene, textures, opts = {}) {
  const lowPower = Boolean(opts.lowPower);
  const root = new THREE.Group();
  root.name = 'solar-system';
  scene.add(root);

  const bodies = {};
  const list = [];
  const pickables = [];
  const _v = new THREE.Vector3();

  const segs = lowPower ? 48 : 96;
  const sphere = new THREE.SphereGeometry(1, segs, segs / 2);

  /** 공통 골격 생성 */
  function baseEntry(data, radius, extraLabelClass) {
    const group = new THREE.Group();          // 궤도상 위치를 담는 그룹
    group.name = data.key;
    const tilt = new THREE.Group();           // 자전축 기울기
    tilt.rotation.z = (data.tiltDeg || 0) * DEG;
    group.add(tilt);
    const spin = new THREE.Group();           // 자전
    tilt.add(spin);

    const label = makeLabel(data, extraLabelClass);
    // 반지름에 비례해 천체 바로 위에 붙인다 (거리와 무관하게 붙어 보이도록)
    label.position.set(0, radius * 1.22, 0);
    group.add(label);

    const halo = makeHoverHalo(radius);
    group.add(halo);

    // 레이캐스트 전용 히트박스 — 작은 행성도 쉽게 클릭되도록 넉넉하게
    const pick = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(radius * 2.6, 1.9), 12, 8),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    pick.userData.key = data.key;
    group.add(pick);
    pickables.push(pick);

    const entry = {
      key: data.key,
      data,
      radius,
      group,
      tilt,
      spin,
      label,
      labelEl: label.element,
      halo,
      pick,
      worldPos: new THREE.Vector3(),
      // 궤도 요소에서 계산된 값이 매 프레임 채워진다
      eph: { lon: 0, lat: 0, r: 1 },
    };
    bodies[data.key] = entry;
    list.push(entry);
    return entry;
  }

  // ── 태양 ──────────────────────────────────────────────────────────────
  const sunEntry = baseEntry(SUN, SUN_RADIUS_UNITS);
  {
    const surfMat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: textures.sun },
        uTime: { value: 0 },
        // 렌즈플레어 bright-pass threshold(2.4) 는 넘되, 블룸이 화면 전체를
        // 하얗게 날려 버리지 않을 만큼만 밝게.
        uIntensity: { value: 3.6 },
      },
      vertexShader: SUN_SURFACE.vert,
      fragmentShader: SUN_SURFACE.frag,
      toneMapped: false,
    });
    const surf = new THREE.Mesh(sphere, surfMat);
    surf.scale.setScalar(SUN_RADIUS_UNITS);
    sunEntry.spin.add(surf);
    sunEntry.surfaceMaterial = surfMat;

    // 코로나 셸 2겹
    const coronaMats = [];
    for (const [scale, power, intensity, cool, hot] of [
      [1.16, 3.0, 0.85, 0xff7a1a, 0xfff0c0],
      [1.52, 4.2, 0.34, 0xff4a00, 0xffc46a],
    ]) {
      const m = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uColorHot: { value: new THREE.Color(hot) },
          uColorCool: { value: new THREE.Color(cool) },
          uPower: { value: power },
          uIntensity: { value: intensity },
        },
        vertexShader: CORONA.vert,
        fragmentShader: CORONA.frag,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.FrontSide,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(sphere, m);
      mesh.scale.setScalar(SUN_RADIUS_UNITS * scale);
      mesh.renderOrder = 5;
      sunEntry.group.add(mesh);
      coronaMats.push(m);
    }
    sunEntry.coronaMaterials = coronaMats;

    // 바깥쪽 부드러운 글로우 빌보드
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: softDotTexture(),
        color: 0xffc773,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.26,
        toneMapped: false,
      }),
    );
    glow.scale.setScalar(SUN_RADIUS_UNITS * 3.6);
    glow.renderOrder = 4;
    sunEntry.group.add(glow);
  }
  root.add(sunEntry.group);

  // ── 행성 8개 ──────────────────────────────────────────────────────────
  for (const p of PLANETS) {
    const radius = kmToUnits(p.radiusKm);
    const entry = baseEntry(p, radius);
    entry.orbitRadiusUnits = auToUnits(p.distanceAu);

    if (p.key === 'earth') {
      // 낮/밤 + 구름 + 대기 글로우
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uDay: { value: textures.earthDay },
          uNight: { value: textures.earthNight },
          uSunDir: { value: new THREE.Vector3(1, 0, 0) },
          uAmbient: { value: 0.055 },
        },
        vertexShader: EARTH.vert,
        fragmentShader: EARTH.frag,
      });
      const mesh = new THREE.Mesh(sphere, mat);
      mesh.scale.setScalar(radius);
      entry.spin.add(mesh);
      entry.surfaceMaterial = mat;

      const clouds = new THREE.Mesh(
        sphere,
        new THREE.MeshStandardMaterial({
          map: textures.earthClouds,
          alphaMap: textures.earthClouds,
          color: 0xffffff,
          transparent: true,
          opacity: 0.82,
          depthWrite: false,
          roughness: 1,
          metalness: 0,
          blending: THREE.NormalBlending,
        }),
      );
      clouds.scale.setScalar(radius * 1.012);
      entry.tilt.add(clouds);
      entry.clouds = clouds;

      const atmoMat = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(0x5aa8ff) },
          uSunDir: { value: new THREE.Vector3(1, 0, 0) },
          uPower: { value: 2.7 },
          uIntensity: { value: 1.5 },
        },
        vertexShader: ATMOSPHERE.vert,
        fragmentShader: ATMOSPHERE.frag,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.BackSide,
      });
      const atmo = new THREE.Mesh(sphere, atmoMat);
      atmo.scale.setScalar(radius * 1.055);
      atmo.renderOrder = 6;
      entry.group.add(atmo);
      entry.atmosphereMaterial = atmoMat;
    } else {
      const mat = new THREE.MeshStandardMaterial({
        map: textures[p.texture] || null,
        color: textures[p.texture] ? 0xffffff : p.color,
        roughness: p.key === 'venus' ? 0.82 : 0.95,
        metalness: 0.0,
      });
      const mesh = new THREE.Mesh(sphere, mat);
      mesh.scale.setScalar(radius);
      entry.spin.add(mesh);
      entry.surfaceMaterial = mat;

      // 가스/얼음 행성에는 옅은 대기 테두리
      if (['jupiter', 'saturn', 'uranus', 'neptune', 'venus'].includes(p.key)) {
        const atmoMat = new THREE.ShaderMaterial({
          uniforms: {
            uColor: { value: new THREE.Color(p.color) },
            uSunDir: { value: new THREE.Vector3(1, 0, 0) },
            uPower: { value: 3.4 },
            uIntensity: { value: p.key === 'venus' ? 1.1 : 0.75 },
          },
          vertexShader: ATMOSPHERE.vert,
          fragmentShader: ATMOSPHERE.frag,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.BackSide,
        });
        const atmo = new THREE.Mesh(sphere, atmoMat);
        atmo.scale.setScalar(radius * 1.04);
        atmo.renderOrder = 6;
        entry.group.add(atmo);
        entry.atmosphereMaterial = atmoMat;
      }
    }

    // ── 고리 ──
    if (p.ring) {
      const inner = radius * p.ring.inner;
      const outer = radius * p.ring.outer;

      if (p.key === 'saturn') {
        const geo = makeRingGeometry(inner, outer, lowPower ? 128 : 320);
        const mat = new THREE.MeshBasicMaterial({
          map: textures.saturnRing || null,
          color: 0xffffff,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
          alphaTest: 0.01,
        });
        const ring = new THREE.Mesh(geo, mat);
        ring.rotation.x = Math.PI / 2;
        ring.renderOrder = 3;
        entry.tilt.add(ring);
        entry.ring = ring;
      } else {
        // 천왕성 — 아주 얇고 어두운 고리 몇 개
        const g = new THREE.Group();
        for (const [ri, ro, op] of [
          [1.64, 1.66, 0.36], [1.72, 1.735, 0.24], [1.82, 1.845, 0.3],
          [1.94, 1.955, 0.2], [1.99, 2.0, 0.42],
        ]) {
          const geo = new THREE.RingGeometry(radius * ri, radius * ro, lowPower ? 96 : 192);
          const m = new THREE.MeshBasicMaterial({
            color: 0xbfe6f2,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: op,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          });
          const r = new THREE.Mesh(geo, m);
          r.rotation.x = Math.PI / 2;
          g.add(r);
        }
        g.renderOrder = 3;
        entry.tilt.add(g);
        entry.ring = g;
      }
    }

    root.add(entry.group);
  }

  // ── 달 ────────────────────────────────────────────────────────────────
  const moonRadius = kmToUnits(MOON.radiusKm);
  const moonEntry = baseEntry(MOON, moonRadius, 'is-moon');
  {
    const mat = new THREE.MeshStandardMaterial({
      map: textures.moon || null,
      // 달의 실제 알베도는 0.12 로 아주 어둡다 — 텍스처를 눌러 준다
      color: textures.moon ? 0xb0aba3 : MOON.color,
      roughness: 1,
      metalness: 0,
    });
    const mesh = new THREE.Mesh(sphere, mat);
    mesh.scale.setScalar(moonRadius);
    moonEntry.spin.add(mesh);
    moonEntry.surfaceMaterial = mat;
    root.add(moonEntry.group);
  }

  // ── 달 학습용 보조선 (달 선택 시에만 표시) ────────────────────────────
  const moonHelpers = new THREE.Group();
  moonHelpers.visible = false;
  root.add(moonHelpers);
  {
    // 1) 태양광 방향 화살표 — 태양 쪽에서 달을 향해 날아오는 햇빛을 나타낸다.
    //    (ArrowHelper 는 콘이 5각형이라 가까이서 각져 보이므로 직접 만든다)
    const arrow = new THREE.Group();
    const arrowMat = new THREE.MeshBasicMaterial({
      color: 0xffc65c,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const shaftLen = moonRadius * 5.2;
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(moonRadius * 0.05, moonRadius * 0.05, shaftLen, 10),
      arrowMat,
    );
    shaft.position.y = shaftLen / 2 + moonRadius * 0.55;
    const head = new THREE.Mesh(
      new THREE.ConeGeometry(moonRadius * 0.2, moonRadius * 0.62, 20),
      arrowMat,
    );
    head.position.y = moonRadius * 0.86;
    head.rotation.z = Math.PI;   // 달 쪽(-Y)을 향하도록
    arrow.add(shaft, head);
    // 화살표 3개를 나란히 두어 "평행하게 쏟아지는 햇빛" 느낌
    const arrows = new THREE.Group();
    for (const off of [-1.6, 0, 1.6]) {
      const a = arrow.clone();
      a.position.x = off * moonRadius;
      arrows.add(a);
    }
    moonHelpers.add(arrows);

    // 2) 밝은 반구 표시 — 햇빛 받는 쪽 반구를 감싸는 반투명 캡
    const capGeo = new THREE.SphereGeometry(
      moonRadius * 1.09, 40, 24, 0, Math.PI * 2, 0, Math.PI / 2,
    );
    const capMat = new THREE.MeshBasicMaterial({
      color: 0xfff0c0,
      transparent: true,
      opacity: 0.11,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const cap = new THREE.Mesh(capGeo, capMat);
    moonHelpers.add(cap);

    // 3) 지구 — 달 시선 (왜 그렇게 보이는지)
    const sightGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(), new THREE.Vector3(1, 0, 0),
    ]);
    const sight = new THREE.Line(
      sightGeo,
      new THREE.LineDashedMaterial({
        color: 0x58e6ff,
        transparent: true,
        opacity: 0.55,
        dashSize: 0.28,
        gapSize: 0.2,
      }),
    );
    sight.computeLineDistances();
    moonHelpers.add(sight);

    // 4) 터미네이터(명암 경계) 링
    const termGeo = new THREE.TorusGeometry(moonRadius * 1.02, moonRadius * 0.035, 8, 72);
    const term = new THREE.Mesh(
      termGeo,
      new THREE.MeshBasicMaterial({
        color: 0x58e6ff,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    moonHelpers.add(term);

    moonHelpers.userData = { arrows, cap, sight, term, sightGeo };
  }

  // ── 소행성대 (InstancedMesh 1 드로우콜) ───────────────────────────────
  const belt = createAsteroidBelt(root, { lowPower });

  // ───────────────────────────────────────────────────────────────────────
  // 매 프레임 갱신
  // ───────────────────────────────────────────────────────────────────────

  const sunDirTmp = new THREE.Vector3();
  const moonToEarth = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const FORWARD = new THREE.Vector3(0, 0, 1);
  const ORIGIN = new THREE.Vector3(0, 0, 0);

  /**
   * @param {number} jd  현재 시뮬레이션 율리우스일
   * @param {number} elapsed 렌더 시작부터의 경과 초 (셰이더 애니메이션용)
   */
  function update(jd, elapsed) {
    // 태양 — 원점 고정, 자전만
    sunEntry.worldPos.set(0, 0, 0);
    sunEntry.spin.rotation.y = ((jd - J2000) / (SUN.rotationHours / 24)) * Math.PI * 2 % (Math.PI * 2);
    if (sunEntry.surfaceMaterial) sunEntry.surfaceMaterial.uniforms.uTime.value = elapsed;
    for (const m of sunEntry.coronaMaterials) m.uniforms.uTime.value = elapsed;

    // 행성
    for (const p of PLANETS) {
      const e = bodies[p.key];
      const eph = planetHeliocentric(p.key, jd);
      e.eph = eph;
      // 각도는 실제값, 거리만 압축
      eclipticToScene(eph.lon, eph.lat, auToUnits(eph.r), e.group.position);
      e.worldPos.copy(e.group.position);

      // 자전 — 축을 기울인 뒤 항상 같은 방향으로 돌린다.
      // 기울기가 90°를 넘는 금성(177°)·천왕성(98°)은 이것만으로 역자전이 된다.
      const periodDays = Math.abs(p.rotationHours) / 24;
      e.spin.rotation.y = (((jd - J2000) / periodDays) % 1) * Math.PI * 2;

      // 태양 방향 (행성 → 태양)
      sunDirTmp.copy(e.worldPos).negate().normalize();
      if (e.surfaceMaterial?.uniforms?.uSunDir) e.surfaceMaterial.uniforms.uSunDir.value.copy(sunDirTmp);
      if (e.atmosphereMaterial) e.atmosphereMaterial.uniforms.uSunDir.value.copy(sunDirTmp);

      // 구름은 조금 더 느리게 (바람)
      if (e.clouds) e.clouds.rotation.y = (((jd - J2000) / (periodDays * 1.13)) % 1) * Math.PI * 2;
    }

    // 달 — 지구 기준 지심 위치. 방향은 실제값, 거리만 압축.
    {
      const earth = bodies.earth;
      const mg = moonGeocentric(jd);
      moonEntry.eph = mg;
      const dist = MOON_DIST_UNITS * (mg.distKm / MOON_DIST_KM_REF);
      eclipticToScene(mg.lon, mg.lat, dist, _v);
      moonEntry.group.position.copy(earth.group.position).add(_v);
      moonEntry.worldPos.copy(moonEntry.group.position);

      // 조석 고정 — 늘 지구 쪽을 향한다.
      // 텍스처의 경도 0(이미지 가운데)이 근지점 방향이 되도록 맞춘다.
      moonToEarth.copy(earth.worldPos).sub(moonEntry.worldPos);
      moonEntry.spin.rotation.y = Math.atan2(moonToEarth.x, moonToEarth.z) - Math.PI / 2;

      // 보조선 갱신
      if (moonHelpers.visible) {
        const { arrows, cap, sight, term, sightGeo } = moonHelpers.userData;
        const toSun = _v.copy(moonEntry.worldPos).negate().normalize();

        moonHelpers.position.copy(moonEntry.worldPos);
        // 화살표 묶음은 태양 쪽에 놓고, 로컬 +Y 가 태양을 향하게 돌린다
        // (화살촉이 -Y 를 보고 있으므로 결과적으로 달을 향해 쏟아진다)
        arrows.position.copy(toSun).multiplyScalar(moonRadius * 1.35);
        arrows.quaternion.setFromUnitVectors(UP, toSun);
        // 밝은 반구 캡을 태양 쪽으로
        cap.quaternion.setFromUnitVectors(UP, toSun);
        // 터미네이터 링 — 태양 방향을 법선으로 하는 대원
        term.quaternion.setFromUnitVectors(FORWARD, toSun);
        // 지구 방향 시선
        sightGeo.setFromPoints([ORIGIN, moonToEarth]);
        sightGeo.attributes.position.needsUpdate = true;
        sight.computeLineDistances();
      }
    }

    // 소행성대
    belt.update(jd, elapsed);
  }

  /** 달 보조선 표시 토글 */
  function setMoonHelpers(on) {
    moonHelpers.visible = Boolean(on);
  }

  return {
    root,
    bodies,
    list,
    pickables,
    belt,
    moonHelpers,
    setMoonHelpers,
    update,
    sunEntry,
    moonRadius,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 소행성대
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 화성-목성 사이 소행성대.
 *  · 바위: InstancedMesh 한 개 (드로우콜 1). 궤도 운동은 정점 셰이더에서 처리해
 *    CPU 로 매 프레임 4천 개 행렬을 쓰지 않는다.
 *  · 먼지: Points — 반드시 캔버스 radial-gradient 원형 텍스처를 쓴다 (사각형 금지).
 */
function createAsteroidBelt(parent, { lowPower }) {
  const ROCKS = lowPower ? 1600 : 4200;
  const DUST = lowPower ? 3500 : 11000;
  const A_MIN = 2.06;
  const A_MAX = 3.28;

  // 커크우드 간극(목성과의 공명으로 비어 있는 띠)을 살짝 반영
  const GAPS = [[2.5, 0.035], [2.82, 0.03], [2.95, 0.025], [3.27, 0.03]];
  function sampleAxis() {
    for (let tries = 0; tries < 24; tries++) {
      const a = A_MIN + Math.random() * (A_MAX - A_MIN);
      let keep = 1;
      for (const [c, w] of GAPS) keep *= 1 - 0.9 * Math.exp(-((a - c) ** 2) / (2 * w * w));
      if (Math.random() < keep) return a;
    }
    return A_MIN + Math.random() * (A_MAX - A_MIN);
  }

  // ── 바위 ──
  const rockGeo = new THREE.IcosahedronGeometry(1, 0);
  {
    // 정점을 무작위로 밀어 울퉁불퉁하게
    const pos = rockGeo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      v.multiplyScalar(0.62 + Math.random() * 0.72);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    rockGeo.computeVertexNormals();
  }

  const aOrbit = new Float32Array(ROCKS);
  const aPhase = new Float32Array(ROCKS);
  const aSpeed = new Float32Array(ROCKS);
  const aY = new Float32Array(ROCKS);
  const aTint = new Float32Array(ROCKS);

  const dummy = new THREE.Object3D();
  const rockMat = new THREE.ShaderMaterial({
    uniforms: {
      uDays: { value: 0 },
      uAmbient: { value: 0.1 },
    },
    vertexShader: /* glsl */ `
      attribute float aOrbit;
      attribute float aPhase;
      attribute float aSpeed;
      attribute float aY;
      attribute float aTint;
      uniform float uDays;
      varying vec3 vNormalW;
      varying vec3 vWorld;
      varying float vTint;

      void main() {
        // instanceMatrix 에는 바위 고유의 크기·회전만 들어 있다
        vec4 local = instanceMatrix * vec4(position, 1.0);
        float ang = aPhase + uDays * aSpeed;
        // 황경이 커질수록 (cos, -sin) — 행성과 같은 순행 방향
        vec3 center = vec3(cos(ang) * aOrbit, aY, -sin(ang) * aOrbit);
        vec3 world = center + local.xyz;

        vNormalW = normalize(mat3(instanceMatrix) * normal);
        vWorld = world;
        vTint = aTint;
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uAmbient;
      varying vec3 vNormalW;
      varying vec3 vWorld;
      varying float vTint;

      void main() {
        // 태양은 원점에 있다
        vec3 L = normalize(-vWorld);
        float d = max(dot(normalize(vNormalW), L), 0.0);
        vec3 base = mix(vec3(0.40, 0.35, 0.30), vec3(0.62, 0.58, 0.52), vTint);
        vec3 col = base * (uAmbient + 1.15 * d);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, ROCKS);
  rocks.frustumCulled = false;
  rocks.instanceMatrix.setUsage(THREE.StaticDrawUsage);

  for (let i = 0; i < ROCKS; i++) {
    const a = sampleAxis();
    const e = Math.random() * 0.14;
    const r = auToUnits(a * (1 + (Math.random() * 2 - 1) * e));
    aOrbit[i] = r;
    aPhase[i] = Math.random() * Math.PI * 2;
    // 케플러 제3법칙 — 안쪽이 더 빠르게 돈다 (rad/day)
    aSpeed[i] = (Math.PI * 2) / (Math.pow(a, 1.5) * 365.25);
    // 궤도 경사 (실제 소행성대는 평균 10° 정도 퍼져 있다)
    aY[i] = (Math.random() - 0.5) * r * 0.075;
    aTint[i] = Math.random();

    // 실제 소행성 크기에 맞춰 아주 작게 (가장 큰 세레스도 이 스케일에서 0.18 유닛)
    const s = 0.018 + Math.pow(Math.random(), 3.2) * 0.15;
    dummy.position.set(0, 0, 0);
    dummy.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
    dummy.scale.set(s, s * (0.6 + Math.random() * 0.7), s * (0.6 + Math.random() * 0.7));
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
  }
  rocks.instanceMatrix.needsUpdate = true;

  rockGeo.setAttribute('aOrbit', new THREE.InstancedBufferAttribute(aOrbit, 1));
  rockGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(aPhase, 1));
  rockGeo.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(aSpeed, 1));
  rockGeo.setAttribute('aY', new THREE.InstancedBufferAttribute(aY, 1));
  rockGeo.setAttribute('aTint', new THREE.InstancedBufferAttribute(aTint, 1));

  parent.add(rocks);

  // ── 먼지 (원형 소프트 파티클) ──
  const dPos = new Float32Array(DUST * 3);   // x=반경, y=높이, z=위상 으로 재활용
  const dSpeed = new Float32Array(DUST);
  const dSize = new Float32Array(DUST);
  for (let i = 0; i < DUST; i++) {
    const a = sampleAxis();
    const r = auToUnits(a * (1 + (Math.random() * 2 - 1) * 0.1));
    dPos[i * 3] = r;
    dPos[i * 3 + 1] = (Math.random() - 0.5) * r * 0.085;
    dPos[i * 3 + 2] = Math.random() * Math.PI * 2;
    dSpeed[i] = (Math.PI * 2) / (Math.pow(a, 1.5) * 365.25);
    dSize[i] = 1.4 + Math.pow(Math.random(), 3) * 7;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  dustGeo.setAttribute('aSpeed', new THREE.BufferAttribute(dSpeed, 1));
  dustGeo.setAttribute('aSize', new THREE.BufferAttribute(dSize, 1));
  dustGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), auToUnits(A_MAX) * 1.2);

  const dustMat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: softDotTexture() },
      uDays: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
    },
    vertexShader: /* glsl */ `
      attribute float aSpeed;
      attribute float aSize;
      uniform float uDays;
      uniform float uPixelRatio;
      varying float vFade;
      void main() {
        float r = position.x;
        float ang = position.z + uDays * aSpeed;
        vec3 world = vec3(cos(ang) * r, position.y, -sin(ang) * r);
        vec4 mv = viewMatrix * vec4(world, 1.0);
        // 멀리서도 띠가 보이고, 가까이서도 거대한 원반이 되지 않도록 상·하한을 둔다
        gl_PointSize = clamp(
          aSize * uPixelRatio * (190.0 / -mv.z),
          0.9 * uPixelRatio,
          4.5 * uPixelRatio
        );
        vFade = clamp(900.0 / -mv.z, 0.12, 1.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D uMap;
      varying float vFade;
      void main() {
        vec4 t = texture2D(uMap, gl_PointCoord);
        if (t.a < 0.01) discard;
        gl_FragColor = vec4(vec3(0.68, 0.62, 0.54) * 0.55, t.a * 0.5 * vFade);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  parent.add(dust);

  return {
    rocks,
    dust,
    count: ROCKS,
    update(jd) {
      const days = jd - J2000;
      rockMat.uniforms.uDays.value = days;
      dustMat.uniforms.uDays.value = days;
    },
  };
}
