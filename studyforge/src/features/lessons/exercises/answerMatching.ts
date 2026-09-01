/**
 * Normalizzazione esplicita per il confronto delle risposte aperte: trim,
 * spazi ripetuti collassati, case-insensitive (locale-aware per gli accenti
 * italiani). Pura funzione di confronto testuale — NON è una valutazione
 * semantica: non sappiamo se una risposta concettualmente corretta ma
 * scritta in modo diverso da `acceptedAnswers` sia "giusta". La UI deve
 * essere onesta su questo limite (vedi OpenAnswerQuestion.tsx).
 */
export function normalizeAnswerText(text: string): string {
  return text.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

/**
 * Vera solo se la risposta normalizzata coincide ESATTAMENTE con almeno una
 * delle risposte accettate normalizzata allo stesso modo. Una risposta vuota
 * non è mai corretta, anche se per assurdo `acceptedAnswers` contenesse una
 * stringa vuota/solo spazi (non dichiariamo mai una non-risposta corretta).
 */
export function isOpenAnswerCorrect(userText: string, acceptedAnswers: readonly string[]): boolean {
  const normalizedUser = normalizeAnswerText(userText);
  if (!normalizedUser) return false;
  return acceptedAnswers.some((accepted) => normalizeAnswerText(accepted) === normalizedUser);
}
