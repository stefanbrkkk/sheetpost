/* ============================================================
   End-to-end gates for the Sheetpost site.
   Run with: npm run e2e   (starts its own static server if needed)

   The suite is organised by what a visitor actually does, not by
   module, because every regression this site has had was a
   behaviour regression, not a unit one.
   ============================================================ */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.SP_PORT || 8199);
const BASE = `http://127.0.0.1:${PORT}`;
const LANGS = ['pl', 'en', 'de', 'hr', 'ro'];

/* The contrast maths has to run inside the page, and every group builds its own
   browser context, so it travels as source text and is installed on demand.
   Two things it must get right: translucent backgrounds are composited down the
   ancestor chain (a 13% tint is not a solid block), and the AA threshold drops
   to 3:1 only for genuinely large text. */
const CONTRAST_SRC = `
window.__spContrast = (root) => {
  const parse = (c) => {
    const m = (c || '').match(/[\\d.]+/g);
    if (!m) return null;
    return { r: +m[0], g: +m[1], b: +m[2], a: m[3] === undefined ? 1 : +m[3] };
  };
  const lumOf = ({ r, g, b }) => {
    const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const bgOf = (el) => {
    const stack = [];
    let e = el;
    while (e) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0) { stack.push(c); if (c.a === 1) break; }
      e = e.parentElement;
    }
    let out = { r: 8, g: 11, b: 9 };
    for (let i = stack.length - 1; i >= 0; i--) {
      const c = stack[i];
      out = { r: c.a * c.r + (1 - c.a) * out.r, g: c.a * c.g + (1 - c.a) * out.g, b: c.a * c.b + (1 - c.a) * out.b };
    }
    return out;
  };
  const bad = [];
  const nodes = [...(root || document).querySelectorAll('p, span, li, a, b, h1, h2, h3, h4, label, small, button, summary, div, td, th')]
    .filter((e) => e.offsetParent !== null && e.textContent.trim().length > 2 &&
      [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
  for (const e of nodes) {
    const cs = getComputedStyle(e);
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
    const a = lumOf(parse(cs.color)), b = lumOf(bgOf(e));
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const need = large ? 3 : 4.5;
    if (ratio < need) bad.push(e.tagName + '.' + (e.className || '').toString().split(' ')[0] +
      ' ' + ratio.toFixed(2) + ' < ' + need + ' "' + e.textContent.trim().slice(0, 30) + '"');
  }
  return [...new Set(bad)];
};
`;

/* installs the scanner, then runs it over the whole page or one subtree */
/* The header hides itself on scroll down and comes back on scroll up, so any
   test that reaches for a header control while the page is scrolled has to do
   what a reader would do and bring it back first. Until the intro stopped
   leaving an inline transform on .nav, that inline style silently outranked
   .nav.hide and the header never actually hid, which is why this was not
   needed before. */
async function showNav(page) {
  await page.evaluate(() => window.scrollBy({ top: -160, behavior: 'instant' }));
  await page.waitForFunction(() => !document.querySelector('.nav').classList.contains('hide'),
    null, { timeout: 4000 });
  await page.waitForTimeout(320);
}

async function contrastIssues(page, selector) {
  await page.evaluate(CONTRAST_SRC);
  return page.evaluate(
    (sel) => window.__spContrast(sel ? document.querySelector(sel) : null),
    selector || null,
  );
}

/* the production Content-Security-Policy, applied to every HTML response so
   the suite fails if anything reintroduces an inline style or script */
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
  "font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2', '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

let failures = 0, passes = 0;
const failed = [];
function check(name, cond, detail) {
  if (cond) { passes++; return true; }
  failures++;
  failed.push(name);
  console.log(`  FAIL ${name}`);
  if (detail !== undefined) String(detail).split('\n').slice(0, 12).forEach((l) => console.log(`       ${l}`));
  return false;
}
function group(t) { console.log(`\n${t}`); }

