# DNS & email deliverability — exact records to set up at launch

Everything below goes into your DNS provider (e.g. Cloudflare, free plan). Do it ONCE on launch day, in this order: domain → MX/email → SPF → DKIM → DMARC.

## 0. Base records (website)
| Type | Name | Value | Proxy |
|---|---|---|---|
| A | `@` | `192.0.2.1` (or CNAME to your Pages target — Cloudflare Pages adds this automatically when you attach the custom domain) | auto |
| CNAME | `www` | `sheetpost.app` | auto |

Cloudflare Pages steps: Pages project → Custom domains → add `sheetpost.app` and `www.sheetpost.app` → it writes the CNAMEs for you. HTTPS certificates are automatic.

## 1. Mailbox (pick ONE provider)
| Provider | Cost | MX record (name `@`, priority 10 unless noted) |
|---|---|---|
| Cloudflare Email Routing → forward to your private inbox | $0 | none needed (forwarding) — best for day 1: `kontakt@`, `pomoc@`, `partnerzy@` all forward to you |
| Zoho Mail Forever | $0 | `mx.zoho.com` (10), `mx2.zoho.com` (20), `mx3.zoho.com` (50) |
| Purelymail | ~$10/yr | `mx1.purelymail.com` (10), `mx2.purelymail.com` (10) |

Day-1 recommendation: **Cloudflare Email Routing** (free, 5 min, forwards to your Gmail). Add real mailboxes when volume justifies.

## 2. SPF (TXT, name `@`) — pick per provider
- Cloudflare forwarding only: `v=spf1 include:_spf.mx.cloudflare.net ~all`
- Zoho: `v=spf1 include:zohomail.com ~all` (or `include:transmail.net` for Zoho Transactional)
- Purelymail: `v=spf1 include:purelymail.com ~all`
- Later, when the app sends from your domain via an ESP (Loops/Resend/etc.): add `include:<esp>` before `~all`.

## 3. DKIM (TXT, provider-specific selector names)
- Cloudflare Email Routing: DKIM handled by Cloudflare if you enable "send and receive" — follow the wizard.
- Zoho: Settings → Mail → DKIM → generate 1024/2048-bit → publishes TXT at `selector._domainkey` (e.g. `zmail._domainkey`) with the `v=DKIM1; k=rsa; p=MIIB...` value.
- Purelymail: dashboard → DKIM keys → TXT at `purelymail1._domainkey` and `purelymail2._domainkey`.

## 4. DMARC (TXT, name `_dmarc`) — start lenient, tighten later
Launch: `v=DMARC1; p=none; rua=mailto:kontakt@sheetpost.app; fo=1`
After 2-4 weeks of clean reports: `v=DMARC1; p=quarantine; rua=mailto:kontakt@sheetpost.app; pct=50`
Target by month 2: `v=DMARC1; p=reject; rua=mailto:kontakt@sheetpost.app`

Google/Yahoo/Microsoft require SPF+DKIM+DMARC for bulk senders — this trio is what keeps the waitlist email out of spam.

## 5. Verification digs (run after DNS propagates)
```bash
dig +short TXT sheetpost.app                      # SPF visible
dig +short TXT _dmarc.sheetpost.app               # DMARC visible
dig +short TXT <selector>._domainkey.sheetpost.app  # DKIM visible
dig +short MX sheetpost.app                       # MX visible
```
Then send a test to the Gmail "Show original" view: expect `SPF: PASS · DKIM: PASS · DMARC: PASS`.

## 6. App-sending notes (later, from revenue)
- The APP sends invoices to gov APIs, not marketing mail — no deliverability coupling.
- When you add transactional email (UPO notifications), use a subdomain (`powiadomienia.sheetpost.app`) with its own SPF/DKIM so marketing and transactional reputations stay separate.
- Never buy email lists. The 2026 sender rules get you domain-flagged for it.
