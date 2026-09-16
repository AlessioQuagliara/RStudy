"use client";

import { useEffect, useRef, useState } from "react";
import { dict, type Locale } from "@/lib/dictionaries";
import { PADDLE_CLIENT_TOKEN, PADDLE_PRICE_ID, PADDLE_ENVIRONMENT } from "@/lib/paddle";

declare global {
  interface Window {
    Paddle?: {
      Environment: { set: (env: string) => void };
      Initialize: (opts: { token: string; eventCallback: (event: { name: string; data?: { transaction_id?: string } }) => void }) => void;
      Checkout: { open: (opts: { items: Array<{ priceId: string; quantity: number }> }) => void };
    };
  }
}

const STORAGE_KEY = "rstudy_license_key";
const PADDLE_SRC = "https://cdn.paddle.com/paddle/v2/paddle.js";

type Os = "mac" | "win" | "linux" | null;

function detectOs(): Os {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const probe = `${nav.userAgentData?.platform ?? ""} ${navigator.userAgent ?? ""}`.toLowerCase();
  if (probe.includes("mac") || probe.includes("iphone") || probe.includes("ipad")) return "mac";
  if (probe.includes("win")) return "win";
  if (probe.includes("linux") || probe.includes("x11")) return "linux";
  return null;
}

const RELEASES_URL = "https://github.com/AlessioQuagliara/RStudy/releases";

export function CheckoutContent({ locale }: { locale: Locale }) {
  const t = dict[locale].checkout;
  const [licenseKey, setLicenseKey] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState<string>(t.copy);
  const [os, setOs] = useState<Os>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // navigator/localStorage non esistono durante il prerender statico:
    // questa lettura può avvenire solo qui, lato client dopo il mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOs(detectOs());
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setLicenseKey(saved);
    } catch {
      /* nessun recupero automatico se localStorage non è disponibile: non blocca il resto della pagina. */
    }
  }, []);

  useEffect(() => {
    if (document.querySelector(`script[src="${PADDLE_SRC}"]`)) return;
    const script = document.createElement("script");
    script.src = PADDLE_SRC;
    script.onload = () => {
      if (!window.Paddle) return;
      window.Paddle.Environment.set(PADDLE_ENVIRONMENT);
      window.Paddle.Initialize({
        token: PADDLE_CLIENT_TOKEN,
        eventCallback: (event) => {
          if (event.name === "checkout.completed" && event.data?.transaction_id) {
            const id = event.data.transaction_id;
            try {
              localStorage.setItem(STORAGE_KEY, id);
            } catch {
              /* la chiave resta comunque visibile a schermo anche senza localStorage. */
            }
            setLicenseKey(id);
          }
        },
      });
    };
    document.head.appendChild(script);
  }, []);

  const openCheckout = () => {
    window.Paddle?.Checkout.open({ items: [{ priceId: PADDLE_PRICE_ID, quantity: 1 }] });
  };

  const copyKey = () => {
    const el = inputRef.current;
    if (!el || !el.value) return;
    el.select();
    el.setSelectionRange(0, el.value.length);
    const flash = (label: string) => {
      setCopyLabel(label);
      setTimeout(() => setCopyLabel(t.copy), 1500);
    };
    if (!navigator.clipboard?.writeText) {
      flash(t.copyFallback);
      return;
    }
    navigator.clipboard.writeText(el.value).then(
      () => flash(t.copied),
      () => flash(t.copyFallback),
    );
  };

  const osLabel = os ? t.platforms[os].name : null;

  return (
    <section className="container py-16 lg:py-24">
      <div className="mx-auto max-w-lg text-center">
        <h1 className="text-3xl font-bold sm:text-4xl">{t.title}</h1>
        <p className="text-base-content/70 mt-3">{t.lead}</p>
      </div>

      <div className="card border-primary/30 mx-auto mt-10 max-w-md border-2">
        <div className="card-body items-center text-center">
          <button type="button" className="btn btn-primary btn-block" onClick={openCheckout}>
            {t.buy}
          </button>
        </div>
      </div>

      {!licenseKey ? (
        <div className="mx-auto mt-10 max-w-md text-center">
          <h2 className="text-lg font-semibold">{t.lockedTitle}</h2>
          <p className="text-base-content/70 mt-2 text-sm">{t.lockedBody}</p>
        </div>
      ) : (
        <div className="mx-auto mt-10 max-w-lg">
          <div className="card bg-base-200 border-base-300 border">
            <div className="card-body">
              <h2 className="text-lg font-semibold">{t.successTitle}</h2>
              <p className="text-base-content/70 text-sm">{t.successBody}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  ref={inputRef}
                  readOnly
                  value={licenseKey}
                  aria-label="License key"
                  className="input input-bordered min-w-0 flex-1 font-mono text-sm"
                />
                <button type="button" className="btn btn-primary" onClick={copyKey}>
                  {copyLabel}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-10 text-center">
            <h2 className="text-2xl font-bold">{t.downloadTitle}</h2>
            <p className="text-base-content/70 mt-2 text-sm">{osLabel ? t.detected(osLabel) : t.chooseOs}</p>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {(["mac", "win", "linux"] as const).map((key) => {
              const p = t.platforms[key];
              const active = os === key;
              return (
                <div
                  key={key}
                  className={`card relative border p-1 text-center ${active ? "border-primary border-2" : "border-base-300"}`}
                >
                  {active && (
                    <span className="badge badge-primary absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
                      {t.recommended}
                    </span>
                  )}
                  <div className="card-body items-center gap-1 pt-6">
                    <h3 className="font-semibold">{p.name}</h3>
                    <p className="text-base-content/60 text-xs">{p.hint}</p>
                    <a href={RELEASES_URL} className="btn btn-primary btn-sm mt-2">
                      {p.cta}
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
