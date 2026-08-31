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

## Before you publish publicly — 5-minute checklist
1. Fill the launch-blocker placeholders (search the repo for `[___]` and `[pełna`):
   - `index.html` footer imprint: your full name, APR number, PIB, address
   - `privacy.html`: controller name + APR + address (same data)
2. Set `FORM_ENDPOINT` in `assets/js/app.js` to a real form endpoint (Formspree free tier) so waitlist emails actually reach you.
3. Buy the domain and attach it (Vercel/Cloudflare instructions above).
4. Optional analytics: Cloudflare Web Analytics (cookie-free — keeps the no-cookies promise in the privacy policy).

## AI API key — not needed
The site requires **no AI API key**. The demo's "AI column mapping" runs as deterministic client-side heuristics (column-type detection + median-magnitude classification) — it makes zero network calls, which is also why the GDPR posture is so clean. If you later want AI-assisted mapping in the actual app, free tiers exist (Google AI Studio / Gemini free tier, Groq free tier, Mistral free tier) — configure that in the app, never in this marketing site.
