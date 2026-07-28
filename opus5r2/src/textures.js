/**
 * textures.js — 로컬 텍스처 로딩 + 프로시저럴 폴백.
 *
 * 모든 텍스처는 /public/textures/ 에 있는 로컬 파일이다(외부 CDN 없음).
 * 어떤 이유로든 파일이 없거나 로딩에 실패하면 canvas 로 그린 대체 텍스처를
 * 만들어 쓴다 — 빌드도 실행도 절대 깨지지 않는다.
 *
 * 파티클(별·소행성)에 쓰는 스프라이트는 항상 프로시저럴이며,
 * radial-gradient 로 만든 부드러운 원이다. (기본 사각형 점 금지)
 */

import * as THREE from 'three';

const BASE = import.meta.env.BASE_URL || '/';
const url = (f) => `${BASE}textures/${f}`.replace(/([^:])\/\//g, '$1/');

/**
 * key → { file, srgb, fallback }
 * fallback: 프로시저럴 생성기 이름
 */
export const TEXTURE_MANIFEST = {
  sun: { file: '2k_sun.jpg', srgb: true, fallback: ['noise', '#ffcf6b', '#ff7a18', 5] },
  mercury: {
    file: '2k_mercury.jpg',
    srgb: true,
    fallback: ['cratered', '#9c8b7d', '#6b5e53'],
  },
  venus: {
    file: '2k_venus_surface.jpg',
    srgb: true,
    fallback: ['bands', '#e6c07a', '#b8914f', 7],
  },
  venusClouds: {
    file: '2k_venus_atmosphere.jpg',
    srgb: true,
    fallback: ['bands', '#fff0cc', '#e3c78c', 11],
  },
  earth: {
    file: '2k_earth_daymap.jpg',
    srgb: true,
    fallback: ['earthish', '#1b4f8c', '#2f7a3a'],
  },
  earthNight: {
    file: '2k_earth_nightmap.jpg',
    srgb: true,
    fallback: ['citylights', '#000008', '#ffcf7a'],
  },
  earthClouds: { file: '2k_earth_clouds.jpg', srgb: true, fallback: ['clouds'] },
  moon: { file: '2k_moon.jpg', srgb: true, fallback: ['cratered', '#c8c2b4', '#7d786d'] },
  mars: { file: '2k_mars.jpg', srgb: true, fallback: ['cratered', '#c1502e', '#7d3220'] },
  jupiter: {
    file: '2k_jupiter.jpg',
    srgb: true,
    fallback: ['bands', '#e0c39a', '#9a6f4c', 13],
  },
  saturn: {
    file: '2k_saturn.jpg',
    srgb: true,
    fallback: ['bands', '#f0dcb0', '#c2a373', 9],
  },
  saturnRing: { file: '2k_saturn_ring_alpha.png', srgb: true, fallback: ['ring'] },
  uranus: {
    file: '2k_uranus.jpg',
    srgb: true,
    fallback: ['bands', '#a8e2e8', '#7cc4cf', 4],
  },
  neptune: {
    file: '2k_neptune.jpg',
    srgb: true,
    fallback: ['bands', '#3b62c4', '#2a4590', 5],
  },
  stars: { file: '8k_stars_milky_way.jpg', srgb: true, fallback: ['starfield'] },
};

/* ══════════════════════════════════════════════════════════════
   프로시저럴 폴백 생성기
   ══════════════════════════════════════════════════════════════ */

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** 결정적 의사난수 (시드 고정 → 빌드마다 같은 그림) */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

const GEN = {
  /** 얼룩덜룩한 난류 (태양) */
  noise(hot = '#ffcf6b', cool = '#ff7a18', blobs = 5) {
    const c = makeCanvas(1024, 512);
    const g = c.getContext('2d');
    g.fillStyle = cool;
    g.fillRect(0, 0, 1024, 512);
    const r = rng(7);
    for (let i = 0; i < 900; i++) {
      const x = r() * 1024;
      const y = r() * 512;
      const rad = 8 + r() * 46 * (1 + blobs / 10);
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, hot);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.14 + r() * 0.3;
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    return c;
  },

  /** 가로 줄무늬 (가스 행성) */
  bands(light = '#e0c39a', dark = '#9a6f4c', count = 13) {
    const c = makeCanvas(1024, 512);
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 512);
    for (let i = 0; i <= count; i++) {
      grd.addColorStop(i / count, i % 2 ? light : dark);
    }
    g.fillStyle = grd;
    g.fillRect(0, 0, 1024, 512);
    const r = rng(19);
    g.globalCompositeOperation = 'overlay';
    for (let i = 0; i < 600; i++) {
      const y = r() * 512;
      g.globalAlpha = 0.05 + r() * 0.12;
      g.fillStyle = r() > 0.5 ? '#ffffff' : '#000000';
      g.beginPath();
      g.ellipse(r() * 1024, y, 20 + r() * 120, 2 + r() * 7, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    return c;
  },

  /** 크레이터 (수성·달·화성) */
  cratered(base = '#c8c2b4', dark = '#7d786d') {
    const c = makeCanvas(1024, 512);
    const g = c.getContext('2d');
    g.fillStyle = base;
    g.fillRect(0, 0, 1024, 512);
    const r = rng(31);
    for (let i = 0; i < 260; i++) {
      const x = r() * 1024;
      const y = r() * 512;
      const rad = 3 + r() * 34;
      const grd = g.createRadialGradient(x - rad * 0.3, y - rad * 0.3, 0, x, y, rad);
      grd.addColorStop(0, dark);
      grd.addColorStop(0.72, dark);
      grd.addColorStop(1, 'rgba(255,255,255,0.28)');
      g.globalAlpha = 0.22 + r() * 0.4;
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    return c;
  },

  /** 바다 + 대륙 느낌 (지구) */
  earthish(ocean = '#1b4f8c', land = '#2f7a3a') {
    const c = makeCanvas(1024, 512);
    const g = c.getContext('2d');
    g.fillStyle = ocean;
    g.fillRect(0, 0, 1024, 512);
    const r = rng(53);
    for (let i = 0; i < 40; i++) {
      const cx = r() * 1024;
      const cy = 60 + r() * 392;
      g.fillStyle = land;
      g.globalAlpha = 0.55 + r() * 0.4;
      g.beginPath();
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        const rad = 22 + r() * 70;
        const x = cx + Math.cos(a) * rad * 1.7;
        const y = cy + Math.sin(a) * rad * 0.8;
        k ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath();
      g.fill();
    }
    // 극지방 빙하
    g.globalAlpha = 0.9;
    g.fillStyle = '#eef6ff';
    g.fillRect(0, 0, 1024, 22);
    g.fillRect(0, 490, 1024, 22);
    g.globalAlpha = 1;
    return c;
  },

  /** 야간 도시 불빛 */
  citylights(bg = '#000008', light = '#ffcf7a') {
    const c = makeCanvas(1024, 512);
    const g = c.getContext('2d');
    g.fillStyle = bg;
    g.fillRect(0, 0, 1024, 512);
    const r = rng(97);
    for (let i = 0; i < 1400; i++) {
      const x = r() * 1024;
      const y = 70 + r() * 380;
      const rad = 1 + r() * 3.5;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad * 3);
      grd.addColorStop(0, light);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.25 + r() * 0.6;
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, rad * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    return c;
  },

  /** 구름 (알파용 흑백) */
  clouds() {
    const c = makeCanvas(1024, 512);
    const g = c.getContext('2d');
    g.fillStyle = '#000000';
    g.fillRect(0, 0, 1024, 512);
    const r = rng(151);
    for (let i = 0; i < 700; i++) {
      const x = r() * 1024;
      const y = r() * 512;
      const rad = 12 + r() * 62;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, 'rgba(255,255,255,0.85)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.ellipse(x, y, rad * 1.8, rad * 0.7, 0, 0, Math.PI * 2);
      g.fill();
    }
    return c;
  },

  /** 고리 (가로 방향 = 반지름) */
  ring() {
    const c = makeCanvas(1024, 8);
    const g = c.getContext('2d');
    const r = rng(211);
    for (let x = 0; x < 1024; x++) {
      const t = x / 1024;
      let a = 0.55 + 0.35 * Math.sin(t * 42) * Math.sin(t * 7.3);
      // 카시니 간극
      if (t > 0.58 && t < 0.64) a *= 0.12;
      if (t < 0.06 || t > 0.98) a *= 0.2;
      a = Math.max(0, Math.min(1, a + (r() - 0.5) * 0.16));
      const v = 190 + Math.floor(r() * 60);
      g.fillStyle = `rgba(${v},${Math.floor(v * 0.94)},${Math.floor(v * 0.8)},${a})`;
      g.fillRect(x, 0, 1, 8);
    }
    return c;
  },

  /** 은하수 대체 별밭 */
  starfield() {
    const c = makeCanvas(2048, 1024);
    const g = c.getContext('2d');
    g.fillStyle = '#000005';
    g.fillRect(0, 0, 2048, 1024);
    const r = rng(3571);
    // 은하수 띠
    const grd = g.createLinearGradient(0, 380, 0, 660);
    grd.addColorStop(0, 'rgba(60,80,140,0)');
    grd.addColorStop(0.5, 'rgba(120,140,200,0.22)');
    grd.addColorStop(1, 'rgba(60,80,140,0)');
    g.fillStyle = grd;
    g.fillRect(0, 380, 2048, 280);
    for (let i = 0; i < 26000; i++) {
      const x = r() * 2048;
      const bandBias = r() < 0.45 ? 470 + (r() - 0.5) * 220 : r() * 1024;
      const y = bandBias;
      const s = r();
      const rad = s > 0.995 ? 1.8 : s > 0.96 ? 1.1 : 0.6;
      const b = 130 + Math.floor(r() * 125);
      const tint = r();
      g.fillStyle = `rgba(${tint > 0.7 ? b : Math.floor(b * 0.86)},${b},${tint < 0.3 ? b : Math.floor(b * 0.92)},${0.4 + r() * 0.6})`;
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.fill();
    }
    return c;
  },
};

function proceduralTexture(spec) {
  const [name, ...args] = spec;
  const canvas = (GEN[name] || GEN.noise)(...args);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/* ══════════════════════════════════════════════════════════════
   파티클 스프라이트 (항상 프로시저럴 — 기본 사각형 금지)
   ══════════════════════════════════════════════════════════════ */

let _softCircle = null;
/** radial-gradient 원형 소프트 파티클 */
export function softCircleTexture() {
  if (_softCircle) return _softCircle;
  const size = 128;
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const h = size / 2;
  const grd = g.createRadialGradient(h, h, 0, h, h, h);
  grd.addColorStop(0.0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(255,255,255,0.95)');
  grd.addColorStop(0.42, 'rgba(255,255,255,0.42)');
  grd.addColorStop(0.72, 'rgba(255,255,255,0.09)');
  grd.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  _softCircle = new THREE.CanvasTexture(c);
  _softCircle.colorSpace = THREE.SRGBColorSpace;
  _softCircle.needsUpdate = true;
  return _softCircle;
}

let _starSprite = null;
/** 살짝 십자 회절을 넣은 별 스프라이트 */
export function starSpriteTexture() {
  if (_starSprite) return _starSprite;
  const size = 128;
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const h = size / 2;
  const grd = g.createRadialGradient(h, h, 0, h, h, h);
  grd.addColorStop(0.0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.14, 'rgba(255,255,255,0.85)');
  grd.addColorStop(0.38, 'rgba(255,255,255,0.28)');
  grd.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);

  // 아주 옅은 십자 스파이크
  g.globalCompositeOperation = 'lighter';
  const spike = g.createLinearGradient(0, h, size, h);
  spike.addColorStop(0, 'rgba(255,255,255,0)');
  spike.addColorStop(0.5, 'rgba(255,255,255,0.32)');
  spike.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = spike;
  g.fillRect(0, h - 1, size, 2);
  const spikeV = g.createLinearGradient(h, 0, h, size);
  spikeV.addColorStop(0, 'rgba(255,255,255,0)');
  spikeV.addColorStop(0.5, 'rgba(255,255,255,0.32)');
  spikeV.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = spikeV;
  g.fillRect(h - 1, 0, 2, size);
  g.globalCompositeOperation = 'source-over';

  _starSprite = new THREE.CanvasTexture(c);
  _starSprite.colorSpace = THREE.SRGBColorSpace;
  return _starSprite;
}

/* ══════════════════════════════════════════════════════════════
   로더
   ══════════════════════════════════════════════════════════════ */

const LOAD_LABELS = {
  sun: '태양',
  mercury: '수성',
  venus: '금성',
  venusClouds: '금성의 구름',
  earth: '지구',
  earthNight: '지구의 밤',
  earthClouds: '지구의 구름',
  moon: '달',
  mars: '화성',
  jupiter: '목성',
  saturn: '토성',
  saturnRing: '토성의 고리',
  uranus: '천왕성',
  neptune: '해왕성',
  stars: '은하수',
};

/**
 * 전체 텍스처 로딩.
 * @param {(pct:number, label:string)=>void} onProgress
 * @returns {Promise<Record<string, THREE.Texture>>}
 */
export async function loadAllTextures(onProgress, maxAnisotropy = 8) {
  const loader = new THREE.TextureLoader();
  const keys = Object.keys(TEXTURE_MANIFEST);
  const out = {};
  let done = 0;

  const tick = (key) => {
    done++;
    onProgress?.(done / keys.length, LOAD_LABELS[key] || key);
  };

  await Promise.all(
    keys.map(
      (key) =>
        new Promise((resolve) => {
          const spec = TEXTURE_MANIFEST[key];
          loader.load(
            url(spec.file),
            (tex) => {
              out[key] = tex;
              tick(key);
              resolve();
            },
            undefined,
            () => {
              // 실패 → 프로시저럴 폴백. 콘솔에만 알리고 계속 진행한다.
              console.warn(`[textures] ${spec.file} 로딩 실패 — 프로시저럴 텍스처로 대체`);
              out[key] = proceduralTexture(spec.fallback);
              tick(key);
              resolve();
            }
          );
        })
    )
  );

  // 공통 설정
  for (const key of keys) {
    const tex = out[key];
    const spec = TEXTURE_MANIFEST[key];
    if (spec.srgb) tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;
    if (key === 'saturnRing') {
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
    } else {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
    }
    tex.needsUpdate = true;
  }

  return out;
}

/**
 * 달 인셋 패널용 원본 이미지(2D 캔버스에서 픽셀 단위로 쓴다).
 * 텍스처 로딩과 별개로 HTMLImageElement 를 하나 더 확보한다.
 */
export function loadMoonImage() {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url(TEXTURE_MANIFEST.moon.file);
  });
}

/** 폴백 달 이미지(캔버스) — 원본 로딩 실패 시 */
export function proceduralMoonCanvas() {
  return GEN.cratered('#c8c2b4', '#7d786d');
}
