#!/usr/bin/env node
/**
 * scripts/smoke.mjs — 개발용 브라우저 스모크 테스트 (채점 대상 아님)
 *
 * 빌드 결과를 실제 헤드리스 크롬에 띄워 콘솔 에러/셰이더 컴파일 실패를 잡고,
 * 날짜 버튼·행성 클릭 같은 핵심 인터랙션이 동작하는지 확인한 뒤 스크린샷을 남긴다.
 *
 *   node scripts/smoke.mjs
 */

import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import puppeteer from 'puppeteer';

const ROOT = resolve(process.cwd(), 'dist');
const OUT = resolve(process.cwd(), '.smoke');
const PORT = 5199;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/' || p.endsWith('/')) p += 'index.html';
    const file = join(ROOT, p);
    if (!file.startsWith(ROOT) || !existsSync(file)) {
      res.writeHead(404); res.end('not found'); return;
    }
    const buf = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(buf);
  } catch (e) {
    res.writeHead(500); res.end(String(e));
  }
});

await new Promise((r) => server.listen(PORT, r));
await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  headless: 'shell',
  args: [
    '--no-sandbox',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--window-size=1440,900',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

const errors = [];
const warnings = [];
page.on('console', (m) => {
  const t = m.type();
  const txt = m.text();
  if (t === 'error') errors.push(txt);
  else if (t === 'warning') warnings.push(txt);
  else console.log(`  [${t}] ${txt}`);
});
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('requestfailed', (r) => errors.push(`REQFAIL: ${r.url()} ${r.failure()?.errorText}`));

console.log(`\n▶ http://localhost:${PORT}/ 로딩…`);
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0', timeout: 90000 });

// 로딩 화면이 사라질 때까지
await page.waitForFunction(() => document.body.classList.contains('ready'), { timeout: 90000 });
console.log('✓ 로딩 완료 (body.ready)');

await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: join(OUT, '01-overview.png') });

const readState = () => page.evaluate(() => ({
  date: document.getElementById('date-text')?.textContent,
  aux: document.getElementById('date-aux')?.textContent,
  phase: document.getElementById('moon-phase-name')?.textContent,
  illum: document.getElementById('moon-illum')?.textContent,
  age: document.getElementById('moon-age')?.textContent,
  toFull: document.getElementById('moon-tofull')?.textContent,
  why: document.getElementById('moon-why')?.textContent?.slice(0, 40),
  moonPixels: (() => {
    const c = document.getElementById('moon-canvas');
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let lit = 0, opaque = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 128) opaque++;
      if (d[i] > 70) lit++;
    }
    return { lit, opaque };
  })(),
  panelOpen: document.getElementById('info-panel')?.classList.contains('open'),
  panelName: document.getElementById('info-name')?.textContent,
}));

const s0 = await readState();
console.log('\n초기 상태:', JSON.stringify(s0, null, 2));

// ── 날짜 하루씩 넘기며 달 위상이 즉시 갱신되는지 ──
console.log('\n▶ 날짜 컨트롤 — 하루씩 7일 전진');
const seq = [s0];
for (let i = 0; i < 7; i++) {
  await page.click('#date-next');
  await new Promise((r) => setTimeout(r, 130));
  const s = await readState();
  seq.push(s);
  console.log(`  ${s.date}  ${s.phase.padEnd(10)} 밝기 ${s.illum}%  월령 ${s.age}일  다음보름 ${s.toFull}일  (밝은픽셀 ${s.moonPixels.lit})`);
}
await page.screenshot({ path: join(OUT, '02-date+7.png') });

// 위상이 실제로 변했는지
const illums = seq.map((s) => Number(s.illum));
const changed = new Set(illums).size >= 6;
console.log(changed ? '✓ 조명률이 매일 갱신됨' : '✗ 조명률이 변하지 않음');

// 픽셀도 실제로 달라졌는지
const litVals = seq.map((s) => s.moonPixels.lit);
const pixelChanged = new Set(litVals).size >= 6;
console.log(pixelChanged ? '✓ 달 원반 픽셀이 매일 다시 그려짐' : '✗ 달 원반이 갱신되지 않음');

