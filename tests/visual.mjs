/* ============================================================
   Visual capture deck.
   Run with: npm run visual   (writes tests/artifacts/, gitignored)

   Not an assertion suite: it produces a reviewable deck of the
   whole page at the widths and languages that actually break —
   plus the motion beats — so a design pass is repeatable instead
   of a matter of remembering to scroll.
   ============================================================ */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tests/artifacts');
const PORT = Number(process.env.SP_PORT || 8202);
const BASE = `http://127.0.0.1:${PORT}`;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2', '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

const server = await new Promise((res) => {
  const srv = createServer(async (req, out) => {
    const clean = decodeURIComponent(req.url.split('?')[0]);
    const file = join(ROOT, clean === '/' ? 'index.html' : clean.replace(/^\/+/, ''));
    if (!existsSync(file)) { out.writeHead(404); out.end(); return; }
    out.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    out.end(await readFile(file));
  });
  srv.listen(PORT, '127.0.0.1', () => res(srv));
});

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const shots = [];

async function deck(label, viewport, lang, stops) {
  const ctx = await browser.newContext({
    viewport, isMobile: viewport.width < 500, hasTouch: viewport.width < 500,
    deviceScaleFactor: viewport.width < 500 ? 2 : 1
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/${lang === 'pl' ? '' : '?lang=' + lang}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);
  const H = await page.evaluate(() => document.body.scrollHeight);
  for (let i = 0; i < stops; i++) {
    const y = Math.round((H - viewport.height) * (i / (stops - 1)));
    await page.evaluate((v) => window.scrollTo({ top: v, behavior: 'instant' }), y);
    await page.waitForTimeout(850);
    const name = `${label}-${String(i).padStart(2, '0')}.png`;
    await page.screenshot({ path: join(OUT, name) });
    shots.push(name);
  }
  await ctx.close();
}

console.log('capturing…');
await deck('desktop-pl', { width: 1440, height: 900 }, 'pl', 20);
await deck('desktop-de', { width: 1440, height: 900 }, 'de', 12);
await deck('mobile-pl', { width: 390, height: 844 }, 'pl', 16);
await deck('tablet-pl', { width: 820, height: 1180 }, 'pl', 10);

/* the demo mid-flow, which a scroll deck never reaches */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  await page.evaluate(() => document.querySelector('#demo').scrollIntoView({ behavior: 'instant' }));
  await page.click('#btn-sample'); await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, 'demo-1-input.png') });
  await page.click('#btn-to-map'); await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, 'demo-2-map.png') });
  await page.click('#btn-to-check'); await page.waitForTimeout(1300);
  await page.screenshot({ path: join(OUT, 'demo-3-checks.png') });
  await page.click('#btn-to-preview'); await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, 'demo-4-preview.png') });
  await page.click('.ptab[data-view="xml"]'); await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, 'demo-5-xml.png') });
  await page.click('#btn-to-send'); await page.waitForTimeout(4200);
  await page.screenshot({ path: join(OUT, 'demo-6-filed.png') });
  await page.evaluate(() => { localStorage.setItem('sp_runs', '5'); });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1600);
  await page.evaluate(() => document.querySelector('#demo').scrollIntoView({ behavior: 'instant' }));
  await page.click('#btn-sample'); await page.waitForTimeout(300);
  await page.click('#btn-to-map'); await page.waitForTimeout(250);
  await page.click('#btn-to-check'); await page.waitForTimeout(1200);
  await page.click('#btn-to-preview'); await page.waitForTimeout(300);
  await page.click('#btn-to-send'); await page.waitForTimeout(700);
  await page.screenshot({ path: join(OUT, 'demo-7-gate.png') });
  await ctx.close();
}

/* the rig, beat by beat */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  const box = await page.evaluate(() => {
    const s = document.querySelector('#rig-sec');
    return { top: s.offsetTop, height: s.offsetHeight };
  });
  const marks = [0.02, 0.16, 0.30, 0.42, 0.52, 0.63, 0.74, 0.86, 0.96];
  for (let i = 0; i < marks.length; i++) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), box.top + box.height * marks[i]);
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(OUT, `rig-${String(i).padStart(2, '0')}.png`) });
  }
  await ctx.close();
}

/* the mobile menu and the legal pages */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  await page.click('#burger'); await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, 'mobile-menu.png') });
  await ctx.close();
}
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  for (const p of ['privacy.html', 'terms.html', 'cookies.html', '404.html']) {
    await page.goto(`${BASE}/${p}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(OUT, `page-${p.replace('.html', '')}.png`), fullPage: p === '404.html' ? false : false });
  }
  await ctx.close();
}

await browser.close();
server.close();
console.log(`wrote ${shots.length + 18} frames to tests/artifacts/`);
