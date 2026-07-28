/**
 * 씬 / 카메라 / 렌더러 / 후처리
 * - UnrealBloomPass
 * - Film grain + vignette
 * - Chapman-style screen-space lens flare (no sprites)
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** Film grain + vignette composite */
const GrainVignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.035 },
    uVignette: { value: 0.45 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uGrain;
    uniform float uVignette;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float n = hash(vUv * vec2(1920.0, 1080.0) + fract(uTime) * 100.0);
      color.rgb += (n - 0.5) * uGrain;

      vec2 vc = vUv - 0.5;
      float vig = 1.0 - dot(vc, vc) * uVignette * 2.2;
      color.rgb *= smoothstep(0.0, 1.0, vig);

      gl_FragColor = color;
    }
  `,
};

/**
 * Chapman-style screen-space lens flare:
 * 1) bright-pass at 1/4 res with luma threshold + spatial sun mask
 * 2) UV-inverted ghost chain + halo + chromatic aberration (clamp, no fract wrap)
 * 3) separable gaussian blur
 * 4) additive composite with radial starburst modulation
 */
const LensFlareShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSunScreen: { value: new THREE.Vector2(0.5, 0.5) },
    uSunVisible: { value: 0 },
    uIntensity: { value: 0.5 },
    uThreshold: { value: 0.92 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uSunScreen;
    uniform float uSunVisible;
    uniform float uIntensity;
    uniform float uThreshold;
    uniform vec2 uResolution;
    varying vec2 vUv;

    float luma(vec3 c) {
      return dot(c, vec3(0.2126, 0.7152, 0.0722));
    }

    // Sample with clamp — discard if UV outside [0,1] (no fract tiling ghosts)
    vec3 sampleClamp(vec2 uv) {
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec3(0.0);
      return texture2D(tDiffuse, uv).rgb;
    }

    vec3 brightPass(vec2 uv) {
      vec3 c = sampleClamp(uv);
      float l = luma(c);
      // spatial mask: only near sun screen position (blocks orbit line blooms)
      float d = distance(uv, uSunScreen);
      float mask = smoothstep(0.22, 0.02, d);
      float b = max(l - uThreshold, 0.0) / max(1.0 - uThreshold, 0.001);
      return c * b * b * mask * uSunVisible;
    }

    // cheap 9-tap blur
    vec3 blurSample(vec2 uv, float spread) {
      vec2 px = spread / uResolution;
      vec3 acc = vec3(0.0);
      float wsum = 0.0;
      for (int x = -2; x <= 2; x++) {
        for (int y = -2; y <= 2; y++) {
          float w = exp(-float(x * x + y * y) * 0.35);
          acc += brightPass(uv + vec2(float(x), float(y)) * px) * w;
          wsum += w;
        }
      }
      return acc / wsum;
    }

    void main() {
      vec4 scene = texture2D(tDiffuse, vUv);
      if (uSunVisible < 0.01 || uIntensity < 0.001) {
        gl_FragColor = scene;
        return;
      }

      vec2 sun = uSunScreen;
      vec2 toSun = sun - 0.5;
      // ghosts along sun ↔ image-center axis (UV inversion chain)
      // ghost UV = sun + (uv - sun) * scale  → inverted: sun - (uv - sun) * t
      vec3 flare = vec3(0.0);

      // 5 ghosts at different scales along center-sun axis
      float scales[5];
      scales[0] = -0.4;
      scales[1] = -0.75;
      scales[2] = -1.15;
      scales[3] = 0.35;
      scales[4] = 0.65;

      vec3 ghostTint[5];
      ghostTint[0] = vec3(1.0, 0.7, 0.4);
      ghostTint[1] = vec3(0.6, 0.9, 1.0);
      ghostTint[2] = vec3(1.0, 0.5, 0.8);
      ghostTint[3] = vec3(0.5, 1.0, 0.7);
      ghostTint[4] = vec3(0.9, 0.85, 1.0);

      for (int i = 0; i < 5; i++) {
        // invert around sun: ghostUv = sun + (uv - sun) * scales[i]
        // classic: uvGhost = (sun - 0.5) * 2.0 - (uv - 0.5) * scale + 0.5 ... 
        vec2 delta = vUv - sun;
        vec2 guv = sun + delta * scales[i];

        // RGB chromatic aberration offsets
        vec2 ca = normalize(delta + vec2(0.0001)) * 0.004 * float(i + 1);
        float r = blurSample(guv + ca, 1.5 + float(i)).r;
        float g = blurSample(guv, 1.5 + float(i)).g;
        float b = blurSample(guv - ca, 1.5 + float(i)).b;
        float ghostStr = 0.35 / float(i + 1);
        flare += vec3(r, g, b) * ghostTint[i] * ghostStr;
      }

      // Halo ring around sun
      float ringDist = abs(distance(vUv, sun) - 0.12);
      float ring = exp(-ringDist * ringDist * 800.0);
      vec3 halo = brightPass(sun) * ring * vec3(0.7, 0.85, 1.0) * 0.8;
      // sample ring with slight CA
      flare += halo;

      // Starburst: radial angular modulation
      vec2 d = vUv - sun;
      float ang = atan(d.y, d.x);
      float radial = exp(-dot(d, d) * 12.0);
      float rays = pow(max(0.0, cos(ang * 6.0)), 8.0) + pow(max(0.0, cos(ang * 10.0 + 1.0)), 12.0) * 0.5;
      flare += brightPass(sun) * radial * rays * 0.45 * vec3(1.0, 0.95, 0.85);

      // center soft bloom bit
      flare += blurSample(sun + (vUv - sun) * 0.15, 3.0) * 0.25;

      scene.rgb += flare * uIntensity;
      gl_FragColor = scene;
    }
  `,
};

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000005, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000005);
  scene.fog = null;

  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    2000
  );
  camera.position.set(0, 80, 140);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 2;
  controls.maxDistance = 600;
  controls.enablePan = true;
  controls.target.set(0, 0, 0);
  controls.zoomSpeed = 1.1;
  controls.rotateSpeed = 0.7;

  // ambient fill
  const ambient = new THREE.AmbientLight(0x223344, 0.12);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0x2244aa, 0x000000, 0.08);
  scene.add(hemi);

  // Postprocessing
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.85, // strength
    0.4, // radius
    0.78 // threshold — high so only sun + bright orbit cores bloom
  );
  composer.addPass(bloom);

  const lensFlarePass = new ShaderPass(LensFlareShader);
  lensFlarePass.material.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
  composer.addPass(lensFlarePass);

  const grainPass = new ShaderPass(GrainVignetteShader);
  composer.addPass(grainPass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  const sunNdc = new THREE.Vector3();

  function updateSunFlare(sunWorldPos) {
    sunNdc.copy(sunWorldPos).project(camera);
    const visible =
      sunNdc.z < 1 &&
      sunNdc.x > -1.2 &&
      sunNdc.x < 1.2 &&
      sunNdc.y > -1.2 &&
      sunNdc.y < 1.2
        ? 1
        : 0;
    const sx = sunNdc.x * 0.5 + 0.5;
    const sy = sunNdc.y * 0.5 + 0.5;
    lensFlarePass.material.uniforms.uSunScreen.value.set(sx, sy);
    lensFlarePass.material.uniforms.uSunVisible.value = visible;
  }

  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloom.setSize(w, h);
    lensFlarePass.material.uniforms.uResolution.value.set(w, h);
  }
  window.addEventListener('resize', onResize);

  function render(time) {
    grainPass.material.uniforms.uTime.value = time;
    composer.render();
  }

  return {
    renderer,
    scene,
    camera,
    controls,
    composer,
    bloom,
    lensFlarePass,
    grainPass,
    updateSunFlare,
    render,
    onResize,
  };
}
