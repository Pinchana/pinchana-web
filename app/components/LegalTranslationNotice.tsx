import Link from "next/link";
import type {ReactNode} from "react";
import styles from "../legal.module.css";

export default function LegalTranslationNotice({
  message,
  showEnglish,
  path,
}: {
  message?: ReactNode;
  showEnglish: ReactNode;
  path: "/policy" | "/usage";
}) {
  if (!message) return null;
  return (
    <aside className={styles.translationNotice} role="note">
      <span>{message}</span>
      <Link href={`${path}?legal=en`}>{showEnglish}</Link>
    </aside>
  );
}
