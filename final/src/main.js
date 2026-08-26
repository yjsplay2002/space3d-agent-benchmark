import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
// (스크린-스페이스 렌즈플레어 패스는 사용자 요청으로 제거)
import { BODIES } from './data.js';
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
const SUN_SEG = LOW_POWER ? 48 : 96;
const STAR_COUNT = LOW_POWER ? 1200 : 3000;
const BELT_COUNT = LOW_POWER ? 1600 : 4500;
const MAX_DPR = LOW_POWER ? 1.5 : 2;

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

// 조명 — 태양 포인트라이트 + 아주 약한 앰비언트
const sunLight = new THREE.PointLight(0xfff2dd, 26000, 0, 2);
scene.add(sunLight);
scene.add(new THREE.AmbientLight(0x223344, 0.35));


// ---------------------------------------------------------------- 흐르는 빛 셰이더 (궤도/자전 링 공용)
function flowMaterial(color, opacity = 1) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uDir: { value: 1 },       // 1 = 진행 방향, -1 = 역방향
      uPulses: { value: 3 },    // 동시에 흐르는 빛 꼬리 개수
    },
    vertexShader: /* glsl */`
      attribute float aT;
      varying float vT;
      void main() {
        vT = aT;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uOpacity, uDir, uPulses;
      uniform vec3 uColor;
      varying float vT;
      void main() {
        float phase = fract(vT * uPulses - uTime * uDir);
        float tail = pow(phase, 14.0);            // 혜성 꼬리 모양
        float base = 0.06;                        // 희미한 전체 궤도선
        float b = base + tail * 1.6;
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

  let mesh;
  if (d.id === 'sun') {
    mesh = new THREE.Mesh(
      new THREE.SphereGeometry(d.radius, SUN_SEG, SUN_SEG),
      new THREE.MeshBasicMaterial({ map: loadTex(d.texture), color: 0xffffff }),
    );
    // 코로나 글로우 스프라이트
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
      map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.95,
    }));
    glow.scale.setScalar(d.radius * 5.2);
    group.add(glow);
  } else {
    const mat = new THREE.MeshStandardMaterial({
      map: loadTex(d.texture), roughness: 0.95, metalness: 0,
    });
    if (d.night) {
      mat.emissiveMap = loadTex(d.night);
      mat.emissive = new THREE.Color(0xffe9b0);
      mat.emissiveIntensity = 0.85;
    }
    mesh = new THREE.Mesh(new THREE.SphereGeometry(d.radius, SEG, SEG), mat);
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
        uniforms: { uColor: { value: new THREE.Color(0x4d9fff) } },
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
          varying vec3 vN, vV;
          void main() {
            float f = pow(1.0 - abs(dot(vN, vV)), 2.5);
            gl_FragColor = vec4(uColor, f * 0.9);
          }`,
      }),
    );
    tiltGroup.add(atmo);
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
  labelEl.className = 'body-label';
  labelEl.textContent = d.name;
  labelEl.addEventListener('click', () => selectBody(d.id));
  const label = new CSS2DObject(labelEl);
  label.position.set(0, d.radius * 1.6 + 0.6, 0);
  group.add(label);

  // 궤도 (흐르는 빛)
  let orbitLine = null;
  if (d.dist > 0) {
    orbitLine = makeFlowCircle(d.dist, d.id === 'moon' ? 0x9fb8d8 : 0x6ee7ff, d.id === 'moon' ? 0.5 : 0.85);
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
    angle: Math.random() * Math.PI * 2,
  });
  bodyMap.set(d.id, entry);
}
function bodyMapSet(id, key, val) {
  const e = bodyMap.get(id) || {};
  e[key] = val;
  bodyMap.set(id, e);
}

// 자전 방향 링 (선택된 행성 전용, 하나 재사용)
const spinRing = makeFlowCircle(1, 0xffc46b, 1);
spinRing.material.uniforms.uPulses.value = 2;
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
const bloomScale = LOW_POWER ? 0.5 : 1; // 모바일은 블룸을 절반 해상도로
const bloom = new UnrealBloomPass(
  new THREE.Vector2(innerWidth * bloomScale, innerHeight * bloomScale), 0.9, 0.6, 0.82,
);
composer.addPass(bloom);
const grainPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime;
    varying vec2 vUv;
    float rand(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float grain = (rand(vUv * 900.0 + fract(uTime)) - 0.5) * 0.05;   // 필름 그레인
      float d = distance(vUv, vec2(0.5));
      float vig = smoothstep(0.95, 0.35, d);                            // 비네트
      c.rgb = c.rgb * (0.75 + 0.25 * vig) + grain;
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
btnPause.addEventListener('click', () => {
  paused = !paused;
  btnPause.textContent = paused ? '▶' : '⏸';
});

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
    el.style.animationDelay = `${0.15 + i * 0.05}s`;
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

// ---------------------------------------------------------------- 소행성 충돌 시뮬레이션
const impact = initImpact({
  camera, controls, bodyMap, LOW_POWER,
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

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;

  if (!paused) {
    simDays += dt * speedMult(); // 1초 = speedMult 일
    updateMoonPanel();
  }

  // 궤도 위치 + 자전
  for (const [id, e] of bodyMap) {
    if (id.startsWith('_')) continue;
    const d = e.data;
    if (d.dist > 0) {
      const a = e.angle + (simDays / d.orbitDays) * Math.PI * 2;
      e.group.position.set(Math.cos(a) * d.dist, 0, -Math.sin(a) * d.dist);
    }
    if (d.rotationHours) {
      e.mesh.rotation.y = (simDays * 24 / d.rotationHours) * Math.PI * 2;
    }
    if (e.clouds) e.clouds.rotation.y = e.mesh.rotation.y * 1.15;
    // 라벨 거리 페이드
    const dist = camera.position.distanceTo(e.group.getWorldPosition(tmpV));
    const o = THREE.MathUtils.clamp(1.3 - dist / 500, 0.25, 1);
    e.labelEl.style.opacity = o.toFixed(2);
  }
  bodyMap.get('_belt').mesh.rotation.y = (simDays / 1800) * Math.PI * 2;

  // 흐르는 빛 시간
  for (const m of flowMats) m.uniforms.uTime.value = t * 0.13;

  // 렌즈플레어 광원 위치 (태양 = 원점)

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
    const viewDist = Math.max(d.radius * 4.2, 3.5) * (1 + sheetFraction() * 0.8);
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
      // 추적: 행성 이동분 만큼 카메라도 이동
      if (hadSelected) {
        const delta = bodyPos.clone().sub(prevBodyPos);
        camera.position.add(delta);
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

window.__dbg =() => ({ pos: camera.position.toArray().map(v => +v.toFixed(1)), tgt: controls.target.toArray().map(v => +v.toFixed(1)), flyT, sel: selected?.data.id ?? null });
