# Sheetpost — handoff

Everything a new owner needs to run, change and ship this site. Read the
**Before you go live** section first; it is the only part with hard blockers.

---

## 1. What this site is

A single-page marketing site for **Sheetpost**: a tool that turns spreadsheet
rows into legally compliant structured e-invoices and files them to Poland's
**KSeF 2.0** system in the **FA(3)** XML format.

The argument the page makes, in order:

| Section | Job |
|---|---|
| Hero | State the promise: the spreadsheet survives, the invoice becomes official. |
| Marquee | Show the formats the product speaks (KSeF, Peppol, XRechnung, …). |
| Tickers | Make the deadline concrete and countable. |
| Mandate wall | Prove this is not one country's problem. |
| How (3 steps) | Reduce the product to connect / map / file. |
| **The rig** | A scroll-driven laptop and phone that play the whole flow: sheet, mapping, validation, filed. This is the set piece. |
| Live demo | Prove it. The visitor runs the real FA(3) validator on their own rows. |
| Split view | The same document in two forms: human and machine. |
| The fold | The dark "ink world" hands over to the light "paper world". |
| Pricing | Founder price, locked. |
| Partner band | Accounting offices, 25 clients each. |
| FAQ, waitlist | Objections, then the ask. |

**Design concept.** Two worlds. The dark *ink world* is the spreadsheet.
The light *paper world* is the government document. The page crosses from one
to the other exactly once, at the guarantee section, and the header changes
palette with it.

**Everything runs in the browser.** No backend, no build step, no cookies.
The demo's parser, validator and XML writer are real and local; only the
filing step is simulated (and says so).

---

## 2. Run it

```bash
npm install          # eslint, playwright, http-server (dev only)
npm run serve        # http://127.0.0.1:8123
```

Any static host works: Cloudflare Pages, Netlify, Vercel, nginx. Deploy the
repository root as-is.

---

## 3. Quality gates

```bash
npm run lint         # eslint over assets/js (vendor excluded)
npm run check        # static gates: CSP, i18n parity, copy, links, hygiene
npm run e2e          # 225 browser assertions, starts its own server
npm test             # all three
npm run test:launch  # the same, with launch blockers promoted to failures
```

`npm run check` and `npm run e2e` are not decoration. Every assertion in them
maps to a way this site has actually broken. Some worth knowing about:

- **CSP**: the shipped `_headers` has no `unsafe-inline`. `npm run check`
  fails if anyone reintroduces a `style="..."` attribute or an inline
  `<script>`, and the e2e suite serves every page with the production CSP so a
  violation shows up as a console error.
- **i18n drift**: the static Polish markup must be byte-identical to the `pl`
  dictionary. If it drifts, switching to another language and back silently
  rewrites the page.
- **Hero visibility**: the hero's eyebrow, subheadline and meta line are
  asserted to be opaque. They were once permanently invisible because a GSAP
  `.from({opacity: 0})` captured the CSS reveal state as its end value.
- **No console noise**: the sweep loads all five locales at two viewports and
  fails on any error, warning or failed request.

---

## 4. Before you go live

### 4.1 Legal identity (hard blocker)

`assets/js/config.js` is the only file you must edit:

```js
window.SP_CONFIG = {
  legalName:  '',   // REQUIRED  e.g. "Jan Kowalski PR"
  registryNo: '',   // REQUIRED  APR registration number
  taxId:      '',   // REQUIRED  PIB
  address:    '',   // REQUIRED  e.g. "Ulica 1, 11000 Beograd"
  ...
};
```

Until these are filled in, the footer imprint and the controller sentence in
the privacy policy are **omitted entirely** rather than printed with
placeholders. `npm run check:launch` fails while they are empty.

An imprint is legally required in most of the markets this site targets. Do
not launch without it.

### 4.2 Waitlist endpoint

`assets/js/config.js` → `formEndpoint`. Empty means signups are kept in
`localStorage` only, which is fine for a demo and useless for a launch. Set a
Formspree / Netlify Forms / Polar endpoint, then **add its host to
`connect-src` in `_headers`** or the strict CSP will block the request.

### 4.3 Legal review

`privacy.html`, `terms.html` and `cookies.html` are solid, specific templates.
They are not legal advice. Have a lawyer read them before you charge money,
particularly the retention periods, the processor list and the consumer
withdrawal clause.

