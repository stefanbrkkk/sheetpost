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

    /* the bonus is worth three runs, once */
    const grant = await page.evaluate(() => {
      localStorage.setItem('sp_runs', '9');
      return localStorage.getItem('sp_bonus');
    });
    check('the bonus grant is recorded so it cannot be farmed', grant === '1', grant);

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

    await ctx.close();
  }

  /* =========================================================
     9. MOBILE MENU
     ========================================================= */
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
    check('the page behind the menu is scroll locked',
      (await page.evaluate(() => document.body.style.overflow)) === 'hidden');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    check('Escape closes the menu', await page.isHidden('#menu'));
    check('the scroll lock is released', (await page.evaluate(() => document.body.style.overflow)) === '');

    await page.click('#burger');
    await page.waitForTimeout(250);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForTimeout(400);
    check('growing past the breakpoint closes the menu', await page.isHidden('#menu'));
    check('and releases the scroll lock', (await page.evaluate(() => document.body.style.overflow)) === '');

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

    /* scrubbing back must rewind, not leave the payoff on screen */
    await page.evaluate((y) => window.scrollTo(0, y), box.top + box.height * 0.05);
    await page.waitForTimeout(800);
    const rewound = await page.evaluate(() => document.querySelector('#rig-sec').dataset.beat);
    check('scrubbing backwards rewinds the beats', rewound === '1', rewound);

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

    /* text contrast on a sample of real text nodes, in both worlds */
    const lowContrast = await page.evaluate(() => {
      const parse = (c) => {
        const m = (c || '').match(/[\d.]+/g);
        if (!m) return null;
        return { r: +m[0], g: +m[1], b: +m[2], a: m[3] === undefined ? 1 : +m[3] };
      };
      const lumOf = ({ r, g, b }) => {
        const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      /* translucent backgrounds have to be composited down the ancestor
         chain, or a 13%-alpha tint reads as a solid mint block */
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
      const lum = (c) => { const p = parse(c); return p ? lumOf(p) : 1; };
      const bad = [];
      const nodes = [...document.querySelectorAll('p, span, li, a, b, h1, h2, h3, h4, label, small, button, summary')]
        .filter((e) => e.offsetParent !== null && e.textContent.trim().length > 2 &&
          [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
      for (const e of nodes) {
        const cs = getComputedStyle(e);
        const size = parseFloat(cs.fontSize);
        const bold = Number(cs.fontWeight) >= 700;
        const large = size >= 24 || (size >= 18.66 && bold);
        const a = lum(cs.color), b = lumOf(bgOf(e));
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        const need = large ? 3 : 4.5;
        if (ratio < need) bad.push(`${e.tagName}.${(e.className || '').toString().split(' ')[0]} ${ratio.toFixed(2)} < ${need} "${e.textContent.trim().slice(0, 30)}"`);
      }
      return [...new Set(bad)];
    });
    check('all visible text clears WCAG AA contrast', lowContrast.length === 0, lowContrast.slice(0, 10).join('\n'));

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
