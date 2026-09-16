import Link from "next/link";
import { dict, localePath, type Locale } from "@/lib/dictionaries";

export function Footer({ locale }: { locale: Locale }) {
  const t = dict[locale].footer;

  return (
    <footer className="border-base-300 border-t">
      <div className="container flex flex-wrap items-center justify-between gap-3 py-8 text-sm">
        <span className="text-base-content/70">{t.tagline}</span>
        <div className="flex gap-5">
          <a
            href="https://github.com/AlessioQuagliara/RStudy"
            className="hover:text-primary text-base-content/70"
          >
            {t.repo}
          </a>
          <a
            href="https://github.com/AlessioQuagliara/RStudy/issues"
            className="hover:text-primary text-base-content/70"
          >
            {t.issues}
          </a>
          <Link href={localePath(locale, "/privacy")} className="hover:text-primary text-base-content/70">
            {t.privacy}
          </Link>
          <Link href={localePath(locale, "/terms")} className="hover:text-primary text-base-content/70">
            {t.terms}
          </Link>
        </div>
      </div>
    </footer>
  );
}
