# DEPLOYMENT — Sheetpost

## Current state
- Code: pushed to GitHub — `stefanbrkkk/sheetpost` (private, branch `main`).
- The site is 100% static: any static host works. No build step, no environment variables, no server.

## Recommended: Vercel (2 minutes, uses the repo you just pushed)
1. Go to https://vercel.com/new and sign in with GitHub.
2. Grant Vercel access to the `stefanbrkkk/sheetpost` repository (it is private).
3. Import it. Vercel auto-detects "Other" (static) — leave all build settings empty.
   - Framework preset: none / Other. Build command: (leave empty). Output directory: `./`
4. Deploy. You get a `*.vercel.app` preview URL instantly.
5. When you buy `sheetpost.app`, add it: Project → Settings → Domains → add domain, then point the nameservers or CNAME as instructed (Vercel gives you the exact records; SSL is automatic).

## Alternatives
| Host | How | Notes |
|---|---|---|
| Cloudflare Pages | Pages → Upload assets (drag the folder) or connect the GitHub repo | Free, `_headers` + `_redirects` are applied automatically (they are already in the repo) |
| Netlify | Drag-and-drop the site folder at app.netlify.com/drop | Fastest manual option; rename `_headers`/`_redirects` config as needed (Netlify uses the same filenames) |
| GitHub Pages | Only if the repo becomes public (or GitHub Pro) → Settings → Pages → deploy from `main` | The repo is currently private; strict CSP `_headers` does NOT apply on GitHub Pages (fine — headers are a hardening bonus, the site works without them) |

## Before you publish publicly

Everything you must fill in now lives in one file: **`assets/js/config.js`**.

1. Legal identity (`legalName`, `registryNo`, `taxId`, `address`). Until these
   are set, the footer imprint and the controller sentence in the privacy
   policy are omitted rather than shown with placeholders.
2. `formEndpoint` — a real form endpoint (Formspree's free tier works) so
   waitlist signups reach you. **Then add its host to `connect-src` in
   `_headers`**, or the strict CSP will block the request.
3. Verify with `npm run test:launch`. It fails while step 1 is outstanding.
4. Buy the domain and attach it (instructions above). If the domain is not
   `sheetpost.app`, grep for it: canonical URLs, hreflang, `sitemap.xml`,
   `og:*` and `llms.txt` all name it.
5. Optional analytics: Cloudflare Web Analytics (cookie-free, which keeps the
   no-cookies promise in the privacy policy true). Anything else needs a
   consent banner and a privacy-policy update.

## A note on the Content-Security-Policy

`_headers` ships `default-src 'self'` with **no** `unsafe-inline`. That is not
decorative: the site has zero inline styles and zero inline scripts, and
`npm run check` fails if anyone adds one. Hosts that ignore `_headers`
(GitHub Pages) still serve a working site; they just lose the hardening.

## AI API key — not needed
The site requires **no AI API key**. The demo's "AI column mapping" runs as deterministic client-side heuristics (column-type detection + median-magnitude classification) — it makes zero network calls, which is also why the GDPR posture is so clean. If you later want AI-assisted mapping in the actual app, free tiers exist (Google AI Studio / Gemini free tier, Groq free tier, Mistral free tier) — configure that in the app, never in this marketing site.
