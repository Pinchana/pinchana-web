import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import styles from "../legal.module.css";

export default function PolicyPage() {
  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.back}>
          <FontAwesomeIcon icon={faArrowLeft} />
          Pinchana
        </Link>
        <nav className={styles.switcher} aria-label="Legal documents">
          <Link href="/policy" aria-current="page">Privacy</Link>
          <Link href="/usage">Terms</Link>
        </nav>
      </header>

      <article className={styles.document}>
        <header className={styles.intro}>
          <p className={styles.kicker}>Legal · Privacy</p>
          <h1>Privacy, without surprises.</h1>
          <p className={styles.summary}>How Pinchana processes requests, protects the web interface, and stores the few preferences needed to make the app work.</p>
          <p className={styles.meta}><span aria-hidden="true" />Effective July 13, 2026</p>
        </header>

        <section className={styles.section}>
          <span className={styles.number}>01</span>
          <div className={styles.sectionBody}>
            <h2>Introduction</h2>
            <p>Welcome to Pinchana. We respect your privacy and are committed to protecting any personal data processed through our website.</p>
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.number}>02</span>
          <div className={styles.sectionBody}>
            <h2>Data processing and storage</h2>
            <p>Pinchana operates as a direct stream downloader utility. We do not build a user media library or retain downloaded media files. Media may pass through temporary server memory while a request is processed.</p>
            <p>Submitted URLs and technical request details may appear in short-lived operational logs used for security, abuse prevention, and troubleshooting.</p>
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.number}>03</span>
          <div className={styles.sectionBody}>
            <h2>Turnstile security</h2>
            <p>We use Cloudflare Turnstile to protect our API endpoints from automated spam and bot abuse. Cloudflare Turnstile collects telemetry, device parameters, and browser details to perform verification checks.</p>
            <p>For more information, refer to the <a href="https://www.cloudflare.com/en-gb/turnstile-privacy-policy/" target="_blank" rel="noopener noreferrer">Cloudflare Turnstile Privacy Policy</a>.</p>
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.number}>04</span>
          <div className={styles.sectionBody}>
            <h2>Cookies and local storage</h2>
            <p>We use only storage that is necessary for security and your local preferences.</p>
            <dl className={styles.definitions}>
              <div>
                <dt>pinchana_web_session</dt>
                <dd>An HttpOnly, SameSite=Strict session cookie containing a signed verification credential. It authorizes web downloads and becomes invalid when the verification session expires.</dd>
              </div>
              <div>
                <dt>pinchana_instance</dt>
                <dd>An HttpOnly, SameSite=Strict cookie containing the project-signed certificate for a custom API origin selected in Settings. It expires with that certificate and is removed when the default API is restored.</dd>
              </div>
              <div>
                <dt>cf_clearance</dt>
                <dd>Cloudflare may set this strictly necessary security cookie only when Turnstile pre-clearance or a Cloudflare Challenge is enabled. It records that the browser passed a security check and expires according to the configured challenge-passage period.</dd>
              </div>
              <div>
                <dt>pinchana-settings</dt>
                <dd>Local browser storage for Save immediately, ZIP multiple files, background paws, reduced motion, and the selected download mode.</dd>
              </div>
              <div>
                <dt>pinchana_cookie_consent</dt>
                <dd>Local browser storage recording that the essential-storage notice was acknowledged.</dd>
              </div>
            </dl>
            <p>We do not use analytical, tracking, advertising, or marketing cookies.</p>
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.number}>05</span>
          <div className={styles.sectionBody}>
            <h2>External platforms</h2>
            <p>This service interacts server-side with third-party platforms such as Instagram, TikTok, and YouTube. Pinchana does not embed their login widgets or scripts, so using the downloader does not itself let those platforms set cookies in your browser.</p>
            <p>Following an external link is subject to that platform&apos;s own privacy and cookie policies.</p>
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.number}>06</span>
          <div className={styles.sectionBody}>
            <h2>Icons</h2>
            <p>Font Awesome icons are packaged and served locally with this website. The browser does not contact a Font Awesome CDN, and Font Awesome does not set cookies through this integration.</p>
          </div>
        </section>

        <footer className={styles.end}>
          <span>Pinchana · Privacy Policy</span>
          <Link href="/">Return to the downloader</Link>
        </footer>
      </article>
    </main>
  );
}
