import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import BODY_DATA, { PLANETS } from './data/bodies.js';
import { createRotationRing, ephemerisToScene } from './orbits.js';

const TEXTURE_PATH = '/textures/';

function makeFallbackTexture(id, color = 0x888888) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const base = new THREE.Color(color);
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, `#${base.clone().offsetHSL(0, 0.08, 0.12).getHexString()}`);
  gradient.addColorStop(0.5, `#${base.getHexString()}`);
  gradient.addColorStop(1, `#${base.clone().offsetHSL(0, -0.05, -0.16).getHexString()}`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  let seed = [...id].reduce((sum, char) => sum + char.charCodeAt(0), 17);
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  context.globalCompositeOperation = 'soft-light';
  for (let index = 0; index < 280; index += 1) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    const radius = 2 + random() * 30;
    context.fillStyle = `rgba(${random() > 0.5 ? '255,255,255' : '0,0,0'},${0.03 + random() * 0.12})`;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

export async function loadBodyTextures(renderer, onProgress = () => {}) {
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => onProgress(loaded / total);
  const loader = new THREE.TextureLoader(manager);
  const requests = {
    sun: '2k_sun.jpg', mercury: '2k_mercury.jpg', venus: '2k_venus_surface.jpg',
    earth: '2k_earth_daymap.jpg', earthNight: '2k_earth_nightmap.jpg',
    earthClouds: '2k_earth_clouds.jpg', moon: '2k_moon.jpg', mars: '2k_mars.jpg',
    jupiter: '2k_jupiter.jpg', saturn: '2k_saturn.jpg', saturnRing: '2k_saturn_ring_alpha.png',
    uranus: '2k_uranus.jpg', neptune: '2k_neptune.jpg', galaxy: '8k_stars_milky_way.jpg',
  };
  let complete = 0;
  const entries = await Promise.all(Object.entries(requests).map(async ([id, filename]) => {
    try {
      const texture = await loader.loadAsync(`${TEXTURE_PATH}${filename}`);
      if (id !== 'saturnRing') texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      texture.wrapS = THREE.RepeatWrapping;
      complete += 1;
      onProgress(complete / Object.keys(requests).length);
      return [id, texture];
    } catch {
      complete += 1;
      onProgress(complete / Object.keys(requests).length);
      return [id, makeFallbackTexture(id, BODY_DATA[id]?.color ?? 0x7486a3)];
    }
  }));
  return Object.fromEntries(entries);
}

function createLabel(body) {
  const element = document.createElement('button');
  element.className = 'body-label';
  element.type = 'button';
  element.dataset.body = body.id;
  element.innerHTML = `<span class="label-dot"></span><span>${body.ko}</span>`;
  element.setAttribute('aria-label', `${body.ko} 선택`);
  const label = new CSS2DObject(element);
  const labelHeight = body.id === 'moon' ? body.radius * 1.7 + 0.14 : body.radius * 1.55 + 0.45;
  label.position.set(0, labelHeight, 0);
  label.userData.bodyId = body.id;
  return label;
}

function atmosphereMaterial(color, intensity = 1) {
  return new THREE.ShaderMaterial({
    vertexShader: /* glsl */`
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vNormal = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - world.xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float fresnel = pow(1.0 - max(0.0, dot(vNormal, vView)), 2.4);
        gl_FragColor = vec4(uColor * fresnel * uIntensity, fresnel * 0.72);
      }
    `,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
    },
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

function createPlanet(body, textures) {
  const anchor = new THREE.Group();
  anchor.name = body.id;
  anchor.userData.bodyId = body.id;
  const axis = new THREE.Group();
  axis.rotation.z = THREE.MathUtils.degToRad(body.tilt);
  anchor.add(axis);

  let material;
  if (body.id === 'sun') {
    material = new THREE.MeshBasicMaterial({ map: textures.sun, color: 0xffc36a, toneMapped: false });
  } else if (body.id === 'earth') {
    material = new THREE.MeshStandardMaterial({
      map: textures.earth,
      emissiveMap: textures.earthNight,
      emissive: new THREE.Color(0x76b9ff),
      emissiveIntensity: 0.7,
      roughness: 0.82,
    });
  } else {
    material = new THREE.MeshStandardMaterial({
      map: textures[body.id],
      roughness: body.id === 'venus' ? 0.92 : 0.78,
      metalness: 0,
    });
  }
  const geometry = new THREE.SphereGeometry(body.radius, body.id === 'sun' ? 96 : 64, body.id === 'sun' ? 64 : 48);
  const mesh = new THREE.Mesh(geometry, material);
  // 압축 축척에서는 행성 그림자가 실제보다 지나치게 커져 달을 가짜 월식처럼
  // 가리므로 천체 사이 cast shadow는 사용하지 않는다. 자체 명암은 광원으로 유지된다.
  mesh.castShadow = false;
  mesh.receiveShadow = body.id !== 'sun';
  mesh.userData.bodyId = body.id;
  axis.add(mesh);

  if (body.id === 'earth') {
    const cloudMaterial = new THREE.MeshStandardMaterial({
      map: textures.earthClouds, transparent: true, opacity: 0.58,
      depthWrite: false, roughness: 1, blending: THREE.NormalBlending,
    });
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(body.radius * 1.012, 64, 48), cloudMaterial);
    clouds.userData.isClouds = true;
    axis.add(clouds);
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(body.radius * 1.13, 64, 48),
      atmosphereMaterial(0x4bbcff, 1.5),
    );
    axis.add(atmosphere);
    anchor.userData.clouds = clouds;
  } else if (['venus', 'uranus', 'neptune'].includes(body.id)) {
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(body.radius * 1.075, 48, 32),
      atmosphereMaterial(body.color, 0.55),
    );
    axis.add(atmosphere);
  }

  if (body.id === 'saturn') {
    const ringGeometry = new THREE.RingGeometry(body.radius * 1.22, body.radius * 2.15, 128);
    const ringMaterial = new THREE.MeshStandardMaterial({
      map: textures.saturnRing,
      alphaMap: textures.saturnRing,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
      depthWrite: false,
      roughness: 0.75,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    axis.add(ring);
  }

  if (body.id === 'uranus') {
    for (const scale of [1.7, 1.92]) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(body.radius * scale, 0.012, 5, 128),
        new THREE.MeshBasicMaterial({
          color: 0x9de7e9, transparent: true, opacity: 0.34,
          blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
        }),
      );
      ring.rotation.x = Math.PI / 2;
      axis.add(ring);
    }
  }

  if (body.id === 'sun') {
    const corona = new THREE.Mesh(
      new THREE.SphereGeometry(body.radius * 1.15, 80, 48),
      atmosphereMaterial(0xff8a27, 1.35),
    );
    anchor.add(corona);
  }

  const rotationRing = createRotationRing(body.radius);
  rotationRing.material.uniforms.uDirection.value = body.retrograde ? -1 : 1;
  axis.add(rotationRing);
  const label = createLabel(body);
  anchor.add(label);
  anchor.userData.axis = axis;
  anchor.userData.mesh = mesh;
  anchor.userData.label = label;
  anchor.userData.rotationRing = rotationRing;
  anchor.userData.body = body;
  return anchor;
}

