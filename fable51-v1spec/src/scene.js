import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { LensFlarePass } from './lensflare.js';

// 렌즈플레어 on/off 스위치 (한 줄로 제거 가능)
const DBG = new URLSearchParams(location.search);
export const LENS_FLARE_ENABLED = DBG.get('flare') !== '0';

const GrainVignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.045 },
    uVignette: { value: 0.55 },
    uResolution: { value: new THREE.Vector2(1920, 1080) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uGrain;
    uniform float uVignette;
    uniform vec2 uResolution;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float n = hash(vUv * uResolution + fract(uTime * 13.7) * 97.0) - 0.5;
      c.rgb += n * uGrain * (0.4 + 0.6 * clamp(1.0 - dot(c.rgb, vec3(0.333)), 0.0, 1.0));
      vec2 d = (vUv - 0.5) * vec2(1.15, 1.0);
      float v = 1.0 - smoothstep(0.3, 0.95, length(d) * 1.35) * uVignette;
      c.rgb *= v;
      gl_FragColor = c;
    }
  `,
};

export function createScene(container) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'webgl';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000005);

  const camera = new THREE.PerspectiveCamera(48, width / height, 0.5, 14000);
  camera.position.set(0, 170, 330);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(width, height);
  labelRenderer.domElement.className = 'labels';
  container.appendChild(labelRenderer.domElement);

  // ---------- 후처리 ----------
  const rt = new THREE.WebGLRenderTarget(width * pixelRatio, height * pixelRatio, {
    type: THREE.HalfFloatType,
    samples: 4,
  });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(width, height);

  const renderPass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.9, 0.6, 0.8);
  const flarePass = new LensFlarePass(width, height, {
    enabled: LENS_FLARE_ENABLED,
    intensity: 0.5,
    threshold: 1.4,
    maskRadius: 0.14,
  });
  const grainPass = new ShaderPass(GrainVignetteShader);
  const outputPass = new OutputPass();

  composer.addPass(renderPass);
  // 플레어는 블룸 전에: 블룸 헤일로가 threshold 를 넘어 고스트로 번지는 것 방지
  if (LENS_FLARE_ENABLED) composer.addPass(flarePass);
  if (DBG.get('bloom') !== '0') composer.addPass(bloomPass);
  if (DBG.get('grain') !== '0') composer.addPass(grainPass);
  composer.addPass(outputPass);

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    bloomPass.setSize(w, h);
    flarePass.setSize(w, h);
    labelRenderer.setSize(w, h);
    grainPass.uniforms.uResolution.value.set(w * pr, h * pr);
  }
  window.addEventListener('resize', resize);
  grainPass.uniforms.uResolution.value.set(width * pixelRatio, height * pixelRatio);

  function render(dt) {
    grainPass.uniforms.uTime.value += dt;
    composer.render(dt);
    labelRenderer.render(scene, camera);
  }

  return { scene, camera, renderer, composer, labelRenderer, bloomPass, flarePass, grainPass, resize, render };
}
