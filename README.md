# Pinchana Web

Pinchana Web is the official server-backed browser interface for Pinchana API. It verifies visitors with Cloudflare Turnstile, keeps the processing form locked until the API issues a browser session, previews normalized media, and saves individual files or ZIP archives in the browser.

## Configuration

Copy `.env.example` to `.env.local`:

```env
PINCHANA_API_URL=http://localhost:8080
NEXT_PUBLIC_TURNSTILE_SITE_KEY=REPLACE_WITH_PUBLIC_WIDGET_SITE_KEY
```

`PINCHANA_API_URL` is server-only. The browser never receives the API URL, machine API keys, or the signed Pinchana web session. For local UI testing, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` may use Cloudflare's always-pass test site key; production must use the site key registered for the deployed hostname.

The configured API instance must expose `POST /v1/web/scrape`. Pinchana Web
proxies that normalized v1 response through its same-origin `/api/scrape`
route; older instances that only expose legacy `/web/scrape` are not supported.

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

The build automatically embeds the current Web Git commit when repository
metadata is available. Compose passes `NEXT_PUBLIC_PINCHANA_WEB_COMMIT` into
the image build because repository metadata is intentionally excluded from the
Docker context. The Settings About page links that revision to the public
source.

The interface uses cookie-based locale selection without locale-prefixed URLs.
English and Ukrainian are active, with the language picker in the workspace's
top-right corner. The Settings translation link opens the public
[translation guide](https://docs.pinchana.cc/translating/), which explains the
JSON catalog layout, review gates, and pull-request workflow.

The production Compose stack builds an immutable local image and tags it as
`pinchana-web:latest` by default. Override `PINCHANA_WEB_IMAGE` when the host
needs a different local tag, then rebuild and recreate the service with:

```bash
docker compose --env-file .env config --quiet
docker compose --env-file .env up --detach --build
```

## Development

```bash
bun install --frozen-lockfile
bun run dev
```

Then open `http://localhost:3000`. The responsive Settings dialog groups General, YouTube, Cookie Vault, and API instance controls. Ordinary preferences save immediately in the browser; changing the API instance still requires an explicit signed-instance verification step.

## Private downloads and Cookie Vault

The web client feature-detects protocol-v2 DLP through `/api/capabilities`. YouTube and youtu.be URLs use DLP. Cookie profiles are optional and must be selected explicitly for each browser session. Capability-advertised controls offer fixed quality ceilings, Auto/H.264/AV1/VP9 codec preference, and Auto/MP4/WebM/MKV containers without exposing raw yt-dlp format strings. YouTube video downloads can also embed a preferred subtitle language, using creator subtitles first and automatic captions as a fallback.

All browser and DLP downloads include `[pinchana.cc]` in their filename. General settings provide Classic, Basic, Pretty (default), and Nerdy filename styles with live examples; filenames are sanitized and kept within a conservative UTF-8 byte limit. Twitter/X animated posts remain efficient looping video by default. Users who require a GIF file can enable **Convert Twitter GIFs**, which performs an explicit browser-side conversion.

The About & diagnostics settings section shows the Web revision, the API's
sanitized public module manifest, coarse browser/device information, and generic
processing state. Its copy action intentionally excludes submitted URLs, media
metadata, cookie-vault data, custom API addresses, IP addresses, and the full
browser user agent.

The Cookie Vault stores one AES-256-GCM ciphertext in IndexedDB. PBKDF2-SHA256 uses a device-calibrated count with a 600,000-iteration minimum, and the derived key is never persisted. Profile labels, domains, and cookies are encrypted together. The browser performs X25519/HKDF/AES-GCM job encryption before the same-origin Next.js proxy sees the request.

Run the static checks with:

```bash
bun run test
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
