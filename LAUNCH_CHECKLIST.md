# LAUNCH CHECKLIST — Sheetpost

Status: **website launch-ready** (built, tested, packaged). Everything with a checkbox is yours.
Rule of the house: **the validation gate comes before any spend beyond the domain.**

---

## A. Done in this build (nothing to do)

- [x] Full marketing site: hero filing machine (auto-loop, cursor-reactive cell field), format marquee, mandate wall (honest Aug-2026 statuses), 3-step how-it-works, **working in-browser FA(3) demo** (paste/CSV → auto column mapping → validation with real NIP checksums + PL VAT catalogue → invoice + XML preview → simulated KSeF filing with UPO receipt → downloadable XML)
- [x] **Test-once-then-paywall gate**: 1 free run, then gate overlay; email unlock grants 3 more runs (lead capture, stored locally until you wire an endpoint)
- [x] 5 languages: PL (static, SEO default) + EN/DE/HR/RO switcher, `<html lang>` + meta swap, no layout shift
- [x] Currency toggle PLN/EUR across pricing + price-lock card
- [x] The fold: ink world → paper world transition; guarantee section (price-lock card, one-click cancel, export, fallback)
- [x] Pricing (Free / Solo / Business / Księgowy) + accountant partner band (25 clients, 20–30% rev-share)
- [x] FAQ written for LLM citation (including the honest "free gov app is enough for single invoices" answer)
- [x] Waitlist form with consent checkbox + honeypot; success state with stamp
- [x] Legal pages (privacy/terms/cookies, PL+EN), 404, robots, sitemap, JSON-LD (SoftwareApplication), OG/Twitter cards, canonical, hreflang
- [x] OG image (1200×630, real brand font) + favicon set (SVG/PNG/apple-touch)
- [x] **Real .xlsx import** in the demo (drop the actual Excel file; SheetJS loads on demand), sample workbook downloadable from the page
- [x] Deploy configs: strict Content-Security-Policy + security headers (`_headers`), pretty URLs (`_redirects`) — no inline scripts/styles on shipped pages
- [x] Launch kit (`launch-kit/`): PL Mom-Test interview script, partner outreach emails (PL/EN), 5 video scripts + shorts plan, PH/FB/LinkedIn/directory copy, the single waitlist email
- [x] **Scroll-driven device sequence** (`#rig-sec`): a laptop opens, the sheet is scanned, columns wire themselves to FA(3) fields, the checks tick, the document is stamped and a phone slides in with the KSeF receipt. Four beats driven by scroll progress, so scrubbing backwards rewinds it; collapses to its final frame under reduced motion or without GSAP.
- [x] **Committed quality gates** you can run yourself: `npm test` = eslint (zero warnings) + 29 static checks + 207 browser assertions, covering the full demo flow, parser edge cases, all five locales, a 13-width responsive sweep, WCAG AA contrast with proper alpha compositing, focus management, reduced-motion and no-GSAP fallbacks, and a console sweep that fails on any error, warning or failed request
- [x] Budget: hosting $0 (static), fonts/libs self-hosted, no tracking cookies

## B. Your launch steps (in order)

1. **[ ] Domain — ~$12–15/yr.** `sheetpost.app` showed no DNS records (likely free); `sheetpost.com` is taken; `sheetpost.io` also looks free. Verify at a registrar and buy. Update the canonical/OG/sitemap URLs in the files if you pick anything else (find `sheetpost.app`).
2. **[ ] Deploy — $0.** Cloudflare Pages: create account → "Upload assets" (drag the folder or upload `sheetpost-v2.zip`) → add custom domain after DNS. No build command, output dir = root. `_headers` + `_redirects` are picked up automatically (strict CSP is already configured; if you set `FORM_ENDPOINT` to Formspree or similar, add its host to `connect-src` in `_headers`).
3. **[ ] Waitlist endpoint — $0.** Create a Formspree (free tier) form; paste the URL into `assets/js/config.js` → `formEndpoint`, then add its host to `connect-src` in `_headers`. Until then signups land in visitors' localStorage only (they still see the success state).
3b. **[ ] Legal identity — the one hard blocker.** Fill `legalName`, `registryNo`, `taxId` and `address` in `assets/js/config.js`. Until they are set, the footer imprint and the controller sentence in the privacy policy are omitted rather than printed with placeholders. `npm run test:launch` fails while they are empty.
4. **[ ] Analytics — $0, optional.** Cloudflare Web Analytics (cookie-free, fits the privacy page). Do NOT add cookie-based analytics — the cookies page promises none.
5. **[ ] Support email — $0.** Something like `kontakt@sheetpost.app` via a free tier (Zoho Mail / Cloudflare Email Routing forwarding to your inbox).
6. **[ ] Legal pass — recommended.** Privacy/terms are solid templates written for this exact setup (vendor-not-issuer, demo local-only, MoR for payments). Have a lawyer glance at them before you charge money. Note on the site: Serbian sole trader selling EU-wide via a merchant-of-record is the researched path (Polar.sh / Lemon Squeezy both accept Serbian sellers; Stripe does not).
7. **[ ] Validation gate — $0, 2 weeks. BEFORE any ads:**
   - Join 3 Polish KSeF / entrepreneur Facebook groups; answer questions for a week (no links).
   - 8–10 Mom-Test chats: "How do you get invoices into KSeF today? What do you pay? What broke in April?"
   - Kill/test logic: if ≥5/10 are happy with the free gov portal and refuse ~39–59 PLN/mo for spreadsheet-native validation + archive → stop, use the fallback idea (late-payment AR wedge, same accountant channel).
   - Pre-sell the price-locked founder plan to 2–3 paying pilots. **Cash in = build the app. Zero cash = don't.**
