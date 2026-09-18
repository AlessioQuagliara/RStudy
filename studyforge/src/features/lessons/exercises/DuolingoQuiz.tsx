import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AlertTriangle, ArrowLeft, Check, RotateCcw, Trophy, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Exercise, ExerciseSet } from "@shared/schemas";
import { QuestionMarkdown } from "../shared/QuestionMarkdown";
import { MultipleChoiceQuestion } from "./MultipleChoiceQuestion";
import { OpenAnswerQuestion } from "./OpenAnswerQuestion";
import { CodingChallengeQuestion } from "./CodingChallengeQuestion";
import { isOpenAnswerCorrect } from "./answerMatching";
import { evaluateCodingChallengeByTextComparison, type CodingEvaluationResult, type CodingEvaluator } from "./codingEvaluation";

interface AttemptState {
  selectedOption: string | null;
  openAnswerText: string;
  /** Codice dell'utente per coding_challenge: inizializzato allo starterCode, persiste finché il quiz resta aperto. */
  codeText: string;
  verified: boolean;
  /** Esito multiple_choice/open_answer: null finché non verificato. */
  correct: boolean | null;
  /** Esito coding_challenge (vedi codingEvaluation.ts): null finché non verificato. */
  codingResult: CodingEvaluationResult | null;
}

function createInitialAttempts(exercises: Exercise[]): AttemptState[] {
  return exercises.map((exercise) => ({
    selectedOption: null,
    openAnswerText: "",
    codeText: exercise.type === "coding_challenge" ? exercise.starterCode : "",
    verified: false,
    correct: null,
    codingResult: null,
  }));
}

function computeCorrectness(exercise: Exercise, attempt: AttemptState): boolean | null {
  if (exercise.type === "multiple_choice") {
    return attempt.selectedOption !== null ? attempt.selectedOption === exercise.correctAnswer : null;
  }
  if (exercise.type === "open_answer") {
    return isOpenAnswerCorrect(attempt.openAnswerText, exercise.acceptedAnswers);
  }
  return null; // coding_challenge: valutato a parte, vedi evaluateCodingChallenge
}

type FeedbackTone = "neutral" | "success" | "error" | "warning";

function getFeedbackTone(exercise: Exercise, attempt: AttemptState): FeedbackTone {
  if (!attempt.verified) return "neutral";
  if (exercise.type === "coding_challenge") {
    return attempt.codingResult?.status === "matches_reference" ? "success" : "warning";
  }
  return attempt.correct ? "success" : "error";
}

const FEEDBACK_PANEL_CLASS: Record<FeedbackTone, string> = {
  neutral: "border-base-200",
  success: "border-success/30 bg-success/10",
  error: "border-error/30 bg-error/10",
  warning: "border-warning/30 bg-warning/10",
};

export interface DuolingoQuizProps {
  exerciseSet: ExerciseSet;
  /** Se il set proviene dalla cache (nessuna nuova chiamata al provider AI): mostrato in modo discreto nell'header. */
  fromCache?: boolean;
  onClose: () => void;
  /**
   * Strategia di valutazione dei coding_challenge. Default: confronto
   * testuale locale (codingEvaluation.ts::evaluateCodingChallengeByTextComparison),
   * mai esecuzione del codice. Iniettabile per sostituirla in futuro (es.
   * valutazione sicura nel main process via IPC, o in una sandbox separata)
   * senza toccare questo componente: la UI conosce solo la forma
   * `CodingEvaluationResult`, mai i dettagli di come viene prodotta.
   */
  evaluateCodingChallenge?: CodingEvaluator;
}

/**
 * Allenamento a step in stile Duolingo su un ExerciseSet già validato.
 * Nessuna dipendenza da provider AI/database: riceve i dati via prop e vive
 * di solo stato locale (indice corrente, risposte, esito). Il chiamante
 * decide come mostrarlo (dialog/pagina/modal) tramite `onClose`.
 */
