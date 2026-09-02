// textures.js — 텍스처 로딩(진행률) + 실패 시 canvas 프로시저럴 폴백
import * as THREE from 'three';

const FILES = {
  sun: '2k_sun.jpg',
  mercury: '2k_mercury.jpg',
  venus: '2k_venus_surface.jpg',
  earthDay: '2k_earth_daymap.jpg',
  earthNight: '2k_earth_nightmap.jpg',
  earthClouds: '2k_earth_clouds.jpg',
  moon: '2k_moon.jpg',
  mars: '2k_mars.jpg',
  jupiter: '2k_jupiter.jpg',
  saturn: '2k_saturn.jpg',
  saturnRing: '2k_saturn_ring_alpha.png',
  uranus: '2k_uranus.jpg',
  neptune: '2k_neptune.jpg',
  stars: '8k_stars_milky_way.jpg',
};

const FALLBACK_COLORS = {
  sun: ['#ffd27a', '#ff9a1f', '#ffe9b0'],
  mercury: ['#8d8781', '#5c5752', '#b3ada6'],
  venus: ['#e6c48a', '#c9a15f', '#f2dcaa'],
  earthDay: ['#1d4f8a', '#2c8c4a', '#5b98d6'],
  earthNight: ['#020208', '#0a0a20', '#ffd27a'],
  earthClouds: ['#ffffff', '#ffffff', '#ffffff'],
  moon: ['#8f8f8f', '#5a5a5a', '#b5b5b5'],
  mars: ['#b8552f', '#8a3a1f', '#d97f52'],
  jupiter: ['#d9b48c', '#a9805a', '#efd7b8'],
  saturn: ['#e2c58f', '#c4a468', '#f3e0b4'],
  saturnRing: ['#d9c8a8', '#b39d78', '#efe3c8'],
  uranus: ['#9be3ea', '#7ccbd4', '#c6f0f4'],
  neptune: ['#3b5fd9', '#2a45a8', '#6f8cff'],
  stars: ['#000005', '#050a18', '#ffffff'],
};

function hash(x, y, seed) {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

// 부드러운 값 노이즈
function valueNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x, y, seed, oct = 4) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += amp * valueNoise(x * f, y * f, seed + i); amp *= 0.5; f *= 2; }
  return s;
}

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// 프로시저럴 폴백 텍스처 (밴드 + 노이즈)
export function makeProceduralTexture(key, w = 1024, h = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const [c0, c1, c2] = (FALLBACK_COLORS[key] || FALLBACK_COLORS.moon).map(hexToRgb);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const seed = key.length * 13.7;
  const banded = key === 'jupiter' || key === 'saturn' || key === 'uranus' || key === 'neptune';
  const ring = key === 'saturnRing';
  const stars = key === 'stars';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const u = x / w, v = y / h;
      let t;
      if (stars) {
        const n = fbm(u * 6, v * 3, seed, 5);
        const band = Math.exp(-Math.pow((v - 0.5 + 0.15 * Math.sin(u * 6.28)) * 6, 2));
        const s = hash(x, y, seed) > 0.997 ? 1 : 0;
        const r = c1[0] * n * band + 255 * s, g = c1[1] * n * band + 255 * s, b = c1[2] * 2 * n * band + 255 * s;
        d[i] = Math.min(255, r); d[i + 1] = Math.min(255, g); d[i + 2] = Math.min(255, b); d[i + 3] = 255;
        continue;
      }
      if (ring) {
        const n = fbm(u * 40, 0, seed, 3);
        const alpha = u < 0.05 || (u > 0.55 && u < 0.6) ? 0.15 : 0.55 + 0.45 * n;
        d[i] = c0[0]; d[i + 1] = c0[1]; d[i + 2] = c0[2]; d[i + 3] = Math.floor(alpha * 255);
        continue;
      }
      if (banded) t = 0.5 + 0.5 * Math.sin(v * 40 + fbm(u * 8, v * 8, seed) * 6);
      else t = fbm(u * 8, v * 4, seed, 5);
      const k = key === 'earthClouds' ? 1 : t;
      const mix = (a, b, f) => a + (b - a) * f;
      let r = mix(c1[0], c0[0], k), g = mix(c1[1], c0[1], k), b = mix(c1[2], c0[2], k);
      const hi = fbm(u * 16 + 3, v * 16, seed + 9, 3);
      if (hi > 0.6) { const f = (hi - 0.6) * 2; r = mix(r, c2[0], f); g = mix(g, c2[1], f); b = mix(b, c2[2], f); }
      d[i] = r; d[i + 1] = g; d[i + 2] = b;
      d[i + 3] = key === 'earthClouds' ? Math.max(0, Math.min(255, (t - 0.45) * 700)) : 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 소프트 원형 파티클 텍스처 (기본 사각형 금지)
export function makeSoftParticleTexture(size = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 전체 로딩. onProgress(loaded, total)
export function loadTextures(onProgress, maxAnisotropy = 8) {
  const loader = new THREE.TextureLoader();
  const keys = Object.keys(FILES);
  const total = keys.length;
  let loaded = 0;
  const result = { fallbacks: [] };

  const tasks = keys.map((key) => new Promise((resolve) => {
    const finish = (tex, fallback) => {
      tex.colorSpace = key === 'saturnRing' ? THREE.SRGBColorSpace : THREE.SRGBColorSpace;
      tex.anisotropy = maxAnisotropy;
      if (key === 'stars') tex.mapping = THREE.EquirectangularReflectionMapping;
      result[key] = tex;
      if (fallback) result.fallbacks.push(key);
      loaded++;
      onProgress?.(loaded, total);
      resolve();
    };
    loader.load(
      `/textures/${FILES[key]}`,
      (tex) => finish(tex, false),
      undefined,
      () => finish(makeProceduralTexture(key, key === 'stars' ? 2048 : 1024, key === 'stars' ? 1024 : 512), true),
    );
  }));
  return Promise.all(tasks).then(() => result);
}
