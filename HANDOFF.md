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
npm run check        # 57 static gates: CSP, i18n parity, SEO, copy, links, hygiene
npm run e2e          # 261 browser assertions, starts its own server
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
- **The hero is never erased**: its opacity is sampled every frame from
  navigation. It used to paint, go transparent when `no-js` came off, and fade
  back in around a second later, which is the LCP element disappearing.
- **Scroll cost of the fold**: `#fold` has a viewport budget, a page-share
  budget, and a limit on how far it may scroll with only one thing animating.
  That last one is the interesting one. A freeze test passes a section that
  translates a rectangle for 700px with everything else at opacity 0, because
  the rectangle does change every frame. What makes a scroll section feel
  padded is a long single-channel run, so that is what is measured.
- **Hover is a state**: every control is hovered and its label measured
  against what is behind it. Four rules were unreadable on hover, including
  the primary CTA at 1.02:1, and nothing caught them because every other
  contrast check sampled elements at rest.
- **Scroll traps**: no element big enough to sit under a pointer may be a
  scroll container holding content it cannot show. `overflow: hidden` makes an
  element a scroll container even though nobody can scroll it, so the wheel
  goes there instead of to the page; the guarantee sheet swallowed the scroll
  outright on a phone. Use `overflow: clip` for decorative clipping. It clips
  identically, rounded corners included, and is never a scrollport.
- **Behaviour, not bookkeeping**: the paywall test submits a second address
  and proves no run is granted, rather than reading the flag; the scroll-lock
  test scrolls with a real wheel event rather than reading a style property.
  Both bugs shipped under tests that asserted the bookkeeping and passed.

---

## 4. Before you go live

### 4.1 Legal identity (hard blocker)

`assets/js/config.js` is the only file you must edit:

```js
window.SP_CONFIG = {
  legalName:  '',              // REQUIRED  exactly as registered at the APR
  entityForm: 'preduzetnik',   //           'preduzetnik' or 'doo'
  registryNo: '',              // REQUIRED  maticni broj, 8 digits
  taxId:      '',              // REQUIRED  PIB, 9 digits
  address:    '',              // REQUIRED  "Knez Mihailova 1, 11000 Beograd"
  ...
};
```

**Copy these off the APR registration document, not from memory.** They are
government-issued identifiers that appear in a public imprint on a site whose
whole proposition is regulatory compliance; an invented or mistyped one is a
misrepresentation of a legal entity, and it can collide with a real company's
number. Nobody but the operator can supply them, which is why they ship empty.

`npm run check` validates the shape of whatever is filled in, even before the
set is complete, so these fail the build rather than the launch:

- a `registryNo` that is not 8 digits, or a `taxId` that is not 9
- the same value pasted into both
- a `legalName` that still reads "test", "example", "placeholder", "TBD"
- an `address` with no street number or postcode
- an `entityForm` that is neither `preduzetnik` nor `doo`

`entityForm` is not cosmetic: it picks between "sole proprietor" and "a
company" in the imprint sentence, and calling a d.o.o. a sole proprietor in a
public imprint misstates the operator's legal form.

Until the four required fields are set, the footer imprint and the controller
sentence in the privacy policy are **omitted entirely** rather than printed
with placeholders, and `npm run check:launch` fails.

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

## 7b. Taking payments

The site is wired for checkout but not selling yet. Turning it on is editing
`assets/js/config.js`. Nothing else has to change: no SDK, no backend on this
site, and no change to the Content-Security-Policy.

### Which gateway

The blocker is the seller's country, not the buyer's. **Stripe does not accept
Serbia as a merchant country**, and neither does Wise Business or Revolut
Business. Lemon Squeezy is migrating onto Stripe Managed Payments, which
inherits that same country list, so it is a dead end for a Serbian company.

That leaves two shapes of answer:

| Route | Onboards a Serbian company | EU VAT / OSS |
|---|---|---|
| **Merchant of record** (Paddle, Polar) | yes | **none** - they are the seller |
| Serbian acquirer + gateway (AllSecure, Monri/WSPay, Intesa, AIK, ...) | yes | all of it stays with you |
| Stripe Atlas (US Delaware C-corp) | via a US entity | all of it stays with you |

A merchant of record is the seller to the Polish, German, Croatian and Romanian
customer. That removes non-Union OSS registration, per-country VAT rates,
quarterly OSS returns, customer-location evidence logging and the ten-year
archive. At around 9 EUR per month that compliance machine costs more per year
than the merchant-of-record fee ever will, which is why the domestic acquirers
lose here despite being technically capable. Stripe Atlas is the worst of both:
a Delaware franchise tax, a Form 5472 with a US$25,000 penalty for missing it,
and it still leaves the EU VAT liability with you.

**Recommended: Paddle, with Polar as the fallback.** Both are merchants of
record and both issue hosted checkout links, so they drop into the wiring below
identically and switching is a config edit.

> **Verify before you commit.** The vendor documentation sites were unreachable
> from the environment this was researched in, so the eligibility and currency
> claims above come from search results quoting those pages, not from the pages
> themselves. Before you sign anything, open Paddle's supported-countries and
> supported-currencies pages yourself, and confirm Serbia and your currencies.
> The integration below does not depend on the answer: it is provider-agnostic.

### Turning it on

1. Create the products in the gateway and copy each plan's **hosted checkout
   URL** (Paddle: `https://pay.paddle.io/checkout/...`).
