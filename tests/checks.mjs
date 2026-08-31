/* ============================================================
   Static gates for the Sheetpost site. No browser, no network.
   Run with: npm run check
   Every check here corresponds to a way this site has actually
   broken before, so none of them are decorative.
   ============================================================ */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const PAGES = ['index.html', 'privacy.html', 'terms.html', 'cookies.html', '404.html'];

/* --launch (or SP_LAUNCH=1) promotes launch blockers to hard failures.
   Day to day, an unfilled config should not stop a developer's test run;
   on the way to production it must. */
const LAUNCH = process.argv.includes('--launch') || process.env.SP_LAUNCH === '1';

let failures = 0;
let warnings = 0;
let checks = 0;
function ok(name) { checks++; console.log(`  ok   ${name}`); }
function fail(name, detail) {
  checks++; failures++;
  console.log(`  FAIL ${name}`);
  String(detail).split('\n').slice(0, 24).forEach((l) => console.log(`       ${l}`));
}
function warn(name, detail) {
  checks++; warnings++;
  console.log(`  WARN ${name}   (blocks launch, not development)`);
  String(detail).split('\n').slice(0, 24).forEach((l) => console.log(`       ${l}`));
}
function assert(cond, name, detail) { if (cond) ok(name); else fail(name, detail); }
function assertLaunch(cond, name, detail) {
  if (cond) ok(name);
  else if (LAUNCH) fail(name, detail);
  else warn(name, detail);
}
function section(t) { console.log(`\n${t}`); }

