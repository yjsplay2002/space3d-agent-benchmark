import * as THREE from 'three';

// ---------- 프로시저럴 폴백 텍스처 (다운로드 실패 시) ----------
function noiseCanvas(w, h, base, bands, seed = 1) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const [r, g, b] = base;
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let y = 0; y < h; y++) {
    const band = bands ? 0.5 + 0.5 * Math.sin((y / h) * Math.PI * bands * 2 + Math.sin(y * 0.05) * 2) : 1;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const n = 0.75 + rnd() * 0.5;
      const f = n * (0.7 + 0.3 * band);
      d[i] = Math.min(255, r * f);
      d[i + 1] = Math.min(255, g * f);
      d[i + 2] = Math.min(255, b * f);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const FALLBACK_COLORS = {
  sun: [255, 170, 60],
  mercury: [150, 145, 140],
  venus: [225, 190, 120],
  earth: [70, 130, 200],
  earth_night: [10, 10, 25],
  earth_clouds: [255, 255, 255],
  moon: [185, 185, 185],
  mars: [200, 100, 70],
  jupiter: [215, 170, 120],
  saturn: [225, 205, 160],
  uranus: [150, 210, 230],
  neptune: [80, 110, 240],
  stars: [4, 4, 12],
};

export function fallbackFor(url) {
  const key = Object.keys(FALLBACK_COLORS).find((k) => url.includes(k.replace('_', '_'))) ||
    (url.includes('night') ? 'earth_night' : url.includes('cloud') ? 'earth_clouds' : url.includes('star') ? 'stars' : null);
  const base = FALLBACK_COLORS[key] || [128, 128, 128];
  const bands = /jupiter|saturn|neptune|uranus/.test(url) ? 6 : 0;
  if (url.includes('ring')) return ringCanvas();
  if (url.includes('star')) return starfieldCanvas();
  return noiseCanvas(1024, 512, base, bands, url.length);
}

export function ringCanvas(tint = [230, 210, 170], count = 60, seed = 7) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 16;
  const ctx = c.getContext('2d');
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let x = 0; x < c.width; x++) {
    const t = x / c.width;
    const a = (0.35 + 0.65 * Math.abs(Math.sin(t * count) * Math.sin(t * 13.7))) * (t > 0.12 ? 1 : t / 0.12) * (rnd() * 0.4 + 0.6);
    const gap = t > 0.62 && t < 0.68 ? 0.1 : 1;
    ctx.fillStyle = `rgba(${tint[0]},${tint[1]},${tint[2]},${(a * gap).toFixed(3)})`;
    ctx.fillRect(x, 0, 1, c.height);
  }
  return c;
}

export function starfieldCanvas() {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 1024;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#02030a';
  ctx.fillRect(0, 0, c.width, c.height);
  const grad = ctx.createLinearGradient(0, 0, c.width, c.height);
  grad.addColorStop(0, 'rgba(40,50,90,0)');
  grad.addColorStop(0.5, 'rgba(60,70,120,0.35)');
  grad.addColorStop(1, 'rgba(40,50,90,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 4000; i++) {
    const x = Math.random() * c.width;
    const y = Math.random() * c.height;
    const r = Math.random() * 1.4 + 0.2;
    ctx.fillStyle = `rgba(255,255,255,${(Math.random() * 0.8 + 0.2).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

// 원형 소프트 파티클 (사각형 금지)
export function softParticleTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- 로더 ----------
export function createTextureLoader(onProgress, onDone, maxAnisotropy = 8) {
  const manager = new THREE.LoadingManager();
  manager.onProgress = (url, loaded, total) => onProgress?.(loaded / total, url);
  manager.onLoad = () => onDone?.();
  manager.onError = (url) => console.warn('[textures] 로드 실패, 프로시저럴 폴백 사용:', url);
  const loader = new THREE.TextureLoader(manager);
  const maxAniso = Math.min(16, maxAnisotropy || 8);

  function load(url, { srgb = true, aniso = true } = {}) {
    const tex = loader.load(
      url,
      undefined,
      undefined,
      () => {
        tex.image = fallbackFor(url);
        tex.needsUpdate = true;
      },
    );
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = aniso ? maxAniso : 1;
    tex.wrapS = THREE.RepeatWrapping;
    return tex;
  }

  return { load, manager };
}
