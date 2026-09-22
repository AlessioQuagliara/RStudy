const TOUR_SEEN_KEY = "rstudy:tourSeenVersion";

/**
 * Versione del CONTENUTO del tour (non della app): incrementarla in futuro
 * se il tour cambia abbastanza da voler farlo rivedere agli utenti esistenti.
 */
export const CURRENT_TOUR_VERSION = "1";

/**
 * Stesso pattern try/catch di ChangelogPanel.tsx: localStorage può lanciare
 * (private browsing/policy) o essere assente, e questo non deve mai rompere
 * il render dell'app. A differenza del changelog, qui il default sicuro in
 * caso di errore è "già visto" — non forzare mai il tour automatico se
 * localStorage non è accessibile; il bottone manuale in Sidebar resta
 * comunque disponibile.
 */
export function hasTourBeenSeen(): boolean {
  try {
    return localStorage.getItem(TOUR_SEEN_KEY) === CURRENT_TOUR_VERSION;
  } catch {
    return true;
  }
}

export function markTourAsSeen(): void {
  try {
    localStorage.setItem(TOUR_SEEN_KEY, CURRENT_TOUR_VERSION);
  } catch {
    // Ignorato di proposito: vedi commento sopra.
  }
}