2. Fill in `assets/js/config.js`:

   ```js
   checkout: {
     provider: 'paddle',
     currencies: ['eur', 'pln'],     // what the gateway can actually BILL in
     links: {
       solo:       'https://pay.paddle.io/checkout/...',
       business:   'https://pay.paddle.io/checkout/...',
       accountant: 'https://pay.paddle.io/checkout/...'
     }
   }
   ```
3. `npm run check` and `npm run e2e`. That is the whole deployment.

`assets/js/checkout.js` rewrites the `href` of each `a[data-checkout]` button.
A plan whose URL is empty keeps the destination written in the markup, so the
pre-launch waitlist behaviour survives untouched and you can switch plans on one
at a time. A URL that is not absolute `https:` is refused rather than followed,
and `npm run check` fails on one before it ever reaches a browser.

**Currencies.** The price toggle offers PLN, EUR and RON. Paddle has no RON. If
a reader picks a currency the gateway cannot bill, the pricing section says
which currency they will actually be charged in - that is what `currencies` is
for, and `npm run check` fails if you configure links without it. Do not show a
RON price and silently charge euros.

### Why links and not an SDK

CSP has no directive that restricts where an anchor navigates: `navigate-to`
was drafted for CSP3 and dropped, and no browser ships it. So a hosted checkout
link works under `default-src 'self'` with nothing added. `form-action 'self'`
*does* restrict where a form may POST, so always send buyers with an `<a href>`,
never a form POST.

A client-side checkout SDK would cost the whole security posture: its bootstrap
injects inline styles, so it needs `style-src 'unsafe-inline'`, plus `frame-src`
and `connect-src` entries for the vendor. `npm run check` fails on that, by
design. The link costs one redirect and nothing else.

Because the destination is a real `href` in the HTML, checkout also works with
JavaScript disabled.

### What still needs a server

A hosted link removes the checkout server. It does not remove **fulfilment**.
Something must receive the gateway's subscription webhooks (`created`,
`updated`, `paused`, `canceled`, `past_due`), verify the signature, and grant or
revoke access. That belongs to the product, not to this marketing site. If you
want it in the same Cloudflare project, add `functions/api/<provider>-webhook.js`:
Pages Functions live outside the five static pages the gates read, so nothing
here changes. Keep the webhook secret in Cloudflare environment variables, never
in `config.js` - that file ships to the browser.

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
- **The waitlist stores nothing while `formEndpoint` is empty.** The address
  goes to `localStorage` and the page says "we will write once, at launch",
  which is a promise nothing can keep yet. Set the endpoint before launch, or
  soften the confirmation copy. `npm run check` does not fail on this because
  it is a deliberate pre-launch state, but it is on the launch list.
- **Romanian cannot be billed by every gateway.** Paddle has no RON. The price
  toggle keeps RON because a Romanian reader wants to see a Romanian number,
  and `checkout.currencies` makes the page say which currency actually gets
  charged. If you pick a gateway that does bill RON, add it to that list.

---

## 12b. Known small stuff, deliberately left

A final audit turned these up. Each was checked against the code and none of
them is worth the regression risk of a late change, so they are written down
rather than fixed. In rough order of how much they matter.

- **Three clocks on one document.** `P_1` and `P_6` come from
  `toISOString()` (UTC), while the invoice number uses local time. Between
  midnight and the UTC offset on New Year's Eve, an invoice could be numbered
  for one year and dated for the previous one. Pick one clock when the real
  filing path is built server-side.
- **The unit of measure is hardcoded.** `<P_8A>szt</P_8A>` is written for
  every line even though the parser recognises `jm` / `jednostka` / `uom`
  headers. If a sheet says hours or kilograms, the file still says pieces.
- **The currency guard is cell-level.** `500,00 EUR` in a cell is caught; a
  column headed "Cena netto (EUR)" is not.
- **Row numbers count filtered rows.** Blank lines are dropped before the
  grid is numbered, so a validation error's "row 7" is the seventh non-empty
  row, not the seventh row of the sheet the reader is looking at.
- **`#sendlog` does not re-render on a language switch.** Everything else in
  the demo does. Switch language mid-filing and that one panel keeps the old
  language until the next run.
- **`--s1` to `--s7` are unused.** The space scale is declared with a comment
  telling you to use it, and nothing does. Either adopt it or delete it; a
  system nobody follows is worse than no system.
- **The demo has no no-JS fallback of its own.** `noscript.css` covers the
  hero, the rig, the fold and the marquee, but the demo section renders its
  first step and no explanation of why it does nothing.
- **`--fg-lo` and `--fg-faint` differ by 4/4/3 in RGB.** Two tiers the eye
  reads as one colour.

---

## 13. Judgement calls left to the owner

These came out of the audit and were deliberately **not** changed, because
they are business decisions rather than defects.

- **The h1 carries no search term.** "Arkusz zostaje arkuszem. Faktura staje
  się urzędowa." is the whole design concept and the strongest line on the
  page, but it contains neither "KSeF" nor "Excel" nor "e-faktura". The title
  tag and meta description carry those. Rewriting the h1 would trade the idea
  for keywords; that is a call for whoever owns the brand.
- **The German, Croatian and Romanian pages sell KSeF.** A German searcher
  looks for XRechnung or ZUGFeRD, a Croatian for fiskalizacija 2.0, a
  Romanian for e-Factura. Leading with those terms per locale would rank
  better, but it would also imply the product ships those integrations today.
  Do it when it does, not before: on a site selling regulatory compliance an
  overclaim is a liability, not a growth tactic.
- **The five-step bar in the demo is decorative.** It reads as a stepper.
  Either wire it to the actual step or restyle it so it does not promise
  navigation it does not provide.
