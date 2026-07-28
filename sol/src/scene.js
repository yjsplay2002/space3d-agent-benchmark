import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

class ScreenSpaceLensFlarePass extends Pass {
  constructor() {
    super();
    this.sunUv = new THREE.Vector2(0.5, 0.5);
    this.brightTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    });
    this.ghostTarget = this.brightTarget.clone();
    this.blurTargetA = this.brightTarget.clone();
    this.blurTargetB = this.brightTarget.clone();
    this.brightMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tInput: { value: null },
        uSunUv: { value: this.sunUv },
        uThreshold: { value: 0.93 },
      },
      vertexShader: this.vertexShader,
      fragmentShader: /* glsl */`
        uniform sampler2D tInput;
        uniform vec2 uSunUv;
        uniform float uThreshold;
        varying vec2 vUv;
        void main() {
          vec3 color = texture2D(tInput, vUv).rgb;
          float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
          float coreMask = 1.0 - smoothstep(0.045, 0.13, distance(vUv, uSunUv));
          float bright = smoothstep(uThreshold, min(1.0, uThreshold + 0.16), luma) * coreMask;
          gl_FragColor = vec4(color * bright, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.ghostMaterial = new THREE.ShaderMaterial({
      uniforms: { tBright: { value: null } },
      vertexShader: this.vertexShader,
      fragmentShader: /* glsl */`
        uniform sampler2D tBright;
        varying vec2 vUv;
        float inside(vec2 uv) {
          return step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
        }
        vec3 chromaSample(vec2 uv, vec2 direction) {
          float valid = inside(uv);
          vec2 safeUv = clamp(uv, vec2(0.001), vec2(0.999));
          float r = texture2D(tBright, clamp(safeUv + direction * 0.003, 0.001, 0.999)).r;
          float g = texture2D(tBright, safeUv).g;
          float b = texture2D(tBright, clamp(safeUv - direction * 0.003, 0.001, 0.999)).b;
          return vec3(r, g, b) * valid;
        }
        void main() {
          vec2 mirrored = vec2(1.0) - vUv;
          vec2 ghostVector = (vec2(0.5) - mirrored) * 0.34;
          vec2 direction = normalize(ghostVector + vec2(0.0001));
          vec3 result = vec3(0.0);
          vec3 tint[5];
          tint[0] = vec3(0.32, 0.72, 1.0);
          tint[1] = vec3(1.0, 0.42, 0.18);
          tint[2] = vec3(0.32, 1.0, 0.72);
          tint[3] = vec3(0.7, 0.32, 1.0);
          tint[4] = vec3(1.0, 0.76, 0.34);
          for (int i = 0; i < 5; i++) {
            vec2 sampleUv = mirrored + ghostVector * float(i);
            float falloff = 1.0 - float(i) * 0.13;
            result += chromaSample(sampleUv, direction) * tint[i] * falloff;
          }
          vec2 radial = vUv - vec2(0.5);
          float radius = length(radial);
          float haloRing = exp(-pow((radius - 0.29) / 0.028, 2.0));
          vec2 haloUv = vUv + normalize(-radial + vec2(0.0001)) * 0.085;
          result += chromaSample(haloUv, normalize(radial + vec2(0.0001))) * haloRing * vec3(0.28, 0.48, 0.8);
          gl_FragColor = vec4(result, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.blurMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tInput: { value: null },
        uDirection: { value: new THREE.Vector2(1, 0) },
        uTexel: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: this.vertexShader,
      fragmentShader: /* glsl */`
        uniform sampler2D tInput;
        uniform vec2 uDirection;
        uniform vec2 uTexel;
        varying vec2 vUv;
        void main() {
          vec3 sum = texture2D(tInput, vUv).rgb * 0.227027;
          sum += texture2D(tInput, vUv + uDirection * uTexel * 1.384615).rgb * 0.316216;
          sum += texture2D(tInput, vUv - uDirection * uTexel * 1.384615).rgb * 0.316216;
          sum += texture2D(tInput, vUv + uDirection * uTexel * 3.230769).rgb * 0.070270;
          sum += texture2D(tInput, vUv - uDirection * uTexel * 3.230769).rgb * 0.070270;
          gl_FragColor = vec4(sum, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.compositeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        tFlare: { value: null },
        uSunUv: { value: this.sunUv },
        uIntensity: { value: 0.24 },
      },
      vertexShader: this.vertexShader,
      fragmentShader: /* glsl */`
        uniform sampler2D tScene;
        uniform sampler2D tFlare;
        uniform vec2 uSunUv;
        uniform float uIntensity;
        varying vec2 vUv;
        void main() {
          vec3 scene = texture2D(tScene, vUv).rgb;
          vec3 flare = texture2D(tFlare, vUv).rgb;
          vec2 ray = vUv - uSunUv;
          float angle = atan(ray.y, ray.x);
          float radius = length(ray);
          float star = pow(abs(cos(angle * 4.0)), 22.0) * exp(-radius * 11.0);
          vec3 starColor = vec3(1.0, 0.72, 0.38) * star * 0.09;
          gl_FragColor = vec4(scene + flare * uIntensity + starColor, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad(null);
  }

  get vertexShader() {
    return /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `;
  }

  setSize(width, height) {
    const w = Math.max(1, Math.floor(width / 4));
    const h = Math.max(1, Math.floor(height / 4));
    for (const target of [this.brightTarget, this.ghostTarget, this.blurTargetA, this.blurTargetB]) {
      target.setSize(w, h);
    }
    this.blurMaterial.uniforms.uTexel.value.set(1 / w, 1 / h);
  }

  render(renderer, writeBuffer, readBuffer) {
    this.brightMaterial.uniforms.tInput.value = readBuffer.texture;
    this.fsQuad.material = this.brightMaterial;
    renderer.setRenderTarget(this.brightTarget);
    renderer.clear();
    this.fsQuad.render(renderer);

    this.ghostMaterial.uniforms.tBright.value = this.brightTarget.texture;
    this.fsQuad.material = this.ghostMaterial;
    renderer.setRenderTarget(this.ghostTarget);
    renderer.clear();
    this.fsQuad.render(renderer);

    this.blurMaterial.uniforms.tInput.value = this.ghostTarget.texture;
    this.blurMaterial.uniforms.uDirection.value.set(1, 0);
    this.fsQuad.material = this.blurMaterial;
    renderer.setRenderTarget(this.blurTargetA);
    renderer.clear();
    this.fsQuad.render(renderer);

    this.blurMaterial.uniforms.tInput.value = this.blurTargetA.texture;
    this.blurMaterial.uniforms.uDirection.value.set(0, 1);
    renderer.setRenderTarget(this.blurTargetB);
    renderer.clear();
    this.fsQuad.render(renderer);

    this.compositeMaterial.uniforms.tScene.value = readBuffer.texture;
    this.compositeMaterial.uniforms.tFlare.value = this.blurTargetB.texture;
    this.fsQuad.material = this.compositeMaterial;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.fsQuad.render(renderer);
  }

  dispose() {
    for (const target of [this.brightTarget, this.ghostTarget, this.blurTargetA, this.blurTargetB]) target.dispose();
    this.brightMaterial.dispose();
    this.ghostMaterial.dispose();
    this.blurMaterial.dispose();
    this.compositeMaterial.dispose();
    this.fsQuad.dispose();
  }
}

const cinematicShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime;
    varying vec2 vUv;
    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    void main() {
      vec3 color = texture2D(tDiffuse, vUv).rgb;
      float grain = (hash(vUv * vec2(1920.0, 1080.0) + uTime * 31.7) - 0.5) * 0.022;
      float vignette = smoothstep(0.88, 0.22, length(vUv - 0.5));
      color = color * mix(0.66, 1.0, vignette) + grain;
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

export function createScene(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000005);
  const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.02, 500);
  camera.position.set(0, 35, 62);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    logarithmicDepthBuffer: true,
  });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // 압축 축척의 천체 간 그림자는 실제보다 커져 위상을 왜곡하므로 비활성화한다.
  renderer.shadowMap.enabled = false;
  renderer.domElement.className = 'space-canvas';
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(innerWidth, innerHeight);
  labelRenderer.domElement.className = 'label-layer';
  container.appendChild(labelRenderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.minDistance = 0.15;
  controls.maxDistance = 125;
  controls.zoomSpeed = 0.75;
  controls.rotateSpeed = 0.42;
  controls.target.set(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0x223a59, 0x020206, 0.075));
  const sunLight = new THREE.PointLight(0xffe2ac, 72, 0, 1.08);
  sunLight.castShadow = false;
  scene.add(sunLight);

  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  }));
  composer.setPixelRatio(Math.min(devicePixelRatio, 2));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.46, 0.3, 0.88);
  composer.addPass(bloom);
  const lensFlare = new ScreenSpaceLensFlarePass();
  composer.addPass(lensFlare);
  const cinematic = new ShaderPass(cinematicShader);
  composer.addPass(cinematic);
  composer.addPass(new OutputPass());

  function setGalaxy(texture) {
    const geometry = new THREE.SphereGeometry(245, 64, 40);
    const material = new THREE.MeshBasicMaterial({
      map: texture, side: THREE.BackSide, color: 0x4b5067,
      depthWrite: false, fog: false,
    });
    const galaxy = new THREE.Mesh(geometry, material);
    galaxy.name = '은하수 배경';
    scene.add(galaxy);
    return galaxy;
  }

  function resize() {
    const width = innerWidth;
    const height = innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(width, height);
    labelRenderer.setSize(width, height);
    composer.setPixelRatio(Math.min(devicePixelRatio, 2));
    composer.setSize(width, height);
  }
  window.addEventListener('resize', resize);

  const sunProjected = new THREE.Vector3();
  const cameraForward = new THREE.Vector3();
  const cameraToSun = new THREE.Vector3();
  function render(time) {
    controls.update();
    sunProjected.set(0, 0, 0).project(camera);
    camera.getWorldDirection(cameraForward);
    cameraToSun.copy(camera.position).multiplyScalar(-1).normalize();
    const sunIsVisible =
      cameraForward.dot(cameraToSun) > 0
      && Math.abs(sunProjected.x) < 1.12
      && Math.abs(sunProjected.y) < 1.12
      && sunProjected.z > -1
      && sunProjected.z < 1;
    if (sunIsVisible) {
      lensFlare.sunUv.set(sunProjected.x * 0.5 + 0.5, sunProjected.y * 0.5 + 0.5);
    } else {
      lensFlare.sunUv.set(-10, -10);
    }
    cinematic.uniforms.uTime.value = time;
    composer.render();
    labelRenderer.render(scene, camera);
  }

  return {
    scene, camera, renderer, labelRenderer, controls, composer, lensFlare,
    setGalaxy, render, resize,
  };
}
