import Link from "next/link";

export default function UsagePage() {
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
          <h1>Terms of Use</h1>
          <p className="last-updated">Last Updated: July 12, 2026</p>

          <h3>1. Acceptance of Terms</h3>
          <p>By accessing or using Pinchana, you agree to be bound by these Terms of Use and all applicable laws and regulations.</p>

          <h3>2. Permitted Use and Copyright</h3>
          <p>Pinchana is a general utility tool designed to help you download media for personal, educational, and non-commercial use. You are solely responsible for ensuring you have the legal right, permissions, or copyright clearances from the respective creators before downloading or distributing any media accessed through this tool.</p>

          <h3>3. Prohibited Activities</h3>
          <p>You agree not to use Pinchana to:</p>
          <ul>
            <li>Infringe upon the intellectual property rights of any third party.</li>
            <li>Automate requests, scrapers, or scripts to abuse our API infrastructure.</li>
            <li>Attempt to bypass security constraints, rate limits, or verification protocols.</li>
          </ul>

          <h3>4. Limitation of Liability</h3>
          <p>Pinchana is provided on an "as is" and "as available" basis without warranties of any kind. We do not host the content you download, and we shall not be held liable for any copyright infringements, damages, data losses, or legal disputes arising from your use of the tool.</p>

          <h3>5. Changes to Terms</h3>
          <p>We reserve the right to modify these Terms at any time. Your continued use of the website following changes constitutes acceptance of the new Terms.</p>
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
