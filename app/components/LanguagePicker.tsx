"use client";

import {faCheck, faChevronDown} from "@fortawesome/free-solid-svg-icons";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import Image, {type StaticImageData} from "next/image";
import {useLocale, useTranslations} from "next-intl";
import {useRouter} from "next/navigation";
import {useEffect, useRef, useState, useTransition} from "react";
import {toast} from "sonner";
import {isSupportedLocale, SUPPORTED_LOCALES, type AppLocale} from "@/i18n/config";
import gbFlag from "flag-icons/flags/4x3/gb.svg";
import uaFlag from "flag-icons/flags/4x3/ua.svg";

const FLAG_IMAGES: Record<(typeof SUPPORTED_LOCALES)[number]["flag"], StaticImageData> = {
  gb: gbFlag,
  ua: uaFlag,
};

export default function LanguagePicker() {
  const locale = useLocale();
  const t = useTranslations("language");
  const router = useRouter();
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [savingLocale, setSavingLocale] = useState<AppLocale | null>(null);
  const [isRefreshing, startTransition] = useTransition();
  const currentLocale = isSupportedLocale(locale) ? locale : SUPPORTED_LOCALES[0].code;
  const current = SUPPORTED_LOCALES.find((option) => option.code === currentLocale) ?? SUPPORTED_LOCALES[0];

  useEffect(() => {
    if (!open) return;

    function closeOnOutsidePress(event: PointerEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    requestAnimationFrame(() => document.getElementById(`language-option-${currentLocale}`)?.focus());

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [currentLocale, open]);

  async function changeLanguage(nextLocale: AppLocale) {
    if (nextLocale === currentLocale) {
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }

    setSavingLocale(nextLocale);
    try {
      const response = await fetch("/api/locale", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({locale: nextLocale}),
      });
      if (!response.ok) throw new Error("locale_update_failed");

      setOpen(false);
      startTransition(() => router.refresh());
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSavingLocale(null);
    }
  }

  return (
    <div className="language-picker" ref={pickerRef} data-open={open} data-saving={Boolean(savingLocale) || isRefreshing}>
      <button
        className="language-picker-trigger"
        type="button"
        ref={triggerRef}
        aria-label={t("current", {language: current.label})}
        title={t("pickerLabel")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Image className="language-picker-flag" src={FLAG_IMAGES[current.flag]} width={20} height={15} alt="" />
        <span className="language-picker-current">{current.label}</span>
        <FontAwesomeIcon className="language-picker-chevron" icon={faChevronDown} aria-hidden="true" />
      </button>

      <div className="language-picker-menu" role="menu" aria-label={t("menuLabel")} aria-hidden={!open}>
        {SUPPORTED_LOCALES.map((option) => {
          const selected = option.code === currentLocale;
          const saving = option.code === savingLocale;
          return (
            <button
              id={`language-option-${option.code}`}
              key={option.code}
              type="button"
              role="menuitemradio"
              aria-checked={selected}
              aria-label={t("switchTo", {language: option.label})}
              disabled={Boolean(savingLocale)}
              data-saving={saving}
              onClick={() => void changeLanguage(option.code)}
            >
              <Image className="language-picker-flag" src={FLAG_IMAGES[option.flag]} width={20} height={15} alt="" />
              <span>{option.label}</span>
              <FontAwesomeIcon className="language-picker-check" icon={faCheck} aria-hidden={!selected} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
