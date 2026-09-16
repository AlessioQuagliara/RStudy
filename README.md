# RStudy

Sito di presentazione (GitHub Pages) del progetto **RStudy**: un'app desktop locale-first che trasforma gli
appunti universitari in esercizi interattivi e presentazioni, per studiare in modo attivo invece che rileggere.

**Appunti → quiz progressivi → presentazioni di ripasso.**

## Cosa trovi in questo repository

- `web/` — sorgente Next.js del sito (landing, checkout, privacy, termini — IT/EN), stile DaisyUI/Tailwind. È
  quello da modificare.
- `docs/` — **output buildato** di `web/` (generato, non modificarlo a mano): è la cartella pubblicata da GitHub
  Pages.
- `index.html`, `assets/` — vecchia landing statica vanilla-JS, superata dal sito in `web/`. Non più servita da
  GitHub Pages (che ora punta a `/docs`); lasciata nel repo, rimuovibile quando vuoi.
- `studyforge/` — codice sorgente dell'app desktop (Electron + React + TypeScript + SQLite locale). Per build,
  sviluppo locale e dettagli di architettura vedi [`studyforge/README.md`](studyforge/README.md).
- `html-dashboard@2/`, `saas-landingpage-html@2/` — template premium acquistati, usati come riferimento di design
  per `web/`. **Non tracciati in git** (licenza non redistribuibile in un repo pubblico, vedi `.gitignore`): esistono
  solo sulla tua macchina.

## Il sito (`web/`)

Next.js (App Router, TypeScript) con export statico, Tailwind v4 + DaisyUI 5 (stessa struttura dei template
`html-dashboard@2`/`saas-landingpage-html@2`, colori adattati al brand RStudy). Contenuti in italiano (`/`) e
inglese (`/en`), pagina di checkout Paddle dedicata (`/checkout`, `/en/checkout`), Privacy Policy e Termini di
Servizio in entrambe le lingue, cookie bar.

```bash
cd web
pnpm install
pnpm dev          # sviluppo, http://localhost:3000
pnpm build        # build statica + copia automatica in ../docs (vedi sotto)
```

### Pubblicazione su GitHub Pages

`pnpm build` (dentro `web/`) esegue `next build` e poi uno script (`postbuild`) che copia l'export statico da
`web/out` a `docs/` alla radice del repo — Turbopack non permette a `next build` di scrivere direttamente fuori da
`web/`, da qui il passaggio extra automatico.

1. **Una sola volta**: Settings → Pages → Source: branch `main`, cartella **`/docs`** (non più `/ (root)`).
2. Ad ogni modifica al sito: `cd web && pnpm build`, poi commit + push (anche di `docs/`, che va tracciato in git:
   GitHub Pages legge i file dal branch, non builda nulla lui stesso).
3. La pagina resta su `https://<utente>.github.io/<repo>/` — invariato.

`web/next.config.ts` ha `basePath`/`assetPrefix` impostati su `/RStudy` (il nome di questo
repo): se colleghi un dominio personalizzato in futuro (file `web/public/CNAME`), rimuovi quel blocco — con un
dominio proprio il sito vive alla radice.

## Stato del progetto

RStudy è in sviluppo attivo. La landing gestisce un vero checkout (Paddle) per una licenza one-time con 1 anno di
aggiornamenti gratuiti inclusi: al pagamento completato, la pagina mostra la chiave di licenza e sblocca i link di
download per macOS, Windows e Linux. I pacchetti sono comunque da pubblicare come GitHub Release (vedi
[`studyforge/README.md`](studyforge/README.md) → Build multi-piattaforma) prima che i link funzionino davvero.

## Pagamenti (Paddle)

Il checkout (`web/src/components/CheckoutContent.tsx`, config in `web/src/lib/paddle.ts`) usa Paddle.js v2:
`Paddle.Checkout.open` apre l'overlay, l'evento `checkout.completed` rivela la chiave di licenza (l'ID transazione
Paddle) e i download. L'app Electron verifica la chiave lato server (API Paddle) al momento dell'attivazione:
vedi la sezione "Licenza" in [`studyforge/README.md`](studyforge/README.md) per il dettaglio.

**Stato attuale**: prodotto e prezzo (39,00 € one-time) e un client-side token sono già creati via API Paddle in
ambiente **Sandbox** — funzionano da subito per testare l'intero flusso con carte di test Paddle, senza addebiti
reali. Prima di vendere davvero:

1. Ripeti la creazione di prodotto/prezzo/client-token nell'ambiente **Live** (le risorse Sandbox non esistono in
   produzione) e sostituisci `PADDLE_CLIENT_TOKEN`/`PADDLE_PRICE_ID`/`PADDLE_ENVIRONMENT` in `web/src/lib/paddle.ts`,
   oltre a `PADDLE_API` in `studyforge/.env`.
2. Rimuovi (o imposta a `"production"`) `Paddle.Environment.set("sandbox")`.
3. **Approva il dominio della landing** in Paddle: Dashboard → Checkout → Approved domains (o via API,
   `POST /checkout-domains` con `{"domain": "tuodominio.tld"}`). Senza questo passaggio il checkout non fallisce
   con un errore visibile: l'overlay si apre ma resta vuoto/trasparente, perché Paddle rifiuta silenziosamente di
   servire il contenuto su un dominio non approvato. `alessioquagliara.github.io` è già stato approvato in Sandbox
   durante lo sviluppo; **`localhost` non è approvabile** (Paddle richiede un dominio registrabile reale), quindi
   il checkout non è testabile in locale — solo dopo aver pubblicato la pagina su un dominio vero (GitHub Pages
   incluso).

## Privacy

Appunti, corsi e materiali restano sul dispositivo dell'utente. L'AI gira interamente in locale (llama.cpp): nessun
testo viene inviato a servizi esterni, nemmeno durante una generazione. Il pagamento passa da Paddle (nessun dato di
carta gestito da questo progetto); l'unico dato scambiato con Paddle dopo l'acquisto è la verifica della chiave di
licenza al primo avvio dell'app. Maggiori dettagli nella sezione "Privacy" della landing page e in
[`studyforge/README.md`](studyforge/README.md).
