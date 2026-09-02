import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { BODIES, PLANET_SCALE, orbitRadiusFromAU } from './data/bodies.js';
import { createOrbit, createSpinRing, updateOrbitMaterial } from './orbits.js';
import { ringCanvas, softParticleTexture } from './textures.js';

const DEG = THREE.MathUtils.DEG2RAD;
const TAU = Math.PI * 2;

// ---------- 셰이더 ----------
const earthVert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const earthFrag = /* glsl */ `
  uniform sampler2D tDay;
  uniform sampler2D tNight;
  uniform vec3 uSunPos;
  uniform float uHighlight;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 l = normalize(uSunPos - vPosW);
    vec3 v = normalize(cameraPosition - vPosW);
    float ndl = dot(n, l);
    float day = smoothstep(-0.1, 0.3, ndl);
    vec3 dayC = texture2D(tDay, vUv).rgb;
    vec3 nightC = texture2D(tNight, vUv).rgb;
    // 바다 스페큘러 (밝은 파랑 픽셀 = 바다)
    float ocean = smoothstep(0.15, 0.5, dayC.b - dayC.r);
    vec3 h = normalize(l + v);
    float spec = pow(max(dot(n, h), 0.0), 48.0) * ocean * 0.6;
    vec3 lit = dayC * (max(ndl, 0.0) * 1.35 + 0.035) + vec3(1.0, 0.95, 0.85) * spec * max(ndl, 0.0);
    vec3 night = nightC * vec3(1.4, 1.2, 0.9) * 1.3;
    vec3 col = mix(night, lit, day);
    col += vec3(0.25, 0.4, 0.6) * uHighlight;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const atmoVert = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const atmoFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uSunPos;
  uniform float uPower;
  uniform float uIntensity;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vPosW);
    vec3 l = normalize(uSunPos - vPosW);
    float fres = pow(1.0 - max(dot(n, v), 0.0), uPower);
    float lit = clamp(dot(n, l) * 0.8 + 0.45, 0.08, 1.0);
    gl_FragColor = vec4(uColor * fres * lit * uIntensity, 1.0);
  }
`;

const coronaVert = /* glsl */ `
  varying vec3 vNormalV;
  varying vec3 vPosV;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vNormalV = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vPosV = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
const coronaFrag = /* glsl */ `
  uniform float uTime;
  varying vec3 vNormalV;
  varying vec3 vPosV;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  void main() {
    vec3 n = normalize(vNormalV);
    vec3 v = normalize(-vPosV);
    float rim = pow(1.0 - max(dot(n, v), 0.0), 2.2);
    float nz = noise(vUv * vec2(24.0, 12.0) + vec2(uTime * 0.05, -uTime * 0.03));
    nz = 0.7 + 0.6 * nz;
    vec3 col = mix(vec3(1.0, 0.55, 0.15), vec3(1.0, 0.85, 0.5), rim) * rim * nz * 1.6;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// ---------- 헬퍼 ----------
function glowSpriteTexture(inner, outer, stops) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, (size / 2) * inner, size / 2, size / 2, (size / 2) * outer);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeLabel(text, id) {
  const el = document.createElement('div');
  el.className = 'label';
  el.textContent = text;
  el.dataset.id = id;
  const obj = new CSS2DObject(el);
  obj.center.set(0.5, 1);
  return obj;
}

function makeRingGeometry(inner, outer) {
  const geo = new THREE.RingGeometry(inner, outer, 160, 1);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const d = v.length();
    uv.setXY(i, (d - inner) / (outer - inner), 0.5);
  }
  return geo;
}

