import Link from "next/link";
import { Menu } from "lucide-react";
import { dict, localePath, type Locale } from "@/lib/dictionaries";
import { withBasePath } from "@/lib/basePath";

/**
 * `pathWithoutLocale` è il path della pagina corrente SENZA il prefisso
 * `/en` (es. "/", "/checkout", "/privacy"): serve a costruire sia i link di
 * navigazione sia lo switch di lingua per qualunque pagina, senza che ogni
 * pagina debba ripetere questa logica.
 */
export function Header({ locale, pathWithoutLocale }: { locale: Locale; pathWithoutLocale: string }) {
  const t = dict[locale].nav;
  const home = localePath(locale);
  const isHome = pathWithoutLocale === "/";
  const anchor = (id: string) => (isHome ? `#${id}` : `${home}#${id}`);

  return (
    <header className="bg-base-100/80 border-base-300 sticky top-0 z-20 border-b backdrop-blur-sm">
      <div className="container flex items-center justify-between py-3">
        <Link href={home} className="flex items-center gap-2 text-lg font-bold">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG statico + basePath GitHub Pages, next/image richiederebbe comunque il prefisso manuale (vedi src/lib/basePath.ts) */}
          <img src={withBasePath("/logo-mark.svg")} alt="" width={32} height={32} className="rounded-lg" />
          RStudy
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium lg:flex">
          <a href={anchor("funzionalita")} className="hover:text-primary">
            {t.features}
          </a>
          <a href={anchor("come-funziona")} className="hover:text-primary">
            {t.how}
          </a>
          <a href={anchor("prezzo")} className="hover:text-primary">
            {t.pricing}
          </a>
          <a href={anchor("faq")} className="hover:text-primary">
            {t.faq}
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <div className="join hidden sm:flex">
            <Link
              href={localePath("it", pathWithoutLocale)}
              className={`join-item btn btn-xs ${locale === "it" ? "btn-active" : "btn-ghost"}`}
            >
              IT
            </Link>
            <Link
              href={localePath("en", pathWithoutLocale)}
              className={`join-item btn btn-xs ${locale === "en" ? "btn-active" : "btn-ghost"}`}
            >
              EN
            </Link>
          </div>
          <Link href={localePath(locale, "/checkout")} className="btn btn-primary btn-sm">
            {t.buy}
          </Link>
          <label htmlFor="rstudy-drawer" className="btn btn-ghost btn-sm btn-square lg:hidden" aria-label="Menu">
            <Menu className="size-5" />
          </label>
        </div>
      </div>

      {/* Drawer mobile: stesso pattern di html-dashboard@2 (input checkbox + label). */}
      <div className="drawer drawer-end lg:hidden">
        <input id="rstudy-drawer" type="checkbox" className="drawer-toggle" />
        <div className="drawer-side z-30">
          <label htmlFor="rstudy-drawer" aria-label="close sidebar" className="drawer-overlay" />
          <div className="bg-base-100 min-h-full w-64 p-5">
            <ul className="menu w-full gap-1 p-0">
              <li>
                <a href={anchor("funzionalita")}>{t.features}</a>
              </li>
              <li>
                <a href={anchor("come-funziona")}>{t.how}</a>
              </li>
              <li>
                <a href={anchor("prezzo")}>{t.pricing}</a>
              </li>
              <li>
                <a href={anchor("faq")}>{t.faq}</a>
              </li>
            </ul>
            <div className="join mt-4 w-full">
              <Link
                href={localePath("it", pathWithoutLocale)}
                className={`join-item btn btn-sm flex-1 ${locale === "it" ? "btn-active" : "btn-ghost"}`}
              >
                Italiano
              </Link>
              <Link
                href={localePath("en", pathWithoutLocale)}
                className={`join-item btn btn-sm flex-1 ${locale === "en" ? "btn-active" : "btn-ghost"}`}
              >
                English
              </Link>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
