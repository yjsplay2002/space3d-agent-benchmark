import * as THREE from 'three';
import { J2000, PLANET_PERIODS, getPlanetPosition } from './ephemeris.js';

export function compressedDistance(au) {
  return 6.5 + Math.log1p(Math.max(0, au) * 2) * 10;
}

export function ephemerisToScene(position, overrideRadius = null) {
  const length = Math.hypot(position.x, position.y, position.z) || 1;
  const radius = overrideRadius ?? compressedDistance(position.distance ?? length);
  return new THREE.Vector3(
    position.x / length * radius,
    position.z / length * radius,
    -position.y / length * radius,
  );
}

const orbitVertex = /* glsl */`
  attribute float aProgress;
  varying float vProgress;
  void main() {
    vProgress = aProgress;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const orbitFragment = /* glsl */`
  uniform float uTime;
  uniform float uPlanetPhase;
  uniform vec3 uColor;
  uniform float uSelected;
  varying float vProgress;

  void main() {
    float behind = fract(uPlanetPhase - vProgress);
    float headTail = exp(-behind * 18.0);
    float p1 = pow(max(0.0, 1.0 - abs(fract(vProgress * 5.0 - uTime * 0.055) - 0.5) * 2.0), 9.0);
    float p2 = pow(max(0.0, 1.0 - abs(fract(vProgress * 11.0 - uTime * 0.022) - 0.5) * 2.0), 16.0);
    float energy = 0.08 + headTail * 1.7 + p1 * 0.35 + p2 * 0.18 + uSelected * 0.22;
    gl_FragColor = vec4(uColor * energy, min(0.92, energy));
  }
`;

export function createFlowingOrbits(scene, bodyData) {
  const orbits = new Map();
  for (const body of bodyData) {
    const segments = 640;
    const positions = [];
    const progress = [];
    for (let index = 0; index <= segments; index += 1) {
      const fraction = index / segments;
      const p = getPlanetPosition(body.id, J2000 + PLANET_PERIODS[body.id] * fraction);
      const point = ephemerisToScene(p);
      positions.push(point.x, point.y, point.z);
      progress.push(fraction);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aProgress', new THREE.Float32BufferAttribute(progress, 1));
    const material = new THREE.ShaderMaterial({
      vertexShader: orbitVertex,
      fragmentShader: orbitFragment,
      uniforms: {
        uTime: { value: 0 },
        uPlanetPhase: { value: 0 },
        uColor: { value: new THREE.Color(body.color).lerp(new THREE.Color(0x39d9ff), 0.55) },
        uSelected: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const line = new THREE.Line(geometry, material);
    line.name = `${body.id}-orbit`;
    line.frustumCulled = false;
    scene.add(line);
    orbits.set(body.id, { line, material });
  }
  return {
    update(time, ephemeris, selectedId) {
      for (const [id, orbit] of orbits) {
        orbit.material.uniforms.uTime.value = time;
        orbit.material.uniforms.uPlanetPhase.value =
          (ephemeris.planets[id]?.meanLongitude ?? 0) / 360;
        orbit.material.uniforms.uSelected.value = id === selectedId ? 1 : 0;
      }
    },
    dispose() {
      for (const { line, material } of orbits.values()) {
        line.geometry.dispose();
        material.dispose();
        line.removeFromParent();
      }
    },
  };
}

const rotationRingVertex = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const rotationRingFragment = /* glsl */`
  uniform float uTime;
  uniform float uDirection;
  varying vec2 vUv;
  void main() {
    float flow = fract(vUv.x * 3.0 - uTime * 0.65 * uDirection);
    float pulse = pow(max(0.0, 1.0 - abs(flow - 0.5) * 2.0), 8.0);
    vec3 color = mix(vec3(0.05, 0.55, 0.95), vec3(0.65, 1.0, 1.0), pulse);
    gl_FragColor = vec4(color * (0.22 + pulse * 0.95), 0.18 + pulse * 0.62);
  }
`;

export function createRotationRing(radius) {
  const geometry = new THREE.TorusGeometry(radius * 1.28, Math.max(0.018, radius * 0.018), 8, 180);
  const material = new THREE.ShaderMaterial({
    vertexShader: rotationRingVertex,
    fragmentShader: rotationRingFragment,
    uniforms: { uTime: { value: 0 }, uDirection: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const ring = new THREE.Mesh(geometry, material);
  ring.rotation.x = Math.PI / 2;
  ring.visible = false;
  ring.renderOrder = 5;
  return ring;
}
