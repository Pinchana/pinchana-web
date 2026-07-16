import Link from "next/link";
import styles from "./mobile.module.css";
import {getTranslations} from "next-intl/server";

export default async function MobileUnavailable() {
  const t = await getTranslations("mobile");
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="mobile-title">
        <span className={styles.eyebrow}>{t("eyebrow")}</span>
        <h1 id="mobile-title">{t("title")}</h1>
        <p>{t("description")}</p>
        <div className={styles.actions}>
          <a href="https://docs.pinchana.cc">{t("docs")}</a>
          <a href="https://t.me/pinchanabot" target="_blank" rel="noopener noreferrer">
            {t("telegram")}
          </a>
        </div>
        <nav aria-label={t("legal")}>
          <Link href="/policy">{t("privacy")}</Link>
          <span aria-hidden="true">·</span>
          <Link href="/usage">{t("terms")}</Link>
        </nav>
      </section>
    </main>
  );
}
