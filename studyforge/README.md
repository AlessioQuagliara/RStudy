# RStudy

Dashboard di studio universitario **locale-first**, in app desktop Electron: corsi, lezioni con editor stile Notion, materiali RAG, generazione AI locale (llama.cpp, nessuna API key/cloud) di riepiloghi/flashcard/diagrammi, flashcard con ripasso spaziato (SRS) e chat RAG per corso.

## Prerequisiti

- Sviluppato e validato su macOS Apple Silicon (M1/M2/M3/M4); pacchetti Windows e Linux configurati in `electron-builder.yml` (vedi [Build multi-piattaforma](#build-multi-piattaforma)).
- Node.js 20 LTS o 22 LTS (consigliato; il progetto è stato validato anche su Node 26). Su macOS servono i tool da riga di comando di Xcode (`xcode-select --install`) per compilare il modulo nativo `better-sqlite3` e per i binding precompilati di `node-llama-cpp`.
- [pnpm](https://pnpm.io) (`npm i -g pnpm` se non è già installato).
- Spazio su disco per il modello AI locale: il modello di default (`Qwen2.5-3B-Instruct`, quantizzazione Q4_K_M) pesa circa 2 GB e viene scaricato al primo utilizzo dalle Impostazioni dell'app, non incluso nel repository.

## Installazione

```bash
cd studyforge
pnpm install
```

Al primo `pnpm install`, pnpm chiederà di approvare gli script nativi di `better-sqlite3`, `electron` e `node-llama-cpp`:

```bash
pnpm approve-builds --all
```

(già preconfigurato in `pnpm-workspace.yaml` → `allowBuilds`, quindi le installazioni successive non richiedono conferma).

Genera lo schema SQLite (migrazioni Drizzle già incluse in `drizzle/`, rigenerabili con):

```bash
pnpm db:generate
```

## Avvio in sviluppo

```bash
pnpm dev
```

Avvia in parallelo il dev server Vite (renderer, porta 5173) e la build in watch mode di main/preload (tsup), poi lancia Electron. Le modifiche a `src/` fanno hot-reload nel renderer; le modifiche a `electron/` ricompilano e riavviano il processo main.

Per popolare l'app con un corso demo (senza chiamate AI):

```bash
pnpm seed
```

## Build multi-piattaforma

```bash
pnpm dist:mac    # .dmg + .zip arm64
pnpm dist:win    # installer NSIS (x64/arm64) — da macOS/Linux richiede Wine
pnpm dist:linux  # AppImage + .deb (x64/arm64)
pnpm dist:all    # tutte e tre insieme
```

Ogni script esegue typecheck, build del renderer (Vite) e di main/preload (tsup), poi impacchetta con `electron-builder` in `release/`. L'icona (`build/icon.png`, generata da `assets/img/logo-mark.svg`) viene convertita automaticamente da electron-builder nei formati `.icns`/`.ico` necessari.

## Dove configurare l'AI locale

Apri l'app → **Impostazioni**:

- **AI locale**: mostra lo stato del modello (non scaricato / download in corso con percentuale / pronto) e il bottone "Scarica modello". Il file `.gguf` viene salvato in `userData/models` — nessuna API key, nessun account, nessuna chiamata di rete durante l'uso (solo per il download iniziale del modello).
- **URI modello**, **temperatura**, **max token**: salvati in `app_settings` (SQLite). L'URI segue il formato di `node-llama-cpp` (es. `hf:Qwen/Qwen2.5-3B-Instruct-GGUF:Q4_K_M`); cambiarlo richiede un nuovo download.
- **Testa connessione**: esegue un prompt di verifica (ping/pong) contro il modello caricato in locale.

Tutta l'inferenza avviene esclusivamente nel main process (`electron/ai/localAiClient.ts`, `electron/services/localModelService.ts`); il renderer non tocca mai il modello direttamente, solo via IPC.

## Licenza

L'app richiede una licenza attivata per essere usata: senza, all'avvio mostra solo la schermata di attivazione
(`src/features/license/ActivationScreen.tsx`), nessuna route dell'app è raggiungibile. Non esiste una modalità
trial: la licenza è one-time, venduta sulla landing page tramite Paddle Checkout (vedi il README alla radice del
repo → "Pagamenti (Paddle)").

- **Configurazione**: crea `studyforge/.env` da `.env.example` con `PADDLE_API_SANDBOX` (o `PADDLE_API` per
  produzione) e `PADDLE_PRICE_ID`. Senza `.env`, `license:activate` fallisce con un errore chiaro invece di
  crashare (`electron/services/paddleClient.ts`).
- **Flusso di attivazione**: l'utente incolla nella schermata di attivazione la chiave ricevuta dopo l'acquisto
  (in pratica l'ID transazione Paddle, `txn_...`, mostrato dalla landing dopo il checkout). Il main process
  (`electron/services/licenseService.ts`) chiama l'API Paddle server-to-server per verificare che la transazione
  sia `completed` e corrisponda al `PADDLE_PRICE_ID` atteso, poi salva la licenza in SQLite (tabella `license`,
  una sola riga per installazione).
- **Aggiornamenti gratuiti**: `updatesValidUntil` è calcolato all'attivazione (data acquisto + 1 anno) e confrontato
  con `APP_RELEASE_DATE` (`electron/shared/buildInfo.ts`, da aggiornare manualmente ad ogni release) per decidere
  se la build corrente rientra nell'anno incluso — visibile in Impostazioni → Licenza. La licenza resta comunque
  valida (l'app continua a funzionare) anche oltre l'anno: solo gli aggiornamenti a versioni successive non sono
  più "gratuiti" in senso stretto (nessun meccanismo di blocco automatico è implementato).
- **Nota di sicurezza**: la API key Paddle finisce nel pacchetto distribuito (`extraResources` in
  `electron-builder.yml`), quindi è in linea di principio estraibile da chi decompila l'installer. Usa una API key
  con scope minimo (sola lettura Transactions) dal Dashboard Paddle, non la chiave admin dell'account — dettagli
  nel commento in cima a `electron/services/paddleClient.ts`.

## Struttura del progetto

```
studyforge/
  electron/
    main/        bootstrap Electron, sicurezza (CSP, sender IPC), creazione finestra
    preload/      contextBridge.exposeInMainWorld — unica API esposta al renderer
    ipc/          handler IPC granulari, validati con Zod (safeHandle.ts)
    services/     percorsi app, download/stato modello locale, impostazioni, backup, licenza/Paddle
    db/           schema Drizzle, client SQLite, migrazioni, repository, seed
    ai/           LocalAiClient (node-llama-cpp), prompt, generazione study pack/riassunto corso
    rag/          parsing documenti, chunking, embedding, vector store, RagService
    shared/       schemi Zod e contratto IPC condivisi (type-safe end-to-end)
  src/
    app/          router, query client, error boundary
    components/    UI riutilizzabile (layout, card, tabs, MermaidDiagram, toast...)
    features/      courses, lessons, materials, flashcards, search, settings, dashboard
    lib/, hooks/, types/
  html-dashboard@2/   template DaisyUI di riferimento (tema/pattern portati in src/styles)
  drizzle/       migrazioni SQL generate
  docs/          docs/implementation-plan.md
```

Architettura feature-based nel renderer; il renderer non tocca mai il filesystem o il DB direttamente — passa sempre da `window.rstudy` (preload) → IPC validato → servizi del main process.

## Schema funzionale RAG

1. **Import materiale** (drag&drop o dialog nativo) → copia sicura in `userData/materials`.
2. **Estrazione testo**: TXT/MD diretti, PDF via `pdf-parse`. DOCX è best-effort con `mammoth`: se fallisce, il materiale è marcato "supporto in arrivo" senza bloccare il flusso.
3. **Chunking** con overlap (~700-1000 token/chunk, ~100-150 token di overlap), salvato in `document_chunks` con `source_label`.
4. **Embedding**: interfaccia `EmbeddingProvider` — attualmente sempre `LocalHashEmbeddingProvider` (hash-based, offline, nessuna dipendenza da rete o modello esterno).
5. **Retrieval**: `VectorStore` con cosine similarity in TypeScript sugli embedding (salvati come JSON), filtrato per corso e con boost per la lezione attiva.
6. **Risposta**: il main process chiede al modello AI locale una risposta in italiano basata solo sul contesto recuperato; se il contesto è insufficiente, l'app lo dichiara esplicitamente invece di inventare fonti.

## Privacy

- Database SQLite e file importati restano **sempre locali** (`~/Library/Application Support/RStudy`).
- L'inferenza AI gira interamente in locale via `node-llama-cpp`: nessuna API key, nessun account, nessun testo inviato a servizi esterni. L'unica chiamata di rete AI-correlata è il download una tantum del modello `.gguf`.
- Solo quando l'utente attiva esplicitamente una funzione AI (genera study pack, riassunto corso, chat RAG), il modello locale elabora la porzione di testo strettamente necessaria (appunti della lezione + chunk RAG rilevanti) — sempre sul dispositivo, mai in rete.
- Il backup JSON (Impostazioni → Esporta backup) **non include mai** il file del modello: solo il riferimento (URI/percorso) nei settings.

## Limitazioni note (MVP)

- **DOCX**: estrazione best-effort; documenti complessi possono risultare "supporto in arrivo".
- **Vector search**: implementazione TypeScript in-process (cosine similarity), non `sqlite-vec` nativo — adeguata per volumi da singolo studente, non ottimizzata per migliaia di documenti.
- **Embedding hash-based**: nessun modello di embedding semantico locale (per restare leggeri); la ricerca RAG è meno precisa di un vero embedding neurale, ma funziona sempre offline.
- **Qualità generazione AI**: un modello locale da ~2GB (Qwen2.5-3B) è meno capace di modelli cloud molto più grandi; per generazioni complesse la qualità può variare.
- **Drag&drop file**: si basa sulla proprietà `File.path` esposta da Electron ai file trascinati dal Finder; è un comportamento specifico di Electron che potrebbe cambiare in versioni future (in tal caso, usare il pulsante di selezione file, che passa sempre dal dialog nativo del main process).
- Nessun'app mobile o sync multi-dispositivo: i dati vivono su un singolo Mac (il backup JSON è il meccanismo di trasferimento).

## Troubleshooting

- **`pnpm install` fallisce a compilare `better-sqlite3`/scaricare i binding di `node-llama-cpp`**: verifica di avere i Command Line Tools di Xcode installati (`xcode-select --install`, su macOS) e una connessione di rete stabile (node-llama-cpp scarica binari precompilati da GitHub Releases al primo install). Se il problema persiste con una versione di Node molto recente, usa una LTS (20 o 22) via `nvm`/`fnm`.
- **Electron va in crash (`SIGSEGV`) all'avvio, senza log applicativi utili**: è un problema di compatibilità tra la versione di Electron e macOS, non un bug del codice — capita con release di macOS molto recenti quando Electron non è ancora abbastanza aggiornato. Il progetto è già fissato su una versione di Electron (`42.x`) verificata stabile; se dopo un aggiornamento di macOS il crash dovesse ripresentarsi, prova ad aggiornare `electron` all'ultima patch della stessa major (`pnpm add -D electron@latest` per una major più recente) e rilancia `pnpm install`.
- **La finestra Electron non si apre in `pnpm dev`**: controlla che la porta 5173 sia libera (`lsof -ti tcp:5173 | xargs kill -9`) e rilancia.
- **Le funzioni AI restano disattivate**: vai in Impostazioni → verifica lo stato del modello locale ("Modello pronto") — se risulta "Nessun modello scaricato", premi "Scarica modello" e attendi il completamento, poi usa "Testa connessione".
- **Un diagramma Mermaid non si vede**: l'app mostra automaticamente un fallback testuale col codice sorgente se il rendering fallisce; il resto della pagina resta utilizzabile.
- **electron-builder non trova le migrazioni a runtime da pacchetto**: le migrazioni in `drizzle/` sono incluse come `extraResources` in `electron-builder.yml`; se sposti/rinomini la cartella, aggiorna sia `extraResources` sia il calcolo del percorso in `electron/main/index.ts`.