/* ---------- 1. Content-Security-Policy compatibility ---------- */
section('Content-Security-Policy (the shipped _headers has no unsafe-inline)');
{
  const offenders = [];
  for (const p of PAGES) {
    const html = read(p);
    for (const m of html.matchAll(/\sstyle="/g)) offenders.push(`${p}: inline style attribute at ${m.index}`);
    for (const m of html.matchAll(/<style[\s>]/g)) offenders.push(`${p}: inline <style> at ${m.index}`);
    /* a <script> with a body, other than a JSON-LD data block */
    for (const m of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)) {
      const attrs = m[1];
      if (/type\s*=\s*["']application\/ld\+json["']/.test(attrs)) continue;
      if (m[2].trim()) offenders.push(`${p}: inline <script> at ${m.index}`);
    }
  }
  assert(offenders.length === 0, 'no inline style or script in any shipped page', offenders.join('\n'));

  const headers = read('_headers');
  assert(/Content-Security-Policy:/.test(headers), '_headers declares a CSP');
  assert(!/unsafe-inline/.test(headers.split('\n').filter((l) => !l.includes('og-card')).join('\n')),
    'the site-wide CSP does not use unsafe-inline');
}

/* ---------- 2. i18n integrity ---------- */
section('i18n');
{
  globalThis.window = {};
  await import(`file://${join(ROOT, 'assets/js/i18n.js')}`);
  const T = globalThis.window.SP_I18N;
  const langs = Object.keys(T);
  assert(langs.length === 5, `five locales present (${langs.join(', ')})`);

  const plKeys = Object.keys(T.pl);
  const parity = [];
  for (const l of langs) {
    const missing = plKeys.filter((k) => !(k in T[l]));
    const extra = Object.keys(T[l]).filter((k) => !(k in T.pl));
    if (missing.length) parity.push(`${l} missing: ${missing.join(', ')}`);
    if (extra.length) parity.push(`${l} extra: ${extra.join(', ')}`);
  }
  assert(parity.length === 0, `all locales have the same ${plKeys.length} keys`, parity.join('\n'));

  const empties = [];
  for (const l of langs) for (const [k, v] of Object.entries(T[l])) {
    if (typeof v !== 'string' || !v.trim()) empties.push(`${l}.${k}`);
  }
  assert(empties.length === 0, 'no empty translations', empties.join('\n'));

  /* placeholders must survive translation: {n} in one locale means {n} in all */
  const phMismatch = [];
  for (const k of plKeys) {
    const want = [...T.pl[k].matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    for (const l of langs) {
      const got = [...T[l][k].matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
      if (got !== want) phMismatch.push(`${l}.${k}: "${got}" vs pl "${want}"`);
    }
  }
  assert(phMismatch.length === 0, 'interpolation placeholders match across locales', phMismatch.join('\n'));

  /* every key the markup asks for must exist */
  const referenced = new Set();
  for (const p of PAGES) {
    for (const m of read(p).matchAll(/data-i18n(?:-html|-aria|-ph|-t)?="([a-z0-9_]+)"/g)) referenced.add(m[1]);
  }
  const unknown = [...referenced].filter((k) => !(k in T.pl));
  assert(unknown.length === 0, `${referenced.size} referenced keys all exist`, unknown.join(', '));

  /* and every key must be reachable from markup or from the scripts */
  const js = ['app.js', 'demo.js', 'motion.js'].map((f) => read(`assets/js/${f}`)).join('\n');
  const orphan = plKeys.filter((k) =>
    !referenced.has(k) &&
    !new RegExp(`['"\`]${k}['"\`]`).test(js) &&
    !['title', 'desc', 'og_title', 'og_desc'].includes(k));
  assert(orphan.length === 0, 'no orphaned dictionary keys', orphan.join(', '));

  /* the static Polish markup IS the Polish dictionary; if they drift,
     switching back to Polish silently rewrites the page */
  const html = read('index.html');
  const drift = [];
  const seen = new Set();
  const re = /<([a-z0-9]+)([^>]*?)data-i18n(-html)?="([a-z0-9_]+)"([^>]*)>([\s\S]*?)<\/\1>/gi;
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  for (const m of html.matchAll(re)) {
    const key = m[4];
    if (seen.has(key)) continue;
    seen.add(key);
    if (!(key in T.pl)) continue;
    if (norm(m[6]) !== norm(T.pl[key])) drift.push(`${key}\n    html: ${norm(m[6])}\n    dict: ${norm(T.pl[key])}`);
  }
  assert(drift.length === 0, 'static Polish markup matches the pl dictionary', drift.join('\n'));
}

/* ---------- 3. copy hygiene ---------- */
section('Copy');
{
  globalThis.window = globalThis.window || {};
  const T = globalThis.window.SP_I18N;
  const corpus = [...PAGES.map(read), ...Object.values(T).map((d) => Object.values(d).join(' '))].join('\n');

  const emoji = [...corpus.matchAll(/\p{Extended_Pictographic}/gu)].map((m) => m[0]);
  assert(emoji.length === 0, 'no emoji in shipped copy', [...new Set(emoji)].join(' '));

  const dashes = [...corpus.matchAll(/[–—]/g)];
  assert(dashes.length === 0, 'no em/en dashes in shipped copy', `${dashes.length} found`);

  const placeholders = [];
  for (const p of PAGES) {
    const html = read(p);
    for (const pat of [/\[_+\]/g, /\bTODO\b/g, /\bFIXME\b/g, /\blorem ipsum\b/gi, /pełna nazwa właściciela/gi, /owner full name/gi]) {
      for (const m of html.matchAll(pat)) placeholders.push(`${p}: ${m[0]}`);
    }
  }
  assert(placeholders.length === 0, 'no unfilled placeholders in shipped pages', placeholders.join('\n'));
}

/* ---------- 4. launch configuration ---------- */
section('Launch configuration (assets/js/config.js)');
{
  const cfg = read('assets/js/config.js');
  const val = (k) => (cfg.match(new RegExp(`${k}:\\s*'([^']*)'`)) || [, ''])[1];
  const required = ['legalName', 'registryNo', 'taxId', 'address'];
  const empty = required.filter((k) => !val(k));
  assertLaunch(empty.length === 0,
    'operator legal identity is filled in',
    `Still empty: ${empty.join(', ')}\n` +
    'The footer imprint and the privacy policy stay blank until these are set.\n' +
    'This is a launch blocker, not a code defect. See HANDOFF.md.');
}

/* ---------- 5. structured data / config files ---------- */
section('Structured data and config files');
{
  const html = read('index.html');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert(blocks.length > 0, 'index.html carries JSON-LD');
  let jsonOk = true; let jsonErr = '';
  for (const b of blocks) { try { JSON.parse(b[1]); } catch (e) { jsonOk = false; jsonErr = e.message; } }
  assert(jsonOk, 'JSON-LD parses', jsonErr);

  try { JSON.parse(read('site.webmanifest')); ok('site.webmanifest parses'); }
  catch (e) { fail('site.webmanifest parses', e.message); }

  const sm = read('sitemap.xml');
  assert(sm.includes('<urlset') && sm.trim().endsWith('</urlset>'), 'sitemap.xml is well formed');
  const canon = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
  assert(!!canon, 'index.html has a canonical URL');
  assert(sm.includes(canon), 'the canonical URL is in the sitemap');

  const sec = read('.well-known/security.txt');
  const exp = (sec.match(/Expires:\s*(\S+)/) || [])[1];
  assert(exp && new Date(exp) > new Date(), 'security.txt has not expired', `Expires: ${exp}`);
}

/* ---------- 6. every local reference resolves ---------- */
section('Local references');
{
  const missing = [];
  for (const p of PAGES) {
    const html = read(p);
    for (const m of html.matchAll(/(?:href|src)="([^"#:?]+)"/g)) {
      const target = m[1];
      if (/^(https?:|mailto:|tel:|data:|\/\/)/.test(target)) continue;
      const rel = target.startsWith('/') ? target.slice(1) : target;
      if (!rel) continue;
      if (!existsSync(join(ROOT, rel))) missing.push(`${p} -> ${target}`);
    }
  }
  assert(missing.length === 0, 'every local href/src resolves to a file', missing.join('\n'));

  /* every stylesheet the pages load actually exists and is referenced */
  const cssFiles = readdirSync(join(ROOT, 'assets/css')).filter((f) => f.endsWith('.css'));
  const allHtml = PAGES.map(read).join('\n');
  const unusedCss = cssFiles.filter((f) => !allHtml.includes(`assets/css/${f}`));
  assert(unusedCss.length === 0, 'no orphaned stylesheets', unusedCss.join(', '));

  const jsFiles = readdirSync(join(ROOT, 'assets/js')).filter((f) => f.endsWith('.js'));
  const unusedJs = jsFiles.filter((f) => !allHtml.includes(`assets/js/${f}`) &&
    !read('assets/js/demo.js').includes(f));
  assert(unusedJs.length === 0, 'no orphaned scripts', unusedJs.join(', '));
}

/* ---------- 7. CSS <-> markup coherence ---------- */
section('CSS and markup coherence');
{
  const css = readdirSync(join(ROOT, 'assets/css'))
    .filter((f) => f.endsWith('.css'))
    .map((f) => read(`assets/css/${f}`)).join('\n');
  /* classes that exist purely as JS hooks and legitimately have no styles */
  const JS_HOOKS = new Set(['magnetic', 'morph-right', 'no-js']);
  const used = new Set();
  for (const p of PAGES) {
    for (const m of read(p).matchAll(/class="([^"]+)"/g)) {
      for (const c of m[1].split(/\s+/)) if (c) used.add(c);
    }
  }
  const noRule = [...used].filter((c) => !JS_HOOKS.has(c) && !new RegExp(`\\.${c.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(?![\\w-])`).test(css));
  assert(noRule.length === 0, `all ${used.size} markup classes have CSS rules`, noRule.join(', '));

  /* the z-index scale is declared once and used through tokens */
  const rawZ = [...css.matchAll(/z-index:\s*(-?\d+)/g)].map((m) => m[1]).filter((v) => Number(v) > 10);
  assert(rawZ.length === 0, 'no ad-hoc high z-index values outside the token scale', rawZ.join(', '));
}

/* ---------- 8. build artefacts must not ship ---------- */
section('Repository hygiene');
{
  const junk = readdirSync(ROOT).filter((f) => /\.(zip|tgz|tar|log)$/.test(f));
  assert(junk.length === 0, 'no build artefacts in the repository root', junk.join(', '));

  const imgs = readdirSync(join(ROOT, 'assets/img'));
  const qa = imgs.filter((f) => f.startsWith('qa-'));
  assert(qa.length === 0, 'no QA screenshots shipped to production', qa.join(', '));

  const heavy = [];
  const walk = (dir, base = '') => {
    for (const f of readdirSync(join(ROOT, dir))) {
      const p = join(dir, f);
      const st = statSync(join(ROOT, p));
      if (st.isDirectory()) walk(p, base);
      else if (st.size > 400 * 1024) heavy.push(`${p} (${Math.round(st.size / 1024)} KB)`);
    }
  };
  walk('assets');
  assert(heavy.length === 0, 'no single asset over 400 KB', heavy.join('\n'));
}

console.log(`\n${failures ? 'FAILED' : 'PASSED'}  ${checks - failures - warnings}/${checks} static checks` +
  (warnings ? `, ${warnings} launch blocker${warnings > 1 ? 's' : ''} outstanding (run \`npm run check:launch\` to enforce)` : ''));
process.exit(failures ? 1 : 0);