### 4.4 Facts with a shelf life

These are dated claims that will go stale. Re-check them before launch and
each quarter:

- the three countdown deadlines (`data-deadline` in `index.html`)
- every row of the mandate wall (`w_*_st` and `w_*_pool` in `assets/js/i18n.js`)
- the "Stan na 08/2026" note under the wall (`wall_note`)
- `.well-known/security.txt` → `Expires`

### 4.5 Domain

Canonical URLs, `hreflang`, `sitemap.xml`, `og:*` and `llms.txt` all assume
`https://sheetpost.app/`. If the domain changes, grep for it.

---

## 5. Where things live

```
index.html                 the whole marketing page
privacy / terms / cookies  legal pages, PL + EN via doclang
404.html                   PL + EN
assets/css/
  tokens.css               colours, type, space, motion, z-scale. Start here.
  base.css                 reset, typography, reveal system, print
  components.css           buttons, nav, chips, forms, footer, dialog chrome
  sections.css             hero, machine, tickers, mandate wall, steps, split view
  device.css               the rig (laptop + phone)
  paper.css                the fold, guarantee, pricing, partner, CTA
  demo.css                 the five-step demo and its gate
  subpages.css             legal pages and 404
  noscript.css             the no-JS end state (loaded via <noscript><link>)
  fonts.css                self-hosted variable fonts
assets/js/
  config.js                THE FILE YOU EDIT TO GO LIVE
  i18n.js                  five locales, one key set
  app.js                   language, currency, nav, progress, countdowns, waitlist
  motion.js                GSAP choreography incl. the rig
  demo.js                  the FA(3) engine: parse, map, validate, render, file
  imprint.js               renders config.js into the pages
  doclang-boot.js          picks the legal-page language before first paint
  doclang.js               the PL/EN toggle on legal pages
  vendor/                  GSAP, ScrollTrigger, SheetJS (lazy)
tests/                     checks.mjs (static) and e2e.mjs (browser)
_headers / _redirects      Cloudflare Pages config
```

### Contracts between scripts

Load order is `config → gsap → ScrollTrigger → i18n → app → motion → demo → imprint`.

