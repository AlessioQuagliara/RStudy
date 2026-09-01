# StudyForge

Sito di presentazione (GitHub Pages) del progetto **StudyForge**: un'app desktop locale-first che trasforma gli
appunti universitari in esercizi interattivi e presentazioni, per studiare in modo attivo invece che rileggere.

**Appunti → quiz progressivi → presentazioni di ripasso.**

## Cosa trovi in questo repository

- `index.html`, `assets/css/`, `assets/js/` — landing page statica pubblicata su GitHub Pages.
- `studyforge/` — codice sorgente dell'app desktop (Electron + React + TypeScript + SQLite locale). Per build,
  sviluppo locale e dettagli di architettura vedi [`studyforge/README.md`](studyforge/README.md).

## La landing page

Pagina statica in HTML/CSS/JS vanilla: nessun framework, nessun build system. Si può aprire `index.html`
direttamente nel browser oppure pubblicarla così com'è su GitHub Pages.

```bash
# anteprima locale (facoltativa)
npx serve .
# oppure
python -m http.server 8080
```

### Pubblicazione su GitHub Pages

1. Fai push del repository su GitHub.
2. Settings → Pages → Source: branch `main`, cartella `/ (root)`.
3. La pagina sarà disponibile su `https://<utente>.github.io/<repo>/`.

## Stato del progetto

StudyForge è in sviluppo attivo. La beta desktop (macOS e Windows) e il piano a pagamento indicato in landing non
sono ancora pubblicati: la pagina raccoglie l'interesse tramite una issue GitHub precompilata, senza checkout né
raccolta di dati di pagamento.

## Privacy

Appunti, corsi e materiali restano sul dispositivo dell'utente. Il testo viene inviato al provider AI solo quando
l'utente avvia esplicitamente una generazione (esercizi o presentazione), mai in automatico o in background.
Maggiori dettagli nella sezione "Privacy" della landing page e in [`studyforge/README.md`](studyforge/README.md).