// ── 키보드 ← ──
console.log('\n▶ 키보드 ← 로 하루 뒤로');
await page.keyboard.press('ArrowLeft');
await new Promise((r) => setTimeout(r, 200));
const sk = await readState();
console.log(`  ${sk.date} · ${sk.phase} · ${sk.illum}%`);

// ── 오늘 버튼 ──
await page.click('#date-today');
await new Promise((r) => setTimeout(r, 200));
const st = await readState();
console.log(`▶ 오늘 버튼 → ${st.date} (${st.aux})`);

// ── 행성 클릭 ──
console.log('\n▶ 라벨 클릭으로 행성 선택');
for (const key of ['saturn', 'earth', 'moon']) {
  const ok = await page.evaluate((k) => {
    const el = document.querySelector(`.body-label[data-key="${k}"]`);
    if (!el) return false;
    el.click();
    return true;
  }, key);
  if (!ok) { console.log(`  ✗ ${key} 라벨을 찾지 못함`); continue; }
  await new Promise((r) => setTimeout(r, 3200));
  const s = await readState();
  console.log(`  ${key} → 패널 ${s.panelOpen ? '열림' : '닫힘'} / 제목 "${s.panelName}"`);
  await page.screenshot({ path: join(OUT, `03-${key}.png`) });
}

// 달 패널 내용 확인
const moonPanel = await page.evaluate(() => ({
  hero: Boolean(document.getElementById('moon-hero')),
  heroWhy: document.getElementById('moon-hero-why')?.textContent?.slice(0, 60),
  stats: [...document.querySelectorAll('#info-stats .row')].map(
    (r) => `${r.querySelector('dt').textContent}: ${r.querySelector('dd').firstChild.textContent}`,
  ),
  facts: document.querySelectorAll('#info-facts li').length,
  spin: document.getElementById('info-spin')?.textContent?.slice(0, 40),
}));
console.log('\n달 정보 패널:', JSON.stringify(moonPanel, null, 2));

// ── 전체 보기 (ESC) ──
await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 2600));
await page.screenshot({ path: join(OUT, '04-back.png') });
console.log('▶ ESC → 전체 보기 복귀');

// ── 재생 ──
console.log('\n▶ 재생 3초');
await page.click('#btn-play');
await new Promise((r) => setTimeout(r, 3000));
const sp = await readState();
console.log(`  ${sp.date} · ${sp.phase} · 밝기 ${sp.illum}%`);
await page.click('#btn-play');

// ── 줌 ──
await page.mouse.move(720, 450);
for (let i = 0; i < 12; i++) {
  await page.mouse.wheel({ deltaY: -160 });
  await new Promise((r) => setTimeout(r, 45));
}
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: join(OUT, '05-zoom.png') });
console.log('▶ 휠 줌 인 동작');

// ── 모바일 뷰포트 ──
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await new Promise((r) => setTimeout(r, 1600));
await page.screenshot({ path: join(OUT, '06-mobile.png') });
console.log('▶ 모바일 뷰포트(390×844) 렌더');

// ── FPS 측정 ──
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await new Promise((r) => setTimeout(r, 800));
const fps = await page.evaluate(() => new Promise((res) => {
  let n = 0;
  const t0 = performance.now();
  const f = () => {
    n++;
    if (performance.now() - t0 < 2000) requestAnimationFrame(f);
    else res((n / (performance.now() - t0)) * 1000);
  };
  requestAnimationFrame(f);
}));
console.log(`\n▶ 프레임률(소프트웨어 렌더러 기준): ${fps.toFixed(1)} fps`);

// ── 결과 ──
const ignorable = (t) =>
  /Failed to load resource: the server responded with a status of 404/.test(t) && /favicon/.test(t);
const realErrors = errors.filter((e) => !ignorable(e));

console.log(`\n스크린샷: ${OUT}`);
if (warnings.length) {
  console.log(`\n경고 ${warnings.length}건:`);
  for (const w of [...new Set(warnings)].slice(0, 12)) console.log(`  ⚠ ${w}`);
}
if (realErrors.length) {
  console.log(`\n에러 ${realErrors.length}건:`);
  for (const e of [...new Set(realErrors)].slice(0, 25)) console.log(`  ✗ ${e}`);
} else {
  console.log('\n✓ 콘솔 에러 없음');
}

await browser.close();
server.close();
process.exit(realErrors.length ? 1 : 0);
