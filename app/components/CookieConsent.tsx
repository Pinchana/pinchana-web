"use client";

import {useState} from "react";
import Link from "next/link";
import {useTranslations} from "next-intl";
import SettingsSwitch from "./SettingsSwitch";

type Props = {
  ready: boolean;
  acknowledged: boolean;
  anonymousAnalytics: boolean;
  onSave: (enabled: boolean) => void;
};

export default function CookieConsent({ready, acknowledged, anonymousAnalytics, onSave}: Props) {
  const t = useTranslations("cookieConsent");
  const [draftAnalytics, setDraftAnalytics] = useState(anonymousAnalytics);

  if (!ready || acknowledged) return null;

  return (
    <>
      <div className="cookie-banner" role="dialog" aria-labelledby="privacy-consent-title">
        <div className="cookie-content">
          <p id="privacy-consent-title">
            {t.rich("message", {policy: (chunks) => <Link href="/policy" className="cookie-link">{chunks}</Link>})}
          </p>
          <SettingsSwitch
            id="cookie-anonymous-analytics"
            label={t("analyticsLabel")}
            description={t("analyticsDescription")}
            checked={draftAnalytics}
            onChange={setDraftAnalytics}
          />
          <button className="cookie-accept" onClick={() => onSave(draftAnalytics)}>{t("save")}</button>
        </div>
      </div>

      <style jsx global>{`
        .cookie-banner {
          position: fixed;
          bottom: 24px;
          inset-inline: 24px;
          z-index: 9999;
          background: var(--panel-raised, #0e0e0e);
          border: 1px solid var(--line, #242424);
          border-radius: 16px;
          padding: 16px 20px;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.72);
          animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @media (min-width: 600px) {
          .cookie-banner {
            inset-inline-start: auto;
            inset-inline-end: 24px;
            width: 460px;
          }
        }
        .cookie-content {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .cookie-content > p {
          margin: 0;
          font-size: 13px;
          line-height: 1.5;
          color: var(--text, #f5f5f5);
        }
        .cookie-banner .settings-toggle {
          min-height: 0;
          padding: 13px 0 0;
          border-top: 1px solid var(--line, #242424);
        }
        .cookie-banner .settings-control-copy small {
          max-width: 340px;
        }
        .cookie-link {
          color: var(--muted, #8d8d8d);
          text-decoration: underline;
          cursor: pointer;
        }
        .cookie-link:hover { color: var(--text, #f5f5f5); }
        .cookie-accept {
          align-self: flex-end;
          background: var(--text, #f5f5f5);
          color: var(--black, #000);
          border: none;
          border-radius: 8px;
          padding: 8px 14px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.15s ease;
        }
        .cookie-accept:hover { opacity: 0.9; }
        @keyframes slideUp {
          from { transform: translateY(32px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </>
  );
}
