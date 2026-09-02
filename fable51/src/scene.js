// scene.js — 씬/카메라/렌더러/후처리 (블룸 + 렌즈플레어 + 필름 그레인/비네트 + ACES)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { LensFlarePass } from './lensflare.js';
import { makeSoftParticleTexture } from './textures.js';

const GrainVignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.045 },
    uVignette: { value: 0.55 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uGrain;
    uniform float uVignette;
    varying vec2 vUv;
    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233)) + uTime * 13.7) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float g = (rand(vUv * 1.7) - 0.5) * uGrain;
      c.rgb += g * (0.35 + 0.65 * clamp(1.0 - dot(c.rgb, vec3(0.333)), 0.0, 1.0));
      vec2 d = (vUv - 0.5) * vec2(1.15, 1.0);
      float v = 1.0 - smoothstep(0.45, 1.05, length(d)) * uVignette;
      c.rgb *= v;
      gl_FragColor = c;
    }
  `,
};

export function createScene(canvas, labelsEl, textures) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000005);
  if (textures?.stars) {
    scene.background = textures.stars;
    scene.backgroundIntensity = 0.5;
  }

  const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.05, 4000);
  camera.position.set(0, 150, 300);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 0.6;
  controls.maxDistance = 900;
  controls.zoomSpeed = 1.1;
  controls.rotateSpeed = 0.7;
  controls.panSpeed = 0.6;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.06; // 유휴 미세 드리프트
  controls.target.set(0, 0, 0);

  // ---- 별 파티클 (소프트 원형 텍스처)
  const starTex = makeSoftParticleTexture(64);
  const starCount = 3200;
  const sp = new Float32Array(starCount * 3);
  const sc = new Float32Array(starCount * 3);
  const tint = [new THREE.Color(0xaec8ff), new THREE.Color(0xffffff), new THREE.Color(0xfff1c8), new THREE.Color(0xffd8a8)];
  for (let i = 0; i < starCount; i++) {
    const r = 1500 + Math.random() * 600;
    const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    sp[i * 3] = r * Math.sin(ph) * Math.cos(th); sp[i * 3 + 1] = r * Math.cos(ph); sp[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    const c = tint[Math.floor(Math.random() * tint.length)];
    const b = 0.5 + Math.random() * 0.5;
    sc[i * 3] = c.r * b; sc[i * 3 + 1] = c.g * b; sc[i * 3 + 2] = c.b * b;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(sc, 3));
  const starMat = new THREE.PointsMaterial({
    map: starTex, size: 2.6, sizeAttenuation: false, vertexColors: true, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  scene.add(stars);

  // ---- 라벨 렌더러
  const labelRenderer = new CSS2DRenderer({ element: labelsEl });
  labelRenderer.setSize(window.innerWidth, window.innerHeight);

  // ---- 후처리
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  const renderPass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.7, 0.5, 1.0);
  const flarePass = new LensFlarePass(size.x, size.y, { threshold: 1.45, intensity: 0.5 });
  const grainPass = new ShaderPass(GrainVignetteShader);
  const outputPass = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(flarePass);
  composer.addPass(grainPass);
  composer.addPass(outputPass);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    // EffectComposer.setSize 는 CSS 크기를 받아 내부에서 pixelRatio 를 곱한다 (패스들의 setSize 도 함께 호출됨)
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    labelRenderer.setSize(w, h);
  }
  window.addEventListener('resize', resize);
  resize();

  // 태양 스크린 위치 → 렌즈플레어에 전달
  const sunNdc = new THREE.Vector3();
  function updateSunScreenPos(sunWorldPos) {
    sunNdc.copy(sunWorldPos).project(camera);
    const behind = sunNdc.z > 1 || sunNdc.z < -1;
    const x = sunNdc.x * 0.5 + 0.5, y = sunNdc.y * 0.5 + 0.5;
    const onScreen = !behind && x > -0.3 && x < 1.3 && y > -0.3 && y < 1.3;
    flarePass.setSun(x, y, onScreen);
  }

  function render(dt, elapsed) {
    grainPass.uniforms.uTime.value = elapsed;
    composer.render(dt);
    labelRenderer.render(scene, camera);
  }

  return { renderer, scene, camera, controls, composer, labelRenderer, bloomPass, flarePass, grainPass, stars, resize, render, updateSunScreenPos };
}
