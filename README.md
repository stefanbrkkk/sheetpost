# Sheetpost — marketing site v2 ("the grid becomes official")

Production-ready static site for **Sheetpost**: spreadsheet → compliant e-invoice → KSeF 2.0 (FA(3)).
Dark "ink world" (the spreadsheet) scrolls into one light "paper world" act (the official document) and back.

## What's inside

| Path | What |
|---|---|
| `index.html` | Single-page marketing site. Polish is the static/no-JS default (SEO); EN/DE/HR/RO via JS dictionary. |
| `privacy.html` `terms.html` `cookies.html` | Legal pages, PL/EN toggle. Solid templates — get a lawyer pass before charging money. |
| `404.html` `robots.txt` `sitemap.xml` | Launch plumbing. |
| `assets/css/*` | Tokens, base, components, sections, paper world, demo (7 files, tokenized). |
| `assets/js/i18n.js` | 5 full locales (~250 keys each). Edit copy here for non-PL languages; PL copy lives in the HTML and in the `pl` dict. |
| `assets/js/app.js` | Language engine, nav, countdowns, currency toggle, waitlist form, modal. |
| `assets/js/motion.js` | GSAP choreography: hero machine, cell canvas, mandate wall, the fold, lock card, magnetic CTAs. Honors `prefers-reduced-motion` (static end-states). |
| `assets/js/demo.js` | The real client-side FA(3) demo: **paste/CSV or real .xlsx upload (SheetJS lazy-loaded)** → auto-mapping (qty/unit separated by median-magnitude) → validation (NIP checksums, VAT catalogue, math) → preview + XML → simulated filing → **gate after 1 free run** (email unlock = 3 more, filing auto-resumes after unlock). |
| `assets/js/vendor/` | GSAP core + ScrollTrigger + SplitText (free plugins), self-hosted. |
| `assets/fonts/` | Self-hosted WOFF2 (latin + latin-ext for PL/RO diacritics), `font-display: swap`. |
| `assets/img/` | favicon (SVG+PNG), apple-touch-icon, `og.png` (1200×630, generated from `og-card.html`). |
| `assets/img/brand/` | Logo system: `logo-mark.svg` (ink square + green grid + folded document corner), `logo-horizontal.svg` (mark + wordmark), PNG exports (512/192/1200). Use these for social avatars, directories and partner decks. |
| `site.webmanifest` `llms.txt` `.well-known/security.txt` | PWA manifest, AI-assistant product brief (LLM-SEO), security contact policy. robots.txt explicitly allows GPTBot/ClaudeBot/PerplexityBot. |
| `assets/sample/arkusz-przyklad.xlsx` | Downloadable sample workbook used by the demo + e2e tests. |
| `_headers` `_redirects` | Cloudflare Pages config: strict CSP (no inline script/style on shipped pages), security headers, pretty URLs. If you set `FORM_ENDPOINT` to an external service, add its host to `connect-src` in `_headers`. |
| `launch-kit/` | Everything outside the website: PL validation-gate interview script, partner outreach emails, 5 video scripts + shorts, launch announcements (PH/FB/LinkedIn/directories), the single waitlist email. |
| `qa/` | Screenshots from the automated e2e run (desktop, demo, mobile, full page). |
| `og-card.html` | Source for regenerating `assets/img/og.png` (serve over HTTP, screenshot at 1200×630). Not linked from the site. |
| `LAUNCH_CHECKLIST.md` | What's done vs. what you do before/at launch, plus the 30-day plan. |

## Run locally

```bash
cd sheetpost-v2
python3 -m http.server 8123
# open http://127.0.0.1:8123
```

Any static host works (Cloudflare Pages / Netlify / Vercel / nginx). No build step, no backend, no cookies.

## Config points (edit before launch)

- **Waitlist endpoint:** `assets/js/app.js` → `const FORM_ENDPOINT = '';`
  Empty = localStorage-only. Set to a Formspree/Netlify/Polar endpoint to collect signups.
- **Pricing:** `index.html` (PL copy + `data-eur` / `data-pln` attributes) and mirrored in `assets/js/i18n.js`.
- **Mandate dates:** ticker `data-deadline` attributes in `index.html`; wall rows are plain HTML.
- **Free demo runs:** `assets/js/demo.js` → gate logic (`sp_runs` in localStorage; email unlock = `-3`).
- **Domain:** canonical/OG URLs assume `https://sheetpost.app/` — update everywhere if you pick another name.

## Quality gates already passed

- 38/38 automated e2e checks (headless Chrome), including: real .xlsx import → correct mapping (name/qty/unit/vat), totals (13 458,00 PLN) and XML field-level assertions (P_15, NIPs, 4 FaWiersz, FA(3) header, PLN), invalid-NIP negative path (live hint + blocked preview), gate close/ESC/email-unlock with auto-resume, mid-flow language switching, axe-core a11y (0 critical/serious), overflow sweep 320→1920px in PL+DE, motion assertions (machine phases, fold scrub, marquee).
- Historical first pass: 24/24 checks (console clean on desktop/mobile/reduced-motion, demo flow, currency, menu, fonts verified) console/pageerror/requestfail clean on desktop + mobile + reduced-motion, full demo flow (parse → map → validate → preview → simulated filing → paywall → email unlock), language switching (PL/EN/DE/HR/RO), currency toggle, mobile menu, no horizontal overflow at 390/1024/1440.
- WCAG AA contrast on sampled text pairs, touch targets ≥40px, `prefers-reduced-motion` honored, no emoji, no em/en dashes in copy, tabular numerals, fonts self-hosted (LCP = text).