export function DuolingoQuiz({
  exerciseSet,
  fromCache,
  onClose,
  evaluateCodingChallenge = evaluateCodingChallengeByTextComparison,
}: DuolingoQuizProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [attempts, setAttempts] = useState<AttemptState[]>(() => createInitialAttempts(exerciseSet.exercises));
  const [phase, setPhase] = useState<"in-progress" | "finished">("in-progress");
  // Non un vero <h3>: react-markdown produce elementi di blocco (<p>, <ul>,
  // ...) che non sono validi dentro un heading nativo. role="heading" +
  // aria-level espone comunque la semantica corretta per lo screen reader.
  const questionHeadingRef = useRef<HTMLDivElement>(null);

  const total = exerciseSet.exercises.length;
  const currentExercise = exerciseSet.exercises[currentIndex]!;
  const currentAttempt = attempts[currentIndex]!;
  const isLastExercise = currentIndex === total - 1;

  // Sposta il focus sulla domanda ad ogni avanzamento (accessibilità
  // tastiera/screen reader). Solo il primissimo mount rimanda al frame
  // successivo, per non competere con showModal() del dialog che lo ospita;
  // i cambi di esercizio successivi spostano il focus in modo sincrono,
  // altrimenti un rAF pendente potrebbe scattare mentre l'utente ha già
  // iniziato a scrivere nella domanda successiva e rubargli il focus a metà
  // digitazione (bug osservato: risposta troncata dopo pochi caratteri).
  const isFirstFocusRun = useRef(true);
  useEffect(() => {
    if (phase !== "in-progress") return;
    if (isFirstFocusRun.current) {
      isFirstFocusRun.current = false;
      const raf = requestAnimationFrame(() => questionHeadingRef.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
    questionHeadingRef.current?.focus();
  }, [currentIndex, phase]);

  const updateCurrentAttempt = (patch: Partial<AttemptState>) => {
    setAttempts((prev) => prev.map((attempt, i) => (i === currentIndex ? { ...attempt, ...patch } : attempt)));
  };

  const handleSelectOption = (option: string) => {
    if (currentAttempt.verified) return;
    updateCurrentAttempt({ selectedOption: option });
  };

  const handleOpenAnswerChange = (text: string) => {
    if (currentAttempt.verified) return;
    updateCurrentAttempt({ openAnswerText: text });
  };

  const handleCodeChange = (text: string) => {
    if (currentAttempt.verified) return;
    updateCurrentAttempt({ codeText: text });
  };

  const handleVerify = () => {
    if (currentAttempt.verified) return;
    if (currentExercise.type === "coding_challenge") {
      updateCurrentAttempt({
        verified: true,
        codingResult: evaluateCodingChallenge(currentAttempt.codeText, currentExercise),
      });
      return;
    }
    updateCurrentAttempt({ verified: true, correct: computeCorrectness(currentExercise, currentAttempt) });
  };

  const handleContinue = () => {
    if (isLastExercise) {
      setPhase("finished");
      return;
    }
    setCurrentIndex((i) => i + 1);
  };

  const handleRestart = () => {
    setAttempts(createInitialAttempts(exerciseSet.exercises));
    setCurrentIndex(0);
    setPhase("in-progress");
  };

  const canVerify =
    currentExercise.type === "multiple_choice"
      ? currentAttempt.selectedOption !== null
      : currentExercise.type === "open_answer"
        ? currentAttempt.openAnswerText.trim().length > 0
        : currentAttempt.codeText.trim().length > 0;

  const showFeedback = currentAttempt.verified;
  const feedbackTone = getFeedbackTone(currentExercise, currentAttempt);

  // Punteggio principale: solo multiple_choice/open_answer, esattamente come
  // prima. I coding_challenge sono mostrati separatamente (vedi sotto): il
  // confronto testuale con la soluzione di riferimento non è lo stesso tipo
  // di garanzia di una risposta verificata, quindi non li facciamo confluire
  // nello stesso numero di "risposte corrette" per non sovra-dichiarare.
  const gradableExercises = exerciseSet.exercises.filter((e) => e.type !== "coding_challenge");
  const gradableCorrect = attempts.filter(
    (a, i) => exerciseSet.exercises[i]!.type !== "coding_challenge" && a.correct === true,
  ).length;
  const scorePercent = gradableExercises.length > 0 ? Math.round((gradableCorrect / gradableExercises.length) * 100) : 0;
  const radialStyle: CSSProperties & { "--value"?: number } = { "--value": scorePercent };

  const codingExercises = exerciseSet.exercises.filter((e) => e.type === "coding_challenge");
  const codingMatches = attempts.filter(
    (a, i) => exerciseSet.exercises[i]!.type === "coding_challenge" && a.codingResult?.status === "matches_reference",
  ).length;

  if (phase === "finished") {
    return (
      <div className="flex h-[min(85vh,640px)] flex-col overflow-hidden">
        <QuizHeader
          title={exerciseSet.title}
          fromCache={fromCache}
          currentPosition={total}
          total={total}
          onClose={onClose}
        />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 overflow-y-auto p-6 text-center">
          <Trophy className="text-warning size-12" aria-hidden="true" />
          <h2 className="text-xl font-semibold">Sessione completata!</h2>
          <div
            className="radial-progress text-primary"
            style={radialStyle}
            role="img"
            aria-label={`${scorePercent} per cento di risposte corrette`}
          >
            {scorePercent}%
          </div>
          <p className="text-base-content/70 text-sm">
            {gradableCorrect} risposte corrette su {gradableExercises.length}
          </p>
          {codingExercises.length > 0 && (
            <p className="text-base-content/50 text-xs">
              {codingMatches} su {codingExercises.length} esercizi di coding con codice che combacia testualmente
              con la soluzione di riferimento
            </p>
          )}
          <div className="mt-2 flex gap-3">
            <button type="button" className="btn btn-outline" onClick={handleRestart}>
              <RotateCcw className="size-4" aria-hidden="true" />
              Ricomincia
            </button>
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Chiudi
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[min(85vh,640px)] flex-col overflow-hidden">
      <QuizHeader
        title={exerciseSet.title}
        fromCache={fromCache}
        currentPosition={currentIndex + 1}
        total={total}
        onClose={onClose}
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div
          ref={questionHeadingRef}
          tabIndex={-1}
          role="heading"
          aria-level={3}
          className="mb-4 text-lg font-medium outline-none"
        >
          <QuestionMarkdown>{currentExercise.question}</QuestionMarkdown>
        </div>

        {currentExercise.type === "multiple_choice" && (
          <MultipleChoiceQuestion
            exercise={currentExercise}
            selectedOption={currentAttempt.selectedOption}
            verified={currentAttempt.verified}
            onSelect={handleSelectOption}
          />
        )}
        {currentExercise.type === "open_answer" && (
          <OpenAnswerQuestion
            exercise={currentExercise}
            value={currentAttempt.openAnswerText}
            verified={currentAttempt.verified}
            correct={currentAttempt.correct}
            onChange={handleOpenAnswerChange}
          />
        )}
        {currentExercise.type === "coding_challenge" && (
          <CodingChallengeQuestion
            exercise={currentExercise}
            value={currentAttempt.codeText}
            readOnly={currentAttempt.verified}
            onChange={handleCodeChange}
          />
        )}
      </div>

      <div className={cn("shrink-0 border-t p-4 sm:p-6", FEEDBACK_PANEL_CLASS[feedbackTone])}>
        {!showFeedback && (
          <button type="button" className="btn btn-primary btn-block" disabled={!canVerify} onClick={handleVerify}>
            Verifica
          </button>
        )}
        {showFeedback && (
          <div className="flex flex-col gap-3">
            {currentExercise.type === "coding_challenge" ? (
              currentAttempt.codingResult && (
                <p
                  className={cn(
                    "flex items-center gap-2 font-semibold",
                    currentAttempt.codingResult.status === "matches_reference" ? "text-success" : "text-warning",
                  )}
                  role="status"
                >
                  {currentAttempt.codingResult.status === "matches_reference" ? (
                    <Check className="size-5" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="size-5" aria-hidden="true" />
                  )}
                  {currentAttempt.codingResult.status === "matches_reference"
                    ? "Coincide con la soluzione di riferimento"
                    : "Da rivedere"}
                </p>
              )
            ) : (
              <p
                className={cn(
                  "flex items-center gap-2 font-semibold",
                  currentAttempt.correct ? "text-success" : "text-error",
                )}
                role="status"
              >
                {currentAttempt.correct ? (
                  <Check className="size-5" aria-hidden="true" />
                ) : (
                  <X className="size-5" aria-hidden="true" />
                )}
                {currentAttempt.correct ? "Corretto!" : "Non proprio..."}
              </p>
            )}

            {currentExercise.type === "coding_challenge" && currentAttempt.codingResult && (
              <p className="text-base-content/70 text-xs">{currentAttempt.codingResult.message}</p>
            )}

            <div className="text-base-content/80 text-sm">
              <QuestionMarkdown>{currentExercise.explanation}</QuestionMarkdown>
            </div>

            {currentExercise.type === "coding_challenge" && currentAttempt.codingResult?.status === "needs_review" && (
              <div>
                <p className="text-base-content/60 mb-1 text-xs font-medium">Soluzione di riferimento</p>
                <pre className="bg-base-300 overflow-x-auto rounded-lg p-3 text-xs">
                  <code>{currentExercise.expectedSolution}</code>
                </pre>
              </div>
            )}

            <button type="button" className="btn btn-block" onClick={handleContinue}>
              {isLastExercise ? "Termina" : "Continua"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function QuizHeader({
  title,
  fromCache,
  currentPosition,
  total,
  onClose,
}: {
  title: string;
  fromCache: boolean | undefined;
  currentPosition: number;
  total: number;
  onClose: () => void;
}) {
  return (
    <div className="border-base-200 flex shrink-0 flex-col gap-2 border-b p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={onClose} aria-label="Chiudi esercizi">
          <ArrowLeft className="size-4" aria-hidden="true" />
        </button>
        <h2 className="flex-1 truncate text-base font-semibold">{title}</h2>
        {fromCache && <span className="badge badge-ghost badge-sm shrink-0">Da cache</span>}
      </div>
      <div className="flex items-center gap-3">
        <progress
          className="progress progress-primary w-full"
          value={currentPosition}
          max={total}
          aria-label={`Esercizio ${currentPosition} di ${total}`}
        />
        <span className="text-base-content/60 shrink-0 text-xs">
          {currentPosition}/{total}
        </span>
      </div>
    </div>
  );
}
