import Link from "next/link";
import styles from "./mobile.module.css";

export default function MobileUnavailable() {
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="mobile-title">
        <span className={styles.eyebrow}>Desktop only for now</span>
        <h1 id="mobile-title">Pinchana is not ready for mobile yet.</h1>
        <p>
          The download workspace currently needs a desktop-sized browser. We are keeping mobile
          access closed until the interface and media workflow work properly on smaller screens.
        </p>
        <div className={styles.actions}>
          <a href="https://docs.pinchana.cc">Read the docs</a>
          <a href="https://t.me/pinchanabot" target="_blank" rel="noopener noreferrer">
            Use the Telegram bot
          </a>
        </div>
        <nav aria-label="Legal links">
          <Link href="/policy">Privacy Policy</Link>
          <span aria-hidden="true">·</span>
          <Link href="/usage">Terms of Use</Link>
        </nav>
      </section>
    </main>
  );
}
