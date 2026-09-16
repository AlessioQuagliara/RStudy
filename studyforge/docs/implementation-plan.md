# RStudy — piano di implementazione

## Obiettivo
App desktop Electron locale-first (macOS Apple Silicon; pacchetti Windows/Linux configurati) per gestione corsi/lezioni universitari, appunti (Tiptap), materiali RAG, generazione AI locale (llama.cpp, nessuna API key) di study pack per lezione e riassunti di corso, flashcard con SRS, chat RAG per corso.

## Riuso del template
`html-dashboard@2` (Tailwind v4 + DaisyUI 5, layout `drawer`, `stats`, `card`, `menu` sidebar con gruppi `details/summary`, breadcrumbs, popover dropdown) è la fonte del look & feel. Non è praticabile portare le ~100 pagine HTML del template (catalogo e-commerce) 1:1: si estraggono invece i **token di tema DaisyUI** (`src/css/tailwind.css`, temi `light`/`dark` con variabili oklch) e i **pattern di componente** (drawer layout, card, stats, menu, breadcrumbs, badge, btn, modal/dialog) e si ricostruiscono come componenti React in `src/components/`. Le icone heroicons caricate via CDN (`external-svg-loader`) e la libreria grafici (`@weblogin/trendchart-elements`) vengono sostituite con `lucide-react` (bundle locale, offline) perché l'app deve funzionare offline.

## Stack
Electron (main/preload separati, `contextIsolation`+`sandbox`+`nodeIntegration:false`) · React 18 + Vite + TS strict · Tailwind CSS + DaisyUI · Drizzle ORM + better-sqlite3 · Tiptap · mermaid · Zod · TanStack Query · Zustand · node-llama-cpp (inferenza AI locale).

## Sicurezza
- Preload espone solo API granulari via `contextBridge.exposeInMainWorld('rstudy', {...})`, mai `ipcRenderer` diretto.
- Ogni handler IPC nel main valida payload con Zod e verifica `event.senderFrame` contro la finestra applicativa attesa prima di eseguire.
- Nessuna API key: l'inferenza AI gira in locale via `node-llama-cpp`, il modello `.gguf` vive in `userData/models`.

## Modello dati
8 tabelle Drizzle come da specifica (courses, lessons, materials, document_chunks, lesson_ai_outputs, flashcards, course_ai_outputs, app_settings) con indici su `course_id`, `lesson_id`, `material_id`, `status`, `next_review_at`.

## RAG
`DocumentParser` (txt/md diretti, pdf via `pdf-parse`, docx via `mammoth` best-effort con fallback "supporto in arrivo") → chunking con overlap → `EmbeddingProvider` (interfaccia; implementazione attuale: hash-embedding locale deterministico, sempre offline) → `VectorStore` (adapter con implementazione TS cosine-similarity su BLOB/JSON in SQLite; punto di estensione per sqlite-vec) → `RagService.query(courseId, question, {lessonId?})`.

## AI locale
`LocalAiClient` nel main, backed by `node-llama-cpp` (modello GGUF caricato in locale, grammar JSON per forzare output parsabile). `generateLessonStudyPack` e `generateCourseSummary` con validazione Zod dell'output, `prompt_version`, salvataggio transazionale.

## Ordine di esecuzione
1. Scaffold progetto (Vite+Electron+TS, Tailwind/DaisyUI, electron-builder).
2. DB (Drizzle schema+migrazioni) + preload/IPC sicuro + CRUD corsi/lezioni.
3. Editor Tiptap + autosave.
4. UI corsi/dettaglio/lezioni/materiali riusando i pattern DaisyUI.
5. LocalAiClient (node-llama-cpp) + study pack.
6. Mermaid, flashcard/SRS, riassunto corso.
7. RAG (parsing, chunking, embedding, retrieval, chat).
8. Test Vitest, seed, README.
9. Typecheck/lint/test e fix.

## Limiti noti MVP (dichiarati anche in README)
- DOCX: estrazione best-effort con `mammoth`; se fallisce, materiale marcato "supporto in arrivo" senza bloccare il flusso.
- Vector search: cosine-similarity in TS su embedding salvati come JSON BLOB (nessuna dipendenza nativa `sqlite-vec` per evitare problemi di build su Apple Silicon in questa iterazione); l'adapter è isolato dietro `VectorStore` per poter aggiungere in futuro un backend nativo.
- Embedding: hash-based locale (bag-of-words → vettore), sempre offline, sufficiente per retrieval approssimativo ma non semantico quanto un vero modello neurale.