8. **[ ] KSeF 2.0 tool certification — free/nominal (parallel track).** Ministry of Finance test environment; this is the only software-vendor gate for real filing. Budget days, not dollars.

## C. First-30-days marketing plan (all $0, uses your video skill)

- **Community embedded selling (weeks 1–4):** one niche (Polish spreadsheet-run micro-SMBs), 3 places they gather, 5 useful replies/day, one build-in-public post week 2, free-setup offer for the first 5 commenters → convert to price-locked founder plan week 3–4. Every paying user: ask for one peer intro.
- **Founder video (weeks 1–∞):** 6–10 search-titled how-tos + 3–5 Shorts cut from each. Hooks that match buyer search: "Jak wysłać fakturę do KSeF z Excela w 60 sekund", "KSeF bez programu księgowego", "Excel → KSeF: pełny walkthrough", "XRechnung aus Excel", "KSeF 2027: mikrofirmy, to musisz wiedzieć". Structure: pain hook → 90-sec demo (screen-record the site demo!) → one CTA to the site.
- **1:1 outreach with video audit (weeks 2–12):** hand-built list of 200 ICP businesses; for the best 50, a 60–90s personalized screen recording showing their workflow solved; send as DM/plain 1:1 email (SPF/DKIM/DMARC once); ask one question, sell nothing. Kill after 200 quality touches at <2% replies.
- **Concierge bridge (weeks 1–8):** sell a done-for-you "your sheet → KSeF-compliant" setup at 5–10× SaaS price to the first clients; every manual delivery = a workflow spec + a mini case study + video content.
- **Launch amplifier (weeks 6–8, only after social proof):** Product Hunt once + 15–20 directories; expectations: 500–1,000 curious visitors, ~0 customers without follow-up — DM every commenter, offer a launch-only annual deal.
- **SEO/LLM-citation:** already seeded (FAQ + mandate wall + pricing transparency). It compounds from month 4–6; don't rely on it sooner.

## D. Metrics & kill switches

- North star: **cash pilots from the validation gate** (target 2–3 in 14 days), then paid subs.
- Site: demo starts, gate email submissions, waitlist signups, DE/EN traffic share (tells you where to translate content next).
- Kill/switch rules: validation gate fails → fallback idea (same channel). Gate emails <10 after 500 demo runs → change demo placement/hero CTA before touching price.

## E. Editing notes

See **[HANDOFF.md](HANDOFF.md)** for the full picture. The short version:

- Everything you must configure to go live: `assets/js/config.js`.
- Copy (non-PL): `assets/js/i18n.js` (5 dicts, one key set). PL static copy lives
  in `index.html` **and** in the `pl` dict, and `npm run check` fails if they drift.
- Prices: `data-pln` / `data-eur` / `data-ron` in `index.html`, mirrored in the
  JSON-LD offers and in any price mentioned in prose (`hero_sub_strong`, `cta_p`).
- Mandate wall rows: plain HTML in `index.html` (`#wall`) with statuses and
  market sizes in the dictionary; tickers: `data-deadline` attributes.
- Run `npm test` before every deploy.

## F. Facts with a shelf life

Re-check these before launch and each quarter; they are dated claims:

- the three countdown deadlines (`data-deadline` in `index.html`)
- every mandate-wall status and market size (`w_*_st`, `w_*_pool`)
- the "Stan na 08/2026" note under the wall (`wall_note`)
- `.well-known/security.txt` → `Expires`
- Demo free-run policy: `assets/js/demo.js` (`sp_runs`, email unlock = 3 bonus).
- Regenerate OG after copy changes: serve folder over HTTP, open `og-card.html`, screenshot at 1200×630.
