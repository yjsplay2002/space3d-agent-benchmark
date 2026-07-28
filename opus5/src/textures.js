/**
 * src/textures.js — 텍스처 로딩 + 캔버스 프로시저럴 폴백
 *
 * public/textures/ 의 2k 세트를 로드하고, 어떤 이유로든 실패한 항목은 캔버스로
 * 즉석에서 만들어 채운다. 따라서 텍스처 파일이 하나도 없어도 앱은 절대 깨지지 않는다.
 * 외부 CDN 은 사용하지 않는다 (전부 로컬 번들).
 */

import * as THREE from 'three';

const BASE = import.meta.env.BASE_URL || '/';
const url = (f) => `${BASE}textures/${f}`.replace(/([^:]\/)\/+/g, '$1');

/** 로드할 텍스처 목록. fallback 은 파일이 없을 때 쓰는 프로시저럴 생성기 이름. */
export const TEXTURE_MANIFEST = [
  { key: 'sun', file: '2k_sun.jpg', srgb: true, fallback: ['star', '#fff3c4', '#ff8a00'] },
  { key: 'mercury', file: '2k_mercury.jpg', srgb: true, fallback: ['cratered', '#9c8b7d'] },
  { key: 'venus', file: '2k_venus_surface.jpg', srgb: true, fallback: ['swirl', '#e8c98a', '#b98d44'] },
  { key: 'earthDay', file: '2k_earth_daymap.jpg', srgb: true, fallback: ['earth'] },
  { key: 'earthNight', file: '2k_earth_nightmap.jpg', srgb: true, fallback: ['night'] },
  { key: 'earthClouds', file: '2k_earth_clouds.jpg', srgb: true, fallback: ['clouds'] },
  { key: 'moon', file: '2k_moon.jpg', srgb: true, fallback: ['cratered', '#b9b3a8'] },
  { key: 'mars', file: '2k_mars.jpg', srgb: true, fallback: ['cratered', '#c1440e'] },
  { key: 'jupiter', file: '2k_jupiter.jpg', srgb: true, fallback: ['banded', '#d8a56b', '#f2e2c4', '#9a6b3f'] },
  { key: 'saturn', file: '2k_saturn.jpg', srgb: true, fallback: ['banded', '#e3d3a3', '#f6eed2', '#c0a878'] },
  { key: 'saturnRing', file: '2k_saturn_ring_alpha.png', srgb: true, fallback: ['ring'] },
  { key: 'uranus', file: '2k_uranus.jpg', srgb: true, fallback: ['banded', '#8fd3e8', '#c6effa', '#6fb5cc'] },
  { key: 'neptune', file: '2k_neptune.jpg', srgb: true, fallback: ['banded', '#3f5ef0', '#7f95ff', '#2436a8'] },
  { key: 'stars', file: '8k_stars_milky_way.jpg', srgb: true, fallback: ['milkyway'] },
];

// ─────────────────────────────────────────────────────────────────────────────
// 캔버스 유틸
// ─────────────────────────────────────────────────────────────────────────────

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** 재현 가능한 의사난수 (텍스처가 새로고침마다 바뀌지 않도록) */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 프로시저럴 폴백 생성기 — 전부 2048×1024 equirect
// ─────────────────────────────────────────────────────────────────────────────

const W = 2048;
const H = 1024;

