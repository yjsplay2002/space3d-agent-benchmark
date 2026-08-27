import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { LensFlarePass } from './lensflare.js';
import { BODIES } from './data.js';
import { moonTexture } from './moon-textures.js';
import { initImpact } from './impact.js';

// ---------------------------------------------------------------- 디바이스 프로파일
// 터치 기기 = 호버 불가. 레이아웃 기준은 CSS의 하단 시트 미디어쿼리와 동일하게 맞춘다.
const mqTouch = matchMedia('(hover: none)');
const mqSheet = matchMedia('(max-width: 820px), (orientation: portrait) and (max-width: 1024px)');
const isTouch = () => mqTouch.matches;
const isSheetLayout = () => mqSheet.matches;
// 저사양 판단: 터치 기기 + 코어 수 / 좁은 화면
const LOW_POWER = mqTouch.matches || (navigator.hardwareConcurrency || 8) <= 4 ||
  Math.min(screen.width, screen.height) <= 820;
const SEG = LOW_POWER ? 32 : 64;         // 행성 구 세그먼트
const SEG_MOON = LOW_POWER ? 20 : 32;    // 위성은 작게 보이므로 세그먼트 절약
const SUN_SEG = LOW_POWER ? 48 : 96;
const STAR_COUNT = LOW_POWER ? 1200 : 3000;
const BELT_COUNT = LOW_POWER ? 1600 : 4500;
const MAX_DPR = LOW_POWER ? 1.5 : 2;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- loading
const manager = new THREE.LoadingManager();
const loadFill = document.getElementById('loading-fill');
const loadText = document.getElementById('loading-text');
manager.onProgress = (url, loaded, total) => {
  loadFill.style.width = `${(loaded / total) * 100}%`;
  loadText.textContent = `텍스처 불러오는 중... ${loaded}/${total}`;
};
manager.onLoad = () => {
  loadFill.style.width = '100%';
  setTimeout(() => document.getElementById('loading').classList.add('done'), 300);
};
const texLoader = new THREE.TextureLoader(manager);

function loadTex(file, srgb = true) {
  const t = texLoader.load(`/textures/${file}`, undefined, undefined, () => {
    // 다운로드 실패 시 프로시저럴 폴백 — 빌드/런타임 절대 안 깨짐
    t.image = makeFallbackCanvas();
    t.needsUpdate = true;
  });
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = LOW_POWER ? 2 : 8;
  return t;
}
function makeFallbackCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, '#555'); grad.addColorStop(1, '#999');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  return c;
}

// 원형 소프트 파티클 텍스처 — Points 기본 네모 방지
function makeSoftCircleTexture(inner = 0.15) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(inner, 'rgba(255,255,255,0.9)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const softDot = makeSoftCircleTexture();

// ---------------------------------------------------------------- renderer / scene
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, MAX_DPR));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 4000);
camera.position.set(0, 95, 210);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
Object.assign(labelRenderer.domElement.style, {
  position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: 5,
});
document.body.appendChild(labelRenderer.domElement);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 3;
controls.maxDistance = 700;
// 터치: 한 손가락 회전 / 두 손가락 확대·이동
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
controls.zoomSpeed = isTouch() ? 0.8 : 1;
controls.rotateSpeed = isTouch() ? 0.7 : 1;

// 은하수 배경
const skyTex = loadTex('8k_stars_milky_way.jpg');
skyTex.mapping = THREE.EquirectangularReflectionMapping;
scene.background = skyTex;
scene.backgroundIntensity = 0.35;

// 추가 별 파티클
{
  const n = STAR_COUNT;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(900 + Math.random() * 800);
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xbfd4ff, size: 2.2, sizeAttenuation: true,
    map: softDot, transparent: true, opacity: 0.7,
    depthWrite: false, blending: THREE.AdditiveBlending,
  })));
}

// 조명 — 태양 포인트라이트 + 차가운 은은한 앰비언트
// (밤면이 새까만 실루엣이 되지 않도록 앰비언트를 약간 올리고,
//  각 행성 재질에 자기 컬러맵을 아주 약한 emissive로 깔아 어두운 면에서도 색이 읽히게 한다)
const sunLight = new THREE.PointLight(0xfff2dd, 26000, 0, 2);
scene.add(sunLight);
scene.add(new THREE.AmbientLight(0x2b3a50, 0.65));


// ---------------------------------------------------------------- 흐르는 빛 셰이더 (궤도/자전 링 공용)
function flowMaterial(color, opacity = 1) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uDir: { value: 1 },       // 1 = 진행 방향, -1 = 역방향
      uPulses: { value: 3 },    // 동시에 흐르는 빛 펄스 개수
      uHead: { value: 0 },      // 천체 현재 위치 (궤도 호 분율 0~1) — 매 프레임 갱신
    },
    vertexShader: /* glsl */`
      attribute float aT;
      varying float vT;
      void main() {
        vT = aT;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uOpacity, uDir, uPulses, uHead;
      uniform vec3 uColor;
      varying float vT;
      void main() {
        // 천체 바로 뒤로 길게 스러지는 혜성 꼬리 — 공전 방향이 한눈에 읽힌다 (fable5 이식)
        float behind = fract((uHead - vT) * uDir);
        float head = exp(-behind * 7.0) * 1.35;
        // 그 위로 흐르는 작은 펄스들 (방향 보조)
        float phase = fract(vT * uPulses - uTime * uDir);
        float pulse = pow(phase, 14.0) * 0.55;
        float base = 0.05;                        // 희미한 전체 궤도선
        float b = base + head + pulse;
        gl_FragColor = vec4(uColor * b, b * uOpacity);
      }`,
  });
}

function makeFlowCircle(radius, color, opacity) {
  const seg = LOW_POWER ? 256 : 512;
  const pos = new Float32Array((seg + 1) * 3);
  const ts = new Float32Array(seg + 1);
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pos.set([Math.cos(a) * radius, 0, -Math.sin(a) * radius], i * 3); // CCW(위에서 봤을 때) = 공전 방향
    ts[i] = i / seg;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aT', new THREE.BufferAttribute(ts, 1));
  const line = new THREE.Line(geo, flowMaterial(color, opacity));
  line.material.uniforms.uPulses.value = radius > 20 ? 4 : 2;
  return line;
}

const flowMats = []; // uTime 업데이트 대상

// ---------------------------------------------------------------- 천체 생성
const bodyMap = new Map(); // id -> { data, group(공전 위치), mesh, spinAxis, orbitLine, ... }
const clickables = [];

