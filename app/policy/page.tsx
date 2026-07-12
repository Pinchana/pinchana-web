import Link from "next/link";

export default function PolicyPage() {
  return (
    <main className="app-shell legal-page">
      <header className="legal-header">
        <Link href="/" className="back-link">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          Back to Pinchana
        </Link>
      </header>
      <section className="workspace legal-workspace">
        <div className="legal-content">
          <p className="eyebrow">Legal</p>
          <h1>Privacy Policy</h1>
          <p className="last-updated">Last Updated: July 12, 2026</p>
          
          <h3>1. Introduction</h3>
          <p>Welcome to Pinchana. We respect your privacy and are committed to protecting any personal data processed through our website.</p>

          <h3>2. Data Processing and Storage</h3>
          <p>Pinchana operates as a direct stream downloader utility. We do not store, host, or log the media URLs you submit, nor do we save downloaded media files on our servers. All media data is either downloaded directly from the source platform via your browser or streamed through our temporary server memory buffer strictly to complete the download request.</p>

          <h3>3. Turnstile Security and Captcha</h3>
          <p>We use Cloudflare Turnstile to protect our API endpoints from automated spam and bot abuse. Cloudflare Turnstile collects telemetry, device parameters, and browser details to perform verification checks. For detailed information, please refer to the <a href="https://www.cloudflare.com/en-gb/turnstile-privacy-policy/" target="_blank" rel="noopener noreferrer">Cloudflare Turnstile Privacy Policy</a>.</p>

          <h3>4. Cookies</h3>
          <p>We only use strictly necessary cookies required for the operation of the site:</p>
          <ul>
            <li><code>pinchana_web_session</code>: Stores your encrypted session verification token to authorize downloads. Expires automatically.</li>
            <li>Cloudflare Turnstile Cookies: Set by Cloudflare to ensure security verification and prevent bot request loops.</li>
          </ul>
          <p>We do not use any analytical, tracking, advertising, or marketing cookies.</p>

          <h3>5. External Third-Party Links</h3>
          <p>This service interacts with third-party platforms (such as Instagram, TikTok, and YouTube) to scrape download URLs. When you query a URL, those platforms may process technical data or requests in accordance with their respective privacy policies.</p>
        </div>
      </section>

      <style>{`
        .legal-page {
          max-width: 680px;
          margin: 0 auto;
          padding: 40px 20px 80px;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .legal-header {
          display: flex;
          align-items: center;
        }
        .back-link {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--muted);
          text-decoration: none;
          font-size: 14px;
          transition: color 0.18s ease;
        }
        .back-link:hover {
          color: var(--text);
        }
        .legal-workspace {
          background: none;
          border: none;
          padding: 12px 0;
          box-shadow: none;
        }
        .legal-content h1 {
          font-size: 28px;
          font-weight: 700;
          margin: 8px 0 24px;
          color: var(--text);
        }
        .legal-content h3 {
          font-size: 16px;
          font-weight: 600;
          margin: 32px 0 12px;
          color: var(--text);
        }
        .legal-content p {
          color: #c8c8c8;
          font-size: 14px;
          line-height: 1.6;
          margin: 0 0 16px;
        }
        .legal-content ul {
          margin: 0 0 16px;
          padding-left: 20px;
          color: #c8c8c8;
          font-size: 14px;
          line-height: 1.6;
        }
        .legal-content li {
          margin-bottom: 8px;
        }
        .legal-content code {
          background: rgba(255, 255, 255, 0.08);
          padding: 2px 6px;
          border-radius: 4px;
          font-family: monospace;
          font-size: 12px;
        }
        .legal-content a {
          color: var(--text);
          text-decoration: underline;
        }
        .legal-content a:hover {
          color: #fff;
        }
        .last-updated {
          color: var(--muted) !important;
          font-size: 12px !important;
          margin-bottom: 32px !important;
        }
      `}</style>
    </main>
  );
}
