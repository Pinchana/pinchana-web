import type {Metadata} from "next";
import Link from "next/link";
import SendTestErrorButton from "./SendTestErrorButton";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Sentry verification | Pinchana",
  robots: {index: false, follow: false},
};

export default function DoNotPage() {
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>Diagnostics</p>
        <h1>Do not.</h1>
        <p className={styles.summary}>
          Unless you are verifying this deployment’s Sentry integration. The test includes no
          submitted URL, filename, account data, or other user content.
        </p>
        <SendTestErrorButton />
        <Link href="/" className={styles.back}>Back to Pinchana</Link>
      </section>
    </main>
  );
}
