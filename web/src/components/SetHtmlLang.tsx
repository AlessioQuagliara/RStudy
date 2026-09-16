"use client";

import { useEffect } from "react";

/**
 * Next.js richiede html/body solo nel root layout: non possiamo avere un
 * secondo root layout con lang="en" per le pagine sotto /en senza duplicare
 * l'intera struttura. Un piccolo effect client-side sull'unico punto che
 * conta per SEO/accessibilità (l'attributo lang) è più semplice che
 * reinventare il layout.
 */
export function SetHtmlLang({ lang }: { lang: string }) {
  useEffect(() => {
    document.documentElement.lang = lang;
    return () => {
      document.documentElement.lang = "it";
    };
  }, [lang]);

  return null;
}
