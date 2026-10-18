# RStudy web (in sviluppo)

Versione web di RStudy: Flask, PostgreSQL, Docker Compose, Gunicorn, Traefik in produzione.
L'app desktop resta in `../studyforge/`.

A differenza del desktop, questa versione conserva i dati sul server.

## Stato

Disponibile:
- landing pubblica su `/` (porting di `../web/`), con accesso e registrazione; l'app parte da `/dashboard`;
- abbonamento Paddle: 15 giorni di prova senza carta dalla registrazione, poi 4,99 €/mese o 39,90 €/anno;
  stato aggiornato solo dai webhook firmati; a prova scaduta resta aperta solo la pagina `/abbonamento`;
- impostazioni: profilo (università, facoltà), utilizzo AI, tema, backup JSON nel formato del desktop
  (import con upsert per id limitato ai dati dell'account; export disponibile anche a prova scaduta);
- account (registrazione con università e facoltà, accesso, rate limit, CSRF, CSP senza script inline);
- corsi con filtri e ricerca, lezioni con appunti, dashboard con le metriche del desktop;
- generazione AI in background (`flask ai-worker`): studio AI (riepilogo, punti chiave, schema,
  domande di autoverifica, flashcard) ed esercizi a scelta multipla e risposta aperta, corretti dal server;
  stessi appunti = risultato riusato senza nuova chiamata; limite giornaliero per utente (`AI_DAILY_LIMIT`);
- flashcard: lista paginata (30 per pagina) con filtri, editor, duplica, ripasso con gli stessi intervalli del desktop (1/3/7 giorni);
- produzione con Traefik e certificati Let's Encrypt (`compose.prod.yaml`).

Limiti provvisori, da superare in seguito:
- colori predefiniti di daisyUI invece del tema del desktop, in attesa di una verifica di licenza;
- appunti in un'area di testo semplice con salvataggio esplicito, invece dell'editor TipTap con autosave;
- testo generato mostrato senza Markdown, LaTeX né diagramma Mermaid;
- niente esercizi di codice; esercizi in un unico form invece del quiz a passi;
- provider AI `fake` (simulato, indicato come tale nell'interfaccia) di default in sviluppo.

Non ancora migrato dal desktop: materiali (upload ed estrazione testo), "Chiedi al corso" (RAG),
riassunto del corso, presentazioni, sessione studio in PDF, dettatura.

## Avvio locale

```bash
cd saas
cp .env.example .env      # poi compila SECRET_KEY, POSTGRES_PASSWORD, TEST_POSTGRES_PASSWORD
docker compose up --build
```

L'app risponde su `http://127.0.0.1:5080` (porta configurabile con `RSTUDY_WEB_PORT`).
Il servizio `assets` ricompila il CSS quando cambiano template o JavaScript,
il servizio `worker` esegue le generazioni AI (provider simulato, salvo `AI_PROVIDER=openai` in `.env`).

## Produzione

Su un server con Docker e le porte 80/443 libere, con il DNS di `DOMAIN` che punta al server:

```bash
cd saas
cp .env.example .env.prod   # compila SECRET_KEY, POSTGRES_PASSWORD, AI_*; aggiungi DOMAIN e ACME_EMAIL
docker compose -f compose.prod.yaml --env-file .env.prod up -d --build
```

Il servizio `migrate` applica le migrazioni prima che partano `web` e `worker`.
Postgres non è esposto; l'app riceve traffico solo da Traefik, che è l'unico proxy fidato (`PROXY_FIX_X_*=1`).

## Test

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
npm ci && npm run build          # i test di layout leggono le icone compilate
.venv/bin/pytest
```

Senza `TEST_DATABASE_URL` i test che usano PostgreSQL vengono saltati. Girano sul Postgres usa e getta
di `compose.test.yaml`, che tiene i dati in memoria e non usa volumi:

```bash
docker compose -f compose.test.yaml up -d --wait
TEST_DATABASE_URL=postgresql+psycopg://rstudy:<TEST_POSTGRES_PASSWORD>@127.0.0.1:55433/rstudy_test .venv/bin/pytest
docker compose -f compose.test.yaml down
```

## Variabili

Sono tutte descritte in [`.env.example`](.env.example). Nessuna ha un valore di riserva per i segreti.
