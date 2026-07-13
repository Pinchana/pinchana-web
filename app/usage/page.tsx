import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import styles from "../legal.module.css";

export default function UsagePage() {
  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.back}>
          <FontAwesomeIcon icon={faArrowLeft} />
          Pinchana
        </Link>
        <nav className={styles.switcher} aria-label="Legal documents">
          <Link href="/policy">Privacy</Link>
          <Link href="/usage" aria-current="page">Terms</Link>
        </nav>
      </header>

      <article className={styles.document}>
        <header className={styles.intro}>
          <p className={styles.kicker}>Legal · Terms</p>
          <h1>Use Pinchana responsibly.</h1>
          <p className={styles.summary}>The rules for using the service, respecting creators, and keeping Pinchana&apos;s shared infrastructure available.</p>
          <p className={styles.meta}><span aria-hidden="true" />Effective July 12, 2026</p>
        </header>

        <section className={styles.section}>
          <span className={styles.number}>01</span>
          <div className={styles.sectionBody}>
            <h2>Acceptance of terms</h2>
            <p>By accessing or using Pinchana, you agree to be bound by these Terms of Use and all applicable laws and regulations.</p>
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.number}>02</span>
          <div className={styles.sectionBody}>
            <h2>Permitted use and copyright</h2>
            <p>Pinchana is a general utility tool designed to help you download media for personal, educational, and non-commercial use.</p>
            <p>You are solely responsible for ensuring you have the legal right, permissions, or copyright clearances from the respective creators before downloading or distributing any media accessed through this tool.</p>
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.number}>03</span>
          <div className={styles.sectionBody}>
            <h2>Prohibited activities</h2>
            <p>You agree not to use Pinchana to:</p>
            <ul className={styles.list}>
              <li>Infringe upon the intellectual property rights of any third party.</li>
              <li>Automate requests, scrapers, or scripts to abuse our API infrastructure.</li>
              <li>Attempt to bypass security constraints, rate limits, or verification protocols.</li>
            </ul>
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.number}>04</span>
          <div className={styles.sectionBody}>
            <h2>Limitation of liability</h2>
            <p>Pinchana is provided on an &quot;as is&quot; and &quot;as available&quot; basis without warranties of any kind.</p>
            <p>We do not host the content you download, and we shall not be held liable for any copyright infringements, damages, data losses, or legal disputes arising from your use of the tool.</p>
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.number}>05</span>
          <div className={styles.sectionBody}>
            <h2>Changes to these terms</h2>
            <p>We reserve the right to modify these Terms at any time. Your continued use of the website following changes constitutes acceptance of the new Terms.</p>
          </div>
        </section>

        <footer className={styles.end}>
          <span>Pinchana · Terms of Use</span>
          <Link href="/">Return to the downloader</Link>
        </footer>
      </article>
    </main>
  );
}
