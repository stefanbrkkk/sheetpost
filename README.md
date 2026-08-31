# Sheetpost — marketing site

Static, no build step, five languages. The dark "ink world" (the spreadsheet)
scrolls into one light "paper world" act (the official document) and back.

**Start with [HANDOFF.md](HANDOFF.md)** — it covers the concept, the file map,
the script contracts, the demo engine, and the short list of things you must
fill in before launch.

## Run

```bash
npm install
npm run serve      # http://127.0.0.1:8123
```

## Test

```bash
npm test           # lint + static checks + ~205 browser assertions
npm run test:launch  # the same, with launch blockers promoted to failures
```

| Script | What it gates |
|---|---|
| `npm run lint` | eslint over `assets/js` (vendor excluded), zero warnings allowed |
| `npm run check` | CSP compatibility, i18n parity and drift, copy hygiene, dead references, repo hygiene |
| `npm run e2e` | the whole site in a real browser: hero, language, currency, the FA(3) demo end to end, parser edge cases, forms, navigation, the rig, a 13-width responsive sweep, accessibility, reduced-motion and no-GSAP fallbacks, and a console sweep across all five locales |

## Before launch

Edit `assets/js/config.js` (legal identity, waitlist endpoint) and run
`npm run check:launch`. Details and the rest of the launch list are in
[HANDOFF.md](HANDOFF.md) and [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md).

## What's inside

| Path | What |
|---|---|
| `index.html` | The single-page site. Polish is the static/no-JS default (SEO); EN/DE/HR/RO come from the dictionary. |
| `privacy.html` `terms.html` `cookies.html` | Legal pages, PL/EN toggle. Templates, not legal advice. |
| `404.html` `robots.txt` `sitemap.xml` `llms.txt` | Launch plumbing, including the AI-assistant product brief. |
| `assets/css/*` | Ten stylesheets, tokenised. `tokens.css` first. |
| `assets/js/config.js` | The only file you edit to go live. |
| `assets/js/i18n.js` | Five locales, one key set, enforced by `npm run check`. |
| `assets/js/app.js` | Language, currency, nav and reading progress, countdowns, waitlist. |
| `assets/js/motion.js` | GSAP choreography: hero, the machine, the scroll-driven laptop rig, the fold, magnetic CTAs. Every effect is additive. |
| `assets/js/demo.js` | The real client-side FA(3) engine: paste or `.xlsx` → header-driven column mapping → six real validations → human + XML preview → simulated filing → the email gate. |
| `assets/sample/arkusz-przyklad.xlsx` | The sample workbook the demo and the tests both use. |
| `_headers` `_redirects` | Cloudflare Pages: a strict CSP with no `unsafe-inline`, security headers, pretty URLs. |
| `launch-kit/` | Everything outside the website: validation interviews, partner outreach, video scripts, launch announcements, the waitlist email, DNS and deliverability. |
| `tests/` | `checks.mjs` (static) and `e2e.mjs` (browser). |

## House rules

- No inline styles or scripts anywhere: the production CSP has no
  `unsafe-inline`, and `npm run check` enforces it.
- No emoji, no em or en dashes. The separator is `·`.
- Polish markup and the `pl` dictionary must stay byte-identical.
- Hidden animation start states live in JavaScript, never in CSS, so a failed
  GSAP load leaves a finished page rather than an invisible one.
