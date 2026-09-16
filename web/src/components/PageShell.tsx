import type { ReactNode } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CookieBar } from "@/components/CookieBar";
import { SetHtmlLang } from "@/components/SetHtmlLang";
import { dict, type Locale } from "@/lib/dictionaries";

/**
 * Ogni page.tsx conosce staticamente il proprio locale e il proprio path
 * (sono cartelle letterali, non segmenti dinamici): passarli qui evita di
 * dover leggere il pathname a runtime solo per costruire nav e hreflang.
 */
export function PageShell({
  locale,
  pathWithoutLocale,
  children,
}: {
  locale: Locale;
  pathWithoutLocale: string;
  children: ReactNode;
}) {
  return (
    <>
      <SetHtmlLang lang={dict[locale].htmlLang} />
      <Header locale={locale} pathWithoutLocale={pathWithoutLocale} />
      <main>{children}</main>
      <Footer locale={locale} />
      <CookieBar locale={locale} />
    </>
  );
}
