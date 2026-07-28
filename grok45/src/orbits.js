/**
 * 흐르는 빛 궤도 셰이더 (additive + bloom)
 */
import * as THREE from 'three';

const orbitVertexShader = /* glsl */ `
  varying float vAlong;
  void main() {
    // uv.x = 0..1 along the tube path
    vAlong = uv.x;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const orbitFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uPhase;      // planet position along orbit 0..1
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uSpeed;

  varying float vAlong;

  float pulse(float x, float center, float width) {
    float d = abs(fract(x - center + 0.5) - 0.5);
    return exp(-d * d / (width * width));
  }

  void main() {
    // distance behind planet along orbit (trail)
    float behind = fract(uPhase - vAlong + 1.0);
    // brightest near planet, fade along trail
    float trail = exp(-behind * 4.5) * (1.0 - smoothstep(0.35, 0.55, behind));

    // flowing light pulses in orbital direction
    float flow = 0.0;
    flow += pulse(vAlong * 3.0 - uTime * uSpeed, 0.0, 0.04) * 0.7;
    flow += pulse(vAlong * 3.0 - uTime * uSpeed * 1.3, 0.33, 0.035) * 0.5;
    flow += pulse(vAlong * 5.0 - uTime * uSpeed * 0.8, 0.66, 0.03) * 0.4;

    // base faint ring
    float base = 0.12;

    // planet glow hotspot
    float near = exp(-behind * behind * 80.0) * 1.8;

    float alpha = (base + trail * 0.85 + flow * 0.55 + near) * uIntensity;
    vec3 col = uColor * alpha;

    gl_FragColor = vec4(col, alpha * 0.9);
  }
`;

const spinRingVertexShader = /* glsl */ `
  varying float vAlong;
  void main() {
    vAlong = uv.x;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const spinRingFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uDirection; // +1 prograde, -1 retrograde
  uniform float uIntensity;

  varying float vAlong;

  void main() {
    float t = vAlong * 6.28318530718;
    float flow = fract(vAlong * 4.0 - uTime * 0.6 * uDirection);
    float pulse = exp(-pow((flow - 0.5) * 6.0, 2.0));
    float base = 0.25 + 0.15 * sin(t * 2.0 + uTime);
    float a = (base + pulse * 1.4) * uIntensity;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

/**
 * Create a glowing orbital tube for a circular orbit in the ecliptic (xy) plane.
 * @param {number} radius scene units
 * @param {THREE.Color|string|number} color
 */
export function createOrbitLine(radius, color, segments = 256) {
  const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2, false, 0);
  const pts2 = curve.getPoints(segments);
  const pts3 = pts2.map((p) => new THREE.Vector3(p.x, 0, p.y));
  // EllipseCurve is in XY; we want XZ plane with Y up → (x, 0, y)
  const path = new THREE.CatmullRomCurve3(pts3, true);
  const geo = new THREE.TubeGeometry(path, segments, radius * 0.004 + 0.02, 6, true);

  const mat = new THREE.ShaderMaterial({
    vertexShader: orbitVertexShader,
    fragmentShader: orbitFragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uPhase: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: 0.85 },
      uSpeed: { value: 0.35 },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.userData.isOrbit = true;
  return mesh;
}

/**
 * Spin direction ring around selected body (equatorial)
 * @param {number} radius
 * @param {boolean} retrograde
 */
export function createSpinRing(radius, retrograde = false, color = 0x4deeea) {
  const path = new THREE.CatmullRomCurve3(
    Array.from({ length: 64 }, (_, i) => {
      const a = (i / 64) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    }),
    true
  );
  const geo = new THREE.TubeGeometry(path, 64, radius * 0.035, 5, true);
  const mat = new THREE.ShaderMaterial({
    vertexShader: spinRingVertexShader,
    fragmentShader: spinRingFragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uDirection: { value: retrograde ? -1 : 1 },
      uIntensity: { value: 1.2 },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.userData.isSpinRing = true;
  return mesh;
}

export function updateOrbitMaterial(mesh, time, phase) {
  if (!mesh?.material?.uniforms) return;
  mesh.material.uniforms.uTime.value = time;
  if (phase !== undefined) mesh.material.uniforms.uPhase.value = phase;
}

export function updateSpinRing(mesh, time) {
  if (!mesh?.material?.uniforms) return;
  mesh.material.uniforms.uTime.value = time;
}