for (const d of BODIES) {
  const group = new THREE.Group(); // 궤도상 위치
  const tiltGroup = new THREE.Group(); // 자전축 기울기
  tiltGroup.rotation.z = THREE.MathUtils.degToRad(d.tilt);
  group.add(tiltGroup);

  const isMoon = !!d.parent;
  // 달을 뺀 새 위성들은 "부모 선택 or 카메라 근접" 시에만 라벨/궤도를 보인다 (과밀 방지)
  const gatedMoon = isMoon && d.id !== 'moon';

  let mesh;
  if (d.id === 'sun') {
    mesh = new THREE.Mesh(
      new THREE.SphereGeometry(d.radius, SUN_SEG, SUN_SEG),
      new THREE.MeshBasicMaterial({ map: loadTex(d.texture), color: 0xffffff }),
    );
    // HDR 오버드라이브는 매 프레임 sunClose에 따라 조절 (렌즈플레어 브라이트패스의 유일한 트리거)
    bodyMapSet(d.id, 'sunMat', mesh.material);

    // 원거리 확산광 스프라이트 — 전보다 훨씬 약하게. 근거리 "납작한 원판" 문제는
    // 아래 프레넬 셸이 넘겨받고, 이 스프라이트는 가까워지면 완전히 사라진다.
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 256;
    const g = glowCanvas.getContext('2d');
    const rg = g.createRadialGradient(128, 128, 20, 128, 128, 128);
    rg.addColorStop(0, 'rgba(255,220,150,0.9)');
    rg.addColorStop(0.35, 'rgba(255,160,60,0.35)');
    rg.addColorStop(1, 'rgba(255,120,30,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
    const glowTex = new THREE.CanvasTexture(glowCanvas);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.34,
    }));
    glow.scale.setScalar(d.radius * 3.8);
    group.add(glow);
    bodyMapSet(d.id, 'sunGlow', glow);

    // 코로나 — 뒷면 프레넬 셸 + 이중 주파수 플리커 (fable5 이식).
    // 데칼이 아니라 실제 대기처럼 읽히고, 가까이 가도 납작한 원판이 되지 않는다.
    const coronaMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
      uniforms: {
        uColor: { value: new THREE.Color(0xffa030) },
        uCamPos: { value: new THREE.Vector3() },
        uTime: { value: 0 },
        uOpacity: { value: 1 },
        uFlicker: { value: REDUCED ? 0.015 : 0.1 }, // 모션 최소화 설정이면 거의 정지
      },
      vertexShader: /* glsl */`
        varying vec3 vN, vW;
        void main() {
          vN = normalize(mat3(modelMatrix) * normal);
          vW = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        uniform vec3 uCamPos;
        uniform float uTime, uOpacity, uFlicker;
        varying vec3 vN, vW;
        void main() {
          vec3 v = normalize(uCamPos - vW);
          float a = abs(dot(v, normalize(vN)));
          // 프레넬 지수를 fable5(2.0)보다 높여 림을 실루엣 쪽으로 좁히고,
          // 실루엣 바로 앞(a→0)에서 다시 0으로 눌러 셸 바깥 경계가
          // "접시 가장자리"처럼 딱 끊겨 보이지 않게 한다
          float fres = pow(1.0 - a, 3.0) * smoothstep(0.0, 0.22, a);
          float flicker = (1.0 - uFlicker)
            + uFlicker * sin(uTime * 2.0 + vW.x * 3.0) * sin(uTime * 1.3 + vW.z * 2.0);
          gl_FragColor = vec4(uColor * fres * flicker * 1.7 * uOpacity, 1.0);
        }`,
    });
    const corona = new THREE.Mesh(
      new THREE.SphereGeometry(d.radius * 1.3, LOW_POWER ? 40 : 64, LOW_POWER ? 28 : 48),
      coronaMat,
    );
    group.add(corona);
    bodyMapSet(d.id, 'corona', corona);
  } else {
    // 위성은 파일 대신 프로시저럴 캔버스 텍스처 (다운로드 없음)
    const map = d.moonTex ? moonTexture(d.moonTex) : loadTex(d.texture);
    const mat = new THREE.MeshStandardMaterial({
      map, roughness: 0.95, metalness: 0,
    });
    if (d.night) {
      mat.emissiveMap = loadTex(d.night);
      mat.emissive = new THREE.Color(0xffe9b0);
      mat.emissiveIntensity = 1.0; // 밤면이 밝아진 만큼 도시 불빛도 또렷하게
    } else {
      // 밤면 보조광: 자기 컬러맵을 아주 약하게 스스로 빛나게 → 그늘진 면도 "어둡지만 읽히는 표면"
      // (지구는 야간 도시 불빛 emissive가 이미 있으므로 제외 — 앰비언트가 대신 받쳐 준다)
      mat.emissiveMap = map;
      mat.emissive = new THREE.Color(0x9aa0a8); // 거의 무채색 — 화성이 보라색이 되지 않게
      mat.emissiveIntensity = 0.14;
    }
    mesh = new THREE.Mesh(new THREE.SphereGeometry(d.radius, isMoon ? SEG_MOON : SEG, isMoon ? SEG_MOON : SEG), mat);
  }
  tiltGroup.add(mesh);

  // 지구 구름 + 대기 글로우
  if (d.clouds) {
    const clouds = new THREE.Mesh(
      new THREE.SphereGeometry(d.radius * 1.015, SEG, SEG),
      new THREE.MeshStandardMaterial({
        map: loadTex(d.clouds), transparent: true, opacity: 0.55,
        depthWrite: false, blending: THREE.NormalBlending,
      }),
    );
    tiltGroup.add(clouds);
    bodyMapSet(d.id, 'clouds', clouds);

    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(d.radius * 1.12, SEG, SEG),
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
        uniforms: {
          uColor: { value: new THREE.Color(0x4d9fff) },
          uStrength: { value: 0.9 }, // 가까이 가면 낮춰서 표면이 씻겨 보이지 않게
        },
        vertexShader: /* glsl */`
          varying vec3 vN, vV;
          void main() {
            vN = normalize(normalMatrix * normal);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vV = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */`
          uniform vec3 uColor;
          uniform float uStrength;
          varying vec3 vN, vV;
          void main() {
            float f = pow(1.0 - abs(dot(vN, vV)), 2.5);
            gl_FragColor = vec4(uColor, f * uStrength);
          }`,
      }),
    );
    tiltGroup.add(atmo);
    bodyMapSet(d.id, 'atmo', atmo);
  }

  // 토성 고리
  if (d.ring) {
    const inner = d.radius * 1.25, outer = d.radius * 2.3;
    const ringGeo = new THREE.RingGeometry(inner, outer, LOW_POWER ? 64 : 128);
    // UV를 반지름 방향으로 매핑
    const uv = ringGeo.attributes.uv;
    const p = ringGeo.attributes.position;
    for (let i = 0; i < uv.count; i++) {
      const r = Math.hypot(p.getX(i), p.getY(i));
      uv.setXY(i, (r - inner) / (outer - inner), 0.5);
    }
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      map: loadTex(d.ring), transparent: true, side: THREE.DoubleSide,
      opacity: 0.95, depthWrite: false,
    }));
    ring.rotation.x = -Math.PI / 2;
    tiltGroup.add(ring);
  }

  // 라벨
  const labelEl = document.createElement('div');
  labelEl.className = isMoon ? 'body-label moon-label' : 'body-label';
  labelEl.textContent = d.name;
  labelEl.addEventListener('click', () => selectBody(d.id));
  const label = new CSS2DObject(labelEl);
  label.position.set(0, d.radius * 1.6 + 0.6, 0);
  group.add(label);

  // 궤도 (흐르는 빛)
  let orbitLine = null;
  if (d.dist > 0) {
    const orbitOpacity = isMoon ? 0.5 : 0.85;
    orbitLine = makeFlowCircle(d.dist, isMoon ? 0x9fb8d8 : 0x6ee7ff, orbitOpacity);
    orbitLine.userData.baseOpacity = orbitOpacity;
    if (d.retroOrbit) orbitLine.material.uniforms.uDir.value = -1; // 트리톤: 빛도 거꾸로 흐른다
    flowMats.push(orbitLine.material);
    if (d.parent) bodyMap.get(d.parent).group.add(orbitLine);
    else scene.add(orbitLine);
  }

  if (d.parent) bodyMap.get(d.parent).group.add(group);
  else scene.add(group);

  mesh.userData.bodyId = d.id;
  clickables.push(mesh);

  const entry = bodyMap.get(d.id) || {};
  Object.assign(entry, {
    data: d, group, tiltGroup, mesh, label, labelEl, orbitLine,
    gatedMoon, moonVis: gatedMoon ? 0 : 1, // 과밀 방지 페이드 (0=숨김, 1=표시)
    angle: Math.random() * Math.PI * 2,
  });
  bodyMap.set(d.id, entry);
}
function bodyMapSet(id, key, val) {
  const e = bodyMap.get(id) || {};
  e[key] = val;
  bodyMap.set(id, e);
}

// 자전 방향 링 (선택된 행성 전용, 하나 재사용) — 토러스라 옆에서 봐도 사라지지 않는다 (fable5 이식)
// 단위 반지름 토러스를 selectBody에서 천체 크기로 스케일. 튜브 굵기는 반지름 비례라
// 카메라 프레이밍(viewDist = 반지름 비례)과 함께 어느 천체에서나 같은 굵기로 보인다.
function makeSpinTorus() {
  const geo = new THREE.TorusGeometry(1, 0.022, LOW_POWER ? 6 : 8, LOW_POWER ? 96 : 128);
  geo.rotateX(-Math.PI / 2); // 적도면(XZ)으로, uv.x 증가 방향 = 위에서 봤을 때 CCW(순행)
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uDir: { value: 1 },
      uColor: { value: new THREE.Color(0xffc46b) },
      uOpacity: { value: 1 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uDir, uOpacity;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        // 튜브 길이 방향으로 흐르는 혜성 펄스 3개
        float t = fract(vUv.x * 3.0 - uTime * 4.0 * uDir);
        float b = exp(-t * 6.0) * 1.6 + 0.07;
        gl_FragColor = vec4(uColor * b * uOpacity, 1.0);
      }`,
  });
  return new THREE.Mesh(geo, mat);
}
const spinRing = makeSpinTorus();
spinRing.visible = false;
flowMats.push(spinRing.material);
scene.add(spinRing);

