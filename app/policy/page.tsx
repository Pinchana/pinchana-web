import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import styles from "../legal.module.css";
import {getLegalTranslator} from "@/i18n/legal";
import LegalTranslationNotice from "../components/LegalTranslationNotice";

export default async function PolicyPage({searchParams}: {searchParams: Promise<{legal?: string}>}) {
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
          <Link href="/policy" aria-current="page">{t("shared.privacy")}</Link>
          <Link href="/usage">{t("shared.terms")}</Link>
        </nav>
      </header>

      <article className={styles.document}>
        <LegalTranslationNotice
          message={isCommunityTranslation ? t("shared.communityTranslation") : isFallback ? t("shared.fallback") : undefined}
          showEnglish={t("shared.showEnglish")}
          path="/policy"
        />
        <header className={styles.intro}>
          <p className={styles.kicker}>{t("policy.kicker")}</p>
          <h1>{t("policy.title")}</h1>
          <p className={styles.summary}>{t("policy.summary")}</p>
          <p className={styles.meta}><span aria-hidden="true" />{t("policy.effective")}</p>
        </header>

        <section className={styles.section}>
          <span className={styles.number}>01</span>
          <div className={styles.sectionBody}>
            <h2>{t("policy.sections.introduction.title")}</h2>
            <p>{t("policy.sections.introduction.body")}</p>
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.number}>02</span>
          <div className={styles.sectionBody}>
            <h2>{t("policy.sections.processing.title")}</h2>
            <p>{t("policy.sections.processing.direct")}</p>
            <p>{t("policy.sections.processing.delivery")}</p>
            <p>{t("policy.sections.processing.logs")}</p>
            <p>{t("policy.sections.processing.private")}</p>
            <p>{t("policy.sections.processing.diagnostics")}</p>
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.number}>03</span>
          <div className={styles.sectionBody}>
            <h2>{t("policy.sections.turnstile.title")}</h2>
            <p>{t("policy.sections.turnstile.body")}</p>
            <p>{t("policy.sections.turnstile.more")} <a href="https://www.cloudflare.com/en-gb/turnstile-privacy-policy/" target="_blank" rel="noopener noreferrer">{t("policy.sections.turnstile.policyName")}</a>.</p>
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.number}>04</span>
          <div className={styles.sectionBody}>
            <h2>{t("policy.sections.storage.title")}</h2>
            <p>{t("policy.sections.storage.intro")}</p>
            <dl className={styles.definitions}>
              <div>
                <dt>pinchana_web_session</dt>
                <dd>{t("policy.sections.storage.session")}</dd>
              </div>
              <div>
                <dt>pinchana_instance</dt>
                <dd>{t("policy.sections.storage.instance")}</dd>
              </div>
              <div>
                <dt>pinchana_locale</dt>
                <dd>{t("policy.sections.storage.locale")}</dd>
              </div>
              <div>
                <dt>cf_clearance</dt>
                <dd>{t("policy.sections.storage.clearance")}</dd>
              </div>
              <div>
                <dt>pinchana-settings</dt>
                <dd>{t("policy.sections.storage.settings")}</dd>
              </div>
              <div>
                <dt>pinchana-privacy-preferences</dt>
                <dd>{t("policy.sections.storage.consent")}</dd>
              </div>
              <div>
                <dt>pinchana-cookie-vault</dt>
                <dd>{t("policy.sections.storage.vault")}</dd>
              </div>
            </dl>
            <p>{t("policy.sections.storage.noTracking")}</p>
            <p>{t("policy.sections.storage.recovery")}</p>
            <p>{t("policy.sections.storage.limits")}</p>
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.number}>05</span>
          <div className={styles.sectionBody}>
            <h2>{t("policy.sections.platforms.title")}</h2>
            <p>{t("policy.sections.platforms.body")}</p>
            <p>{t("policy.sections.platforms.links")}</p>
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.number}>06</span>
          <div className={styles.sectionBody}>
            <h2>{t("policy.sections.fonts.title")}</h2>
            <p>{t("policy.sections.fonts.body")}</p>
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.number}>07</span>
          <div className={styles.sectionBody}>
            <h2>{t("policy.sections.icons.title")}</h2>
            <p>{t("policy.sections.icons.body")}</p>
          </div>
        </section>

        <footer className={styles.end}>
          <span>{t("policy.footer")}</span>
          <Link href="/">{t("shared.return")}</Link>
        </footer>
      </article>
    </main>
  );
}
