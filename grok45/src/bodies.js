/**
 * 행성/태양/달/소행성대 생성
 */
import * as THREE from 'three';
import { BODIES, PLANET_ORDER } from './data/bodies.js';
import { createOrbitLine, createSpinRing } from './orbits.js';
import { createCircleParticleTexture } from './moonview.js';

/** 교육용 압축 거리 스케일 (로그) — AU → scene units */
export function compressDistance(au) {
  if (au <= 0) return 0;
  // log compression keeps relative order, packs outer planets
  return 12 + Math.log(1 + au * 8) * 28;
}

/** 교육용 상대 크기 — 태양 대비 과장, 행성 상대비 유지 */
export function planetRadius(id) {
  const d = BODIES[id]?.diameterKm || 10000;
  const earthD = BODIES.earth.diameterKm;
  const rel = d / earthD;
  if (id === 'sun') return 6.5;
  // exaggerate small planets slightly for visibility
  const base = Math.pow(rel, 0.85) * 1.35;
  return Math.max(0.35, Math.min(base, 4.2));
}

export function moonRadius() {
  return planetRadius('moon') * 0.55;
}

/**
 * Procedural canvas texture fallback
 */
export function makeProceduralTexture(kind, size = 512) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');

  const fills = {
    sun: ['#fff5c0', '#ffaa33', '#ff6600'],
    mercury: ['#888', '#666', '#444'],
    venus: ['#e8d4a8', '#c4a574', '#a08050'],
    earth: ['#1a4d8c', '#2d8a4e', '#c2b280'],
    earthNight: ['#000010', '#1a1a40', '#ffaa44'],
    clouds: ['rgba(255,255,255,0)', 'rgba(255,255,255,0.7)'],
    moon: ['#bbb', '#888', '#555'],
    mars: ['#c1440e', '#8b3a1a', '#5c2a12'],
    jupiter: ['#d4a574', '#c4884a', '#a06030', '#e8c9a0'],
    saturn: ['#e8d9a0', '#d4c078', '#c0a860'],
    saturnRing: null,
    uranus: ['#7ec8d0', '#5aa8b0', '#3d8890'],
    neptune: ['#3d5a9e', '#2a3d7a', '#1a2860'],
    stars: ['#000005', '#ffffff'],
  };

  if (kind === 'saturnRing') {
    const img = ctx.createImageData(size, size);
    const data = img.data;
    const cx = size / 2;
    const cy = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const d = Math.sqrt(dx * dx + dy * dy) / cx;
        const i = (y * size + x) * 4;
        if (d < 0.55 || d > 0.98) {
          data[i + 3] = 0;
        } else {
          const band = Math.sin(d * 80) * 0.5 + 0.5;
          const gap = d > 0.72 && d < 0.76 ? 0.1 : 1;
          data[i] = 210;
          data[i + 1] = 190;
          data[i + 2] = 140;
          data[i + 3] = Math.floor(band * gap * 200);
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  } else if (kind === 'stars') {
    ctx.fillStyle = '#000005';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 8000; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const b = Math.random();
      const r = b > 0.98 ? 1.8 : b > 0.9 ? 1.2 : 0.6;
      ctx.fillStyle = `rgba(255,255,${220 + Math.random() * 35},${0.3 + b * 0.7})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // milky way band
    const g = ctx.createLinearGradient(0, size * 0.3, size, size * 0.7);
    g.addColorStop(0, 'rgba(40,50,90,0)');
    g.addColorStop(0.5, 'rgba(80,90,140,0.25)');
    g.addColorStop(1, 'rgba(40,50,90,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  } else if (kind === 'earthNight') {
    ctx.fillStyle = '#020210';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 2000; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      ctx.fillStyle = `rgba(255,${180 + Math.random() * 60},80,${0.3 + Math.random() * 0.7})`;
      ctx.beginPath();
      ctx.arc(x, y, Math.random() * 1.5 + 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'clouds') {
    ctx.clearRect(0, 0, size, size);
    for (let i = 0; i < 80; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const rw = 20 + Math.random() * 80;
      const rh = 8 + Math.random() * 30;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rw);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, rw, rh, Math.random(), 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    const cols = fills[kind] || ['#888', '#666', '#444'];
    const g = ctx.createLinearGradient(0, 0, size, size);
    cols.forEach((col, i) => g.addColorStop(i / (cols.length - 1), col));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    // noise bands for gas giants
    if (['jupiter', 'saturn', 'uranus', 'neptune'].includes(kind)) {
      for (let y = 0; y < size; y++) {
        const n = Math.sin(y * 0.08 + Math.sin(y * 0.02) * 3) * 0.5 + 0.5;
        ctx.fillStyle = `rgba(0,0,0,${n * 0.2})`;
        ctx.fillRect(0, y, size, 1);
      }
    }
    if (kind === 'earth') {
      // continents blobs
      ctx.fillStyle = 'rgba(40,120,60,0.7)';
      for (let i = 0; i < 12; i++) {
        ctx.beginPath();
        ctx.ellipse(
          Math.random() * size,
          Math.random() * size,
          30 + Math.random() * 60,
          20 + Math.random() * 40,
          Math.random(),
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }
    if (kind === 'sun') {
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = `rgba(255,255,200,${Math.random() * 0.15})`;
        ctx.beginPath();
        ctx.arc(Math.random() * size, Math.random() * size, Math.random() * 40, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Load texture from URL or fall back to procedural
 */
export async function loadTexture(url, fallbackKind, loader, onProgress) {
  try {
    const tex = await new Promise((resolve, reject) => {
      loader.load(
        url,
        (t) => resolve(t),
        (ev) => {
          if (onProgress && ev.total) onProgress(ev.loaded / ev.total);
        },
        (err) => reject(err)
      );
    });
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  } catch {
    console.warn('Texture fallback:', url, '→', fallbackKind);
    return makeProceduralTexture(fallbackKind);
  }
}

const TEXTURE_MAP = {
  sun: { url: '/textures/sun.jpg', kind: 'sun' },
  mercury: { url: '/textures/mercury.jpg', kind: 'mercury' },
  venus: { url: '/textures/venus.jpg', kind: 'venus' },
  earth: { url: '/textures/earth_daymap.jpg', kind: 'earth' },
  earthNight: { url: '/textures/earth_nightmap.jpg', kind: 'earthNight' },
  earthClouds: { url: '/textures/earth_clouds.jpg', kind: 'clouds' },
  moon: { url: '/textures/moon.jpg', kind: 'moon' },
  mars: { url: '/textures/mars.jpg', kind: 'mars' },
  jupiter: { url: '/textures/jupiter.jpg', kind: 'jupiter' },
  saturn: { url: '/textures/saturn.jpg', kind: 'saturn' },
  saturnRing: { url: '/textures/saturn_ring.png', kind: 'saturnRing' },
  uranus: { url: '/textures/uranus.jpg', kind: 'uranus' },
  neptune: { url: '/textures/neptune.jpg', kind: 'neptune' },
  stars: { url: '/textures/stars_milky_way.jpg', kind: 'stars' },
};

export async function loadAllTextures(onProgress) {
  const loader = new THREE.TextureLoader();
  const keys = Object.keys(TEXTURE_MAP);
  const result = {};
  let done = 0;
  for (const key of keys) {
    const { url, kind } = TEXTURE_MAP[key];
    result[key] = await loadTexture(url, kind, loader);
    // ensure anisotropy
    if (result[key].anisotropy !== undefined) {
      result[key].anisotropy = 8;
    }
    done++;
    onProgress?.(done / keys.length);
  }
  return result;
}

/** Atmosphere fresnel glow material */
function makeAtmosphereMaterial(color) {
  return new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float fres = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.8);
        gl_FragColor = vec4(uColor, fres * 0.65);
      }
    `,
    uniforms: { uColor: { value: new THREE.Color(color) } },
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
  });
}

