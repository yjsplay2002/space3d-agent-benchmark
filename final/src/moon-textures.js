// 위성 프로시저럴 텍스처 — 사진 파일 없이 canvas로 그린다 (외부 다운로드 금지 제약)
// 실제 위성의 색·무늬에 근사하게: 이오=유황 노랑, 유로파=얼음+균열, 칼리스토=크레이터투성이...
// 결정적 해시 노이즈 사용 → 새로고침해도 같은 모습. 한 번 그려서 캐시.
import * as THREE from 'three';

const W = 512, H = 256;
const cache = new Map();

// 결정적 해시 (Math.random 금지 — 매번 같은 무늬)
function hash(i, j, seed = 0) {
  const h = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

function makeCtx() {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  return c.getContext('2d');
}

// 세로 그라데이션 바탕
function base(g, stops) {
  const grad = g.createLinearGradient(0, 0, 0, H);
  for (const [t, col] of stops) grad.addColorStop(t, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
}

// 부드러운 얼룩 (mottling)
function mottle(g, n, seed, colors, rMin, rMax, alpha) {
  for (let i = 0; i < n; i++) {
    const x = hash(i, 0, seed) * W;
    const y = hash(i, 1, seed) * H;
    const r = rMin + hash(i, 2, seed) * (rMax - rMin);
    const col = colors[Math.floor(hash(i, 3, seed) * colors.length)];
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, col);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = alpha * (0.5 + hash(i, 4, seed) * 0.5);
    g.fillStyle = rg;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
}

// 크레이터: 어두운 바닥 + 밝은 림
function crater(g, x, y, r, floorA, rimA) {
  const rg = g.createRadialGradient(x, y, 0, x, y, r);
  rg.addColorStop(0, `rgba(8,6,4,${floorA})`);
  rg.addColorStop(0.7, `rgba(12,10,8,${floorA * 0.5})`);
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = `rgba(255,250,240,${rimA})`;
  g.lineWidth = Math.max(1, r * 0.16);
  g.beginPath(); g.arc(x, y, r * 0.82, 0, Math.PI * 2); g.stroke();
}

function craterField(g, n, seed, rMin, rMax, floorA, rimA) {
  for (let i = 0; i < n; i++) {
    const x = hash(i, 5, seed) * W;
    const y = hash(i, 6, seed) * H;
    const r = rMin + hash(i, 7, seed) ** 2 * (rMax - rMin);
    crater(g, x, y, r, floorA * (0.6 + hash(i, 8, seed) * 0.4), rimA * (0.5 + hash(i, 9, seed) * 0.5));
  }
}

// 유로파식 균열선 — 살짝 휜 긴 선
function cracks(g, n, seed, color, wMin, wMax, aMin, aMax) {
  for (let i = 0; i < n; i++) {
    const x0 = hash(i, 10, seed) * W;
    const y0 = hash(i, 11, seed) * H;
    const ang = hash(i, 12, seed) * Math.PI * 2;
    const len = 60 + hash(i, 13, seed) * 260;
    const x1 = x0 + Math.cos(ang) * len;
    const y1 = y0 + Math.sin(ang) * len * 0.5; // 가로로 길게 (구에 감기면 자연스러움)
    const cx = (x0 + x1) / 2 + (hash(i, 14, seed) - 0.5) * 80;
    const cy = (y0 + y1) / 2 + (hash(i, 15, seed) - 0.5) * 60;
    g.strokeStyle = color;
    g.globalAlpha = aMin + hash(i, 16, seed) * (aMax - aMin);
    g.lineWidth = wMin + hash(i, 17, seed) * (wMax - wMin);
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, x1, y1); g.stroke();
  }
  g.globalAlpha = 1;
}

// ---------------------------------------------------------------- 위성별 페인터
const PAINTERS = {
  // 포보스 — 감자색 바위, 큰 스티크니 크레이터
  phobos(g) {
    base(g, [[0, '#83786a'], [0.5, '#786e60'], [1, '#6b6157']]);
    mottle(g, 60, 21, ['rgba(96,86,74,0.6)', 'rgba(140,130,116,0.5)'], 10, 42, 0.35);
    craterField(g, 90, 22, 3, 16, 0.5, 0.12);
    crater(g, W * 0.28, H * 0.42, 46, 0.6, 0.16); // 스티크니
  },
  // 데이모스 — 더 매끈하고 옅은 회갈색
  deimos(g) {
    base(g, [[0, '#93887a'], [0.5, '#8a8072'], [1, '#7e7466']]);
    mottle(g, 70, 31, ['rgba(120,110,98,0.5)', 'rgba(160,150,134,0.45)'], 12, 50, 0.3);
    craterField(g, 30, 32, 2, 9, 0.35, 0.08);
  },
  // 이오 — 유황 노랑·주황, 검은 화산 점 + 붉은 고리
  io(g) {
    base(g, [[0, '#e9d489'], [0.35, '#ddc26a'], [0.65, '#d5b657'], [1, '#e3cd80']]);
    mottle(g, 90, 41, ['rgba(201,111,42,0.7)', 'rgba(224,160,60,0.6)', 'rgba(242,234,208,0.65)'], 12, 55, 0.4);
    mottle(g, 40, 42, ['rgba(140,61,23,0.7)', 'rgba(180,80,30,0.6)'], 6, 26, 0.5);
    // 화산 점: 검은 중심 + 붉은 테
    for (let i = 0; i < 30; i++) {
      const x = hash(i, 43, 4) * W, y = H * 0.12 + hash(i, 44, 4) * H * 0.76;
      const r = 1.8 + hash(i, 45, 4) * 4.5;
      g.fillStyle = 'rgba(150,40,10,0.4)';
      g.beginPath(); g.arc(x, y, r * 1.7, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(20,10,5,0.8)';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  },
  // 유로파 — 희끄무레한 얼음 + 갈색 균열선
  europa(g) {
    base(g, [[0, '#e4ded2'], [0.5, '#ded6c8'], [1, '#d6cec0']]);
    mottle(g, 50, 51, ['rgba(196,176,150,0.4)', 'rgba(236,232,222,0.5)'], 20, 70, 0.3);
    cracks(g, 46, 52, 'rgb(146,96,58)', 0.8, 2.4, 0.25, 0.6);
    cracks(g, 10, 53, 'rgb(120,72,44)', 2.5, 4, 0.3, 0.5);
    mottle(g, 26, 54, ['rgba(170,140,110,0.35)'], 4, 14, 0.4); // 주근깨 (렌티큘)
  },
  // 가니메데 — 회갈색, 밝은 지대와 어두운 지대 + 밝은 광조 크레이터
  ganymede(g) {
    base(g, [[0, '#96897b'], [0.5, '#8d8172'], [1, '#84786a']]);
    mottle(g, 26, 61, ['rgba(96,86,72,0.75)'], 30, 90, 0.5);   // 어두운 옛 지형
    mottle(g, 30, 62, ['rgba(176,168,152,0.6)'], 16, 60, 0.4); // 밝은 홈 지형
    craterField(g, 40, 63, 2, 8, 0.3, 0.1);
    // 밝은 광조(레이) 크레이터 몇 개
    for (let i = 0; i < 8; i++) {
      const x = hash(i, 64, 6) * W, y = hash(i, 65, 6) * H;
      const r = 3 + hash(i, 66, 6) * 5;
      const rg = g.createRadialGradient(x, y, 0, x, y, r * 3.2);
      rg.addColorStop(0, 'rgba(240,238,230,0.85)');
      rg.addColorStop(0.35, 'rgba(230,226,214,0.35)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg;
      g.beginPath(); g.arc(x, y, r * 3.2, 0, Math.PI * 2); g.fill();
    }
  },
  // 칼리스토 — 어두운 바탕에 크레이터가 빼곡
  callisto(g) {
    base(g, [[0, '#5d5646'], [0.5, '#554e3f'], [1, '#4c4638']]);
    mottle(g, 60, 71, ['rgba(60,54,44,0.6)', 'rgba(110,102,86,0.5)'], 10, 44, 0.4);
    craterField(g, 150, 72, 2, 10, 0.45, 0.2);
    // 발할라 — 동심원 고리 충돌 자국
    const vx = W * 0.68, vy = H * 0.4;
    for (let k = 0; k < 4; k++) {
      g.strokeStyle = `rgba(200,190,168,${0.28 - k * 0.055})`;
      g.lineWidth = 2.2 - k * 0.35;
      g.beginPath(); g.arc(vx, vy, 12 + k * 12, 0, Math.PI * 2); g.stroke();
    }
    g.fillStyle = 'rgba(216,208,188,0.5)';
    g.beginPath(); g.arc(vx, vy, 8, 0, Math.PI * 2); g.fill();
  },
  // 타이탄 — 뿌연 주황 대기, 무늬는 아주 흐릿하게
  titan(g) {
    base(g, [[0, '#dfae5e'], [0.3, '#d8a24b'], [0.6, '#d09a45'], [1, '#c99242']]);
    // 흐릿한 위도 밴드
    for (let i = 0; i < 9; i++) {
      const y = (i / 9) * H;
      g.fillStyle = i % 2 ? 'rgba(255,220,160,0.07)' : 'rgba(150,95,40,0.08)';
      g.fillRect(0, y, W, H / 9);
    }
    mottle(g, 24, 81, ['rgba(170,110,50,0.3)', 'rgba(235,190,120,0.3)'], 30, 90, 0.25);
    // 북극 쪽 살짝 어두운 모자 (메탄 호수 지대 느낌)
    const rg = g.createLinearGradient(0, 0, 0, H * 0.2);
    rg.addColorStop(0, 'rgba(120,80,40,0.35)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, W, H * 0.2);
  },
  // 엔셀라두스 — 새하얀 얼음, 남극의 푸른 줄무늬(호랑이 줄무늬)
  enceladus(g) {
    base(g, [[0, '#f6f9fc'], [0.5, '#f1f5f9'], [1, '#eef3f8']]);
    mottle(g, 40, 91, ['rgba(214,226,238,0.5)', 'rgba(255,255,255,0.6)'], 14, 50, 0.35);
    craterField(g, 20, 92, 2, 6, 0.1, 0.06);
    // 남극(아래쪽) 호랑이 줄무늬
    for (let i = 0; i < 5; i++) {
      const y = H * 0.82 + i * 6;
      g.strokeStyle = 'rgba(140,180,210,0.55)';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(W * 0.15 + i * 30, y);
      g.quadraticCurveTo(W * 0.4 + i * 25, y - 10, W * 0.7 + i * 20, y + 3);
      g.stroke();
    }
  },
  // 티타니아 — 회색, 크레이터 + 긴 골짜기
  titania(g) {
    base(g, [[0, '#94908a'], [0.5, '#8c8882'], [1, '#847f79']]);
    mottle(g, 50, 101, ['rgba(110,104,96,0.55)', 'rgba(158,150,140,0.5)'], 12, 46, 0.35);
    mottle(g, 20, 102, ['rgba(150,122,106,0.3)'], 20, 55, 0.3); // 살짝 붉은 기
    craterField(g, 60, 103, 2, 9, 0.35, 0.12);
    cracks(g, 5, 104, 'rgb(60,56,50)', 1.5, 3, 0.35, 0.55); // 골짜기
  },
  // 트리톤 — 분홍빛 도는 흰색, 남극의 분홍 질소 얼음 모자 + 멜론 껍질 지형
  triton(g) {
    base(g, [[0, '#e9dfd8'], [0.45, '#e4d8cf'], [0.68, '#e8cfc0'], [1, '#eccdb9']]);
    // 멜론 껍질(캔털루프) 지형 — 오목오목한 자국
    for (let i = 0; i < 160; i++) {
      const x = hash(i, 111, 11) * W;
      const y = H * 0.1 + hash(i, 112, 11) * H * 0.5;
      const r = 3 + hash(i, 113, 11) * 7;
      g.strokeStyle = 'rgba(120,100,90,0.11)';
      g.lineWidth = 1.2;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    }
    // 남극 모자 위 검은 간헐천 줄무늬
    for (let i = 0; i < 18; i++) {
      const x = hash(i, 114, 11) * W;
      const y = H * 0.75 + hash(i, 115, 11) * H * 0.2;
      g.strokeStyle = 'rgba(70,58,52,0.4)';
      g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 8 + hash(i, 116, 11) * 16, y - 4); g.stroke();
    }
    mottle(g, 30, 117, ['rgba(255,252,248,0.5)', 'rgba(214,190,176,0.4)'], 16, 50, 0.3);
  },
};

// 태양광이 강해서(행성 사진 텍스처 기준 노출) 밝은 캔버스 색은 하얗게 날아간다.
// 위성별 알베도 느낌에 맞춰 전체를 한 번 눌러 준다 (엔셀라두스가 가장 밝고 칼리스토가 가장 어둡게).
const DARKEN = {
  phobos: 0.5, deimos: 0.52, io: 0.78, europa: 0.68, ganymede: 0.58,
  callisto: 0.48, titan: 0.75, enceladus: 0.82, titania: 0.56, triton: 0.7,
};

/** 위성 텍스처를 생성(최초 1회)해 돌려준다. */
export function moonTexture(key) {
  if (cache.has(key)) return cache.get(key);
  const g = makeCtx();
  PAINTERS[key](g);
  const v = Math.round(255 * (DARKEN[key] ?? 0.62));
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = `rgb(${v},${v},${v})`;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(g.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}
