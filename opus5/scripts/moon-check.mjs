#!/usr/bin/env node
/**
 * scripts/moon-check.mjs — 개발용: 달 인셋 패널의 위상 렌더가 물리적으로 맞는지 확인.
 *
 * 한 삭망월을 하루씩 넘기면서 원반 캔버스를 읽어
 *   · 밝은 픽셀의 무게중심이 좌/우 어느 쪽인지 (차오를 때 오른쪽, 기울 때 왼쪽)
 *   · 밝은 면적 비율이 계산된 조명률과 일치하는지
 * 를 확인하고, 위상 변화를 이어 붙인 시트 이미지를 남긴다.
 */

import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import puppeteer from 'puppeteer';

const ROOT = resolve(process.cwd(), 'dist');
const OUT = resolve(process.cwd(), '.smoke');
const PORT = 5197;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png' };

const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/' || p.endsWith('/')) p += 'index.html';
  const file = join(ROOT, p);
  if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(await readFile(file));
});
await new Promise((r) => server.listen(PORT, r));
await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  headless: 'shell',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0', timeout: 90000 });
await page.waitForFunction(() => document.body.classList.contains('ready'), { timeout: 90000 });
await new Promise((r) => setTimeout(r, 1500));

// 삭에 가까운 날로 먼저 이동
await page.evaluate(() => {
  document.getElementById('date-today').click();
});
await new Promise((r) => setTimeout(r, 200));

const rows = [];
const tiles = [];
for (let i = 0; i < 30; i++) {
  const r = await page.evaluate(() => {
    const c = document.getElementById('moon-canvas');
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const half = c.width / 2;
    let sumW = 0, sumX = 0, litArea = 0, discArea = 0;
    for (let y = 0; y < c.width; y++) {
      for (let x = 0; x < c.width; x++) {
        const o = (y * c.width + x) * 4;
        if (d[o + 3] < 128) continue;
        discArea++;
        const lum = (d[o] * 0.3 + d[o + 1] * 0.59 + d[o + 2] * 0.11) / 255;
        if (lum > 0.20) { litArea++; sumW += lum; sumX += lum * (x - half); }
      }
    }
    return {
      date: document.getElementById('date-text').textContent,
      phaseName: document.getElementById('moon-phase-name').textContent,
      illum: Number(document.getElementById('moon-illum').textContent),
      age: Number(document.getElementById('moon-age').textContent),
      centroidX: sumW > 0 ? sumX / sumW / half : 0,   // -1(왼쪽) … +1(오른쪽)
      litFrac: discArea ? litArea / discArea : 0,
      png: c.toDataURL('image/png'),
    };
  });
  tiles.push(r.png);
  rows.push(r);
  await page.click('#date-next');
  await new Promise((r2) => setTimeout(r2, 110));
}

// 시트 이미지로 합치기
const sheet = await page.evaluate((pngs) => new Promise((res) => {
  const cols = 10, size = 130, pad = 8;
  const rowsN = Math.ceil(pngs.length / cols);
  const cv = document.createElement('canvas');
  cv.width = cols * (size + pad) + pad;
  cv.height = rowsN * (size + pad) + pad;
  const g = cv.getContext('2d');
  g.fillStyle = '#04080f';
  g.fillRect(0, 0, cv.width, cv.height);
  let loaded = 0;
  pngs.forEach((src, i) => {
    const im = new Image();
    im.onload = () => {
      g.drawImage(im, pad + (i % cols) * (size + pad), pad + Math.floor(i / cols) * (size + pad), size, size);
      if (++loaded === pngs.length) res(cv.toDataURL('image/png'));
    };
    im.src = src;
  });
}), tiles);

const { writeFile } = await import('node:fs/promises');
await writeFile(join(OUT, 'moon-phases.png'), Buffer.from(sheet.split(',')[1], 'base64'));

console.log('\n날짜            위상            조명률   월령   밝은쪽 무게중심  밝은면적');
let fails = 0;
for (const r of rows) {
  // 위상각을 월령에서 역산 (0~29.53 → 0~360)
  const waxing = r.age < 14.77;
  const side = r.centroidX > 0.045 ? '오른쪽' : r.centroidX < -0.045 ? '왼쪽 ' : '가운데';
  let ok = true;
  // 보름/삭 근처(무게중심이 거의 가운데)를 뺀 구간에서 방향을 검사
  if (r.illum > 6 && r.illum < 94) {
    ok = waxing ? r.centroidX > 0.02 : r.centroidX < -0.02;
  }
  // 밝은 면적이 조명률과 대체로 일치해야 한다 (터미네이터 소프트닝 때문에 여유를 둠)
  const areaOk = Math.abs(r.litFrac * 100 - r.illum) < 17;
  if (!ok || !areaOk) fails++;
  console.log(
    `${r.date.padEnd(15)} ${r.phaseName.padEnd(15)} ${String(r.illum).padStart(5)}%  ` +
    `${String(r.age).padStart(5)}  ${side} ${r.centroidX.toFixed(3).padStart(7)}   ` +
    `${(r.litFrac * 100).toFixed(1).padStart(5)}%  ${ok && areaOk ? '✓' : '✗'}`,
  );
}
console.log(`\n시트 이미지: ${join(OUT, 'moon-phases.png')}`);
console.log(fails === 0 ? '✓ 위상 렌더 방향/면적 모두 정합' : `✗ ${fails}일 불일치`);

await browser.close();
server.close();
process.exit(fails ? 1 : 0);