/** Sun corona glow shader */
function makeSunGlowMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float fres = pow(1.0 - max(dot(vNormal, vView), 0.0), 1.8);
        float pulse = 0.85 + 0.15 * sin(uTime * 1.5);
        vec3 col = mix(vec3(1.0, 0.7, 0.2), vec3(1.0, 0.4, 0.05), fres);
        gl_FragColor = vec4(col * pulse, fres * 0.9);
      }
    `,
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
  });
}

/**
 * Build solar system meshes
 * @returns {{ root: THREE.Group, bodies: object, orbits: object, asteroidBelt: THREE.InstancedMesh, starField: THREE.Points, textures: object }}
 */
export async function createSolarSystem(textures, onProgress) {
  const root = new THREE.Group();
  const bodies = {};
  const orbits = {};

  // ── Sun ──
  const sunR = planetRadius('sun');
  const sunGeo = new THREE.SphereGeometry(sunR, 64, 64);
  const sunMat = new THREE.MeshBasicMaterial({
    map: textures.sun,
    color: 0xffffff,
  });
  // Use standard with emissive for bloom
  const sunMat2 = new THREE.MeshStandardMaterial({
    map: textures.sun,
    emissive: new THREE.Color(0xffaa44),
    emissiveMap: textures.sun,
    emissiveIntensity: 1.8,
    roughness: 1,
    metalness: 0,
  });
  const sunMesh = new THREE.Mesh(sunGeo, sunMat2);
  sunMesh.userData = { id: 'sun', radius: sunR, pickable: true };
  const sunGroup = new THREE.Group();
  sunGroup.add(sunMesh);

  // corona
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(sunR * 1.35, 32, 32),
    makeSunGlowMaterial()
  );
  sunGroup.add(glow);
  const glow2 = new THREE.Mesh(
    new THREE.SphereGeometry(sunR * 1.8, 32, 32),
    makeSunGlowMaterial()
  );
  glow2.material = glow2.material.clone();
  glow2.material.uniforms = { uTime: { value: 0 } };
  // softer outer
  glow2.material.onBeforeCompile = () => {};
  sunGroup.add(glow2);

  // point light from sun
  const sunLight = new THREE.PointLight(0xfff0dd, 2.5, 0, 0);
  sunLight.position.set(0, 0, 0);
  sunGroup.add(sunLight);

  root.add(sunGroup);
  bodies.sun = {
    id: 'sun',
    group: sunGroup,
    mesh: sunMesh,
    radius: sunR,
    glow,
    glow2,
    spinRing: null,
  };

  // ── Planets ──
  for (const id of PLANET_ORDER) {
    const data = BODIES[id];
    const r = planetRadius(id);
    const dist = compressDistance(data.distanceAu);
    const group = new THREE.Group();
    const pivot = new THREE.Group(); // orbital position

    const geo = new THREE.SphereGeometry(r, 48, 48);
    let mat;

    if (id === 'earth') {
      mat = new THREE.MeshStandardMaterial({
        map: textures.earth,
        roughness: 0.85,
        metalness: 0.05,
        emissiveMap: textures.earthNight,
        emissive: new THREE.Color(0xffaa66),
        emissiveIntensity: 0.55,
      });
    } else {
      mat = new THREE.MeshStandardMaterial({
        map: textures[id] || textures.mercury,
        roughness: 0.9,
        metalness: 0.05,
      });
    }

    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { id, radius: r, pickable: true };

    // axial tilt
    const tiltGroup = new THREE.Group();
    tiltGroup.rotation.z = THREE.MathUtils.degToRad(data.axialTiltDeg);
    tiltGroup.add(mesh);

    // Earth clouds + atmosphere
    if (id === 'earth') {
      const clouds = new THREE.Mesh(
        new THREE.SphereGeometry(r * 1.015, 48, 48),
        new THREE.MeshStandardMaterial({
          map: textures.earthClouds,
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
          roughness: 1,
        })
      );
      clouds.userData.isClouds = true;
      tiltGroup.add(clouds);
      const atmo = new THREE.Mesh(
        new THREE.SphereGeometry(r * 1.08, 32, 32),
        makeAtmosphereMaterial(0x4fc3f7)
      );
      tiltGroup.add(atmo);
      group.userData.clouds = clouds;
    }

    // Saturn rings
    if (id === 'saturn') {
      const ringGeo = new THREE.RingGeometry(r * 1.3, r * 2.3, 128);
      // fix UVs for ring texture
      const pos = ringGeo.attributes.position;
      const uv = ringGeo.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const d = Math.sqrt(x * x + y * y);
        uv.setXY(i, (d - r * 1.3) / (r * 2.3 - r * 1.3), 0.5);
      }
      const ringMat = new THREE.MeshBasicMaterial({
        map: textures.saturnRing,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        opacity: 0.9,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      tiltGroup.add(ring);
    }

    // Uranus thin rings
    if (id === 'uranus') {
      const ringGeo = new THREE.RingGeometry(r * 1.4, r * 1.7, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xa0d8e0,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      tiltGroup.add(ring);
    }

    group.add(tiltGroup);
    pivot.add(group);
    // initial position on +X (will be set by ephemeris)
    pivot.position.set(dist, 0, 0);
    root.add(pivot);

    // orbit line
    const orbit = createOrbitLine(dist, data.color);
    root.add(orbit);
    orbits[id] = orbit;

    bodies[id] = {
      id,
      group,
      pivot,
      mesh,
      tiltGroup,
      radius: r,
      distance: dist,
      orbitDays: data.orbitDays,
      rotationDays: data.rotationDays,
      retrograde: data.retrograde,
      axialTiltDeg: data.axialTiltDeg,
      spinRing: null,
      orbit,
    };

    onProgress?.(0.5 + (PLANET_ORDER.indexOf(id) / PLANET_ORDER.length) * 0.3);
  }

  // ── Moon (child of earth pivot) ──
  {
    const earth = bodies.earth;
    const r = moonRadius();
    const moonGroup = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(r, 32, 32),
      new THREE.MeshStandardMaterial({
        map: textures.moon,
        roughness: 0.95,
        metalness: 0,
      })
    );
    mesh.userData = { id: 'moon', radius: r, pickable: true };
    moonGroup.add(mesh);
    // moon orbit radius in scene (visual)
    const moonOrbitR = earth.radius * 4.5;
    moonGroup.position.set(moonOrbitR, 0, 0);
    earth.pivot.add(moonGroup);

    // small moon orbit line around earth
    const moonOrbit = createOrbitLine(moonOrbitR, '#c0c0c0');
    moonOrbit.material.uniforms.uIntensity.value = 0.45;
    earth.pivot.add(moonOrbit);

    bodies.moon = {
      id: 'moon',
      group: moonGroup,
      mesh,
      radius: r,
      orbitRadius: moonOrbitR,
      parent: earth,
      orbit: moonOrbit,
      spinRing: null,
      retrograde: false,
      rotationDays: BODIES.moon.rotationDays,
    };
  }

  // ── Asteroid belt (Mars–Jupiter) InstancedMesh ──
  const asteroidCount = 2500;
  const aR0 = compressDistance(1.8);
  const aR1 = compressDistance(3.2);
  const asteroidGeo = new THREE.SphereGeometry(0.08, 4, 4);
  const asteroidMat = new THREE.MeshStandardMaterial({
    color: 0x8a7a68,
    roughness: 1,
    metalness: 0.1,
  });
  const asteroidBelt = new THREE.InstancedMesh(asteroidGeo, asteroidMat, asteroidCount);
  const dummy = new THREE.Object3D();
  const asteroidData = [];
  for (let i = 0; i < asteroidCount; i++) {
    const rr = aR0 + Math.random() * (aR1 - aR0);
    const theta = Math.random() * Math.PI * 2;
    const y = (Math.random() - 0.5) * 2.5;
    const scale = 0.4 + Math.random() * 1.6;
    dummy.position.set(Math.cos(theta) * rr, y, Math.sin(theta) * rr);
    dummy.scale.setScalar(scale);
    dummy.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    dummy.updateMatrix();
    asteroidBelt.setMatrixAt(i, dummy.matrix);
    asteroidData.push({ r: rr, theta, y, scale, speed: 0.02 + Math.random() * 0.03 });
  }
  asteroidBelt.instanceMatrix.needsUpdate = true;
  asteroidBelt.userData.asteroids = asteroidData;
  root.add(asteroidBelt);

  // ── Star field particles (soft circles) ──
  const starCount = 4000;
  const starGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const rad = 400 + Math.random() * 500;
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    positions[i * 3] = rad * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = rad * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = rad * Math.cos(phi);
    const c = 0.7 + Math.random() * 0.3;
    colors[i * 3] = c;
    colors[i * 3 + 1] = c * (0.9 + Math.random() * 0.1);
    colors[i * 3 + 2] = c;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const starTex = createCircleParticleTexture(64);
  const starMat = new THREE.PointsMaterial({
    size: 1.8,
    map: starTex,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const starField = new THREE.Points(starGeo, starMat);
  root.add(starField);

  // ── Skybox ──
  const skyGeo = new THREE.SphereGeometry(900, 32, 32);
  const skyMat = new THREE.MeshBasicMaterial({
    map: textures.stars,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  root.add(sky);

  return { root, bodies, orbits, asteroidBelt, starField, sky, textures };
}

export function attachSpinRing(body) {
  if (body.spinRing) return body.spinRing;
  const ring = createSpinRing(body.radius * 1.25, body.retrograde, 0x4deeea);
  // attach to tilt group if exists so it follows equator
  if (body.tiltGroup) body.tiltGroup.add(ring);
  else body.group.add(ring);
  body.spinRing = ring;
  return ring;
}

export function removeSpinRing(body) {
  if (!body?.spinRing) return;
  body.spinRing.parent?.remove(body.spinRing);
  body.spinRing.geometry?.dispose();
  body.spinRing.material?.dispose();
  body.spinRing = null;
}