function createMoonOrbit() {
  const points = [];
  for (let index = 0; index < 128; index += 1) {
    const angle = index / 128 * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * 2.45, Math.sin(angle) * 0.2, Math.sin(angle) * 2.45));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: 0x7adfff, transparent: true, opacity: 0.23,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  return new THREE.LineLoop(geometry, material);
}

function createMoonHelpers(scene) {
  const group = new THREE.Group();
  group.visible = false;
  const earthMoonMaterial = new THREE.LineDashedMaterial({
    color: 0x5ce5ff, dashSize: 0.18, gapSize: 0.12, transparent: true, opacity: 0.75,
  });
  const line = new THREE.Line(new THREE.BufferGeometry(), earthMoonMaterial);
  group.add(line);
  const sunlight = new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.72, 0xffc052, 0.12, 0.045,
  );
  group.add(sunlight);
  const captionElement = document.createElement('div');
  captionElement.className = 'relation-label';
  captionElement.textContent = '☀ 태양빛이 비추는 방향';
  const caption = new CSS2DObject(captionElement);
  group.add(caption);
  scene.add(group);
  return { group, line, sunlight, caption };
}

export function createSoftParticleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.16, 'rgba(255,255,255,.9)');
  gradient.addColorStop(0.55, 'rgba(120,210,255,.28)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

function createAsteroidBelt(scene) {
  const count = 2800;
  const geometry = new THREE.IcosahedronGeometry(0.045, 0);
  const material = new THREE.MeshStandardMaterial({ color: 0x776b61, roughness: 1 });
  const asteroids = new THREE.InstancedMesh(geometry, material, count);
  asteroids.name = '소행성대';
  asteroids.castShadow = false;
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  let seed = 91573;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < count; i += 1) {
    const angle = random() * Math.PI * 2;
    const radius = 23.1 + (random() - 0.5) * 2.8;
    const position = new THREE.Vector3(
      Math.cos(angle) * radius,
      (random() - 0.5) * 0.85,
      Math.sin(angle) * radius,
    );
    quaternion.setFromEuler(new THREE.Euler(random() * 6, random() * 6, random() * 6));
    const size = 0.25 + random() * 1.6;
    scale.setScalar(size);
    matrix.compose(position, quaternion, scale);
    asteroids.setMatrixAt(i, matrix);
  }
  asteroids.instanceMatrix.needsUpdate = true;
  scene.add(asteroids);
  return asteroids;
}

