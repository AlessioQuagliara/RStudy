/**
 * Changelog statico mostrato in app (Sidebar → "Novità", ChangelogPanel.tsx):
 * un array scritto a mano ad ogni release, in ordine dalla più recente.
 * Nessun meccanismo automatico (nessun CMS/CI che lo genera dai commit):
 * un progetto di queste dimensioni non giustifica la complessità, e un testo
 * scritto a mano è più leggibile per uno studente di un changelog tecnico
 * generato da messaggi di commit.
 */
export interface ChangelogEntry {
  version: string;
  date: string;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.1.2",
    date: "2026-09-18",
    items: [
      "Nuovo: dettato appunti col microfono — trascrive la voce direttamente nell'editor della lezione.",
      "Il pulsante \"Riavvia e installa\" ora mostra l'errore reale se l'aggiornamento non può essere installato, invece di sembrare inerte.",
    ],
  },
  {
    version: "0.1.1",
    date: "2026-09-18",
    items: [
      "Aggiunto un provider AI cloud alternativo al modello locale, per generazioni più veloci e affidabili (facoltativo, da Impostazioni).",
      "Corretto il rendering LaTeX che a volte non compariva nelle spiegazioni degli esercizi.",
      "Corretto il logo mancante nell'app installata.",
      "I diagrammi Mermaid generati sono ora più affidabili e leggibili per lo studio.",
      "Aggiunto il controllo automatico degli aggiornamenti dell'app.",
    ],
  },
];

/** Versione più recente presente nel changelog: usata per il badge "novità non lette" (ChangelogPanel.tsx). */
export const LATEST_CHANGELOG_VERSION = CHANGELOG[0]?.version ?? null;
