import Link from "next/link";
import {
  NotebookPen,
  Target,
  Sigma,
  Code2,
  Presentation,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { dict, localePath, type Locale } from "@/lib/dictionaries";

const ICONS = {
  "notebook-pen": NotebookPen,
  target: Target,
  sigma: Sigma,
  "code-2": Code2,
  presentation: Presentation,
  "shield-check": ShieldCheck,
} as const;

export function HomeContent({ locale }: { locale: Locale }) {
  const t = dict[locale];
  const checkoutHref = localePath(locale, "/checkout");

  return (
    <>
      <section id="home" className="py-16 text-center lg:py-24">
        <div className="container">
          <span className="badge badge-outline badge-lg">{t.hero.pill}</span>
          <p className="text-secondary mt-6 text-xs font-bold tracking-[0.2em] uppercase">{t.hero.tagline}</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            {t.hero.title} <span className="text-primary">{t.hero.titleAccent}</span>
          </h1>
          <p className="text-base-content/70 mx-auto mt-6 max-w-2xl text-lg">{t.hero.lead}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href={checkoutHref} className="btn btn-primary">
              {t.hero.ctaPrimary}
              <ArrowRight className="size-4" />
            </Link>
            <a
              href="https://github.com/AlessioQuagliara/RStudy/tree/main/studyforge"
              className="btn btn-outline"
            >
              {t.hero.ctaSecondary}
            </a>
          </div>
          <p className="text-base-content/50 mt-6 text-sm">{t.hero.note}</p>
        </div>
      </section>

      <section id="funzionalita" className="py-16 lg:py-24">
        <div className="container">
          <div className="mx-auto max-w-xl text-center">
            <span className="badge badge-outline">{t.features.pill}</span>
            <h2 className="mt-4 text-3xl font-bold sm:text-4xl">{t.features.title}</h2>
            <p className="text-base-content/70 mt-3">{t.features.lead}</p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {t.features.items.map((item) => {
              const Icon = ICONS[item.icon as keyof typeof ICONS];
              return (
                <div key={item.title} className="card border-base-300 border">
                  <div className="card-body">
                    <div className="bg-primary/10 text-primary mb-2 flex size-10 items-center justify-center rounded-lg">
                      <Icon className="size-5" />
                    </div>
                    <h3 className="card-title text-base">{item.title}</h3>
                    <p className="text-base-content/70 text-sm">{item.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="come-funziona" className="bg-base-200 py-16 lg:py-24">
        <div className="container">
          <div className="mx-auto max-w-xl text-center">
            <span className="badge badge-outline">{t.how.pill}</span>
            <h2 className="mt-4 text-3xl font-bold sm:text-4xl">{t.how.title}</h2>
          </div>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {t.how.steps.map((step) => (
              <div key={step.num} className="card bg-base-100 border-base-300 border">
                <div className="card-body">
                  <span className="text-primary text-sm font-bold">{step.num}</span>
                  <h3 className="card-title text-base">{step.title}</h3>
                  <p className="text-base-content/70 text-sm">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="prezzo" className="py-16 lg:py-24">
        <div className="container">
          <div className="mx-auto max-w-xl text-center">
            <span className="badge badge-outline">{t.pricing.pill}</span>
            <h2 className="mt-4 text-3xl font-bold sm:text-4xl">{t.pricing.title}</h2>
            <p className="text-base-content/70 mt-3">{t.pricing.lead}</p>
          </div>
          <div className="card border-primary/30 mx-auto mt-10 max-w-md border-2">
            <div className="card-body items-center text-center">
              <h3 className="text-lg font-semibold">{t.pricing.planName}</h3>
              <p className="mt-2 flex items-baseline gap-1">
                <span className="text-5xl font-bold">{t.pricing.amount}</span>
                <span className="text-base-content/60">{t.pricing.per}</span>
              </p>
              <ul className="mt-6 w-full space-y-2 text-left text-sm">
                {t.pricing.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="text-secondary">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link href={checkoutHref} className="btn btn-primary btn-block mt-6">
                {t.pricing.cta}
              </Link>
              <p className="text-base-content/50 mt-3 text-xs">{t.pricing.note}</p>
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="bg-base-200 py-16 lg:py-24">
        <div className="container">
          <div className="mx-auto max-w-xl text-center">
            <span className="badge badge-outline">{t.faq.pill}</span>
            <h2 className="mt-4 text-3xl font-bold sm:text-4xl">{t.faq.title}</h2>
          </div>
          <div className="join join-vertical mx-auto mt-10 w-full max-w-2xl">
            {t.faq.items.map((item, i) => (
              <div key={item.q} className="collapse join-item bg-base-100 border-base-300 border">
                <input type="radio" name="rstudy-faq" defaultChecked={i === 0} />
                <div className="collapse-title font-medium">{item.q}</div>
                <div className="collapse-content text-base-content/70 text-sm">
                  <p>{item.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
