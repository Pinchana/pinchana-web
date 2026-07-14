# Pinchana Web

A lightweight AMOLED-only browser interface for Pinchana API. It verifies visitors on page load with Cloudflare Turnstile, keeps the URL bar locked until the API issues a browser session, previews returned media, and saves single or ZIP downloads in the browser.

## Configuration

Copy `.env.example` to `.env.local`:

```env
PINCHANA_API_URL=http://localhost:8080
NEXT_PUBLIC_TURNSTILE_SITE_KEY=your-widget-site-key
```

`PINCHANA_API_URL` is server-only. The browser never receives the API URL, machine API keys, or the signed Pinchana web session. For local UI testing, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` may use Cloudflare's always-pass test site key; production must use the site key registered for the deployed hostname.

The Pinchana API must separately configure the private Turnstile secret:

```env
TURNSTILE_SECRET_KEY=your-private-widget-secret
TURNSTILE_EXPECTED_HOSTNAME=pinchana.example.com
TURNSTILE_EXPECTED_ACTION=turnstile-spin-v1
TURNSTILE_SESSION_SECRET=a-random-secret-of-at-least-32-characters
```

The widget includes `data-action="turnstile-spin-v1"` through its explicit-render configuration. The browser sends the one-use token to Pinchana API through the same-origin Next.js route; only Pinchana API calls Cloudflare Siteverify, and the secret is never sent to the browser.

Production requires an HTTPS `PINCHANA_API_URL`, a Turnstile site key registered
for the exact web hostname, and the project Ed25519 public key in
`PINCHANA_INSTANCE_PUBLIC_KEY`. Deploy the web build while the API still reports
DLP unavailable, complete the DLP canary, and only then enable the API
capability. Never add DLP gateway, Redis, VPN, or cookie secrets to the web
deployment environment.

## Development

```bash
bun install
bun run dev
```

Then open `http://localhost:3000`. The responsive Settings dialog groups General, Private downloads, Cookie Vault, and API instance controls. Ordinary preferences save immediately in the browser; changing the API instance still requires an explicit signed-instance verification step.

## Private downloads and Cookie Vault

The web client feature-detects protocol-v2 DLP through `/api/capabilities`. YouTube and youtu.be URLs always use DLP; other URLs use it only when Private mode is enabled. Cookie profiles are optional and must be selected explicitly for each browser session. Capability-advertised controls offer fixed quality ceilings, Auto/H.264/AV1/VP9 codec preference, and Auto/MP4/WebM/MKV containers without exposing raw yt-dlp format strings.

The Cookie Vault stores one AES-256-GCM ciphertext in IndexedDB. PBKDF2-SHA256 uses a device-calibrated count with a 600,000-iteration minimum, and the derived key is never persisted. Profile labels, domains, and cookies are encrypted together. The browser performs X25519/HKDF/AES-GCM job encryption before the same-origin Next.js proxy sees the request.

Run the static checks with:

```bash
bun run lint
bun run build
```

## License and official status

Pinchana Web is the only official Pinchana wrapper other than the official
Telegram bot. The interface is licensed under the
[GNU Affero General Public License v3.0 only](LICENSE) so modified versions
offered over a network must keep their corresponding source available under
the same license. This protects the official wrapper from becoming a closed,
unaccountable derivative while keeping the code available for inspection,
modification, and redistribution under the AGPL.

Copyright (C) 2026 Pinchana Developers within FireFly Team.
