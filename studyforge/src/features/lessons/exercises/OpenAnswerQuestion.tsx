import type { OpenAnswerExercise } from "@shared/schemas";

/**
 * Risposta libera: confronto puramente testuale (electron/features/lessons/
 * exercises/answerMatching.ts), mai una valutazione semantica. La UI lo
 * dichiara esplicitamente invece di far credere allo studente che l'app
 * "capisca" se la risposta è concettualmente giusta.
 */
export function OpenAnswerQuestion({
  exercise,
  value,
  verified,
  correct,
  onChange,
}: {
  exercise: OpenAnswerExercise;
  value: string;
  verified: boolean;
  correct: boolean | null;
  onChange: (value: string) => void;
}) {
  const inputId = `open-answer-${exercise.id}`;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-base-content/60 text-xs">
        La tua risposta
      </label>
      <textarea
        id={inputId}
        className="textarea textarea-bordered w-full"
        rows={3}
        value={value}
        disabled={verified}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Scrivi qui la tua risposta..."
      />
      <p className="text-base-content/40 text-xs">
        La verifica confronta il testo con le risposte accettate (trim, spazi ripetuti, maiuscole/minuscole
        ignorate): non è una valutazione semantica del significato.
      </p>
      {verified && correct === false && (
        <p className="text-base-content/70 text-sm">
          Risposta accettata: <span className="font-medium">{exercise.acceptedAnswers[0]}</span>
        </p>
      )}
    </div>
  );
}