export function createStarField(scene, texture) {
  const count = 3800;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < count; i += 1) {
    const radius = 125 + Math.random() * 105;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    color.setHSL(0.52 + (Math.random() - 0.5) * 0.15, 0.35, 0.65 + Math.random() * 0.3);
    color.toArray(colors, i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 0.38, map: texture, vertexColors: true, transparent: true, opacity: 0.72,
    depthWrite: false, blending: THREE.AdditiveBlending, alphaTest: 0.005,
  });
  const stars = new THREE.Points(geometry, material);
  scene.add(stars);
  return stars;
}

export function createSolarSystem(scene, textures) {
  const objects = new Map();
  const pickables = [];
  const allBodies = [BODY_DATA.sun, ...PLANETS, BODY_DATA.moon];
  for (const body of allBodies) {
    const anchor = createPlanet(body, textures);
    scene.add(anchor);
    objects.set(body.id, anchor);
    pickables.push(anchor.userData.mesh);
  }
  const moonOrbit = createMoonOrbit();
  scene.add(moonOrbit);
  const moonHelpers = createMoonHelpers(scene);
  const asteroids = createAsteroidBelt(scene);

  return {
    objects,
    pickables,
    moonOrbit,
    moonHelpers,
    asteroids,
    update(ephemeris, elapsed, deltaDays, selectedId, hoveredId) {
      for (const body of allBodies) {
        const object = objects.get(body.id);
        if (body.id === 'sun') object.position.set(0, 0, 0);
        else if (body.id !== 'moon') object.position.copy(ephemerisToScene(ephemeris.planets[body.id]));
        const spin = body.rotationDays === 0 ? 0 : deltaDays / body.rotationDays * Math.PI * 2;
        object.userData.mesh.rotation.y += spin;
        if (object.userData.clouds) object.userData.clouds.rotation.y += spin * 1.035;
        object.userData.rotationRing.visible = selectedId === body.id && body.id !== 'moon';
        object.userData.rotationRing.material.uniforms.uTime.value = elapsed;
        const mat = object.userData.mesh.material;
        if (mat.emissive && body.id !== 'earth') {
          mat.emissive.setHex(hoveredId === body.id ? body.color : 0x000000);
          mat.emissiveIntensity = hoveredId === body.id ? 0.35 : 0;
        }
        object.userData.label.element.classList.toggle('is-active', selectedId === body.id);
        object.userData.label.element.classList.toggle('is-hovered', hoveredId === body.id);
      }
      const earth = objects.get('earth');
      const moon = objects.get('moon');
      const moonDirection = ephemerisToScene(ephemeris.moon, 2.45);
      moon.position.copy(earth.position).add(moonDirection);
      moonOrbit.position.copy(earth.position);
      const helper = moonHelpers;
      helper.group.visible = selectedId === 'moon';
      if (helper.group.visible) {
        const points = [earth.position.clone(), moon.position.clone()];
        helper.line.geometry.dispose();
        helper.line.geometry = new THREE.BufferGeometry().setFromPoints(points);
        helper.line.computeLineDistances();
        const lightDirection = moon.position.clone().normalize();
        const arrowOrigin = moon.position.clone()
          .addScaledVector(lightDirection, -0.55)
          .add(new THREE.Vector3(0, 0.15, 0));
        helper.sunlight.position.copy(arrowOrigin);
        helper.sunlight.setDirection(lightDirection);
        helper.caption.position.copy(arrowOrigin).add(new THREE.Vector3(0, 0.16, 0));
      }
      asteroids.rotation.y += elapsed ? 0.000015 : 0;
      asteroids.visible = selectedId !== 'moon';
    },
    select(id) {
      for (const [bodyId, object] of objects) {
        object.userData.rotationRing.visible = bodyId === id && bodyId !== 'moon';
      }
    },
  };
}
