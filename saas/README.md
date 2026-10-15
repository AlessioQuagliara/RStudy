# RStudy web (in sviluppo)

Versione web di RStudy: Flask, PostgreSQL, Docker Compose, Gunicorn, Traefik in produzione.
Non è ancora utilizzabile: per ora esistono solo lo scheletro dell'app e il layout.
L'app desktop resta in `../studyforge/`.

A differenza del desktop, questa versione conserva i dati sul server.

## Stato

Disponibile (incremento 0):
- application factory, configurazione da variabili d'ambiente, avvio bloccato senza `SECRET_KEY` o `DATABASE_URL`;
- layout ripreso dal desktop (menu laterale, topbar, card, tema chiaro/scuro);
- intestazioni di sicurezza (CSP senza script inline), cookie sicuri di default;
- fiducia negli header `X-Forwarded-*` disattivata finché non viene configurata;
- `/healthz` per il controllo del processo.

Non ancora disponibile: account, corsi, lezioni, esercizi, ripasso, produzione con Traefik.

Limiti provvisori già decisi per il primo percorso, da superare in seguito:
- colori predefiniti di daisyUI invece del tema del desktop, in attesa di una verifica di licenza;
- appunti in un'area di testo semplice invece dell'editor TipTap;
- niente esercizi di codice;
- testo delle domande senza Markdown né LaTeX;
- generazione con un provider AI simulato, indicato come tale nell'interfaccia.

## Avvio locale

```bash
cd saas
cp .env.example .env      # poi compila SECRET_KEY, POSTGRES_PASSWORD, TEST_POSTGRES_PASSWORD
docker compose up --build
```

L'app risponde su `http://127.0.0.1:5080` (porta configurabile con `RSTUDY_WEB_PORT`).
Il servizio `assets` ricompila il CSS quando cambiano template o JavaScript.

## Test

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
npm ci && npm run build          # i test di layout leggono le icone compilate
.venv/bin/pytest
```

I test che useranno PostgreSQL leggono `TEST_DATABASE_URL` e girano sul servizio `db-test`,
che tiene i dati in memoria e non usa volumi:

```bash
docker compose --profile test up -d db-test
TEST_DATABASE_URL=postgresql+psycopg://rstudy:<TEST_POSTGRES_PASSWORD>@127.0.0.1:55433/rstudy_test .venv/bin/pytest
```

## Variabili

Sono tutte descritte in [`.env.example`](.env.example). Nessuna ha un valore di riserva per i segreti.
