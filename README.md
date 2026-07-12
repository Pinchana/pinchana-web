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

## Development

```bash
bun install
bun run dev
```

Then open `http://localhost:3000`. Settings are browser-local and default to immediate saving with ZIP archives for multi-file results.
