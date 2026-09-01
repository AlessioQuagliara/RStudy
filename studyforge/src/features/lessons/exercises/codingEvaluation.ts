import type { CodingChallengeExercise } from "@shared/schemas";

export type CodingEvaluationStatus = "not_verified" | "matches_reference" | "needs_review";

/**
 * Esito di una valutazione di un coding_challenge. Interfaccia stabile e
 * volutamente minimale: una futura strategia di valutazione (sicura nel main
 * process, o in una sandbox separata, eventualmente con esecuzione reale del
 * codice) può sostituire l'evaluator che produce questo risultato senza
 * toccare la UI (DuolingoQuiz/CodingChallengeQuestion conoscono solo questa
 * forma, mai i dettagli implementativi della valutazione).
 */
export interface CodingEvaluationResult {
  status: CodingEvaluationStatus;
  /** Messaggio breve, user-safe, mostrato nel pannello di feedback. */
  message: string;
}

export type CodingEvaluator = (userCode: string, exercise: CodingChallengeExercise) => CodingEvaluationResult;

/**
 * Normalizzazione "prudente": solo fine riga uniformati (CRLF -> LF) e trim
 * di spazi/newline iniziali e finali. Deliberatamente più conservativa della
 * normalizzazione delle risposte aperte (answerMatching.ts, che collassa
 * spazi interni e ignora maiuscole/minuscole): indentazione, spaziatura
 * interna e case fanno parte della sintassi del codice, quindi due
 * implementazioni diverse ma "equivalenti a spanne" non vengono mai
 * dichiarate uguali per errore.
 */
export function normalizeCodeForComparison(code: string): string {
  return code.replace(/\r\n/g, "\n").trim();
}

/**
 * Valutazione v1, puramente testuale e client-side: confronta il codice
 * normalizzato con `expectedSolution`. Non esegue MAI il codice (nessun
 * eval, Function, child_process, worker non sandboxato) e non pretende di
 * essere un giudice semantico — una differenza testuale produce sempre
 * "needs_review" (da rivedere), mai un giudizio di "sbagliato": il codice
 * potrebbe essere corretto ma scritto in modo diverso dalla soluzione di
 * riferimento.
 */
export function evaluateCodingChallengeByTextComparison(
  userCode: string,
  exercise: CodingChallengeExercise,
): CodingEvaluationResult {
  if (!userCode.trim()) {
    return { status: "not_verified", message: "Scrivi del codice prima di verificare." };
  }

  const matches = normalizeCodeForComparison(userCode) === normalizeCodeForComparison(exercise.expectedSolution);

  if (matches) {
    return {
      status: "matches_reference",
      message: "Il codice coincide, dopo normalizzazione, con la soluzione di riferimento.",
    };
  }

  return {
    status: "needs_review",
    message:
      "Il codice è testualmente diverso dalla soluzione di riferimento: non significa che sia sbagliato, confrontalo con quella qui sotto.",
  };
}
