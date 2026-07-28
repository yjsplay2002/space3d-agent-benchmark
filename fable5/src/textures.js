/**
 * textures.js — 텍스처 로딩 + 프로시저럴 폴백
 * 파일이 없거나 로드에 실패해도 canvas 로 생성한 텍스처로 대체되어
 * 앱이 절대 깨지지 않는다.
 */
import * as THREE from "three";

const BASE = `${import.meta.env.BASE_URL}textures/`;

/* ---------------- 프로시저럴 폴백 생성기 ---------------- */

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

// 간단한 해시 노이즈 (결정적)
function hash(x, y, seed = 0) {
  let h = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

/** 행성 표면 폴백: 기본색 + 위도 밴드 + 노이즈 얼룩 */
function proceduralPlanet(baseColor, bandColor, opts = {}) {
  const { bands = 0, spots = 250, seed = 1 } = opts;
  const w = 1024, h = 512;
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, w, h);

  if (bands > 0) {
    for (let i = 0; i < bands; i++) {
      const y = (i / bands) * h;
      const bh = (h / bands) * (0.4 + hash(i, 0, seed) * 0.8);
      ctx.fillStyle = bandColor;
      ctx.globalAlpha = 0.12 + hash(i, 1, seed) * 0.25;
      ctx.fillRect(0, y, w, bh);
    }
    ctx.globalAlpha = 1;
  }

  for (let i = 0; i < spots; i++) {
    const x = hash(i, 2, seed) * w;
    const y = hash(i, 3, seed) * h;
    const r = 2 + hash(i, 4, seed) * 18;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = hash(i, 5, seed) > 0.5;
    g.addColorStop(0, dark ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.18)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

function proceduralSun() {
  const w = 1024, h = 512;
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#ff9a00");
  grad.addColorStop(0.5, "#ffcc33");
  grad.addColorStop(1, "#ff8800");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) {
    const x = hash(i, 0, 9) * w, y = hash(i, 1, 9) * h;
    const r = 2 + hash(i, 2, 9) * 10;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hash(i, 3, 9) > 0.5 ? "rgba(255,240,180,0.35)" : "rgba(200,80,0,0.3)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

function proceduralStars() {
  const w = 2048, h = 1024;
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#000006";
  ctx.fillRect(0, 0, w, h);
  // 은하수 띠
  const band = ctx.createLinearGradient(0, h * 0.3, 0, h * 0.7);
  band.addColorStop(0, "rgba(20,25,50,0)");
  band.addColorStop(0.5, "rgba(60,60,90,0.35)");
  band.addColorStop(1, "rgba(20,25,50,0)");
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 4000; i++) {
    const x = hash(i, 0, 5) * w, y = hash(i, 1, 5) * h;
    const r = hash(i, 2, 5);
    const b = 0.3 + hash(i, 3, 5) * 0.7;
    ctx.fillStyle = `rgba(${200 + r * 55},${200 + r * 55},255,${b})`;
    ctx.fillRect(x, y, r < 0.92 ? 1 : 2, r < 0.92 ? 1 : 2);
  }
  return c;
}

function proceduralClouds() {
  const w = 1024, h = 512;
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  for (let i = 0; i < 400; i++) {
    const x = hash(i, 0, 7) * w, y = hash(i, 1, 7) * h;
    const r = 6 + hash(i, 2, 7) * 40;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${0.10 + hash(i, 3, 7) * 0.22})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

function proceduralNight() {
  const w = 1024, h = 512;
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 1400; i++) {
    const x = hash(i, 0, 11) * w;
    const y = h * 0.15 + hash(i, 1, 11) * h * 0.7;
    ctx.fillStyle = `rgba(255,200,110,${0.2 + hash(i, 2, 11) * 0.6})`;
    ctx.fillRect(x, y, 1, 1);
  }
  return c;
}

function proceduralRing() {
  const w = 1024, h = 64;
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  for (let x = 0; x < w; x++) {
    const t = x / w;
    const a = (0.25 + 0.55 * hash(x, 0, 13)) * (t < 0.08 || t > 0.95 ? 0.15 : 1) * (Math.abs(t - 0.62) < 0.04 ? 0.1 : 1);
    const b = 180 + hash(x, 1, 13) * 60;
    ctx.fillStyle = `rgba(${b},${b * 0.92},${b * 0.78},${a})`;
    ctx.fillRect(x, 0, 1, h);
  }
  return c;
}

const FALLBACKS = {
  "2k_sun.jpg": proceduralSun,
  "2k_mercury.jpg": () => proceduralPlanet("#8a8683", "#6b6560", { spots: 500, seed: 2 }),
  "2k_venus_atmosphere.jpg": () => proceduralPlanet("#d9b06c", "#c49a55", { bands: 10, spots: 90, seed: 3 }),
  "2k_earth_daymap.jpg": () => proceduralPlanet("#2a63b8", "#2f8f4e", { spots: 300, seed: 4 }),
  "2k_earth_nightmap.jpg": proceduralNight,
  "2k_earth_clouds.jpg": proceduralClouds,
  "2k_moon.jpg": () => proceduralPlanet("#9c9a94", "#7d7b74", { spots: 600, seed: 6 }),
  "2k_mars.jpg": () => proceduralPlanet("#b5532c", "#8f3f22", { spots: 420, seed: 8 }),
  "2k_jupiter.jpg": () => proceduralPlanet("#c8a878", "#9d7852", { bands: 14, spots: 80, seed: 10 }),
  "2k_saturn.jpg": () => proceduralPlanet("#d8c08c", "#b39a68", { bands: 12, spots: 40, seed: 12 }),
  "2k_saturn_ring_alpha.png": proceduralRing,
  "2k_uranus.jpg": () => proceduralPlanet("#9fd8dd", "#8ac4d0", { bands: 5, spots: 20, seed: 14 }),
  "2k_neptune.jpg": () => proceduralPlanet("#3b5dc9", "#2c4aa8", { bands: 7, spots: 40, seed: 16 }),
  "8k_stars_milky_way.jpg": proceduralStars,
};

/* ---------------- 로더 ---------------- */

/**
 * 텍스처 세트를 로드한다. 실패 시 프로시저럴 폴백.
 * @param {(loaded:number, total:number)=>void} onProgress
 * @returns {Promise<Record<string, THREE.Texture>>} 파일명 키의 텍스처 맵
 */
export async function loadTextures(onProgress) {
  const loader = new THREE.TextureLoader();
  const names = Object.keys(FALLBACKS);
  let loaded = 0;
  const total = names.length;

  const entries = await Promise.all(
    names.map(
      (name) =>
        new Promise((resolve) => {
          loader.load(
            BASE + name,
            (tex) => {
              loaded++;
              onProgress?.(loaded, total);
              resolve([name, tex]);
            },
            undefined,
            () => {
              // 실패 → canvas 폴백
              const tex = new THREE.CanvasTexture(FALLBACKS[name]());
              loaded++;
              onProgress?.(loaded, total);
              console.warn(`[textures] ${name} 로드 실패 → 프로시저럴 폴백 사용`);
              resolve([name, tex]);
            }
          );
        })
    )
  );

  const map = Object.fromEntries(entries);
  for (const tex of Object.values(map)) {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
  }
  return map;
}

/** 파티클용 소프트 원형 스프라이트 (radial-gradient) — 사각형 파티클 방지 */
export function makeSoftCircleTexture(size = 64, inner = "rgba(255,255,255,1)") {
  const c = makeCanvas(size, size);
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