// ---------- 태양계 ----------
export function createSolarSystem(scene, tex) {
  const bodies = [];
  const byId = {};
  const sunPos = new THREE.Vector3(0, 0, 0);
  const pickables = [];

  const sunData = BODIES.find((b) => b.id === 'sun');

  // --- 태양 ---
  {
    const group = new THREE.Group();
    const tilt = new THREE.Group();
    tilt.rotation.z = sunData.tiltDeg * DEG;
    group.add(tilt);
    const r = sunData.visualRadius;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(r, 96, 64),
      new THREE.MeshBasicMaterial({ map: tex.load(sunData.texture), color: new THREE.Color(2.3, 2.1, 1.9) }),
    );
    tilt.add(mesh);

    const corona = new THREE.Mesh(
      new THREE.SphereGeometry(r * 1.16, 96, 64),
      new THREE.ShaderMaterial({
        vertexShader: coronaVert,
        fragmentShader: coronaFrag,
        uniforms: { uTime: { value: 0 } },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    group.add(corona);

    const glowTex = glowSpriteTexture(0.0, 1.0, [
      [0, 'rgba(255,200,120,0.9)'],
      [0.18, 'rgba(255,150,60,0.45)'],
      [0.45, 'rgba(255,110,40,0.12)'],
      [1, 'rgba(255,80,20,0)'],
    ]);
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
    );
    glow.scale.setScalar(r * 7);
    group.add(glow);

    const light = new THREE.PointLight(0xfff1dc, 2.4, 0, 0);
    group.add(light);

    const label = makeLabel(sunData.name, 'sun');
    label.position.set(0, r * 1.25, 0);
    group.add(label);

    scene.add(group);
    const body = {
      id: 'sun',
      data: sunData,
      group,
      tilt,
      mesh,
      radius: r,
      label,
      corona,
      spinRing: null,
      orbit: null,
      setHighlight(on) {
        mesh.material.color.setRGB(on ? 2.6 : 2.3, on ? 2.4 : 2.1, on ? 2.2 : 1.9);
      },
    };
    mesh.userData.body = body;
    pickables.push(mesh);
    bodies.push(body);
    byId.sun = body;
  }

  scene.add(new THREE.AmbientLight(0x3a4a66, 0.32));

  // --- 행성 ---
  const planets = BODIES.filter((b) => b.id !== 'sun' && !b.parent);
  planets.forEach((data, idx) => {
    const r = data.visualRadius * PLANET_SCALE;
    const R = orbitRadiusFromAU(data.au);
    const group = new THREE.Group();
    const tilt = new THREE.Group();
    tilt.rotation.z = data.tiltDeg * DEG;
    group.add(tilt);

    let mesh;
    let material;
    const extras = [];
    if (data.id === 'earth') {
      material = new THREE.ShaderMaterial({
        vertexShader: earthVert,
        fragmentShader: earthFrag,
        uniforms: {
          tDay: { value: tex.load(data.texture) },
          tNight: { value: tex.load(data.nightTexture) },
          uSunPos: { value: sunPos },
          uHighlight: { value: 0 },
        },
      });
      mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 96, 64), material);

      // 구름
      const cloudTex = tex.load(data.cloudTexture);
      const clouds = new THREE.Mesh(
        new THREE.SphereGeometry(r * 1.012, 96, 64),
        new THREE.MeshStandardMaterial({
          map: cloudTex,
          alphaMap: cloudTex,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          roughness: 1,
        }),
      );
      tilt.add(clouds);
      extras.push({ mesh: clouds, spin: 1.25 });

      // 대기 프레넬 (안쪽 림)
      const atmo = new THREE.Mesh(
        new THREE.SphereGeometry(r * 1.03, 96, 64),
        new THREE.ShaderMaterial({
          vertexShader: atmoVert,
          fragmentShader: atmoFrag,
          uniforms: {
            uColor: { value: new THREE.Color(0.35, 0.65, 1.0) },
            uSunPos: { value: sunPos },
            uPower: { value: 3.2 },
            uIntensity: { value: 1.5 },
          },
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      group.add(atmo);
      // 바깥 헤일로
      const haloTex = glowSpriteTexture(0.55, 1.0, [
        [0, 'rgba(90,160,255,0)'],
        [0.35, 'rgba(90,160,255,0.55)'],
        [0.6, 'rgba(70,130,255,0.18)'],
        [1, 'rgba(60,110,255,0)'],
      ]);
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: haloTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 }),
      );
      halo.scale.setScalar(r * 2.75);
      group.add(halo);
    } else {
      const isGas = /jupiter|saturn|uranus|neptune/.test(data.id);
      material = new THREE.MeshStandardMaterial({
        map: tex.load(data.texture),
        roughness: isGas ? 1 : 0.92,
        metalness: 0,
        emissive: new THREE.Color(0x000000),
      });
      mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 80, 56), material);

      if (data.id === 'venus') {
        const atmo = new THREE.Mesh(
          new THREE.SphereGeometry(r * 1.03, 80, 56),
          new THREE.ShaderMaterial({
            vertexShader: atmoVert,
            fragmentShader: atmoFrag,
            uniforms: {
              uColor: { value: new THREE.Color(1.0, 0.8, 0.5) },
              uSunPos: { value: sunPos },
              uPower: { value: 3.5 },
              uIntensity: { value: 0.9 },
            },
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        group.add(atmo);
      }
      if (data.id === 'mars') {
        const atmo = new THREE.Mesh(
          new THREE.SphereGeometry(r * 1.03, 80, 56),
          new THREE.ShaderMaterial({
            vertexShader: atmoVert,
            fragmentShader: atmoFrag,
            uniforms: {
              uColor: { value: new THREE.Color(1.0, 0.6, 0.4) },
              uSunPos: { value: sunPos },
              uPower: { value: 4.0 },
              uIntensity: { value: 0.5 },
            },
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        group.add(atmo);
      }
      if (isGas) {
        const atmo = new THREE.Mesh(
          new THREE.SphereGeometry(r * 1.02, 80, 56),
          new THREE.ShaderMaterial({
            vertexShader: atmoVert,
            fragmentShader: atmoFrag,
            uniforms: {
              uColor: { value: new THREE.Color(data.color) },
              uSunPos: { value: sunPos },
              uPower: { value: 4.0 },
              uIntensity: { value: 0.55 },
            },
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        group.add(atmo);
      }
    }
    tilt.add(mesh);

    // 고리
    if (data.id === 'saturn') {
      const ringTex = tex.load(data.ringTexture);
      ringTex.wrapS = THREE.ClampToEdgeWrapping;
      const ring = new THREE.Mesh(
        makeRingGeometry(r * 1.24, r * 2.35),
        new THREE.MeshBasicMaterial({
          map: ringTex,
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false,
          opacity: 0.95,
          color: new THREE.Color(0.9, 0.86, 0.78),
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      tilt.add(ring);
    }
    if (data.id === 'uranus') {
      const ringTex = new THREE.CanvasTexture(ringCanvas([170, 215, 235], 34, 3));
      ringTex.colorSpace = THREE.SRGBColorSpace;
      const ring = new THREE.Mesh(
        makeRingGeometry(r * 1.65, r * 2.0),
        new THREE.MeshBasicMaterial({
          map: ringTex,
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false,
          opacity: 0.5,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      tilt.add(ring);
    }

    // 궤도 + 자전 링 + 라벨
    const orbit = createOrbit(R, data.color);
    scene.add(orbit);
    const spinRing = createSpinRing(r, data.color);
    tilt.add(spinRing);
    const label = makeLabel(data.name, data.id);
    label.position.set(0, r * 1.3 + 0.4, 0);
    group.add(label);

    scene.add(group);

    const phase0 = (idx * 0.618034 + 0.13) % 1; // 골든 앵글 분산
    const body = {
      id: data.id,
      data,
      group,
      tilt,
      mesh,
      material,
      radius: r,
      orbitRadius: R,
      orbit,
      spinRing,
      label,
      extras,
      phase0,
      setHighlight(on) {
        if (material.isShaderMaterial) material.uniforms.uHighlight.value = on ? 1 : 0;
        else material.emissive.setHex(on ? 0x2a3a55 : 0x000000);
      },
    };
    mesh.userData.body = body;
    pickables.push(mesh);
    bodies.push(body);
    byId[data.id] = body;
  });

  // --- 달 ---
  {
    const data = BODIES.find((b) => b.id === 'moon');
    const earth = byId.earth;
    const r = data.visualRadius * PLANET_SCALE;
    const R = data.orbitRadius * PLANET_SCALE;
    const pivot = new THREE.Group();
    pivot.rotation.x = 5.1 * DEG;
    earth.group.add(pivot);
    const group = new THREE.Group();
    const tilt = new THREE.Group();
    tilt.rotation.z = data.tiltDeg * DEG;
    group.add(tilt);
    const material = new THREE.MeshStandardMaterial({ map: tex.load(data.texture), roughness: 1, metalness: 0 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), material);
    tilt.add(mesh);
    const orbit = createOrbit(R, data.color);
    orbit.material.uniforms.uBase.value = 0.05;
    orbit.material.uniforms.uHeadStrength.value = 0.8;
    orbit.material.uniforms.uPulseStrength.value = 0.45;
    pivot.add(orbit);
    const spinRing = createSpinRing(r, data.color);
    tilt.add(spinRing);
    const label = makeLabel(data.name, 'moon');
    label.position.set(0, r * 1.4 + 0.15, 0);
    group.add(label);
    pivot.add(group);

    const body = {
      id: 'moon',
      data,
      group,
      tilt,
      mesh,
      material,
      radius: r,
      orbitRadius: R,
      orbit,
      spinRing,
      label,
      extras: [],
      phase0: 0.3,
      parent: earth,
      setHighlight(on) {
        material.emissive.setHex(on ? 0x2a3a55 : 0x000000);
      },
    };
    mesh.userData.body = body;
    pickables.push(mesh);
    bodies.push(body);
    byId.moon = body;
  }

  // --- 소행성대 (InstancedMesh 1 드로우콜) ---
  const beltGroup = new THREE.Group();
  {
    const count = 3200;
    const inner = orbitRadiusFromAU(1.524) + 12;
    const outer = orbitRadiusFromAU(5.203) - 16;
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x9a8f84, roughness: 1, metalness: 0.05 });
    const inst = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const e = new THREE.Euler();
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      // 중앙 밀집
      const u = (Math.random() + Math.random() + Math.random()) / 3;
      const rad = inner + (outer - inner) * u;
      const y = (Math.random() - 0.5) * (Math.random() - 0.5) * 12;
      p.set(Math.cos(a) * rad, y, -Math.sin(a) * rad);
      e.set(Math.random() * TAU, Math.random() * TAU, Math.random() * TAU);
      q.setFromEuler(e);
      const sc = 0.06 + Math.pow(Math.random(), 3) * 0.3;
      s.set(sc * (0.7 + Math.random() * 0.6), sc, sc * (0.7 + Math.random() * 0.6));
      m.compose(p, q, s);
      inst.setMatrixAt(i, m);
    }
    inst.instanceMatrix.needsUpdate = true;
    beltGroup.add(inst);
    scene.add(beltGroup);
  }

  // --- 배경: 은하수 스카이박스 + 별 파티클 ---
  {
    const skyTex = tex.load('/textures/8k_stars_milky_way.jpg', { aniso: false });
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(6500, 64, 40),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, color: new THREE.Color(0.85, 0.86, 0.95) }),
    );
    sky.rotation.y = Math.PI * 0.3;
    sky.rotation.x = -Math.PI * 0.35;
    scene.add(sky);

    const count = 3200;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const tints = [
      [1.0, 1.0, 1.0],
      [0.75, 0.85, 1.0],
      [1.0, 0.9, 0.7],
      [0.9, 0.95, 1.0],
    ];
    for (let i = 0; i < count; i++) {
      const rr = 2400 + Math.random() * 2600;
      const th = Math.random() * TAU;
      const ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = rr * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = rr * Math.cos(ph);
      pos[i * 3 + 2] = rr * Math.sin(ph) * Math.sin(th);
      const t = tints[Math.floor(Math.random() * tints.length)];
      const b = 0.5 + Math.random() * 0.5;
      col[i * 3] = t[0] * b;
      col[i * 3 + 1] = t[1] * b;
      col[i * 3 + 2] = t[2] * b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const stars = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        size: 22,
        map: softParticleTexture(),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    );
    scene.add(stars);
  }

  // ---------- 업데이트 ----------
  let selected = null;
  const tmp = new THREE.Vector3();

  function update(simDays, elapsed) {
    const sun = byId.sun;
    sun.tilt.children[0].rotation.y = (TAU * simDays * 24) / sun.data.rotationHours;
    sun.corona.material.uniforms.uTime.value = elapsed;

    for (const b of bodies) {
      if (b.id === 'sun') continue;
      const d = b.data;
      const angle = b.phase0 * TAU + (TAU * simDays) / d.orbitDays;
      b.group.position.set(Math.cos(angle) * b.orbitRadius, 0, -Math.sin(angle) * b.orbitRadius);
      const phase = ((angle / TAU) % 1 + 1) % 1;
      updateOrbitMaterial(b.orbit, elapsed, phase);

      const spin = (TAU * simDays * 24) / Math.abs(d.rotationHours);
      b.mesh.rotation.y = spin;
      for (const ex of b.extras) ex.mesh.rotation.y = spin * ex.spin;
      if (b.spinRing.visible) updateOrbitMaterial(b.spinRing, elapsed);
    }

    beltGroup.rotation.y = (TAU * simDays) / (4.6 * 365.25);
  }

  function setSelected(body) {
    if (selected?.spinRing) selected.spinRing.visible = false;
    if (selected) selected.label.element.classList.remove('active');
    selected = body;
    if (selected?.spinRing) selected.spinRing.visible = true;
    if (selected) selected.label.element.classList.add('active');
  }

  // 라벨 거리 페이드
  function updateLabels(camera) {
    for (const b of bodies) {
      b.group.getWorldPosition(tmp);
      const dist = camera.position.distanceTo(tmp);
      let o = THREE.MathUtils.smoothstep(dist, b.radius * 2.2, b.radius * 7);
      if (b.id === 'moon') {
        o *= 1 - THREE.MathUtils.smoothstep(dist, 45, 110);
      }
      b.label.element.style.opacity = o.toFixed(3);
      b.label.element.style.pointerEvents = o > 0.15 ? 'auto' : 'none';
    }
  }

  return { bodies, byId, pickables, update, updateLabels, setSelected, sunPos };
}