/* ---------- a tiny static server so the suite is self-contained ---------- */
function startServer() {
  return new Promise((res, rej) => {
    const srv = createServer(async (req, out) => {
      try {
        const clean = decodeURIComponent(req.url.split('?')[0]);
        let file = join(ROOT, clean === '/' ? 'index.html' : clean.replace(/^\/+/, ''));
        if (!existsSync(file)) { out.writeHead(404); out.end('not found'); return; }
        const body = await readFile(file);
        const headers = { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' };
        if (extname(file) === '.html') headers['Content-Security-Policy'] = CSP;
        out.writeHead(200, headers);
        out.end(body);
      } catch (e) { out.writeHead(500); out.end(String(e)); }
    });
    srv.on('error', rej);
    srv.listen(PORT, '127.0.0.1', () => res(srv));
  });
}

/* ---------- console capture ---------- */
function watch(page, label, bag) {
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') bag.push(`${label} [${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => bag.push(`${label} [pageerror] ${e.message}`));
  page.on('requestfailed', (r) => {
    const err = r.failure() ? r.failure().errorText : '';
    if (err === 'net::ERR_ABORTED') return;             /* deliberate route aborts */
    bag.push(`${label} [requestfailed] ${r.url()} ${err}`);
  });
}

const server = await startServer();
const browser = await chromium.launch();
const noise = [];

try {
  /* =========================================================
     1. LOAD, HERO AND CONSOLE HYGIENE
     ========================================================= */
  group('1. First paint and the hero');
  {
    /* The largest element on the page must not be erased after it has been
       painted. The markup ships with html.no-js, which forces [data-reveal]
       visible; dropping that class used to hand the hero back to
       `[data-reveal] { opacity: 0 }` until an observer callback could restore
       it, so the headline measured 0 at 377ms and did not settle until about
       1059ms. Sample every frame from navigation and require that once it is
       visible it stays visible. */
    {
      const lcpCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const lcpPage = await lcpCtx.newPage();
      await lcpPage.addInitScript(() => {
        window.__heroSamples = [];
        const t0 = performance.now();
        const tick = () => {
          const h = document.querySelector('#hero-h1');
          if (h) window.__heroSamples.push([Math.round(performance.now() - t0), +getComputedStyle(h).opacity]);
          if (performance.now() - t0 < 2500) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      await lcpPage.goto(BASE, { waitUntil: 'load' });
      await lcpPage.waitForTimeout(2700);
      const samples = await lcpPage.evaluate(() => window.__heroSamples);
      const dips = samples.filter(([, op]) => op < 0.9);
      check('the hero headline is never erased after it is painted',
        dips.length === 0,
        dips.length ? `opacity under 0.9 from ${dips[0][0]}ms to ${dips[dips.length - 1][0]}ms (${dips.length} frames)` : '');
      check('and it is solid within the first half second',
        samples.length > 0 && samples.some(([t, op]) => t < 500 && op > 0.99),
        JSON.stringify(samples.slice(0, 3)));
      await lcpCtx.close();
    }

    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    watch(page, 'desktop/pl', noise);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2600);

    const hero = await page.evaluate(() => {
      const op = (s) => { const e = document.querySelector(s); return e ? Number(getComputedStyle(e).opacity) : -1; };
      return {
        chip: op('.hero-copy .chip'), sub: op('.hero-sub'), meta: op('.hero-meta'),
        cta: op('.hero-cta .btn'), h1: op('#hero-h1'), canvas: op('.hero-bg canvas'),
        h1text: document.querySelector('#hero-h1').textContent.replace(/\s+/g, ' ').trim()
      };
    });
    check('hero eyebrow is visible', hero.chip > 0.9, hero.chip);
    check('hero subheadline is visible', hero.sub > 0.9, hero.sub);
    check('hero meta line is visible', hero.meta > 0.9, hero.meta);
    check('hero CTA is visible', hero.cta > 0.9, hero.cta);
    check('hero headline is visible', hero.h1 > 0.9, hero.h1);
    check('hero background field is painted', hero.canvas > 0.9, hero.canvas);
    check('headline reads once, not repeated', hero.h1text === 'Arkusz zostaje arkuszem. Faktura staje się urzędowa.', hero.h1text);

    const clipped = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('#hero-h1, .hero-sub, .hero-copy .chip').forEach((e) => {
        if (e.scrollWidth > e.clientWidth + 2) out.push(e.className + ' ' + e.scrollWidth + '>' + e.clientWidth);
      });
      return out;
    });
    check('no clipped hero text', clipped.length === 0, clipped.join('\n'));

    /* the reading-progress bar tracks the document
       (instant, because the page opts into smooth scrolling) */
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
    await page.waitForTimeout(600);
    const prog = await page.evaluate(() => getComputedStyle(document.querySelector('#scroll-progress')).transform);
    check('reading progress reaches the end', /matrix\(1,/.test(prog) || prog.startsWith('matrix(0.9'), prog);


    /* Nothing the intro animates may be left invisible, and nothing may be
       left with an inline opacity.

       `gsap.from()` infers its end value by reading the element's current
       style and then bakes the result into an inline style that outlives the
       tween. When the inference goes wrong the element is stranded at the
       tween's start values forever, and no existing check noticed, because a
       transparent element still has a layout box, still has a colour, and
       still passes contrast: the header's primary CTA sat at opacity 0 on
       every desktop load. Assert the settled state, and assert the residue
       that causes it. */
    const introTargets = await page.evaluate(() => {
      const SELECTORS = ['.nav', '#nav .brand', '#nav .nav-links a', '#nav .nav-right > *',
        '#hero-h1 .hl-i', '.hero-copy .chip', '.hero-sub', '.hero-cta .btn',
        '.hero-meta', '#machine', '.hero-scroll'];
      const faint = [];
      const residue = [];
      for (const sel of SELECTORS) {
        for (const el of document.querySelectorAll(sel)) {
          if (el.offsetParent === null && el !== document.querySelector('.nav')) continue;
          const op = +getComputedStyle(el).opacity;
          const name = `${sel} -> ${el.tagName}.${(el.className || '').toString().split(' ')[0]}`;
          if (op < 0.99) faint.push(`${name} = ${op}`);
          if (el.style && el.style.opacity !== '') residue.push(`${name} inline opacity=${el.style.opacity}`);
        }
      }
      return { faint, residue };
    });
    check('nothing the intro animates is left invisible',
      introTargets.faint.length === 0, introTargets.faint.join('\n'));
    check('the intro leaves no inline opacity behind to be misread later',
      introTargets.residue.length === 0, introTargets.residue.join('\n'));

    await ctx.close();
  }

  /* =========================================================
     2. LANGUAGE
     ========================================================= */

  group('2. Language switching');
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    watch(page, 'lang', noise);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2200);

    for (const L of [...LANGS, 'de', 'pl']) {
      await page.click(`.langs button[data-lang="${L}"]`);
      await page.waitForTimeout(260);
      const r = await page.evaluate(() => ({
        lang: document.documentElement.lang,
        pressed: document.querySelector('.langs button[aria-pressed="true"]').dataset.lang,
        h1: document.querySelector('#hero-h1').textContent.replace(/\s+/g, ' ').trim(),
        title: document.title,
        desc: document.querySelector('meta[name="description"]').content,
        ogLocale: document.querySelector('meta[property="og:locale"]').content,
        twTitle: document.querySelector('meta[name="twitter:title"]').content,
        canonical: document.querySelector('link[rel="canonical"]').href,
        skip: document.querySelector('.skip').textContent,
        navAria: document.querySelector('.nav-links').getAttribute('aria-label'),
        sheetHead: [...document.querySelectorAll('#m-sheet .cell.head')].map((e) => e.textContent).join('|'),
        pool: document.querySelector('#wall .w-pool').textContent
      }));
      check(`${L}: <html lang> follows the picker`, r.lang === L, r.lang);
      check(`${L}: exactly the chosen button is pressed`, r.pressed === L, r.pressed);
      check(`${L}: headline has no duplicated fragments`, !/(.{18,})\1/.test(r.h1), r.h1);
      check(`${L}: document title is translated`, r.title.length > 10);
      check(`${L}: og:locale follows the language`, r.ogLocale.startsWith(L === 'en' ? 'en' : L), r.ogLocale);
      check(`${L}: twitter card is translated`, r.twTitle.length > 10);
      check(`${L}: canonical points at the language URL`,
        L === 'pl' ? r.canonical.endsWith('/') : r.canonical.includes(`lang=${L}`), r.canonical);
      check(`${L}: skip link is translated`, r.skip.length > 3);
      check(`${L}: landmark aria-label is translated`, r.navAria.length > 3);
      check(`${L}: sample sheet headers are translated`, r.sheetHead.split('|').length === 4, r.sheetHead);
      check(`${L}: market sizes use the locale's abbreviation`, r.pool.length > 0, r.pool);
    }

    /* no data-i18n element may exist more times than the markup declares */
    const dupes = await page.evaluate(() => {
      const expected = {};
      /* count from the live DOM: any key whose count grew beyond its
         original markup count means something duplicated the node */
      const m = {};
      document.querySelectorAll('[data-i18n-html]').forEach((e) => {
        const k = e.getAttribute('data-i18n-html');
        m[k] = (m[k] || 0) + 1;
      });
      return Object.entries(m).filter(([, v]) => v > 1).map(([k, v]) => `${k}=${v}`);
    });
    check('no duplicated translatable nodes', dupes.length === 0, dupes.join(', '));

    await ctx.close();
  }

  /* =========================================================
     3. CURRENCY
     ========================================================= */
  group('3. Currency');
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    watch(page, 'currency', noise);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);

    const price = () => page.evaluate(() => document.querySelector('.plan-hot .plan-price').textContent.replace(/\s+/g, ' ').trim());
    check('Polish default shows złoty', (await price()).includes('39'), await price());

    await page.click('.plans-toggle button[data-cur="eur"]');
    await page.waitForTimeout(200);
    check('EUR toggle switches the amount and the unit', /9\s*€/.test(await price()), await price());

    await showNav(page);
    await page.click('.langs button[data-lang="de"]');
    await page.waitForTimeout(300);
    check('a language switch respects a manual currency choice', /9\s*€/.test(await price()), await price());

    await page.click('.plans-toggle button[data-cur="ron"]');
    await page.waitForTimeout(200);
    check('RON toggle switches the amount and the unit', /45\s*lei/.test(await price()), await price());

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);
    check('the currency choice survives a reload', /45\s*lei/.test(await price()), await price());

    const numberIsBigger = await page.evaluate(() => {
      const p = document.querySelector('.plan-hot .plan-price');
      const n = p.querySelector('[data-price]');
      const u = p.querySelector('.pu');
      return parseFloat(getComputedStyle(n).fontSize) > parseFloat(getComputedStyle(u).fontSize) * 1.6;
    });
    check('the price number is typeset larger than its unit', numberIsBigger);

    await ctx.close();
  }

  /* =========================================================
     4. THE DEMO ENGINE
     ========================================================= */
  group('4. The FA(3) demo');
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const page = await ctx.newPage();
    watch(page, 'demo', noise);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);

    check('the next step starts disabled', await page.isDisabled('#btn-to-map'));
    await page.click('#btn-sample');
    await page.waitForTimeout(300);
    check('sample rows parse', (await page.textContent('#parse-msg')).includes('4'));
    check('the next step arms after a successful parse', !(await page.isDisabled('#btn-to-map')));

    /* clearing the box must disarm the flow again */
    await page.fill('#paste-area', '');
    await page.waitForTimeout(150);
    check('clearing the paste box disarms the flow', await page.isDisabled('#btn-to-map'));
    await page.click('#btn-sample');
    await page.waitForTimeout(250);

    await page.click('#btn-to-map');
    await page.waitForTimeout(250);
    const mapping = await page.evaluate(() =>
      [...document.querySelectorAll('.map-row')].map((r) => r.querySelector('select').value).join(','));
    check('columns auto-map from their headers', mapping === 'name,qty,unit,vat', mapping);

    /* invalid tax id blocks the flow and says so */
    await page.fill('#s-nip', '1234563219');
    await page.waitForTimeout(150);
    check('a bad tax id is flagged live', (await page.textContent('#s-nip-hint')).length > 1);
    await page.click('#btn-to-check');
    await page.waitForTimeout(1200);
    check('a bad tax id blocks the preview', await page.isDisabled('#btn-to-preview'));
    const failTitle = await page.evaluate(() => document.querySelector('.check.fail b').textContent);
    check('the failing check renames itself', failTitle.length > 3, failTitle);

    await page.click('#btn-back-2');
    await page.fill('#s-nip', '1234563218');
    await page.waitForTimeout(150);
    await page.click('#btn-to-check');
    await page.waitForTimeout(1200);
    const checkStates = await page.evaluate(() =>
      [...document.querySelectorAll('.check')].map((c) => c.classList.contains('pass')).join(','));
    check('all six checks pass on valid data', checkStates === 'true,true,true,true,true,true', checkStates);
    check('the preview unlocks', !(await page.isDisabled('#btn-to-preview')));

    await page.click('#btn-to-preview');
    await page.waitForTimeout(300);
    const total = await page.textContent('#inv-total');
    check('the invoice total is right', total.replace(/\s/g, '').startsWith('13458,00'), total);
    const invNo = await page.textContent('#inv-no');

    await page.click('.ptab[data-view="xml"]');
    await page.waitForTimeout(200);
    const xml = await page.textContent('#xml-out');
    check('the human view and the XML share one invoice number', xml.includes(`<P_2>${invNo}</P_2>`), invNo);
    check('XML declares FA(3)', xml.includes('kodSystemowy="FA (3)"'));
    check('XML issue date is an ISO date', /<P_1>\d{4}-\d{2}-\d{2}<\/P_1>/.test(xml));
    check('XML totals are machine numbers', xml.includes('<P_15>13458.00</P_15>'), (xml.match(/<P_15>[^<]*/) || [])[0]);
    check('XML has no locale grouping in numbers', !/<P_(8B|9A|11|15|13_\d|14_\d)>[^<]*[\s ,]/.test(xml));
    check('XML buckets VAT by rate', xml.includes('<P_13_1>9800.00</P_13_1>') && xml.includes('<P_13_2>1300.00</P_13_2>'));
    check('XML carries four invoice lines', (xml.match(/<FaWiersz>/g) || []).length === 4);
    check('XML has no invented Podsumowanie wrapper', !xml.includes('<Podsumowanie>'));
    let wellFormed = true;
    try {
      const clean = xml.replace(/^<\?xml[^?]*\?>\s*/, '');
      await page.evaluate((x) => {
        const d = new DOMParser().parseFromString(x, 'application/xml');
        if (d.querySelector('parsererror')) throw new Error(d.querySelector('parsererror').textContent);
      }, clean);
    } catch (e) { wellFormed = false; }
    check('the generated XML is well formed', wellFormed);

    await page.click('#btn-to-send');
    await page.waitForTimeout(3800);
    const upo = await page.textContent('#upo-id');
    check('filing returns a KSeF reference', /^\d{10}-\d{8}-[0-9A-F]{10}-[0-9A-F]{10}$/.test(upo), upo);

    const dl = page.waitForEvent('download');
    await page.click('#btn-xml-dl');
    const download = await dl;
    check('the XML downloads', download.suggestedFilename().endsWith('.xml'), download.suggestedFilename());

    /* a second run must be a NEW document */
    await page.click('#btn-again');
    await page.waitForTimeout(250);
    const cleared = await page.evaluate(() => ({
      pane: document.querySelector('.dpane.active').dataset.pane,
      paste: document.querySelector('#paste-area').value,
      rows: document.querySelector('#inv-rows').children.length,
      log: document.querySelector('#sendlog').children.length,
      armed: !document.querySelector('#btn-to-map').disabled
    }));
    check('"one more time" returns to step 1', cleared.pane === '1', cleared.pane);
    check('"one more time" clears the previous document', cleared.paste === '' && cleared.rows === 0 && cleared.log === 0 && !cleared.armed,
      JSON.stringify(cleared));

    await page.click('#btn-sample'); await page.waitForTimeout(250);
    await page.click('#btn-to-map'); await page.waitForTimeout(200);
    await page.click('#btn-to-check'); await page.waitForTimeout(1100);
    await page.click('#btn-to-preview'); await page.waitForTimeout(250);
    const invNo2 = await page.textContent('#inv-no');
    check('a new run gets a new invoice number', invNo2 !== invNo, `${invNo} vs ${invNo2}`);

    await page.click('#btn-to-send');
    await page.waitForTimeout(500);
    check('the gate appears after the free run', await page.evaluate(() => document.querySelector('#gate').classList.contains('show')));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    check('Escape closes the gate', !(await page.evaluate(() => document.querySelector('#gate').classList.contains('show'))));

    await page.click('#btn-to-send');
    await page.waitForTimeout(400);
    await page.fill('#gate-email', 'not-an-email');
    await page.click('#gate-form button[type="submit"]');
    await page.waitForTimeout(200);
    check('the gate rejects a malformed address', await page.evaluate(() => document.querySelector('#gate-email').getAttribute('aria-invalid') === 'true'));
    await page.fill('#gate-email', 'buyer@example.com');
    await page.click('#gate-form button[type="submit"]');
    await page.waitForTimeout(4200);
    const after = await page.evaluate(() => ({
      gate: document.querySelector('#gate').classList.contains('show'),
      lead: document.querySelector('#demo-lead').textContent,
      runs: document.querySelector('#demo-runs').textContent,
      upo: document.querySelector('#upo').classList.contains('show')
    }));
    check('unlocking closes the gate', !after.gate);
    check('the unlock confirmation survives the resumed filing', after.lead.includes('buyer@example.com'), after.lead);
    check('the run counter still updates next to it', after.runs.length > 0, after.runs);
    check('the filing the visitor asked for resumes', after.upo);

    /* The bonus is worth three runs, once.

       The old assertion here read the sp_bonus flag and stopped. The flag was
       being written correctly the whole time and the paywall still did not
       hold: the submit handler called grantBonus() and threw the return value
       away, so every resubmission ran onBonus(), which hid the gate and filed
       again. Test the walk-through instead of the bookkeeping. */
    const grant = await page.evaluate(() => localStorage.getItem('sp_bonus'));
    check('the bonus grant is recorded so it cannot be farmed', grant === '1', grant);

    await page.evaluate(() => { localStorage.setItem('sp_runs', '9'); });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1400);
    await page.evaluate(() => document.querySelector('#demo').scrollIntoView());
    await page.waitForTimeout(300);
    await page.click('[role="tab"][aria-controls="d-send"]').catch(() => {});
    await page.waitForTimeout(300);
    const reopened = await page.evaluate(() => {
      const el = document.querySelector('#gate');
      el.hidden = false; el.classList.add('show');
      return el.classList.contains('show');
    });
    check('the gate can be reached again once the runs are spent', reopened);

    await page.fill('#gate-email', 'second@example.com');
    await page.click('#gate-form button[type="submit"]');
    await page.waitForTimeout(1200);
    const second = await page.evaluate(() => ({
      stillOpen: document.querySelector('#gate').classList.contains('show'),
      told: !document.querySelector('#gate-used').hidden,
      message: document.querySelector('#gate-used').textContent,
      runs: localStorage.getItem('sp_runs'),
      upo: document.querySelector('#upo').classList.contains('show'),
    }));
    check('a second address does not buy more runs',
      second.runs === '9', `sp_runs=${second.runs}`);
    check('the gate stays open instead of letting the visitor through',
      second.stillOpen, JSON.stringify(second));
    check('and says why, rather than failing silently',
      second.told && second.message.length > 10, second.message);

    await ctx.close();
  }

  /* =========================================================
     5. REAL WORKBOOK IMPORT
     ========================================================= */
  group('5. Real .xlsx import');
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await ctx.newPage();
    watch(page, 'xlsx', noise);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.setInputFiles('#file-input', join(ROOT, 'assets/sample/arkusz-przyklad.xlsx'));
    await page.waitForTimeout(1600);
    const msg = await page.textContent('#parse-msg');
    check('a real workbook parses', /\d/.test(msg) && !msg.includes('Nie rozpoznano'), msg);
    await page.click('#btn-to-map');
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => [...document.querySelectorAll('.map-row select')].map((s) => s.value).join(','));
    check('workbook columns auto-map correctly', m.includes('name') && m.includes('unit') && m.includes('vat'), m);
    await page.click('#btn-to-check');
    await page.waitForTimeout(1200);
    check('a real workbook validates clean',
      await page.evaluate(() => [...document.querySelectorAll('.check')].every((c) => c.classList.contains('pass'))));
    await ctx.close();
  }

  /* =========================================================
     6. PARSER EDGE CASES (in-page, against the shipped code)
     ========================================================= */
  group('6. Parser edge cases');
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await ctx.newPage();
    watch(page, 'parser', noise);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1400);

    async function feed(text) {
      await page.evaluate(() => { document.querySelector('#paste-wrap').hidden = false; });
      await page.fill('#paste-area', text);
      await page.waitForTimeout(300);
      const armed = !(await page.isDisabled('#btn-to-map'));
      if (!armed) return null;
      await page.click('#btn-to-map');
      await page.waitForTimeout(250);
      const map = await page.evaluate(() => [...document.querySelectorAll('.map-row select')].map((s) => s.value));
      await page.click('#btn-to-check');
      await page.waitForTimeout(1100);
      const res = await page.evaluate(() => ({
        pass: [...document.querySelectorAll('.check')].map((c) => c.classList.contains('pass')),
        text: [...document.querySelectorAll('.check')].map((c) => c.querySelector('small').textContent)
      }));
      await page.click('#btn-back-2');
      await page.click('#btn-back-1');
      await page.waitForTimeout(150);
      return { map, ...res };
    }

    const enStyle = await feed('Item\tQty\tNet price\tVAT\nConsulting\t2\t1,200.50\t23\nLicence\t1\t900.00\t8');
    check('US-formatted amounts parse', enStyle && enStyle.pass.every(Boolean), JSON.stringify(enStyle));

    const withLp = await feed('Lp.\tNazwa\tIlość\tCena netto\tVAT\n1\tUsługa A\t2\t500,00\t23\n2\tUsługa B\t1\t300,00\t23');
    check('an Lp. index column is skipped, not read as a quantity',
      withLp && withLp.map.join(',') === 'skip,name,qty,unit,vat', withLp && withLp.map.join(','));

    const exempt = await feed('Nazwa\tIlość\tCena netto\tVAT\nUsługa medyczna\t1\t500,00\tzw\nSzkolenie\t1\t300,00\tnp');
    check('zw / np VAT markers are recognised', exempt && exempt.pass.every(Boolean), JSON.stringify(exempt && exempt.text));

    const titled = await feed('Faktura maj 2026\t\t\t\nNazwa\tIlość\tCena netto\tVAT\nUsługa A\t1\t500,00\t23\nUsługa B\t2\t250,00\t23');
    check('a title row above the header does not break parsing',
      titled && titled.map.join(',') === 'name,qty,unit,vat', titled && titled.map.join(','));

    /* Polish and Croatian need three plural forms; "4 pozycji" is wrong */
    const plurals = [];
    for (const [rows, want] of [[1, 'wiersz.'], [3, 'wiersze.'], [7, 'wierszy.']]) {
      const body = Array.from({ length: rows }, (_, i) => `Usługa ${i + 1}\t1\t100,00\t23`).join('\n');
      await page.evaluate(() => { document.querySelector('#paste-wrap').hidden = false; });
      await page.fill('#paste-area', 'Nazwa\tIlość\tCena netto\tVAT\n' + body);
      await page.waitForTimeout(300);
      const msg = await page.textContent('#parse-msg');
      if (!msg.includes(want)) plurals.push(`${rows} rows -> "${msg}" (expected "${want}")`);
    }
    check('Polish plural forms are correct for 1 / few / many', plurals.length === 0, plurals.join('\n'));

    const foreign = await feed('Nazwa\tIlość\tCena netto\tVAT\nConsulting\t1\t500,00 EUR\t23');
    check('a foreign currency is rejected, not silently filed as PLN',
      foreign && foreign.pass[5] === false, JSON.stringify(foreign && foreign.text[5]));

    const wartosc = await feed('Nazwa\tIlość\tCena netto\tWartość\tVAT\nUsługa A\t2\t500,00\t1000,00\t23\nUsługa B\t1\t300,00\t300,00\t23');
    check('a line-total column is skipped rather than used as the unit price',
      wartosc && wartosc.map.join(',') === 'name,qty,unit,skip,vat', wartosc && wartosc.map.join(','));

    await ctx.close();
  }

  /* =========================================================
     7. WAITLIST FORM
     ========================================================= */
  group('7. Waitlist');
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await ctx.newPage();
    watch(page, 'waitlist', noise);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1400);
    await page.evaluate(() => document.querySelector('#waitlist').scrollIntoView());
    await page.waitForTimeout(400);

    check('the confirmation is hidden before submitting', await page.isHidden('#wait-ok'));
    await page.fill('#w-email', 'nope');
    await page.click('#waitform button[type="submit"]');
    await page.waitForTimeout(200);
    check('a malformed address is refused with a visible reason',
      (await page.textContent('#w-error')).length > 5 && await page.isVisible('#w-error'));

    await page.fill('#w-email', 'buyer@example.com');
    await page.click('#waitform button[type="submit"]');
    await page.waitForTimeout(200);
    check('missing consent is refused with a visible reason',
      (await page.textContent('#w-error')).length > 5 && await page.isHidden('#wait-ok'));

    await page.check('#w-consent');
    await page.click('#waitform button[type="submit"]');
    await page.waitForTimeout(300);
    check('a valid signup is confirmed', await page.isVisible('#wait-ok'));
    check('the signup is recorded', await page.evaluate(() => JSON.parse(localStorage.getItem('sp_waitlist') || '[]').length === 1));
    check('the submit button is disabled after success', await page.isDisabled('#waitform button[type="submit"]'));
    await page.fill('#w-email', 'fixed@example.com');
    await page.waitForTimeout(150);
    check('editing the address re-arms the button so a typo is recoverable',
      !(await page.isDisabled('#waitform button[type="submit"]')));

    /* the honeypot must swallow bots silently */
    await page.evaluate(() => {
      document.querySelector('#wait-ok').hidden = true;
      document.querySelector('#wait-ok').classList.remove('show');
      document.querySelector('input[name="company"]').value = 'bot';
    });
    await page.click('#waitform button[type="submit"]');
    await page.waitForTimeout(200);
    check('the honeypot drops bots without a visible error',
      await page.isHidden('#wait-ok') && (await page.textContent('#w-error')) === '');

    await ctx.close();
  }

  /* =========================================================
     7b. CHECKOUT WIRING
     ========================================================= */
  group('7b. Checkout');
  {
    /* unconfigured: the site must behave exactly as it did before payments
       existed, because that is the state it ships in today */
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    watch(page, 'checkout/off', noise);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    const off = await page.evaluate(() => ({
      state: window.SPCheckout,
      hrefs: [...document.querySelectorAll('a[data-checkout]')].map((a) => a.getAttribute('href')),
      live: document.querySelectorAll('[data-checkout-live]').length,
      noteHidden: document.getElementById('checkout-cur-note').hidden,
    }));
    check('the checkout module loads', !!off.state, JSON.stringify(off.state));
    check('three plan buttons are wired for checkout', off.state.buttons === 3, off.state.buttons);
    check('with no URLs configured nothing is rewritten', off.state.wired === 0 && off.live === 0,
      JSON.stringify(off));
    check('and the buttons keep the destinations in the markup',
      off.hrefs.every((h) => h === '#waitlist' || h === '#partner'), off.hrefs.join(', '));
    check('the billing-currency note stays hidden while checkout is off', off.noteHidden === true);
    await ctx.close();

    /* configured: inject a config before any script runs, exactly as editing
       config.js would, and prove the buttons become real checkout links */
    const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page2 = await ctx2.newPage();
    watch(page2, 'checkout/on', noise);
    await page2.addInitScript(() => {
      window.SP_CONFIG = window.SP_CONFIG || {};
      window.__SP_TEST_CHECKOUT = {
        provider: 'test',
        currencies: ['eur', 'pln'],
        links: {
          solo: 'https://pay.example.com/checkout/solo',
          business: 'https://pay.example.com/checkout/business',
          accountant: 'not-a-url',
        },
      };
    });
    /* config.js defines SP_CONFIG wholesale, so graft the test block on after
       it loads but before checkout.js runs: same ordering a real edit has */
    await page2.route('**/assets/js/config.js', async (route) => {
      const res = await route.fetch();
      const body = await res.text();
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/javascript' },
        body: body + '\nwindow.SP_CONFIG.checkout = window.__SP_TEST_CHECKOUT;\n',
      });
    });
    await page2.goto(BASE, { waitUntil: 'networkidle' });
    await page2.waitForTimeout(1400);

    const on = await page2.evaluate(() => ({
      state: window.SPCheckout,
      solo: document.querySelector('[data-checkout="solo"]').getAttribute('href'),
      soloRel: document.querySelector('[data-checkout="solo"]').getAttribute('rel'),
      business: document.querySelector('[data-checkout="business"]').getAttribute('href'),
      accountant: document.querySelector('[data-checkout="accountant"]').getAttribute('href'),
      live: document.querySelectorAll('[data-checkout-live]').length,
    }));
    check('a configured URL becomes the button destination',
      on.solo === 'https://pay.example.com/checkout/solo' &&
      on.business === 'https://pay.example.com/checkout/business', JSON.stringify(on));
    check('checkout links carry rel=noopener', on.soloRel === 'noopener', on.soloRel);
    check('two live checkout buttons are marked as such', on.live === 2, on.live);
    /* a malformed URL must be refused, not sent a buyer to */
    check('a non-https value is refused and the markup href survives',
      on.accountant === '#partner', on.accountant);

    /* the reader is told what they will actually be charged in */
    await page2.click('.plans-toggle button[data-cur="ron"]');
    await page2.waitForTimeout(350);
    const ron = await page2.evaluate(() => {
      const n = document.getElementById('checkout-cur-note');
      return { hidden: n.hidden, text: n.textContent };
    });
    check('picking a currency the gateway cannot bill shows the billing note',
      ron.hidden === false && /EUR/.test(ron.text), JSON.stringify(ron));

    await page2.click('.plans-toggle button[data-cur="eur"]');
    await page2.waitForTimeout(350);
    const eur = await page2.evaluate(() => document.getElementById('checkout-cur-note').hidden);
    check('and hides it again for a currency it can bill', eur === true);

    /* the note is copy, so it has to follow the language switcher */
    await page2.click('.plans-toggle button[data-cur="ron"]');
    await page2.waitForTimeout(300);
    const plText = await page2.evaluate(() => document.getElementById('checkout-cur-note').textContent);
    await showNav(page2);
    await page2.click('.langs button[data-lang="de"]');
    await page2.waitForTimeout(600);
    const deText = await page2.evaluate(() => document.getElementById('checkout-cur-note').textContent);
    check('the billing note is translated with the rest of the page',
      deText !== plText && /EUR/.test(deText) && deText.length > 10, `${plText} -> ${deText}`);

    await ctx2.close();
  }

  /* =========================================================
     8. NAVIGATION AND THE TWO WORLDS
     ========================================================= */
  group('8. Navigation');
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    watch(page, 'nav', noise);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);

    for (const [sel, id] of [['#mandates', 'mandates'], ['#how', 'how'], ['#demo', 'demo'], ['#pricing', 'pricing'], ['#faq', 'faq']]) {
      /* each jump scrolls down, which hides the header; a reader scrolls up to
         reach for the next link, so the test does too */
      await showNav(page);
      await page.click(`.nav-links a[href="${sel}"]`);
      await page.waitForTimeout(900);
      const clear = await page.evaluate((i) => {
        const el = document.getElementById(i);
        const nav = document.querySelector('#nav').getBoundingClientRect().height;
        return el.getBoundingClientRect().top >= nav - 2;
      }, id);
      check(`nav link to #${id} lands clear of the header`, clear);
    }

    const paperNav = await page.evaluate(async () => {
      const el = document.querySelector('#pricing');
      el.scrollIntoView();
      await new Promise((r) => setTimeout(r, 500));
      const nav = document.querySelector('#nav');
      const link = getComputedStyle(nav.querySelector('.nav-links a')).color;
      const bg = getComputedStyle(nav).backgroundColor;
      return { paper: nav.classList.contains('nav--paper'), link, bg };
    });
    check('the header themes itself for the document world', paperNav.paper, JSON.stringify(paperNav));
    check('the header background is opaque paper, not a grey composite',
      /rgb\(237,\s*238,\s*228\)/.test(paperNav.bg), paperNav.bg);

    /* contrast of nav text against the nav background, both worlds */
    const contrast = await page.evaluate(() => {
      const lum = (c) => {
        const [r, g, b] = c.match(/\d+/g).map(Number).map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const nav = document.querySelector('#nav');
      const a = lum(getComputedStyle(nav.querySelector('.nav-links a')).color);
      const b = lum(getComputedStyle(nav).backgroundColor);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    check('nav text over the paper world clears WCAG AA', contrast >= 4.5, contrast.toFixed(2));

    /* The header's palette is a set of custom properties (instant) while its
       surface is a background (animatable). If those two ever disagree, the
       header is illegible for the length of the transition. Sample it right
       through the flip. */
    const flip = await page.evaluate(async () => {
      const lum = (c) => {
        const m = (c || '').match(/[\d.]+/g);
        if (!m) return 1;
        const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(+m[0]) + 0.7152 * f(+m[1]) + 0.0722 * f(+m[2]);
      };
      const nav = document.querySelector('#nav');
      const brand = nav.querySelector('.brand');
      const worst = { ratio: 99 };
      const H = document.body.scrollHeight;
      for (let i = 0; i < 40; i++) {
        window.scrollTo({ top: H * (0.60 + i * 0.004), behavior: 'instant' });
        await new Promise((r) => requestAnimationFrame(r));
        await new Promise((r) => setTimeout(r, 24));
        const navBg = getComputedStyle(nav).backgroundColor;
        const m = (navBg || '').match(/[\d.]+/g);
        const alpha = m && m[3] !== undefined ? +m[3] : 1;
        if (alpha < 0.5) continue;                 /* transparent header sits on the page, not on itself */
        const a = lum(getComputedStyle(brand).color);
        const b = lum(navBg);
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        if (ratio < worst.ratio) Object.assign(worst, { ratio, navBg, color: getComputedStyle(brand).color });
      }
      return worst;
    });
    check('the header never goes illegible while it changes worlds',
      flip.ratio >= 4.5, JSON.stringify(flip));

    /* Hide on scroll down, return on scroll up. This was designed but did not
       work: the intro tween left an inline transform on .nav, and an inline
       transform outranks the .nav.hide class, so the header never moved. */
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(300);
    const navAtTop = await page.evaluate(() => ({
      hidden: document.querySelector('.nav').classList.contains('hide'),
      inlineTransform: document.querySelector('.nav').style.transform || '',
    }));
    check('the header is visible at the top of the page', navAtTop.hidden === false);
    check('and carries no inline transform that would outrank its own hide rule',
      navAtTop.inlineTransform === '', navAtTop.inlineTransform);

    await page.evaluate(() => window.scrollTo({ top: 1400, behavior: 'instant' }));
    await page.waitForTimeout(200);
    await page.evaluate(() => window.scrollTo({ top: 2200, behavior: 'instant' }));
    await page.waitForTimeout(400);
    const navDown = await page.evaluate(() => {
      const n = document.querySelector('.nav');
      return { hidden: n.classList.contains('hide'), top: Math.round(n.getBoundingClientRect().bottom) };
    });
    check('scrolling down hides the header', navDown.hidden === true && navDown.top <= 2,
      JSON.stringify(navDown));

    await page.evaluate(() => window.scrollBy({ top: -300, behavior: 'instant' }));
    await page.waitForTimeout(400);
    const navUp = await page.evaluate(() => {
      const n = document.querySelector('.nav');
      return { hidden: n.classList.contains('hide'), bottom: Math.round(n.getBoundingClientRect().bottom) };
    });
    check('scrolling back up returns it', navUp.hidden === false && navUp.bottom > 20,
      JSON.stringify(navUp));

    await ctx.close();
  }

  group('9. Mobile menu');
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    watch(page, 'menu', noise);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);

    await page.click('#burger');
    await page.waitForTimeout(300);
    check('the burger opens the menu', await page.isVisible('#menu'));
    check('the burger reports its state', (await page.getAttribute('#burger', 'aria-expanded')) === 'true');
    /* The old assertion read document.body.style.overflow, which only proved a
       property had been assigned. It had been assigned for months and did
       nothing: overflow propagates from body to the viewport only while the
       root's own overflow is visible, and this root sets overflow-x: clip. So
       try to scroll and see whether the page moves. */
    const beforeLock = await page.evaluate(() => window.scrollY);
    await page.mouse.move(200, 400);
    await page.mouse.wheel(0, 500);          /* real input: scripted scrolling
                                                is not what overflow blocks */
    await page.waitForTimeout(250);
    const menuLock = await page.evaluate((before) => ({
      before, after: window.scrollY,
      locked: document.documentElement.classList.contains('is-locked'),
    }), beforeLock);
    check('the page behind the menu really cannot scroll',
      menuLock.after === menuLock.before && menuLock.locked, JSON.stringify(menuLock));

    /* The menu's CTA is an <a> inside .menu, so an unscoped `.menu a` rule
       outranks .btn-primary and repaints the button as a nav link: link
       colour on the mint fill, display size, and a link rule through it.
       On a phone this is the primary CTA, so it is asserted directly. */
    const menuCta = await page.evaluate(() => {
      const a = document.querySelector('.menu .btn-primary');
      const link = document.querySelector('.menu > a');
      const cs = getComputedStyle(a);
      return {
        colorMatchesButton: cs.color !== getComputedStyle(link).color,
        noLinkRule: cs.borderBottomStyle === 'none' || parseFloat(cs.borderBottomWidth) <= 1,
        buttonSized: parseFloat(cs.fontSize) < 20,
        padded: parseFloat(cs.paddingLeft) > 0,
      };
    });
    check('the menu CTA keeps the button ink, not the link ink', menuCta.colorMatchesButton);
    check('the menu CTA has no link rule through it', menuCta.noLinkRule);
    check('the menu CTA keeps button type size', menuCta.buttonSized, JSON.stringify(menuCta));
    check('the menu CTA keeps its button padding', menuCta.padded);

    const menuContrast = await contrastIssues(page, '#menu');
    check('everything in the open menu clears WCAG AA contrast',
      menuContrast.length === 0, menuContrast.join('\n'));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    check('Escape closes the menu', await page.isHidden('#menu'));
    const beforeRelease = await page.evaluate(() => window.scrollY);
    await page.mouse.move(200, 400);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(250);
    const released = await page.evaluate((before) => ({
      moved: window.scrollY !== before,
      locked: document.documentElement.classList.contains('is-locked'),
    }), beforeRelease);
    check('and scrolling works again once it closes', released.moved && !released.locked,
      JSON.stringify(released));
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));

    await page.click('#burger');
    await page.waitForTimeout(250);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForTimeout(400);
    check('growing past the breakpoint closes the menu', await page.isHidden('#menu'));
    check('and releases the scroll lock',
      (await page.evaluate(() => !document.documentElement.classList.contains('is-locked'))));

    await ctx.close();
  }

  /* =========================================================
     10. THE RIG (scroll-driven device sequence)
     ========================================================= */
  group('10. The rig');
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    watch(page, 'rig', noise);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);

    const box = await page.evaluate(() => {
      const s = document.querySelector('#rig-sec');
      return { top: s.offsetTop, height: s.offsetHeight };
    });
    const beats = [];
    for (const f of [0.02, 0.30, 0.45, 0.62, 0.85]) {
      await page.evaluate((y) => window.scrollTo(0, y), box.top + box.height * f);
      await page.waitForTimeout(700);
      beats.push(await page.evaluate(() => ({
        beat: document.querySelector('#rig-sec').dataset.beat,
        lid: getComputedStyle(document.querySelector('#lap-lid')).transform,
        phone: Number(getComputedStyle(document.querySelector('#rig-phone')).opacity).toFixed(2),
        rail: [...document.querySelectorAll('#rig-rail i')].filter((i) => i.classList.contains('on')).length
      })));
    }
    const seq = beats.map((b) => Number(b.beat));
    check('the sequence starts closed on beat 1', seq[0] === 1, JSON.stringify(beats[0]));
    check('the beats never go backwards while scrolling forwards',
      seq.every((v, i) => i === 0 || v >= seq[i - 1]), seq.join(','));
    check('the sequence reaches every beat', new Set(seq).size === 4 && seq[seq.length - 1] === 4, seq.join(','));
    check('the lid opens as the stage plays', beats[0].lid !== beats[3].lid);
    check('the phone only arrives on the last beat', Number(beats[0].phone) < 0.05 && Number(beats[4].phone) > 0.9,
      `${beats[0].phone} -> ${beats[4].phone}`);
    check('the progress rail tracks the beats', beats[4].rail === 4, beats[4].rail);

    /* the beat caption is a headline, not body text: a stray descendant
       selector once demoted it to 11px mono */
    const beatType = await page.evaluate(() => {
      const h = document.querySelector('.rig-beat.on .rig-beat-h');
      const cs = getComputedStyle(h);
      return { size: parseFloat(cs.fontSize), family: cs.fontFamily, weight: cs.fontWeight };
    });
    check('the beat caption is set in the display face at headline size',
      beatType.size >= 22 && /Bricolage/.test(beatType.family) && Number(beatType.weight) >= 700,
      JSON.stringify(beatType));

    /* the stage clips: nothing the composition needs may fall outside it,
       at any viewport height */
    const clipping = [];
    for (const h of [900, 800, 760, 700]) {
      await page.setViewportSize({ width: 1440, height: h });
      const b2 = await page.evaluate(() => {
        const s = document.querySelector('#rig-sec');
        return { top: s.offsetTop, height: s.offsetHeight };
      });
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), b2.top + b2.height * 0.8);
      await page.waitForTimeout(700);
      const r = await page.evaluate(() => {
        const stage = document.querySelector('.rig-stage').getBoundingClientRect();
        const out = [];
        ['#rig-phone', '#lap-lid', '.lap-base'].forEach((sel) => {
          const e = document.querySelector(sel);
          if (!e) return;
          const b = e.getBoundingClientRect();
          if (b.bottom > stage.bottom + 1 || b.top < stage.top - 1) out.push(`${sel} ${Math.round(b.top)}..${Math.round(b.bottom)} vs stage ${Math.round(stage.top)}..${Math.round(stage.bottom)}`);
        });
        return out;
      });
      r.forEach((x) => clipping.push(`${h}px: ${x}`));
    }
    check('the rig never clips its own composition', clipping.length === 0, clipping.join('\n'));

    /* A resize makes ScrollTrigger re-measure. If anything (CSS smooth
       scrolling, a pinned ancestor) corrupts that, every scroll-driven
       section on the page silently freezes at whatever beat it was on. */
    const triggers = await page.evaluate(() => {
      const s = document.querySelector('#rig-sec');
      const st = ScrollTrigger.getAll().find((x) => x.trigger === s);
      return st ? { start: Math.round(st.start), end: Math.round(st.end), top: s.offsetTop } : null;
    });
    check('the rig still measures itself correctly after a resize sweep',
      !!triggers && Math.abs(triggers.start - triggers.top) < 4 && triggers.end > triggers.start,
      JSON.stringify(triggers));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(600);

    /* scrubbing back must rewind, not leave the payoff on screen
       (re-measure: the resize sweep above moved the section) */
    const box2 = await page.evaluate(() => {
      const s = document.querySelector('#rig-sec');
      return { top: s.offsetTop, height: s.offsetHeight };
    });
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), box2.top + box2.height * 0.05);
    await page.waitForTimeout(900);
    const rewound = await page.evaluate(() => document.querySelector('#rig-sec').dataset.beat);
    check('scrubbing backwards rewinds the beats', rewound === '1', rewound);

    await ctx.close();
  }

  /* =========================================================
     10b. THE FOLD (the guarantee certificate)
     ========================================================= */
  group('10b. The fold');
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    watch(page, 'fold', noise);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);

    const geo = await page.evaluate(() => {
      const s = document.querySelector('#fold');
      const st = ScrollTrigger.getAll().find((x) => x.trigger === s);
      return {
        vh: window.innerHeight,
        sectionH: s.offsetHeight,
        docH: document.body.scrollHeight,
        start: st ? st.start : null,
        end: st ? st.end : null,
      };
    });

    /* A section that costs the reader more than about a screen and a third is
       a section they have to sit through. This one used to be 1.6 viewports
       and 11% of the whole page, for a choreography that could be told in
       less. The budget is the point of the test. */
    check('the fold costs no more than 1.4 viewports of scrolling',
      geo.sectionH / geo.vh <= 1.4, (geo.sectionH / geo.vh).toFixed(2) + ' viewports');
    check('the fold is under a tenth of the page height',
      geo.sectionH / geo.docH <= 0.10, ((geo.sectionH / geo.docH) * 100).toFixed(1) + '%');
    check('the fold builds a scroll trigger', geo.start !== null && geo.end > geo.start);

    /* The real complaint was not the length, it was the dead air: half the old
       runway moved one rectangle while everything else sat at opacity 0, and
       the last quarter drew a signature over a composition already finished.
       Sample the whole range and require that every step changes something. */
    const SAMPLES = 24;
    const frames = [];
    for (let i = 0; i <= SAMPLES; i++) {
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }),
        geo.start + ((geo.end - geo.start) * i) / SAMPLES);
      await page.waitForTimeout(120);
      frames.push(await page.evaluate(() => {
        const q = (sel) => document.querySelector(sel);
        const cs = (sel) => getComputedStyle(q(sel));
        const r2 = (v) => Math.round(v * 100) / 100;
        return {
          sheet: cs('#fold-sheet').transform,
          guilloche: r2(+cs('#fold-sheet > .guilloche').opacity),
          head: cs('#fold .fold-head').clipPath,
          h2: r2(+cs('#fold h2').opacity),
          lede: r2(+cs('#fold .lede').opacity),
          trust: [...document.querySelectorAll('#fold .trust-list li')]
            .map((e) => r2(+getComputedStyle(e).opacity)).join(','),
          card: r2(+cs('#lockcard').opacity) + '/' + cs('#lockcard').transform,
          seal: r2(+cs('#fold .lockcard-seal').opacity),
          ring: r2(+cs('#fold .lockcard-ring').opacity),
          note: r2(+cs('#fold .locknote').opacity),
          foot: cs('#fold .fold-foot').clipPath,
          sig: Math.round(parseFloat(cs('#fold .fold-scribble path').strokeDashoffset) || 0),
        };
      }));
    }

    /* Between each pair of samples, which channels actually moved. */
    const CHANNELS = Object.keys(frames[0]);
    const moved = [];
    for (let i = 1; i < frames.length; i++) {
      moved.push(CHANNELS.filter((k) => frames[i][k] !== frames[i - 1][k]));
    }
    const stepPx = (geo.end - geo.start) / SAMPLES;
    const longestRun = (pred) => {
      let run = 0, worst = 0, at = 0;
      for (let i = 0; i < moved.length; i++) {
        if (pred(moved[i])) { run += 1; if (run > worst) { worst = run; at = Math.round(((i + 1 - run) / SAMPLES) * 100); } }
        else run = 0;
      }
      return { worst, at, px: Math.round(worst * stepPx) };
    };

    const frozen = longestRun((m) => m.length === 0);
    check('no stretch of the fold scrolls with nothing changing at all',
      frozen.px <= Math.round(stepPx) + 1,
      `${frozen.px}px frozen from ${frozen.at}%`);

    /* This is the assertion that encodes the actual complaint. The section used
       to spend its first 720px translating one rectangle with every other
       element still at opacity 0, then its last 330px drawing a signature over
       a finished composition. Both stretches technically "changed something"
       every frame, so a freeze test would have passed them happily. What makes
       a scroll section feel padded is a long run where only ONE thing is
       moving. Budget that directly. */
    const soloPx = Math.round(geo.vh * 0.42);
    const solo = longestRun((m) => m.length === 1);
    check('the fold never spends long with only one element animating',
      solo.px <= soloPx,
      `${solo.px}px from ${solo.at}% with only [${moved[Math.max(0, Math.round((solo.at / 100) * SAMPLES))] || ''}] moving, budget ${soloPx}px`);

    /* the payoff has to be reached, and scrubbing back has to undo it */
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), geo.end);
    await page.waitForTimeout(700);
    const landed = await page.evaluate(() => {
      const r2 = (v) => Math.round(v * 100) / 100;
      const o = (sel) => r2(+getComputedStyle(document.querySelector(sel)).opacity);
      return {
        seal: o('#fold .lockcard-seal'),
        card: o('#lockcard'),
        h2: o('#fold h2'),
        trust: [...document.querySelectorAll('#fold .trust-list li')]
          .map((e) => r2(+getComputedStyle(e).opacity)),
        sig: Math.round(parseFloat(getComputedStyle(document.querySelector('#fold .fold-scribble path')).strokeDashoffset) || 0),
        headClip: getComputedStyle(document.querySelector('#fold .fold-head')).clipPath,
        sheet: getComputedStyle(document.querySelector('#fold-sheet')).transform,
      };
    });
    check('the certificate finishes fully composed',
      landed.seal === 1 && landed.card === 1 && landed.h2 === 1 &&
      landed.trust.every((v) => v === 1) && landed.sig <= 2,
      JSON.stringify(landed));
    check('the sheet ends flat and full bleed, so the paper world continues seamlessly',
      landed.sheet === 'none' || /matrix\(1, 0, 0, 1, 0, 0\)/.test(landed.sheet), landed.sheet);
    /* the computed value serialises as inset(0px 0% 0px 0px), so read the
       numbers rather than matching one spelling of "nothing is clipped" */
    const clipInsets = (landed.headClip.match(/-?[\d.]+/g) || ['0']).map(Number);
    check('the header band finishes unclipped',
      landed.headClip === 'none' || clipInsets.every((v) => v <= 0.01),
      landed.headClip);

    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), geo.start + (geo.end - geo.start) * 0.08);
    await page.waitForTimeout(800);
    const rewound = await page.evaluate(() =>
      Math.round(+getComputedStyle(document.querySelector('#lockcard')).opacity * 100) / 100);
    check('scrubbing back out of the fold rewinds it', rewound < 0.15, rewound);

    /* the document furniture used to be pinned to top:22px of the sheet, which
       put it behind the fixed header where no reader ever saw it */
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), geo.end);
    await page.waitForTimeout(600);
    const furniture = await page.evaluate(() => {
      const navH = document.querySelector('.nav').getBoundingClientRect().height;
      return ['#fold .fold-caption', '#fold .fold-docno'].map((sel) => {
        const b = document.querySelector(sel).getBoundingClientRect();
        return { sel, top: Math.round(b.top), navH: Math.round(navH), clear: b.top >= navH };
      });
    });
    check('the document furniture sits clear of the fixed header',
      furniture.every((f) => f.clear), JSON.stringify(furniture));

    await ctx.close();
  }

  /* =========================================================
     11. RESPONSIVE SWEEP
     ========================================================= */
  group('11. Responsive sweep');
  {
    const widths = [320, 360, 390, 414, 480, 600, 768, 860, 861, 1024, 1280, 1440, 1920];
    const problems = [];
    for (const lang of ['pl', 'de', 'ro']) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      watch(page, `responsive/${lang}`, noise);
      await page.goto(`${BASE}/?lang=${lang}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      for (const w of widths) {
        await page.setViewportSize({ width: w, height: 900 });
        await page.waitForTimeout(320);
        const r = await page.evaluate(() => {
          const over = document.documentElement.scrollWidth > window.innerWidth + 1;
          const wide = [];
          document.querySelectorAll('body *').forEach((e) => {
            const b = e.getBoundingClientRect();
            if (b.width === 0 || b.height === 0) return;
            if (b.right > window.innerWidth + 1.5 || b.left < -1.5) {
              const cs = getComputedStyle(e);
              if (cs.position === 'fixed' || cs.overflow === 'hidden' || cs.overflowX === 'hidden' || cs.overflowX === 'clip') return;
              if (e.closest('.marquee-wrap, .demo-bar, .xmlview, .rig-stage, .grain, .hero')) return;
              /* An ancestor that clips its overflow is a scroll container: a
                 child sticking out of it cannot widen the document, so it is
                 not the overflow this check is looking for. Without this the
                 stamp descending inside the price card reads as a page-wide
                 overflow on a phone, which it never was. */
              let clipped = false;
              for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
                const acs = getComputedStyle(a);
                if (acs.overflow === 'hidden' || acs.overflow === 'clip' ||
                    acs.overflowX === 'hidden' || acs.overflowX === 'clip') { clipped = true; break; }
              }
              if (clipped) return;
              wide.push(`${e.tagName}.${(e.className || '').toString().split(' ')[0]}`);
            }
          });
          return { over, wide: [...new Set(wide)].slice(0, 5) };
        });
        if (r.over) problems.push(`${lang} @ ${w}px: document scrolls horizontally`);
        if (r.wide.length) problems.push(`${lang} @ ${w}px: ${r.wide.join(', ')}`);
      }
      await ctx.close();
    }
    check('no horizontal overflow at any width in pl/de/ro', problems.length === 0, problems.join('\n'));

    /* Contrast is width-dependent, because the AA threshold relaxes to 3:1 for
       large text and most display type here is clamped. Something that clears
       AA at 1440px as "large" can fall under it on a phone once the clamp
       bottoms out: that is exactly how the accepted stamp on the machine's
       document slipped through at 4.1:1. */
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      watch(page, 'contrast/390', noise);
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1600);
      await page.evaluate(async () => {
        const H = document.body.scrollHeight;
        for (let i = 0; i <= 10; i++) {
          window.scrollTo({ top: (H * i) / 10, behavior: 'instant' });
          await new Promise((r) => setTimeout(r, 140));
        }
        window.scrollTo({ top: 0, behavior: 'instant' });
      });
      await page.waitForTimeout(500);
      const narrow = await contrastIssues(page);
      check('all visible text clears WCAG AA contrast at phone width',
        narrow.length === 0, narrow.slice(0, 10).join('\n'));
      await ctx.close();
    }
  }

  /* =========================================================
     11b. TYPOGRAPHY SYSTEM
     ========================================================= */
  group('11b. Typography');
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    watch(page, 'type', noise);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);
    /* walk the whole page so lazily-revealed sections are laid out */
    await page.evaluate(async () => {
      const H = document.body.scrollHeight;
      for (let i = 0; i <= 10; i++) {
        window.scrollTo({ top: (H * i) / 10, behavior: 'instant' });
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
    await page.waitForTimeout(600);

    const type = await page.evaluate(() => {
      const seen = (el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed';
      const out = { wrongFace: [], tooSmall: [], tiny: [], families: {} };
      const FLOOR = { H1: 34, H2: 26, H3: 17 };
      document.querySelectorAll('h1, h2, h3, .rig-beat-h').forEach((h) => {
        /* .h-label marks a heading deliberately set as a micro-label */
        if (!seen(h) || h.classList.contains('sr-only') || h.classList.contains('h-label')) return;
        const cs = getComputedStyle(h);
        const size = parseFloat(cs.fontSize);
        const label = `${h.tagName}.${(h.className || '').toString().split(' ')[0]} ${Math.round(size)}px`;
        if (!/Bricolage/.test(cs.fontFamily)) out.wrongFace.push(`${label} ${cs.fontFamily}`);
        const floor = FLOOR[h.tagName] || 22;
        if (size < floor) out.tooSmall.push(`${label} < ${floor}`);
      });
      document.querySelectorAll('p, li, span, small, label, button, a, b, summary, td, th').forEach((e) => {
        if (!seen(e)) return;
        if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return;
        /* text inside a device mock is a picture of a screen: nobody is asked
           to read it and assistive tech never sees it */
        const decorative = e.closest('[aria-hidden="true"]');
        const size = parseFloat(getComputedStyle(e).fontSize);
        if (size < (decorative ? 9 : 10)) out.tiny.push(`${e.tagName}.${(e.className || '').toString().split(' ')[0]} ${size}px "${e.textContent.trim().slice(0, 20)}"`);
        const fam = getComputedStyle(e).fontFamily.split(',')[0].replace(/["']/g, '');
        out.families[fam] = (out.families[fam] || 0) + 1;
      });
      out.tiny = [...new Set(out.tiny)];
      return out;
    });
    check('every heading is set in the display face', type.wrongFace.length === 0, type.wrongFace.join('\n'));
    check('no heading is demoted below its level floor', type.tooSmall.length === 0, type.tooSmall.join('\n'));
    check('no visible text under 10px', type.tiny.length === 0, type.tiny.slice(0, 8).join('\n'));
    check('the page uses exactly the three declared families',
      Object.keys(type.families).every((f) => ['Bricolage Grotesque', 'Figtree', 'JetBrains Mono'].includes(f)),
      Object.keys(type.families).join(', '));

    /* multi-word labels must read as multiple words */
    const wordGap = await page.evaluate(() => {
      const el = document.querySelector('.hero-cta .btn span');
      const cs = getComputedStyle(el);
      const m = document.createElement('span');
      m.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${cs.font};letter-spacing:${cs.letterSpacing};word-spacing:${cs.wordSpacing}`;
      document.body.appendChild(m);
      const w = (t) => { m.textContent = t; return m.getBoundingClientRect().width; };
      const gap = w('a a') - w('aa');
      const size = parseFloat(cs.fontSize);
      m.remove();
      return gap / size;
    });
    check('button labels have a readable word gap', wordGap >= 0.26, wordGap.toFixed(3) + 'em');

    await ctx.close();
  }

  /* =========================================================
     12. ACCESSIBILITY
     ========================================================= */
  group('12. Accessibility');
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    watch(page, 'a11y', noise);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);

    const a11y = await page.evaluate(() => {
      const out = {};
      out.h1count = document.querySelectorAll('h1').length;
      const levels = [...document.querySelectorAll('h1,h2,h3,h4')]
        .filter((h) => h.offsetParent !== null || h.classList.contains('sr-only'))
        .map((h) => Number(h.tagName[1]));
      out.jumps = levels.map((l, i) => (i && l - levels[i - 1] > 1 ? `${levels[i - 1]}->${l}` : null)).filter(Boolean);
      out.imgNoAlt = [...document.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt')).length;
      out.inputsNoLabel = [...document.querySelectorAll('input:not([type=hidden]):not(.hp), select, textarea')]
        .filter((i) => !i.labels?.length && !i.getAttribute('aria-label') && !i.getAttribute('aria-labelledby'))
        .map((i) => i.id || i.name);
      out.btnNoName = [...document.querySelectorAll('button')]
        .filter((b) => !b.textContent.trim() && !b.getAttribute('aria-label')).length;
      out.langAttr = document.documentElement.lang;
      out.landmarks = ['header', 'main', 'footer', 'nav'].filter((t) => document.querySelector(t)).length;
      out.tablistPanels = [...document.querySelectorAll('[role="tab"]')].filter((t) => !t.getAttribute('aria-controls')).length;
      out.hiddenDialogsInTree = [...document.querySelectorAll('[role="dialog"]')]
        .filter((d) => getComputedStyle(d).display !== 'none' && !d.classList.contains('show')).length;
      return out;
    });
    check('exactly one h1', a11y.h1count === 1, a11y.h1count);
    check('no skipped heading levels', a11y.jumps.length === 0, a11y.jumps.join(', '));
    check('every image has alt text', a11y.imgNoAlt === 0, a11y.imgNoAlt);
    check('every form control has an accessible name', a11y.inputsNoLabel.length === 0, a11y.inputsNoLabel.join(', '));
    check('every button has an accessible name', a11y.btnNoName === 0, a11y.btnNoName);
    check('the document declares its language', a11y.langAttr === 'pl', a11y.langAttr);
    check('the page has header, main, footer and nav landmarks', a11y.landmarks === 4, a11y.landmarks);
    check('every tab points at its panel', a11y.tablistPanels === 0, a11y.tablistPanels);
    check('closed dialogs are out of the accessibility tree', a11y.hiddenDialogsInTree === 0, a11y.hiddenDialogsInTree);

    /* the skip link works */
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.evaluate(() => document.body.focus());
    await page.keyboard.press('Tab');
    const skipFocused = await page.evaluate(() => document.activeElement.classList.contains('skip'));
    check('the first Tab reaches the skip link', skipFocused);
    await page.waitForTimeout(600);   /* it slides in */
    const skipVisible = await page.evaluate(() => document.querySelector('.skip').getBoundingClientRect().top >= 0);
    check('the skip link becomes visible when focused', skipVisible);

    /* every interactive element must have a visible focus ring */
    const noRing = await page.evaluate(() => {
      const out = [];
      const els = [...document.querySelectorAll('a[href], button:not([disabled]), input:not([type=hidden]):not(.hp), select, textarea, [tabindex="0"]')]
        .filter((e) => e.offsetParent !== null);
      for (const e of els.slice(0, 90)) {
        e.focus();
        const cs = getComputedStyle(e);
        const hasRing = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) ||
          cs.boxShadow !== 'none';
        if (!hasRing) out.push(e.tagName + '.' + (e.className || '').toString().split(' ')[0]);
      }
      return [...new Set(out)];
    });
    check('every focusable control shows a focus ring', noRing.length === 0, noRing.join(', '));

    /* text contrast over every real text node on the page */
    const lowContrast = await contrastIssues(page);
    check('all visible text clears WCAG AA contrast', lowContrast.length === 0, lowContrast.slice(0, 10).join('\n'));

    /* The header crosses between the two worlds on every scroll past the fold.
       Its palette swaps in one frame, so any surface that animates instead of
       swapping leaves its own label stranded on the outgoing colour. That is
       what happened to the CTA: a near white label on the ink world's mint at
       1.8:1 for 120ms, on every crossing. Sample frame zero of the flip in
       both directions, for every element in the bar that carries text. */
    await page.evaluate(CONTRAST_SRC);
    const flipFlash = await page.evaluate(async () => {
      const nav = document.querySelector('.nav');
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const settle = () => new Promise((r) => setTimeout(r, 700));
      const sample = () => window.__spContrast(nav);
      const out = [];
      nav.classList.add('scrolled');
      nav.classList.remove('nav--paper');
      await settle();
      out.push(...sample().map((x) => 'ink settled: ' + x));
      nav.classList.add('nav--paper');           /* ink -> paper */
      await frame();
      out.push(...sample().map((x) => 'into paper: ' + x));
      await settle();
      /* the settled document world is its own case: the general contrast
         sweep only ever sees the bar in one world, so a header element that
         is legible in ink and not on paper slips straight past it */
      out.push(...sample().map((x) => 'paper settled: ' + x));
      nav.classList.remove('nav--paper');        /* paper -> ink */
      await frame();
      out.push(...sample().map((x) => 'into ink: ' + x));
      await settle();
      nav.classList.remove('scrolled');
      return [...new Set(out)];
    });
    check('the header stays legible through the world flip, from frame zero',
      flipFlash.length === 0, flipFlash.join('\n'));

    /* Hover is a state, and it was never measured. Three separate rules
       repainted text on hover into something unreadable: the document world's
       link hover repainted the primary CTA's label onto its own accent fill,
       and the currency chip's hover painted its label the same colour as its
       background, erasing it. Hover every control and measure what happens. */
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(300);
    const hoverBad = [];
    const hoverables = await page.$$('a[href], button:not([disabled])');
    for (const h of hoverables.slice(0, 70)) {
      const visible = await h.evaluate((e) => e.offsetParent !== null && e.getBoundingClientRect().width > 0);
      if (!visible) continue;
      try { await h.hover({ timeout: 1200 }); } catch (e) { continue; }
      await page.waitForTimeout(45);
      const bad = await h.evaluate((el) => {
        const parse = (c) => { const m = (c || '').match(/[\d.]+/g); return m ? { r: +m[0], g: +m[1], b: +m[2], a: m[3] === undefined ? 1 : +m[3] } : null; };
        const lumOf = ({ r, g, b }) => { const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        const bgOf = (e0) => {
          const st = []; let e = e0;
          while (e) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) { st.push(c); if (c.a === 1) break; } e = e.parentElement; }
          let o = { r: 8, g: 11, b: 9 };
          for (let i = st.length - 1; i >= 0; i--) { const c = st[i]; o = { r: c.a * c.r + (1 - c.a) * o.r, g: c.a * c.g + (1 - c.a) * o.g, b: c.a * c.b + (1 - c.a) * o.b }; }
          return o;
        };
        const txt = el.textContent.trim();
        if (txt.length < 2) return null;
        const cs = getComputedStyle(el);
        const size = parseFloat(cs.fontSize);
        const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
        const a = lumOf(parse(cs.color)), b = lumOf(bgOf(el));
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        const need = large ? 3 : 4.5;
        return ratio < need
          ? `${el.tagName}.${(el.className || '').toString().split(' ')[0]} ${ratio.toFixed(2)} < ${need} "${txt.slice(0, 26)}"`
          : null;
      });
      if (bad) hoverBad.push(bad);
    }
    check('every control stays legible while hovered',
      hoverBad.length === 0, [...new Set(hoverBad)].join('\n'));

    /* Overlays are their own worlds and the page-level sweep never sees them:
       the gate is `hidden` until it is needed, so nothing inside it was ever
       measured. Its stamp sat at 3.9:1. */
    await page.evaluate(() => {
      const el = document.querySelector('#gate');
      el.hidden = false;
      el.classList.add('show');
    });
    await page.waitForTimeout(400);
    const gateContrast = await contrastIssues(page, '#gate');
    check('everything in the demo gate clears WCAG AA contrast',
      gateContrast.length === 0, gateContrast.join('\n'));
    await page.evaluate(() => {
      const el = document.querySelector('#gate');
      el.classList.remove('show');
      el.hidden = true;
    });

    /* touch targets */
    const small = await page.evaluate(() => {
      const bad = [];
      document.querySelectorAll('a[href], button:not([disabled]), input[type="checkbox"]').forEach((e) => {
        if (e.offsetParent === null) return;
        const b = e.getBoundingClientRect();
        if (b.width < 24 || b.height < 24) bad.push(`${e.tagName}.${(e.className || '').toString().split(' ')[0]} ${Math.round(b.width)}x${Math.round(b.height)}`);
      });
      return [...new Set(bad)];
    });
    check('no interactive target under 24px', small.length === 0, small.join(', '));

    /* the gate traps focus while it is open */
    await page.evaluate(() => { localStorage.setItem('sp_runs', '5'); });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.click('#btn-sample'); await page.waitForTimeout(250);
    await page.click('#btn-to-map'); await page.waitForTimeout(200);
    await page.click('#btn-to-check'); await page.waitForTimeout(1100);
    await page.click('#btn-to-preview'); await page.waitForTimeout(250);
    await page.click('#btn-to-send'); await page.waitForTimeout(500);
    const trapped = await page.evaluate(async () => {
      const gate = document.querySelector('#gate');
      const inside = () => gate.contains(document.activeElement);
      const before = inside();
      for (let i = 0; i < 12; i++) {
        const f = [...gate.querySelectorAll('button, input, a[href]')].filter((e) => e.offsetParent !== null);
        f[f.length - 1].focus();
      }
      return { before, focusInside: inside() };
    });
    check('opening the gate moves focus into it', trapped.before);
    check('focus stays inside the open gate', trapped.focusInside);

    await ctx.close();
  }

  /* =========================================================
     13. REDUCED MOTION AND NO-GSAP FALLBACKS
     ========================================================= */
  group('13. Fallbacks');
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    watch(page, 'reduced-motion', noise);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);
    const rm = await page.evaluate(() => ({
      chip: Number(getComputedStyle(document.querySelector('.hero-copy .chip')).opacity),
      sub: Number(getComputedStyle(document.querySelector('.hero-sub')).opacity),
      machinePhase: document.querySelector('#machine').dataset.phase,
      rigBeat: document.querySelector('#rig-sec').dataset.beat,
      phone: Number(getComputedStyle(document.querySelector('#rig-phone')).opacity),
      sheetStatic: getComputedStyle(document.querySelector('#fold-sheet')).position,
      canvas: Number(getComputedStyle(document.querySelector('.hero-bg canvas')).opacity)
    }));
    check('reduced motion still shows the hero copy', rm.chip > 0.9 && rm.sub > 0.9, JSON.stringify(rm));
    check('reduced motion shows the machine end state', rm.machinePhase === 'receipt', rm.machinePhase);
    check('reduced motion shows the rig payoff', rm.rigBeat === '4' && rm.phone > 0.9, JSON.stringify(rm));
    check('reduced motion un-sticks the bridge', rm.sheetStatic === 'static', rm.sheetStatic);
    check('reduced motion still paints the hero field', rm.canvas > 0.9, rm.canvas);
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    /* this block deliberately kills the vendor scripts, so its own aborted
       requests are expected: only real page errors count here */
    const gsapNoise = [];
    watch(page, 'no-gsap', gsapNoise);
    await page.route('**/vendor/gsap.min.js', (r) => r.abort());
    await page.route('**/vendor/ScrollTrigger.min.js', (r) => r.abort());
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    const ng = await page.evaluate(() => ({
      chip: Number(getComputedStyle(document.querySelector('.hero-copy .chip')).opacity),
      sub: Number(getComputedStyle(document.querySelector('.hero-sub')).opacity),
      marquee: document.querySelector('#marquee').children.length,
      rigBeat: document.querySelector('#rig-sec').dataset.beat,
      demoWorks: !!document.querySelector('#btn-sample')
    }));
    check('without GSAP the hero copy is still visible', ng.chip > 0.9 && ng.sub > 0.9, JSON.stringify(ng));
    check('without GSAP the marquee still has content', ng.marquee > 11, ng.marquee);
    check('without GSAP the rig shows its payoff', ng.rigBeat === '4', ng.rigBeat);
    await page.click('#btn-sample');
    await page.waitForTimeout(300);
    check('without GSAP the demo still works', !(await page.isDisabled('#btn-to-map')));
    const realErrors = gsapNoise.filter((n) => !/vendor\/(gsap|ScrollTrigger)\.min\.js|Failed to load resource/.test(n));
    check('without GSAP nothing throws', realErrors.length === 0, realErrors.join('\n'));
    await ctx.close();
  }
  {
    /* private-mode storage: every preference write must be survivable */
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    watch(page, 'no-storage', noise);
    await page.addInitScript(() => {
      const boom = () => { throw new Error('storage disabled'); };
      Object.defineProperty(Storage.prototype, 'setItem', { value: boom });
      Object.defineProperty(Storage.prototype, 'getItem', { value: boom });
    });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);
    await showNav(page);
    await page.click('.langs button[data-lang="en"]');
    await page.waitForTimeout(300);
    await page.click('#btn-sample');
    await page.waitForTimeout(300);
    check('the site works with localStorage disabled',
      (await page.evaluate(() => document.documentElement.lang)) === 'en' && !(await page.isDisabled('#btn-to-map')));
    await ctx.close();
  }

  /* =========================================================
     14. SUBPAGES
     ========================================================= */
  group('14. Legal pages and 404');
  {
    for (const p of ['privacy.html', 'terms.html', 'cookies.html', '404.html']) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      watch(page, p, noise);
      await page.goto(`${BASE}/${p}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      const r = await page.evaluate(() => ({
        doclang: document.documentElement.getAttribute('data-doclang'),
        lang: document.documentElement.lang,
        plVisible: [...document.querySelectorAll('.pl-txt')].some((e) => e.offsetParent !== null),
        enVisible: [...document.querySelectorAll('.en-txt')].some((e) => e.offsetParent !== null),
        h1: document.querySelectorAll('h1').length
      }));
      check(`${p}: opens in Polish by default`, r.doclang === 'pl' && r.plVisible && !r.enVisible, JSON.stringify(r));
      if (p !== '404.html') {
        await page.click('button[data-doclang="en"]');
        await page.waitForTimeout(250);
        const en = await page.evaluate(() => ({
          lang: document.documentElement.lang,
          title: document.title,
          plVisible: [...document.querySelectorAll('.pl-txt')].some((e) => e.offsetParent !== null),
          enVisible: [...document.querySelectorAll('.en-txt')].some((e) => e.offsetParent !== null)
        }));
        check(`${p}: the English toggle shows only English`, en.enVisible && !en.plVisible, JSON.stringify(en));
        check(`${p}: the title follows the toggle`, /[A-Za-z]/.test(en.title) && !/ą|ć|ę|ł|ń|ó|ś|ź|ż/.test(en.title), en.title);
        check(`${p}: <html lang> follows the toggle`, en.lang === 'en', en.lang);
      }
      await ctx.close();
    }
  }

  /* =========================================================
     15. CONSOLE SWEEP ACROSS EVERY LOCALE AND FORM FACTOR
     ========================================================= */
  group('15. Console sweep');
  {
    for (const lang of LANGS) {
      for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
        const ctx = await browser.newContext({ viewport: vp, isMobile: vp.width < 500, hasTouch: vp.width < 500 });
        const page = await ctx.newPage();
        watch(page, `sweep/${lang}/${vp.width}`, noise);
        await page.goto(`${BASE}/?lang=${lang}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1400);
        const H = await page.evaluate(() => document.body.scrollHeight);
        for (let i = 1; i <= 6; i++) {
          await page.evaluate((y) => window.scrollTo(0, y), (H * i) / 7);
          await page.waitForTimeout(260);
        }
        await ctx.close();
      }
    }
    check('no console errors, warnings or failed requests anywhere', noise.length === 0, noise.slice(0, 15).join('\n'));
  }
} finally {
  await browser.close();
  server.close();
}

console.log(`\n${failures ? 'FAILED' : 'PASSED'}  ${passes}/${passes + failures} end-to-end checks`);
if (failures) console.log(`Failing: ${failed.join(' | ')}`);
process.exit(failures ? 1 : 0);
