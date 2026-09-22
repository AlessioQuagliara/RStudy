/**
 * Budget di chiamate AI per un singolo job "Genera sessione studio"
 * (CLOUD_STUDY_SESSION_MAX_CALLS_PER_JOB, default 40): protegge da loop
 * agentici incontrollati e da corsi enormi che genererebbero un numero di
 * chiamate spropositato. Separato dal limite giornaliero condiviso
 * dell'AI generalista (electron/services/cloudUsageService.ts): un singolo
 * job non deve poter azzerare da solo quel budget.
 */
export class StudySessionCallBudgetExceededError extends Error {
  constructor(public readonly limit: number) {
    super(
      `La generazione ha richiesto più di ${limit} elaborazioni AI ed è stata interrotta per sicurezza. Prova con un corso più piccolo o riprova più tardi.`,
    );
    this.name = "StudySessionCallBudgetExceededError";
  }
}

export function getStudySessionMaxCallsPerJob(): number {
  const parsed = Number.parseInt(process.env.CLOUD_STUDY_SESSION_MAX_CALLS_PER_JOB ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 40;
}

export function getStudySessionMinIntervalHours(): number {
  const parsed = Number.parseInt(process.env.CLOUD_STUDY_SESSION_MIN_INTERVAL_HOURS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 24;
}

export function createCallBudget(maxCalls: number) {
  let used = 0;
  return {
    get used() {
      return used;
    },
    /** Da chiamare PRIMA di ogni chiamata AI reale della pipeline: lancia se il budget è già esaurito, altrimenti incrementa. */
    reserve(): void {
      if (used >= maxCalls) throw new StudySessionCallBudgetExceededError(maxCalls);
      used++;
    },
  };
}
