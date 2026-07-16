import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import styles from "../legal.module.css";
import {getLegalTranslator} from "@/i18n/legal";
import LegalTranslationNotice from "../components/LegalTranslationNotice";

export default async function UsagePage({searchParams}: {searchParams: Promise<{legal?: string}>}) {
  const {legal} = await searchParams;
  const {t, isCommunityTranslation, isFallback} = await getLegalTranslator(legal);
  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.back}>
          <FontAwesomeIcon icon={faArrowLeft} />
          Pinchana
        </Link>
        <nav className={styles.switcher} aria-label={t("shared.documents")}>
          <Link href="/policy">{t("shared.privacy")}</Link>
          <Link href="/usage" aria-current="page">{t("shared.terms")}</Link>
        </nav>
      </header>

      <article className={styles.document}>
        <LegalTranslationNotice message={isCommunityTranslation ? t("shared.communityTranslation") : isFallback ? t("shared.fallback") : undefined} showEnglish={t("shared.showEnglish")} path="/usage" />
        <header className={styles.intro}>
          <p className={styles.kicker}>{t("usage.kicker")}</p>
          <h1>{t("usage.title")}</h1>
          <p className={styles.summary}>{t("usage.summary")}</p>
          <p className={styles.meta}><span aria-hidden="true" />{t("usage.effective")}</p>
        </header>

        <section className={styles.section}>
          <span className={styles.number}>01</span>
          <div className={styles.sectionBody}>
            <h2>{t("usage.sections.acceptance.title")}</h2>
            <p>{t("usage.sections.acceptance.body")}</p>
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.number}>02</span>
          <div className={styles.sectionBody}>
            <h2>{t("usage.sections.permitted.title")}</h2>
            <p>{t("usage.sections.permitted.utility")}</p>
            <p>{t("usage.sections.permitted.responsibility")}</p>
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.number}>03</span>
          <div className={styles.sectionBody}>
            <h2>{t("usage.sections.prohibited.title")}</h2>
            <p>{t("usage.sections.prohibited.intro")}</p>
            <ul className={styles.list}>
              <li>{t("usage.sections.prohibited.copyright")}</li>
              <li>{t("usage.sections.prohibited.automation")}</li>
              <li>{t("usage.sections.prohibited.security")}</li>
            </ul>
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.number}>04</span>
          <div className={styles.sectionBody}>
            <h2>{t("usage.sections.liability.title")}</h2>
            <p>{t("usage.sections.liability.availability")}</p>
            <p>{t("usage.sections.liability.damages")}</p>
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.number}>05</span>
          <div className={styles.sectionBody}>
            <h2>{t("usage.sections.changes.title")}</h2>
            <p>{t("usage.sections.changes.body")}</p>
          </div>
        </section>

        <footer className={styles.end}>
          <span>{t("usage.footer")}</span>
          <Link href="/">{t("shared.return")}</Link>
        </footer>
      </article>
    </main>
  );
}
