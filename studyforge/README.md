# StudyForge

Dashboard di studio universitario **locale-first**, in app desktop Electron per macOS (Apple Silicon): corsi, lezioni con editor stile Notion, materiali RAG, generazione AI (DeepSeek) di riepiloghi/flashcard/diagrammi, flashcard con ripasso spaziato (SRS) e chat RAG per corso.

## Prerequisiti

- macOS su Apple Silicon (M1/M2/M3/M4).
- Node.js 20 LTS o 22 LTS (consigliato; il progetto è stato validato anche su Node 26). Servono i tool da riga di comando di Xcode (`xcode-select --install`) per compilare i moduli nativi (`better-sqlite3`, `keytar`).
- [pnpm](https://pnpm.io) (`npm i -g pnpm` se non è già installato).

## Installazione

```bash
cd studyforge
pnpm install
```

Al primo `pnpm install`, pnpm chiederà di approvare gli script nativi di `better-sqlite3`, `electron` e `keytar`:

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

## Build per macOS Apple Silicon

```bash
pnpm dist:mac
```

Esegue typecheck, build del renderer (Vite) e di main/preload (tsup), poi impacchetta con `electron-builder` un `.dmg` e uno `.zip` per `arm64` in `release/`.

## Dove configurare DeepSeek

Apri l'app → **Impostazioni**:

- **API key DeepSeek**: salvata esclusivamente nel **Keychain macOS** tramite `keytar` (mai in SQLite, mai loggata, mai esposta al renderer). Il main process la legge solo al momento della chiamata.
- **Model name**, **Base URL**, **temperatura**, **max token**: salvati in `app_settings` (SQLite, non sensibili).
- **Testa connessione**: esegue una chiamata di prova (ping/pong) verso l'endpoint configurato.

Tutte le chiamate DeepSeek avvengono esclusivamente nel main process (`electron/ai/deepseekClient.ts`); il renderer non vede mai né la chiave né l'URL completo delle richieste.

## Struttura del progetto

```
studyforge/
  electron/
    main/        bootstrap Electron, sicurezza (CSP, sender IPC), creazione finestra
    preload/      contextBridge.exposeInMainWorld — unica API esposta al renderer
    ipc/          handler IPC granulari, validati con Zod (safeHandle.ts)
    services/     percorsi app, Keychain (secretStore), impostazioni, backup
    db/           schema Drizzle, client SQLite, migrazioni, repository, seed
    ai/           DeepSeekClient, prompt, generazione study pack/riassunto corso
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

Architettura feature-based nel renderer; il renderer non tocca mai il filesystem o il DB direttamente — passa sempre da `window.studyforge` (preload) → IPC validato → servizi del main process.

## Schema funzionale RAG

1. **Import materiale** (drag&drop o dialog nativo) → copia sicura in `userData/materials`.
2. **Estrazione testo**: TXT/MD diretti, PDF via `pdf-parse`. DOCX è best-effort con `mammoth`: se fallisce, il materiale è marcato "supporto in arrivo" senza bloccare il flusso.
3. **Chunking** con overlap (~700-1000 token/chunk, ~100-150 token di overlap), salvato in `document_chunks` con `source_label`.
4. **Embedding**: interfaccia `EmbeddingProvider` — usa DeepSeek se è configurato un modello di embedding, altrimenti un fallback locale offline (hash-based) così la ricerca funziona anche senza API key.
5. **Retrieval**: `VectorStore` con cosine similarity in TypeScript sugli embedding (salvati come JSON), filtrato per corso e con boost per la lezione attiva.
6. **Risposta**: il main process chiede a DeepSeek una risposta in italiano basata solo sul contesto recuperato; se il contesto è insufficiente, l'app lo dichiara esplicitamente invece di inventare fonti.

## Privacy

- Database SQLite e file importati restano **sempre locali** (`~/Library/Application Support/StudyForge`).
- La API key DeepSeek vive solo nel Keychain macOS.
- Solo quando l'utente attiva esplicitamente una funzione AI (genera study pack, riassunto corso, chat RAG), la porzione di testo strettamente necessaria (appunti della lezione + chunk RAG rilevanti) viene inviata all'endpoint DeepSeek configurato. Nessun'altra chiamata di rete avviene in background.
- Il backup JSON (Impostazioni → Esporta backup) **non include mai** la API key.

## Limitazioni note (MVP)

- **DOCX**: estrazione best-effort; documenti complessi possono risultare "supporto in arrivo".
- **Vector search**: implementazione TypeScript in-process (cosine similarity), non `sqlite-vec` nativo — adeguata per volumi da singolo studente, non ottimizzata per migliaia di documenti.
- **Embedding offline**: se non è configurato un modello di embedding DeepSeek, si usa un fallback hash-based locale, meno preciso semanticamente di un vero modello.
- **Drag&drop file**: si basa sulla proprietà `File.path` esposta da Electron ai file trascinati dal Finder; è un comportamento specifico di Electron che potrebbe cambiare in versioni future (in tal caso, usare il pulsante di selezione file, che passa sempre dal dialog nativo del main process).
- Nessun'app mobile o sync multi-dispositivo: i dati vivono su un singolo Mac (il backup JSON è il meccanismo di trasferimento).

## Troubleshooting

- **`pnpm install` fallisce a compilare `better-sqlite3`/`keytar`**: verifica di avere i Command Line Tools di Xcode installati (`xcode-select --install`) e riprova. Se il problema persiste con una versione di Node molto recente, usa una LTS (20 o 22) via `nvm`/`fnm`.
- **Electron va in crash (`SIGSEGV`) all'avvio, senza log applicativi utili**: è un problema di compatibilità tra la versione di Electron e macOS, non un bug del codice — capita con release di macOS molto recenti quando Electron non è ancora abbastanza aggiornato. Il progetto è già fissato su una versione di Electron (`42.x`) verificata stabile; se dopo un aggiornamento di macOS il crash dovesse ripresentarsi, prova ad aggiornare `electron` all'ultima patch della stessa major (`pnpm add -D electron@latest` per una major più recente) e rilancia `pnpm install`.
- **La finestra Electron non si apre in `pnpm dev`**: controlla che la porta 5173 sia libera (`lsof -ti tcp:5173 | xargs kill -9`) e rilancia.
- **Le funzioni AI restano disattivate**: vai in Impostazioni → verifica che l'API key sia salvata ("chiave salvata nel Keychain macOS") e usa "Testa connessione".
- **Un diagramma Mermaid non si vede**: l'app mostra automaticamente un fallback testuale col codice sorgente se il rendering fallisce; il resto della pagina resta utilizzabile.
- **electron-builder non trova le migrazioni a runtime da pacchetto**: le migrazioni in `drizzle/` sono incluse come `extraResources` in `electron-builder.yml`; se sposti/rinomini la cartella, aggiorna sia `extraResources` sia il calcolo del percorso in `electron/main/index.ts`.