// ---------------------------------------------------------------- 소행성대
{
  const n = BELT_COUNT;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = 68 + Math.random() * 12 + Math.pow(Math.random(), 3) * 4;
    const a = Math.random() * Math.PI * 2;
    pos.set([Math.cos(a) * r, (Math.random() - 0.5) * 2.2, -Math.sin(a) * r], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const belt = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0x8a7f70, size: 0.5, map: softDot,
    transparent: true, opacity: 0.75, depthWrite: false,
  }));
  scene.add(belt);
  belt.userData.isBelt = true;
  bodyMapSet('_belt', 'mesh', belt);
}

// ---------------------------------------------------------------- 후처리
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// 렌즈플레어 — 블룸 이전의 원본 HDR 버퍼에서 태양 코어만 추출해야 한다.
// LOW_POWER에선 패스 자체를 만들지 않는다 (체인은 Render → Bloom → Grain → Output 그대로 동작).
const flarePass = LOW_POWER ? null : new LensFlarePass();
if (flarePass) {
  flarePass.setSize(innerWidth, innerHeight);
  composer.addPass(flarePass);
}
const bloomScale = LOW_POWER ? 0.5 : 1; // 모바일은 블룸을 절반 해상도로
const bloom = new UnrealBloomPass(
  new THREE.Vector2(innerWidth * bloomScale, innerHeight * bloomScale), 0.9, 0.6, 0.82,
);
composer.addPass(bloom);
const grainPass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 },
    uGrain: { value: 0.05 },     // 그레인 세기 — 표면 근접 시 낮춤
    uVignette: { value: 0.42 },  // 가장자리 어둡기 — 중앙은 항상 100% 밝기
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uGrain, uVignette;
    varying vec2 vUv;
    float rand(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float grain = (rand(vUv * 900.0 + fract(uTime)) - 0.5) * uGrain;  // 필름 그레인
      float d = distance(vUv, vec2(0.5));
      // 비네트: 가장자리만 어둡게, 화면 중앙은 절대 어둡히지 않는다
      float vig = 1.0 - uVignette * smoothstep(0.35, 0.95, d);
      c.rgb = c.rgb * vig + grain;
      gl_FragColor = c;
    }`,
});
composer.addPass(grainPass);
composer.addPass(new OutputPass());

// ---------------------------------------------------------------- 시간/속도
let paused = false;
// 시뮬레이션 0일 = 실제 오늘 → 달 위상 패널이 실제 날짜와 맞음
const SIM_EPOCH_MS = Date.now();
let simDays = 0;
const speedInput = document.getElementById('speed');
const speedLabel = document.getElementById('speed-label');
const btnPause = document.getElementById('btn-pause');
function speedMult() { return Math.pow(10, parseFloat(speedInput.value) - 1); } // 0.1x ~ 1000x
function fmtSpeed() {
  const s = speedMult();
  speedLabel.textContent = s >= 10 ? `${Math.round(s)}×` : `${s.toFixed(1)}×`;
}
speedInput.addEventListener('input', fmtSpeed);
fmtSpeed();
function setPaused(v) {
  paused = v;
  btnPause.textContent = paused ? '▶' : '⏸';
}
btnPause.addEventListener('click', () => setPaused(!paused));

// ---------------------------------------------------------------- 날짜 넘기기 (하루 전 / 오늘 / 하루 후)
const DAY_MS = 86400000;
const btnPrevDay = document.getElementById('btn-prev-day');
const btnNextDay = document.getElementById('btn-next-day');
const btnToday = document.getElementById('btn-today');
const dateMain = document.getElementById('date-main');
let lastDateKey = -1, lastRealKey = -1;
const dayKey = (d) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
// 날짜가 실제로 바뀔 때만 DOM을 만진다 — 1000×에서도 프레임마다 텍스트를 안 갈아끼움
function updateDateReadout() {
  const d = new Date(SIM_EPOCH_MS + simDays * DAY_MS);
  const key = dayKey(d);
  const realKey = dayKey(new Date());
  if (key === lastDateKey && realKey === lastRealKey) return;
  lastDateKey = key; lastRealKey = realKey;
  dateMain.textContent = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  btnToday.disabled = key === realKey; // 이미 오늘이면 누를 필요가 없어요
}
updateDateReadout();

// 날짜 버튼은 누르는 순간 일시정지 — 시계가 계속 돌면 방금 맞춘 날짜가 흘러가 버린다.
// ▶ 버튼으로 언제든 다시 재생.
function pauseForDateStep() { if (!paused) setPaused(true); }
function afterSimJump() { updateDateReadout(); updateMoonPanel(); }
function stepDay(dir) { pauseForDateStep(); simDays += dir; afterSimJump(); }
btnToday.addEventListener('click', () => {
  pauseForDateStep();
  simDays = (Date.now() - SIM_EPOCH_MS) / DAY_MS; // 실제 지금으로 복귀
  afterSimJump();
});

// 꾹 누르면 반복 + 점점 빨라짐 — 다음 달을 보고 싶은 아이가 서른 번 안 눌러도 되게
function bindHold(btn, dir) {
  let timer = null;
  const stop = () => { if (timer !== null) { clearTimeout(timer); timer = null; } };
  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    stop();
    let count = 0;
    stepDay(dir);
    const fire = () => {
      stepDay(dir);
      count++;
      timer = setTimeout(fire, count < 6 ? 240 : count < 18 ? 110 : 40);
    };
    timer = setTimeout(fire, 450);
  });
  btn.addEventListener('pointerup', stop);
  btn.addEventListener('pointercancel', stop);
  btn.addEventListener('pointerleave', stop);
  btn.addEventListener('contextmenu', (e) => e.preventDefault()); // 길게 눌러도 메뉴 안 뜨게
  // pointerdown으로만 동작하므로 키보드는 따로 (Enter/Space, 꾹 누르면 OS 키 반복)
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stepDay(dir); }
  });
}
bindHold(btnPrevDay, -1);
bindHold(btnNextDay, 1);

// ---------------------------------------------------------------- 선택 / 카메라
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(-10, -10);
const mouseNorm = new THREE.Vector2(); // 패럴랙스용
let selected = null;       // bodyMap entry
let flyT = 1;              // 0→1 비행 진행도
const flyFrom = new THREE.Vector3();
const flyFromTarget = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const aimV = new THREE.Vector3();

const panel = document.getElementById('info-panel');
const btnOverview = document.getElementById('btn-overview');
const btnInfo = document.getElementById('btn-info');
let panelOpen = false;   // 패널 표시 여부 — 포커스(selected)와 완전히 독립

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return; // 터치 드래그는 호버/패럴랙스로 취급 안 함
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  mouseNorm.set(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5);
});
let downPos = null;
canvas.addEventListener('pointerdown', (e) => {
  downPos = [e.clientX, e.clientY];
  // 터치는 pointermove가 없을 수 있어 다운 지점을 그대로 레이 원점으로 사용
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
});
canvas.addEventListener('pointercancel', () => { downPos = null; });
canvas.addEventListener('pointerup', (e) => {
  if (!downPos) return;
  const moved = Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]);
  downPos = null;
  const slop = e.pointerType === 'mouse' ? 6 : 12; // 손가락은 흔들림이 큼
  if (moved > slop) return; // 드래그는 클릭 아님
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(clickables)[0];
  if (hit) selectBody(hit.object.userData.bodyId);
});

function syncChrome() {
  btnOverview.hidden = !selected;
  btnInfo.hidden = !selected;
  document.body.classList.toggle('focused', !!selected);
  document.body.classList.toggle('panel-open', panelOpen);
  document.body.classList.toggle('panel-closed', !!selected && !panelOpen);
}

function selectBody(id) {
  const e = bodyMap.get(id);
  if (!e) return;
  if (selected === e) {
    // 같은 천체 재탭 = 포커스 유지한 채 패널만 다시 열기 (충돌 실험 중엔 그대로 둠)
    if (!panelOpen && !impact.isOpen()) openPanel();
    return;
  }
  // 다른 천체로 넘어가면 충돌 실험은 조용히 종료 (흔적은 유지)
  if (impact.isOpen()) impact.close(false);
  selected = e;
  flyT = 0;
  flyFrom.copy(camera.position);
  flyFromTarget.copy(controls.target);
  fillPanel(e.data);
  openPanel();
  // 자전 링 세팅
  const d = e.data;
  if (d.id === 'sun') { spinRing.visible = false; }
  else {
    spinRing.visible = true;
    spinRing.scale.setScalar(d.radius * 1.5);
    spinRing.material.uniforms.uDir.value = d.retrograde ? -1 : 1;
  }
  // 작은 위성도 바짝 다가가 볼 수 있게 줌 한계를 천체 크기에 맞춘다
  controls.minDistance = Math.max(0.45, d.radius * 1.15);
  // 포보스처럼 빨리 도는 위성은 그대로 두면 배경이 프레임마다 점프해 어지럽다.
  // 한 바퀴가 최소 2.5초는 걸리도록 시간 속도를 낮춘다 (슬라이더가 움직여서 아이 눈에도 보인다)
  if (d.parent && d.orbitDays > 0) {
    const maxMult = d.orbitDays / 2.5; // 1초 = speedMult 일
    if (speedMult() > maxMult) {
      speedInput.value = Math.max(0, Math.log10(maxMult) + 1);
      fmtSpeed();
    }
  }
  // 라벨 선택 표시
  for (const [, be] of bodyMap) be.labelEl?.classList.toggle('selected', be === e);
}

// 패널만 닫는다 — selected(카메라 포커스/추적)는 그대로 유지
function closePanel() {
  if (!panelOpen) return;
  panelOpen = false;
  panel.classList.remove('open');
  syncChrome();
}

// 포커스까지 해제 = 전체 보기로 복귀
function deselect() {
  if (!selected) return;
  if (impact.isOpen()) impact.close(false);
  selected = null;
  spinRing.visible = false;
  panelOpen = false;
  panel.classList.remove('open');
  controls.minDistance = 3;
  for (const [, be] of bodyMap) be.labelEl?.classList.remove('selected');
  syncChrome();
  flyT = 0;
  flyFrom.copy(camera.position);
  flyFromTarget.copy(controls.target);
}

btnOverview.addEventListener('click', deselect);
btnInfo.addEventListener('click', () => { if (selected) openPanel(); });
document.getElementById('panel-close').addEventListener('click', closePanel);
// 시트 손잡이 탭/아래로 스와이프 → 패널만 닫기 (포커스 유지)
{
  const grab = document.getElementById('panel-grabber');
  let y0 = null;
  grab.addEventListener('pointerdown', (e) => { y0 = e.clientY; });
  grab.addEventListener('pointerup', (e) => {
    if (y0 === null) return;
    const dy = e.clientY - y0;
    y0 = null;
    if (dy > 30 || Math.abs(dy) < 8) closePanel(); // 아래로 끌기 or 탭
  });
}
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (impact.isOpen()) impact.close(true); // 0단계: 충돌 실험 → 정보 패널로 복귀
  else if (panelOpen) closePanel();        // 1단계: 패널만
  else deselect();                         // 2단계: 포커스 해제
});

const easeInOut = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// ---------------------------------------------------------------- 정보 패널
function fillPanel(d) {
  panel.hidden = false;
  document.getElementById('p-emoji').textContent = d.emoji;
  document.getElementById('p-name').textContent = d.name;
  document.getElementById('p-eng').textContent = d.eng;
  document.getElementById('p-type').textContent = d.type;
  document.getElementById('p-desc').textContent = d.desc;
  document.getElementById('p-spin').textContent = '🔄 ' + d.spin;

  const stats = document.getElementById('p-stats');
  stats.innerHTML = '';
  for (const [k, v] of Object.entries(d.stats)) {
    const row = document.createElement('div');
    row.className = 'stat-row';
    row.innerHTML = `<span class="k">${k}</span><span class="v"></span>`;
    row.querySelector('.v').textContent = v;
    stats.appendChild(row);
  }
  const facts = document.getElementById('p-facts');
  facts.innerHTML = '';
  for (const f of d.facts) {
    const li = document.createElement('li');
    li.textContent = f;
    facts.appendChild(li);
  }
}

function openPanel() {
  panel.hidden = false;
  panel.classList.remove('open');
  panel.scrollTop = 0;
  const stats = document.getElementById('p-stats');
  const facts = document.getElementById('p-facts');
  // stagger materialize
  const items = [
    document.querySelector('.panel-emoji'), document.getElementById('p-name'),
    document.getElementById('p-eng'), document.getElementById('p-type'),
    document.getElementById('p-desc'), document.getElementById('btn-impact'),
    ...stats.children, document.getElementById('p-spin'),
    panel.querySelector('h3'), ...facts.children,
  ];
  items.forEach((el, i) => {
    el.classList.remove('anim');
    el.style.setProperty('--i', i); // CSS가 --i로 스태거 딜레이 계산
    void el.offsetWidth; // reflow로 애니메이션 재시작
    el.classList.add('anim');
  });
  panelOpen = true;
  syncChrome();
  void panel.offsetWidth; // 리플로우 강제 → transform 트랜지션 확실히 재생
  panel.classList.add('open');
  countUpNumbers(stats);
}

// 숫자 카운트업 — 값 안의 첫 숫자를 0부터 올림
function countUpNumbers(container) {
  container.querySelectorAll('.v').forEach((el, i) => {
    const full = el.textContent;
    const m = full.match(/[\d,]+(\.\d+)?/);
    if (!m) return;
    const target = parseFloat(m[0].replace(/,/g, ''));
    if (!isFinite(target) || target === 0) return;
    const decimals = m[1] ? m[1].length - 1 : 0;
    const t0 = performance.now() + 150 + i * 60;
    const dur = 900;
    function tick(now) {
      const p = Math.min(1, Math.max(0, (now - t0) / dur));
      const v = target * easeInOut(p);
      const str = v.toLocaleString('ko-KR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
      el.textContent = full.replace(m[0], str);
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = full;
    }
    requestAnimationFrame(tick);
  });
}

// ---------------------------------------------------------------- 근접도 (표면 접근 시 이펙트 완화)
// 카메라가 어떤 천체 표면에 가까울수록 1에 접근. (거리 ÷ 반지름 기반 → 엔셀라두스도 목성도 동일하게 동작)
let prox = 0;          // 프레임마다 부드럽게 따라가는 값
let earthClose = 0;    // 지구 전용 (대기 글로우 완화)
let sunClose = 0;      // 태양 전용 (코로나 완화)

// ---------------------------------------------------------------- 소행성 충돌 시뮬레이션
const impact = initImpact({
  camera, controls, bodyMap, LOW_POWER,
  // 표면 근접도 — 충돌 섬광/링이 코앞에서 화면을 하얗게 태우지 않게
  getProx: () => prox,
  // 충돌 패널을 닫으면 오던 길(정보 패널)로 되돌아간다
  reopenInfo: () => { if (selected) openPanel(); },
});
document.getElementById('btn-impact').addEventListener('click', () => {
  if (!selected) return;
  closePanel();          // 정보 패널 자리를 비우고
  impact.open(selected); // 충돌 실험 시트를 연다
});

// ---------------------------------------------------------------- 달 위상 패널
// 삭(신월) 기준시 2000-01-06 18:14 UTC = JD 2451550.1, 삭망월 29.530588853일
const SYNODIC = 29.530588853;
const moonCanvas = document.getElementById('moon-canvas');
const moonCtx = moonCanvas.getContext('2d');
const moonImg = new Image();
let moonImgReady = false;
moonImg.onload = () => { moonImgReady = true; lastMoonAge = -1; };
moonImg.src = '/textures/2k_moon.jpg';

// Meeus 48.4 — 평균 삭망월보다 정확한 위상각. 반환: 0(삭)~0.5(보름)~1(다음 삭)
const rad = (deg) => (deg * Math.PI) / 180;
const norm360 = (deg) => ((deg % 360) + 360) % 360;
function moonPhaseFraction(date) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const T = (jd - 2451545) / 36525;
  const D = norm360(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T + (T ** 3) / 545868);
  const M = norm360(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T + (T ** 3) / 24490000);
  const Mp = norm360(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T + (T ** 3) / 69699);
  // 위상각 i (0 = 보름, 180 = 삭)
  const i = 180 - D
    - 6.289 * Math.sin(rad(Mp))
    + 2.100 * Math.sin(rad(M))
    - 1.274 * Math.sin(rad(2 * D - Mp))
    - 0.658 * Math.sin(rad(2 * D))
    - 0.214 * Math.sin(rad(2 * Mp))
    - 0.110 * Math.sin(rad(D));
  // 이각 psi = 180 - i → 삭 0°, 상현 90°, 보름 180°, 하현 270°
  return norm360(180 - i) / 360;
}
function moonAgeDays(date) {
  return moonPhaseFraction(date) * SYNODIC;
}
function moonPhaseName(age) {
  if (age < 1.85 || age >= 27.68) return '삭 (신월)';
  if (age < 5.54) return '초승달';
  if (age < 9.23) return '상현달';
  if (age < 12.91) return '차는 볼록달';
  if (age < 16.61) return '보름달';
  if (age < 20.30) return '기우는 볼록달';
  if (age < 23.99) return '하현달';
  return '그믐달';
}

// 달 텍스처를 원형으로 그린 뒤, 종결선(터미네이터) 타원으로 밝은 부분만 남긴다
function drawMoon(p) {
  const size = moonCanvas.width;
  const r = size / 2, cx = r, cy = r;
  moonCtx.clearRect(0, 0, size, size);
  if (!moonImgReady) return;

  moonCtx.save();
  moonCtx.beginPath();
  moonCtx.arc(cx, cy, r, 0, Math.PI * 2);
  moonCtx.clip();
  // 어두운 달 (지구조 정도만 살짝 보이게)
  moonCtx.globalAlpha = 0.11;
  moonCtx.drawImage(moonImg, 0, 0, size, size);
  moonCtx.globalAlpha = 1;

  // 밝은 부분: waxing은 오른쪽, waning은 좌우 반전
  const waning = p > 0.5;
  const pw = waning ? 1 - p : p;          // 0(삭) ~ 0.5(보름)
  const rx = r * Math.cos(2 * Math.PI * pw);

  moonCtx.save();
  if (waning) { moonCtx.translate(size, 0); moonCtx.scale(-1, 1); }
  moonCtx.beginPath();
  moonCtx.ellipse(cx, cy, r, r, 0, -Math.PI / 2, Math.PI / 2, false);        // 오른쪽 가장자리
  moonCtx.ellipse(cx, cy, Math.abs(rx), r, 0, Math.PI / 2, -Math.PI / 2, rx > 0); // 종결선
  moonCtx.closePath();
  moonCtx.clip();
  if (waning) { moonCtx.translate(size, 0); moonCtx.scale(-1, 1); }          // 텍스처는 원래 방향으로
  moonCtx.drawImage(moonImg, 0, 0, size, size);
  moonCtx.restore();
  moonCtx.restore();
}

let lastMoonAge = -1;
function updateMoonPanel() {
  const date = new Date(SIM_EPOCH_MS + simDays * 86400000);
  const age = moonAgeDays(date);
  if (Math.abs(age - lastMoonAge) < 0.02) return; // 값이 거의 그대로면 다시 안 그림
  lastMoonAge = age;

  const p = age / SYNODIC;
  drawMoon(p);
  const illum = (1 - Math.cos(2 * Math.PI * p)) / 2;
  let toFull = (SYNODIC / 2 - age) % SYNODIC;
  if (toFull < 0) toFull += SYNODIC;

  document.getElementById('moon-name').textContent = moonPhaseName(age);
  document.getElementById('moon-illum').textContent = `${(illum * 100).toFixed(1)}%`;
  document.getElementById('moon-age').textContent = `${age.toFixed(1)}일`;
  document.getElementById('moon-next').textContent =
    toFull < 0.5 ? '오늘' : `${Math.round(toFull)}일 후`;
  document.getElementById('moon-date').textContent =
    `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 · 지구에서 보면`;
  // 시간을 돌리면 "오늘 밤"이 아니게 되므로 제목도 바꿔준다
  const isToday = date.toDateString() === new Date().toDateString();
  document.querySelector('.moon-title').textContent =
    isToday ? '오늘 밤 달의 모습' : '그날 밤 달의 모습';
}
updateMoonPanel();

// ---------------------------------------------------------------- 리사이즈
function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, MAX_DPR));
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  if (flarePass) flarePass.setSize(innerWidth, innerHeight);
  labelRenderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
// iOS 주소창 접힘/펼침, 회전 — visualViewport가 더 정확
if (window.visualViewport) visualViewport.addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 250));

// 하단 시트가 화면 아래쪽을 가리므로, 포커스 대상을 화면 위쪽으로 올려서 보이게 한다.
// 시트 높이 비율은 CSS --sheet-h와 동일하게 읽어온다.
function sheetFraction() {
  if (!(isSheetLayout() && (panelOpen || impact.sheetOpen()))) return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--sheet-h').trim();
  const vh = parseFloat(raw) || 46;
  return Math.min(0.62, vh / 100);
}
const camUp = new THREE.Vector3();
// bodyPos를 화면 중앙 대신 "보이는 영역"의 중앙에 오도록 하는 카메라 타깃
function focusTarget(out, bodyPos, viewDist) {
  out.copy(bodyPos);
  const f = sheetFraction();
  if (f <= 0) return out;
  // 시트가 f만큼 덮으면 가시영역 중심은 화면 중앙보다 f/2 위 → 그만큼 타깃을 아래로
  const visibleH = 2 * viewDist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
  return out.addScaledVector(camUp, -visibleH * f * 0.5);
}

// ---------------------------------------------------------------- 메인 루프
const clock = new THREE.Clock();
const prevBodyPos = new THREE.Vector3();
let hadSelected = false;

// 렌즈플레어 CPU 측 상태 — 태양 스크린 위치/가시도 (가림 판정용 스크래치 포함)
let flareVis = 0, flareX = 0.5, flareY = 0.5;
const sunNDC = new THREE.Vector3();
const toSunV = new THREE.Vector3();
const occRay = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;

  if (!paused) {
    simDays += dt * speedMult(); // 1초 = speedMult 일
    updateMoonPanel();
  }
  updateDateReadout(); // 내부에서 날짜가 바뀐 프레임에만 DOM을 갱신

  // 궤도 위치 + 자전 (+ 근접도/위성 페이드 계산)
  let minRel = 1e9, earthRel = 1e9, sunRel = 1e9;
  // 플레어 가림 판정: 카메라→태양 시선과 각 천체의 구-직선 거리 (레이캐스트 없음, 천체당 곱셈 몇 번)
  let sunOcc = 1;
  const camSunDist = camera.position.length();
  toSunV.copy(camera.position).multiplyScalar(-1 / Math.max(camSunDist, 1e-6));
  const orbitDim = 1 - 0.7 * prox; // 표면 근접 시 궤도선이 시야를 가로지르지 않게
  for (const [id, e] of bodyMap) {
    if (id.startsWith('_')) continue;
    const d = e.data;
    if (d.dist > 0) {
      // 트리톤은 역행 공전 — 궤도를 반대 방향으로 돈다
      const a = e.angle + (simDays / d.orbitDays) * Math.PI * 2 * (d.retroOrbit ? -1 : 1);
      e.group.position.set(Math.cos(a) * d.dist, 0, -Math.sin(a) * d.dist);
      // 궤도선 혜성 꼬리의 머리 = 천체의 현재 위치 (원 궤도 → 호 분율 = 각도 분율)
      if (e.orbitLine) {
        e.orbitLine.material.uniforms.uHead.value = ((a / (Math.PI * 2)) % 1 + 1) % 1;
      }
    }
    if (d.rotationHours) {
      e.mesh.rotation.y = (simDays * 24 / d.rotationHours) * Math.PI * 2;
    }
    if (e.clouds) e.clouds.rotation.y = e.mesh.rotation.y * 1.15;

    const dist = camera.position.distanceTo(e.group.getWorldPosition(tmpV));
    const rel = dist / d.radius; // 반지름 대비 거리 → 천체 크기와 무관한 근접도
    if (rel < minRel) minRel = rel;
    if (id === 'earth') earthRel = rel;
    else if (id === 'sun') sunRel = rel;
    if (id !== 'sun') {
      // 이 천체가 태양을 가리는가 — 시선(카메라→태양)과의 수직 거리로 판정
      occRay.copy(tmpV).sub(camera.position);
      const along = occRay.dot(toSunV);
      if (along > 0 && along < camSunDist) {
        const off = occRay.addScaledVector(toSunV, -along).length();
        sunOcc = Math.min(sunOcc, THREE.MathUtils.smoothstep(off, d.radius * 0.9, d.radius * 1.6));
      }
    }

    // 새 위성: 부모(또는 형제/자신)가 선택됐거나 카메라가 충분히 가까울 때만 라벨/궤도 표시
    if (e.gatedMoon) {
      const nearVis = 1 - THREE.MathUtils.smoothstep(dist, d.dist * 3.5, d.dist * 6);
      const famSel = !!selected &&
        (selected === e || selected.data.id === d.parent || selected.data.parent === d.parent);
      const target = Math.max(famSel ? 1 : 0, nearVis);
      e.moonVis += (target - e.moonVis) * (1 - Math.exp(-5 * dt)); // 팝 없이 페이드
    }

    // 라벨 거리 페이드 × 위성 페이드
    const o = THREE.MathUtils.clamp(1.3 - dist / 500, 0.25, 1) * e.moonVis;
    e.labelEl.style.opacity = o.toFixed(2);
    if (e.gatedMoon) e.labelEl.style.pointerEvents = e.moonVis < 0.25 ? 'none' : 'auto';
    if (e.orbitLine) {
      e.orbitLine.material.uniforms.uOpacity.value =
        e.orbitLine.userData.baseOpacity * e.moonVis * orbitDim;
    }
  }
  bodyMap.get('_belt').mesh.rotation.y = (simDays / 1800) * Math.PI * 2;

  // ---- 표면 근접도 → 이펙트 완화 (프레임레이트 무관 지수 완충)
  {
    const ease = 1 - Math.exp(-3.5 * dt);
    prox += ((1 - THREE.MathUtils.smoothstep(minRel, 4.5, 13)) - prox) * ease;
    earthClose += ((1 - THREE.MathUtils.smoothstep(earthRel, 3.5, 9)) - earthClose) * ease;
    sunClose += ((1 - THREE.MathUtils.smoothstep(sunRel, 2.5, 8)) - sunClose) * ease;

    bloom.strength = 0.9 - 0.65 * prox;      // 표면이 블룸에 씻기지 않게
    bloom.threshold = 0.82 + 0.13 * prox;
    grainPass.uniforms.uGrain.value = 0.05 * (1 - 0.7 * prox);
    grainPass.uniforms.uVignette.value = 0.42 * (1 - 0.75 * prox);
    spinRing.material.uniforms.uOpacity.value = 1 - 0.85 * prox; // 적도 링이 표면을 안 가리게

    const earthE = bodyMap.get('earth');
    if (earthE.atmo) earthE.atmo.material.uniforms.uStrength.value = 0.9 * (1 - 0.75 * earthClose);
    const sunE = bodyMap.get('sun');
    // 확산광 스프라이트는 근접 시 완전히 소멸 — "납작한 원판"은 가까울 때만 문제였다
    if (sunE.sunGlow) sunE.sunGlow.material.opacity = 0.34 * (1 - sunClose);
    if (sunE.corona) {
      const cu = sunE.corona.material.uniforms;
      cu.uCamPos.value.copy(camera.position);
      if (!REDUCED) cu.uTime.value = t;
      cu.uOpacity.value = 1 - 0.55 * sunClose; // 셸은 가까이서도 남되 표면을 태우지 않게
    }
    // 태양 HDR 오버드라이브 — 플레어 브라이트패스(임계 1.15)의 유일한 트리거.
    // 가까이 가면 1로 되돌려 표면 텍스처 대비를 살린다. (LOW_POWER는 플레어가 없으니 약하게)
    if (sunE.sunMat) {
      const k = (1 - sunClose) * (LOW_POWER ? 0.6 : 1);
      sunE.sunMat.color.setRGB(1 + 0.8 * k, 1 + 0.55 * k, 1 + 0.25 * k);
    }
  }

  // 흐르는 빛 시간
  for (const m of flowMats) m.uniforms.uTime.value = t * 0.13;

  // 호버 하이라이트 — 터치 기기는 호버 개념이 없으므로 매 프레임 레이캐스트 생략
  if (!isTouch()) {
    raycaster.setFromCamera(pointer, camera);
    const hover = raycaster.intersectObjects(clickables)[0];
    canvas.style.cursor = hover ? 'pointer' : 'grab';
    for (const [id, e] of bodyMap) {
      if (id.startsWith('_')) continue;
      e.labelEl.classList.toggle('hot', !!hover && hover.object.userData.bodyId === id);
    }
  }

  // 카메라: 선택 추적 + 시네마틱 플라이인
  if (selected) {
    const d = selected.data;
    const bodyPos = selected.group.getWorldPosition(new THREE.Vector3());
    // 하단 시트가 열려 있으면 가시영역이 좁아지므로 조금 물러나서 천체가 잘리지 않게 한다
    // (하한을 반지름 비례로 낮춰 작은 위성도 화면에 꽉 차게 — 포보스도 가까이 보인다)
    const viewDist = Math.max(d.radius * 4.2, 1.3) * (1 + sheetFraction() * 0.8);
    // 그리고 천체를 화면 위쪽(시트에 안 가리는 영역) 중앙으로 올린다
    const aimPos = focusTarget(aimV, bodyPos, viewDist);
    if (flyT < 1) {
      flyT = Math.min(1, flyT + dt / 1.9);
      const k = easeInOut(flyT);
      // 목적지: 행성 뒤쪽 위에서 태양 쪽을 비스듬히 바라보는 구도
      const dir = bodyPos.clone().normalize();
      if (dir.lengthSq() < 0.001) dir.set(0, 0, 1);
      // 태양 쪽에서 바라봐야 행성이 밝게 보임 (역광 방지)
      const dest = bodyPos.clone()
        .sub(dir.clone().multiplyScalar(viewDist * 0.8))
        .add(new THREE.Vector3(0, viewDist * 0.35, 0))
        .add(new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(viewDist * 0.55));
      camera.position.lerpVectors(flyFrom, dest, k);
      controls.target.lerpVectors(flyFromTarget, aimPos, k);
    } else {
      // 추적: 행성 이동분 만큼 카메라와 타깃을 함께 이동
      // (타깃도 같이 옮겨야 이오처럼 빨리 도는 위성에서 조준이 뒤처지지 않는다)
      if (hadSelected) {
        const delta = bodyPos.clone().sub(prevBodyPos);
        camera.position.add(delta);
        controls.target.add(delta);
      }
      // 시트 개폐로 조준점이 바뀌면 부드럽게 따라간다 (툭 끊기지 않게)
      controls.target.lerp(aimPos, Math.min(1, dt * 6));
    }
    prevBodyPos.copy(bodyPos);
    hadSelected = true;
    // 자전 링을 행성 적도면에 부착
    spinRing.position.copy(bodyPos);
    spinRing.rotation.set(0, 0, THREE.MathUtils.degToRad(d.tilt));
  } else {
    hadSelected = false;
    if (flyT < 1) { // 전체 보기 복귀 비행
      flyT = Math.min(1, flyT + dt / 1.9);
      const k = easeInOut(flyT);
      camera.position.lerpVectors(flyFrom, new THREE.Vector3(0, 95, 210), k);
      controls.target.lerpVectors(flyFromTarget, new THREE.Vector3(0, 0, 0), k);
    } else if (!isTouch()) {
      // 유휴 상태 미세 드리프트 + 커서 패럴랙스 (마우스 전용)
      camera.position.x += (mouseNorm.x * 6 - 0) * dt * 0.4;
      camera.position.y += (-mouseNorm.y * 4 - 0) * dt * 0.4;
      camera.position.x += Math.sin(t * 0.05) * dt * 0.5;
    }
  }

  controls.update();
  impact.update(dt); // 소행성 비행/폭발/카메라 흔들림 (controls 이후에 적용)

  // 렌즈플레어 — 태양(원점) 스크린 위치/가시도. 카메라가 이번 프레임 최종 위치로
  // 이동한 "다음"에 계산해야 충돌 흔들림 중에도 마스크가 태양에 정확히 붙는다.
  if (flarePass) {
    camera.updateMatrixWorld();
    sunNDC.set(0, 0, 0).applyMatrix4(camera.matrixWorldInverse); // 카메라 공간 z로 뒤/앞 판정
    const behind = sunNDC.z > -0.1;
    let vis = 0;
    if (!behind) {
      sunNDC.set(0, 0, 0).project(camera);
      flareX = (sunNDC.x + 1) / 2; // 뒤에 있을 땐 마지막 위치 유지 (페이드아웃 잔광이 튀지 않게)
      flareY = (sunNDC.y + 1) / 2;
      // 화면 가장자리를 벗어나면 빠르게 소멸
      const edge =
        (1 - THREE.MathUtils.smoothstep(Math.abs(sunNDC.x), 0.85, 1.05)) *
        (1 - THREE.MathUtils.smoothstep(Math.abs(sunNDC.y), 0.85, 1.05));
      // 가림 판정(sunOcc)은 천체 루프에서 계산 — 브라이트패스가 이미지 기반이라
      // 완전 가림은 어차피 소스 픽셀이 사라지지만, CPU 페이드가 전환을 앞당겨 준다.
      // 표면 근접 시(prox↑) 플레어는 완전히 비켜선다.
      vis = edge * sunOcc * (1 - prox);
    }
    flareVis += (vis - flareVis) * (1 - Math.exp(-7 * dt));
    flarePass.setSun(flareX, flareY, flareVis);
  }

  grainPass.uniforms.uTime.value = t;
  composer.render();
  labelRenderer.render(scene, camera);
}
// ---------------------------------------------------------------- 초기 UI 상태
if (isTouch()) {
  document.getElementById('hud-hint').textContent = '행성을 탭해 보세요 · 두 손가락으로 확대/축소';
}
syncChrome();
// 레이아웃이 바뀌면(회전 등) 시트/사이드 전환에 맞춰 크롬 상태 재계산
mqSheet.addEventListener('change', syncChrome);

animate();

window.__dbg =() => ({ pos: camera.position.toArray().map(v => +v.toFixed(1)), tgt: controls.target.toArray().map(v => +v.toFixed(1)), flyT, sel: selected?.data.id ?? null, prox: +prox.toFixed(2), flare: +flareVis.toFixed(3), lowPower: LOW_POWER });
// 검증용: 선택/카메라/이펙트 토글
window.__select = (id) => selectBody(id);
window.__deselect = () => deselect();
window.__setCam = (px, py, pz, tx, ty, tz) => {
  camera.position.set(px, py, pz);
  controls.target.set(tx, ty, tz);
  controls.update();
};
window.__fx = (on) => { // 추가 이펙트 on/off — 프레임 비용 측정용
  if (flarePass) flarePass.enabled = on;
  const s = bodyMap.get('sun');
  if (s.corona) s.corona.visible = on;
};
window.__flareI = (v) => { if (flarePass) flarePass.compMat.uniforms.uIntensity.value = v; };
// 검증용: 천체의 부모 기준 위치(공전 방향 확인 등)
window.__body = (id) => {
  const e = bodyMap.get(id);
  return e ? { p: e.group.position.toArray().map(v => +v.toFixed(3)), moonVis: +(e.moonVis ?? 1).toFixed(2) } : null;
};