| Global | Set by | Used by |
|---|---|---|
| `SP_CONFIG` | config.js | app.js, imprint.js |
| `SP_I18N` | i18n.js | app.js |
| `SP_T(key, vars)` | app.js | motion.js, demo.js |
| `SP_I18N_HOOKS` | app.js | motion.js, demo.js, imprint.js |
| `SPStore`, `SPLocale` | app.js | demo.js |
| `SPDemo.onBonus` | demo.js | (the gate's own form) |

If you add a module, push a re-render callback onto `SP_I18N_HOOKS` — that is
how anything with generated text survives a language switch.

---

## 6. Editing copy

**Polish lives in two places and they must agree**: the static markup in
`index.html` (which is what a crawler and a no-JS visitor read) and `T.pl` in
`assets/js/i18n.js` (which is what a language switch restores). `npm run check`
enforces the match.

Other languages live only in `assets/js/i18n.js`. All five locales carry the
same key set; the check fails on any drift.

Attributes that get translated:

| Attribute | Effect |
|---|---|
| `data-i18n` | `textContent` |
| `data-i18n-html` | `innerHTML` (headline fragments with `<em>`) |
| `data-i18n-aria` | `aria-label` |
| `data-i18n-ph` | `placeholder` |
| `data-i18n-t` | the `data-t` attribute the typing animation reads |

House style: no emoji, no em or en dashes (the separator is `·`), tabular
numerals for data, sentence case in prose.

---

## 7. Pricing

Prices are declared once per element and switched by currency:

```html
<span data-price data-eur="9" data-pln="39" data-ron="45">39</span>
<span class="pu" data-cur-symbol> zł</span>
<span class="pu" data-i18n="plan_mo">/mies.</span>
```

The static text in the element is the **PLN** value, because Polish is the
no-JS default. `data-cur-symbol` receives the unit. Keep the JSON-LD offers in
`index.html` and any price mentioned in prose (`hero_sub_strong`, `cta_p`) in
sync — nothing enforces that automatically.

The language picks a default currency; a manual choice is remembered
(`sp_cur_manual`) and a later language switch will not overwrite it.

---

## 8. The demo engine

`assets/js/demo.js` is the only genuinely intricate file. What it does:

1. **Parse** pasted text (delimiter sniffing, CSV quoting) or a real `.xlsx`
   (SheetJS, lazy-loaded on first use, `cellDates` so date serials are not
   read as prices).
2. **Find the header row** by scoring the first few rows, so a title line
   above the table does not break everything.
3. **Map columns by header name first** (PL/EN/DE/HR/RO synonyms), and only
   fall back to statistics for what the header did not say. `Lp.`, `Wartość`,
   `Data` and friends are recognised specifically so they are skipped rather
   than mistaken for a quantity or a unit price.
4. **Validate** six things, all of them real: both NIP checksums, the VAT rate
   catalogue (`23 / 8 / 5 / 0 / zw / np / oo`), per-line arithmetic that
   survives rounding to grosze, required FA(3) fields, and the currency
   (a `EUR`/`lei` marker fails: a KSeF invoice is PLN).
5. **Render** the same invoice twice: human and FA(3) XML, sharing one
   invoice number.
6. **Simulate** filing and issue a plausible KSeF reference.

**Free-run economics.** `sp_runs` is a signed counter: `0..n` free runs used,
negative means bonus runs still owed. `runsLeft()` is the only thing the UI
and the gate reason about. The email unlock grants three runs **once**
(`sp_bonus` records it) so the gate cannot be farmed.

Amount parsing handles both conventions: whichever separator comes last is the
decimal point, so `1 200,50` and `1,200.50` are the same number.

---

## 9. Motion

One easing family (`--e-out`, `--e-io`, `--e-spring`) and four durations,
all in `tokens.css`.

Everything in `motion.js` is **additive**. Hidden start states are set from
JavaScript, never from CSS, so a failed GSAP load or a reduced-motion
preference leaves a finished page rather than an empty one. The e2e suite
tests both of those paths.

The rig (`#rig-sec`) is a sticky stage with four beats driven by scroll
progress, not by timeline callbacks, so scrubbing backwards rewinds it. Under
reduced motion or without GSAP it renders its final beat.

`prefers-reduced-motion` is also honoured **mid-session**: turning it on tears
down the choreography instead of waiting for a reload.

---

## 10. One trap worth knowing about

**Never put `scroll-behavior: smooth` on `html`.** ScrollTrigger sets and
restores the scroll position while it measures; with CSS smooth scrolling that
restore *animates*, so every measurement lands against the wrong offset. The
symptom is subtle and delayed: resize the window (or open devtools, or rotate a
phone) and the rig and the fold silently freeze on whatever frame they were on,
because their triggers now think they start at a negative scroll position.

Smooth anchor scrolling is implemented in `app.js` instead, on click, where it
cannot interfere. `npm run e2e` resizes the viewport and then asserts the rig's
trigger still starts where the section does.

## 11. Accessibility notes for whoever edits this next

- Every interactive control needs a visible focus ring. `:focus` may not set
  `outline: none` without a `:focus-visible` replacement.
- UI component boundaries use `--ctl-line` / `--p-ctl-line`, which clear the
  3:1 required by WCAG 1.4.11. `--line-hi` is decorative and does not.
- A placeholder is not a label. Both waitlist fields have visible labels.
- Anything generated (validation results, the KSeF number, form errors) is
  inside a live region; reveal the region **before** writing into it.
- The demo gate is a real modal: fixed, scroll-locked, background `inert`,
  focus trapped.
- `showPane()` moves focus, because the button that triggered the step is
  about to be `display: none`.

---

## 12. Known deliberate limitations

- **Language is client-side only.** `?lang=en` returns the same HTML; the
  dictionary swaps after load. The canonical URL and `og:locale` follow the
  language at runtime and the `hreflang` set matches the sitemap, which is
  the best a static host can do. If organic traffic in DE/HR/RO ever matters,
  pre-render one HTML file per language.
- **The FA(3) XML is a faithful preview, not a filing.** Element order and the
  per-rate summary mirror the KSeF 2.0 schema, but the real document is built
  and signed server-side in the product.
- **The waitlist is optimistic.** `mode: 'no-cors'` hides the status code, so
  a rejected promise (the request never left the machine) is reported and
  anything else is treated as success.
