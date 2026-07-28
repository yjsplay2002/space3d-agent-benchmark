#!/usr/bin/env node
/**
 * scripts/shots.mjs — 개발용: 여러 URL 파라미터 조합으로 스크린샷만 빠르게 찍는다.
 *   node scripts/shots.mjs "bloom=0" "flare=0" ""
 */

import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import puppeteer from 'puppeteer';

const ROOT = resolve(process.cwd(), 'dist');
const OUT = resolve(process.cwd(), '.smoke');
const PORT = 5198;
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

const combos = process.argv.slice(2);
const actions = process.env.SHOT_ACTION || '';

for (const combo of combos) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/?${combo}`, { waitUntil: 'networkidle0', timeout: 90000 });
  await page.waitForFunction(() => document.body.classList.contains('ready'), { timeout: 90000 });
  await new Promise((r) => setTimeout(r, 2200));

  if (actions === 'earth') {
    await page.evaluate(() => document.querySelector('.body-label[data-key="earth"]')?.click());
    await new Promise((r) => setTimeout(r, 11000));
  } else if (actions === 'moon') {
    await page.evaluate(() => document.querySelector('.body-label[data-key="moon"]')?.click());
    await new Promise((r) => setTimeout(r, 11000));
  } else if (actions === 'saturn') {
    await page.evaluate(() => document.querySelector('.body-label[data-key="saturn"]')?.click());
    await new Promise((r) => setTimeout(r, 11000));
  }

  const name = `shot-${(combo || 'default').replace(/[^a-z0-9]+/gi, '_')}${actions ? '-' + actions : ''}.png`;
  await page.screenshot({ path: join(OUT, name) });
  console.log(`${name}${errs.length ? '  ERRORS: ' + errs.join(' | ') : ''}`);
  await page.close();
}

await browser.close();
server.close();
