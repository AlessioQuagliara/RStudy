"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { dict, localePath, type Locale } from "@/lib/dictionaries";

const STORAGE_KEY = "rstudy_cookie_consent";

export function CookieBar({ locale }: { locale: Locale }) {
  const t = dict[locale].cookieBar;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // localStorage non esiste durante il prerender statico: la lettura può
    // avvenire solo qui, lato client dopo il mount, non in un initializer.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      // localStorage indisponibile (privacy mode, ecc.): mostriamo comunque
      // la barra invece di nasconderla per errore silenzioso.
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const accept = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "accepted");
    } catch {
      /* niente da fare se non è disponibile: chiudiamo comunque la barra per questa sessione. */
    }
    setVisible(false);
  };

  return (
    <div className="bg-base-300 fixed inset-x-0 bottom-0 z-40 border-t border-black/10 p-4">
      <div className="container flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          {t.text}{" "}
          <Link href={localePath(locale, "/privacy")} className="link">
            {t.link}
          </Link>
        </p>
        <button type="button" className="btn btn-primary btn-sm shrink-0" onClick={accept}>
          {t.accept}
        </button>
      </div>
    </div>
  );
}