const GENERATORS = {
  /** 줄무늬 가스 행성 */
  banded(base = '#d8a56b', light = '#f2e2c4', dark = '#9a6b3f') {
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    const r = rng(0x51ce);
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y++) {
      const t = y / H;
      const n =
        Math.sin(t * 34 + Math.sin(t * 7.3) * 2.1) * 0.5 +
        Math.sin(t * 91 + 1.7) * 0.2 +
        Math.sin(t * 5 + 0.4) * 0.3;
      g.fillStyle = n > 0 ? light : dark;
      g.globalAlpha = Math.min(0.55, Math.abs(n) * 0.55);
      g.fillRect(0, y, W, 1);
    }
    // 소용돌이 몇 개
    g.globalAlpha = 1;
    for (let i = 0; i < 14; i++) {
      const x = r() * W;
      const y = 120 + r() * (H - 240);
      const rx = 30 + r() * 120;
      const ry = rx * (0.28 + r() * 0.3);
      const grd = g.createRadialGradient(x, y, 0, x, y, rx);
      grd.addColorStop(0, r() > 0.5 ? 'rgba(255,240,220,0.5)' : 'rgba(120,70,40,0.45)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.save();
      g.translate(x, y);
      g.scale(1, ry / rx);
      g.translate(-x, -y);
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, rx, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    return c;
  },

  /** 크레이터투성이 암석 천체 */
  cratered(base = '#9c8b7d') {
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    const r = rng(0x2f10);
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    // 넓은 명암 얼룩 (달의 바다 같은 느낌)
    for (let i = 0; i < 40; i++) {
      const x = r() * W, y = r() * H, rad = 60 + r() * 260;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      const dark = r() > 0.45;
      grd.addColorStop(0, dark ? 'rgba(0,0,0,0.32)' : 'rgba(255,255,255,0.16)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.fill();
    }
    // 크레이터
    for (let i = 0; i < 1400; i++) {
      const x = r() * W, y = r() * H;
      const rad = 2 + Math.pow(r(), 3) * 46;
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.fillStyle = `rgba(0,0,0,${0.06 + r() * 0.16})`;
      g.fill();
      // 밝은 테두리
      g.beginPath();
      g.arc(x - rad * 0.14, y - rad * 0.14, rad * 0.92, 0, Math.PI * 2);
      g.strokeStyle = `rgba(255,255,255,${0.05 + r() * 0.12})`;
      g.lineWidth = Math.max(1, rad * 0.12);
      g.stroke();
    }
    return c;
  },

  /** 금성 같은 소용돌이 구름 */
  swirl(base = '#e8c98a', dark = '#b98d44') {
    const c = GENERATORS.banded(base, '#fff0cf', dark);
    const g = c.getContext('2d');
    const r = rng(0x77aa);
    g.globalAlpha = 0.35;
    for (let i = 0; i < 260; i++) {
      const y = r() * H;
      const x = r() * W;
      const w = 120 + r() * 500;
      g.strokeStyle = r() > 0.5 ? 'rgba(255,246,222,0.6)' : 'rgba(150,110,50,0.5)';
      g.lineWidth = 2 + r() * 12;
      g.beginPath();
      g.moveTo(x, y);
      g.bezierCurveTo(x + w * 0.3, y - 30, x + w * 0.7, y + 30, x + w, y);
      g.stroke();
    }
    g.globalAlpha = 1;
    return c;
  },

  /** 지구 낮 지도 (아주 단순화한 대륙) */
  earth() {
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    const r = rng(0x1234);
    // 바다
    const sea = g.createLinearGradient(0, 0, 0, H);
    sea.addColorStop(0, '#0a2a52');
    sea.addColorStop(0.5, '#12559b');
    sea.addColorStop(1, '#0a2a52');
    g.fillStyle = sea;
    g.fillRect(0, 0, W, H);
    // 대륙 덩어리
    const blobs = [
      [330, 300, 190, 130], [300, 430, 120, 150], [1080, 300, 300, 160],
      [1120, 470, 150, 200], [1500, 330, 260, 130], [1620, 640, 150, 90],
      [980, 180, 420, 90], [1020, 760, 260, 70],
    ];
    g.fillStyle = '#2f6b32';
    for (const [x, y, w, h] of blobs) {
      for (let i = 0; i < 90; i++) {
        const a = r() * Math.PI * 2;
        const rr = Math.sqrt(r());
        const px = x + Math.cos(a) * rr * w * 0.5;
        const py = y + Math.sin(a) * rr * h * 0.5;
        g.beginPath();
        g.arc(px, py, 18 + r() * 40, 0, Math.PI * 2);
        g.fill();
      }
    }
    // 사막 · 극지방
    g.globalAlpha = 0.35;
    g.fillStyle = '#c9a35e';
    for (let i = 0; i < 120; i++) {
      g.beginPath();
      g.arc(950 + r() * 700, 330 + r() * 120, 15 + r() * 45, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    g.fillStyle = '#eef6ff';
    g.fillRect(0, 0, W, 52);
    g.fillRect(0, H - 68, W, 68);
    return c;
  },

  /** 지구 야간 도시 불빛 */
  night() {
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    const r = rng(0x9911);
    g.fillStyle = '#000208';
    g.fillRect(0, 0, W, H);
    const clusters = [
      [330, 320], [300, 440], [1100, 300], [1150, 470], [1520, 340],
      [1640, 650], [1000, 200], [1060, 760], [1400, 300], [860, 330],
    ];
    for (const [cx, cy] of clusters) {
      for (let i = 0; i < 420; i++) {
        const a = r() * Math.PI * 2;
        const rr = Math.pow(r(), 1.6) * (60 + r() * 130);
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr * 0.7;
        const s = 0.7 + r() * 2.1;
        g.fillStyle = `rgba(255,${200 + r() * 55 | 0},${130 + r() * 70 | 0},${0.35 + r() * 0.6})`;
        g.beginPath();
        g.arc(x, y, s, 0, Math.PI * 2);
        g.fill();
      }
    }
    return c;
  },

  /** 구름 (알파용 흑백) */
  clouds() {
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    const r = rng(0x4242);
    g.fillStyle = '#000000';
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 900; i++) {
      const y = r() * H;
      // 위도별 구름 띠 (적도수렴대 · 중위도)
      const band = Math.abs(Math.sin((y / H) * Math.PI * 3.4));
      if (r() > band * 0.85 + 0.2) continue;
      const x = r() * W;
      const rad = 22 + r() * 110;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, `rgba(255,255,255,${0.16 + r() * 0.3})`);
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    return c;
  },

  /** 태양 표면 (과립 + 밝은 얼룩) */
  star(hot = '#fff3c4', cool = '#ff8a00') {
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    const r = rng(0xfeed);
    g.fillStyle = cool;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 9000; i++) {
      const x = r() * W, y = r() * H, rad = 4 + r() * 26;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, r() > 0.4 ? hot : 'rgba(255,120,0,0.8)');
      grd.addColorStop(1, 'rgba(255,140,0,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.fill();
    }
    // 흑점
    for (let i = 0; i < 16; i++) {
      const x = r() * W, y = H * 0.25 + r() * H * 0.5, rad = 8 + r() * 34;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, 'rgba(70,20,0,0.85)');
      grd.addColorStop(0.7, 'rgba(140,50,0,0.4)');
      grd.addColorStop(1, 'rgba(255,140,0,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.fill();
    }
    return c;
  },

  /** 토성 고리 (가로 방향 그라디언트 + 알파) */
  ring() {
    const c = makeCanvas(1024, 8);
    const g = c.getContext('2d');
    const r = rng(0xa11c3);
    const img = g.createImageData(1024, 8);
    for (let x = 0; x < 1024; x++) {
      const t = x / 1024;
      // 카시니 간극 등 굵직한 구조
      let a = 0.85;
      if (t < 0.08) a = t / 0.08 * 0.5;
      if (t > 0.62 && t < 0.68) a *= 0.12;      // 카시니 간극
      if (t > 0.95) a *= (1 - t) / 0.05;
      a *= 0.55 + 0.45 * Math.sin(t * 90) * 0.5 + 0.3 * Math.sin(t * 31 + 1);
      a = Math.max(0, Math.min(1, a));
      const lum = 190 + Math.sin(t * 47) * 30 + r() * 22;
      for (let y = 0; y < 8; y++) {
        const i = (y * 1024 + x) * 4;
        img.data[i] = Math.min(255, lum + 22);
        img.data[i + 1] = Math.min(255, lum + 6);
        img.data[i + 2] = Math.min(255, lum - 26);
        img.data[i + 3] = a * 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  },

  /** 은하수 스카이박스 폴백 */
  milkyway() {
    const c = makeCanvas(4096, 2048);
    const g = c.getContext('2d');
    const r = rng(0xbeef);
    g.fillStyle = '#000206';
    g.fillRect(0, 0, 4096, 2048);
    // 은하수 띠
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6000; i++) {
      const x = r() * 4096;
      const band = 1024 + Math.sin((x / 4096) * Math.PI * 2) * 260;
      const y = band + (r() - 0.5) * (140 + r() * 320);
      const rad = 8 + r() * 90;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, `rgba(${150 + r() * 60 | 0},${160 + r() * 60 | 0},${200 + r() * 55 | 0},0.035)`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.fill();
    }
    // 별
    for (let i = 0; i < 26000; i++) {
      const x = r() * 4096;
      const band = 1024 + Math.sin((x / 4096) * Math.PI * 2) * 260;
      const nearBand = r() < 0.55;
      const y = nearBand ? band + (r() - 0.5) * 420 : r() * 2048;
      const s = Math.pow(r(), 4) * 2.6 + 0.35;
      const b = 0.35 + r() * 0.65;
      const tint = r();
      const col = tint > 0.86 ? `255,${190 + r() * 50 | 0},${150 + r() * 60 | 0}`
        : tint < 0.14 ? `${175 + r() * 50 | 0},${205 + r() * 40 | 0},255`
          : '255,255,255';
      g.fillStyle = `rgba(${col},${b})`;
      g.beginPath();
      g.arc(x, y, s, 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    return c;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 파티클용 소프트 원형 스프라이트 (사각 파티클 금지 요구사항)
// ─────────────────────────────────────────────────────────────────────────────

let _dotTex = null;

/** 캔버스 radial-gradient 로 만든 부드러운 원형 파티클 텍스처 */
export function softDotTexture() {
  if (_dotTex) return _dotTex;
  const size = 128;
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const h = size / 2;
  const grd = g.createRadialGradient(h, h, 0, h, h, h);
  grd.addColorStop(0.0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(255,255,255,0.95)');
  grd.addColorStop(0.42, 'rgba(255,255,255,0.42)');
  grd.addColorStop(0.72, 'rgba(255,255,255,0.1)');
  grd.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  _dotTex = new THREE.CanvasTexture(c);
  _dotTex.colorSpace = THREE.SRGBColorSpace;
  _dotTex.needsUpdate = true;
  return _dotTex;
}

let _glowTex = null;

/** 호버 하이라이트용 링 글로우 스프라이트 */
export function ringGlowTexture() {
  if (_glowTex) return _glowTex;
  const size = 256;
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const h = size / 2;
  const grd = g.createRadialGradient(h, h, 0, h, h, h);
  grd.addColorStop(0.0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.62, 'rgba(255,255,255,0)');
  grd.addColorStop(0.78, 'rgba(160,240,255,0.55)');
  grd.addColorStop(0.86, 'rgba(120,225,255,0.28)');
  grd.addColorStop(1.0, 'rgba(120,225,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  _glowTex = new THREE.CanvasTexture(c);
  _glowTex.colorSpace = THREE.SRGBColorSpace;
  return _glowTex;
}

// ─────────────────────────────────────────────────────────────────────────────
// 로더
// ─────────────────────────────────────────────────────────────────────────────

function applySettings(tex, entry, renderer) {
  if (entry.srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer ? Math.min(16, renderer.capabilities.getMaxAnisotropy()) : 8;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function buildFallback(entry, renderer) {
  const [gen, ...args] = entry.fallback || ['banded'];
  const fn = GENERATORS[gen] || GENERATORS.banded;
  let canvas;
  try {
    canvas = fn(...args);
  } catch {
    canvas = GENERATORS.banded();
  }
  const tex = new THREE.CanvasTexture(canvas);
  return applySettings(tex, entry, renderer);
}

/**
 * 전체 텍스처를 로드한다. 실패 항목은 프로시저럴로 대체하므로 항상 resolve 된다.
 * @param {THREE.WebGLRenderer} renderer anisotropy 상한 조회용
 * @param {(pct:number, label:string)=>void} onProgress
 * @returns {Promise<Record<string, THREE.Texture>>}
 */
export function loadTextures(renderer, onProgress = () => {}) {
  const loader = new THREE.TextureLoader();
  const total = TEXTURE_MANIFEST.length;
  let done = 0;
  const out = {};
  const fallbacks = [];

  const step = (label) => {
    done++;
    onProgress(done / total, label);
  };

  const jobs = TEXTURE_MANIFEST.map(
    (entry) =>
      new Promise((resolve) => {
        loader.load(
          url(entry.file),
          (tex) => {
            out[entry.key] = applySettings(tex, entry, renderer);
            step(entry.key);
            resolve();
          },
          undefined,
          () => {
            // 다운로드 실패 → 캔버스 폴백 (빌드/실행이 절대 깨지지 않도록)
            out[entry.key] = buildFallback(entry, renderer);
            fallbacks.push(entry.key);
            step(entry.key);
            resolve();
          },
        );
      }),
  );

  return Promise.all(jobs).then(() => {
    if (fallbacks.length) {
      console.info('[space3d] 프로시저럴 텍스처로 대체:', fallbacks.join(', '));
    }
    out._fallbacks = fallbacks;
    return out;
  });
}

/**
 * 달 인셋 패널용 픽셀 데이터. 로드된 달 텍스처를 작은 캔버스에 그려 ImageData 로 뽑는다.
 * (같은 오리진이므로 캔버스가 오염되지 않는다)
 * @returns {{data:Uint8ClampedArray, w:number, h:number}|null}
 */
export function extractImageData(texture, w = 512, h = 256) {
  try {
    const img = texture && texture.image;
    if (!img || !(img.width || img.videoWidth)) return null;
    const c = makeCanvas(w, h);
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h);
    return { data: d.data, w, h };
  } catch (err) {
    console.warn('[space3d] 달 텍스처 픽셀 추출 실패, 프로시저럴로 대체합니다.', err);
    return null;
  }
}

/** 달 인셋 폴백용 프로시저럴 픽셀 데이터 */
export function proceduralMoonPixels(w = 512, h = 256) {
  const c = GENERATORS.cratered('#b9b3a8');
  const s = makeCanvas(w, h);
  const g = s.getContext('2d', { willReadFrequently: true });
  g.drawImage(c, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h);
  return { data: d.data, w, h };
}
