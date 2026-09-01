import { ListChecks } from "lucide-react";
import type { CodingChallengeExercise } from "@shared/schemas";
import { LazyMonacoCodeEditor } from "../shared/LazyMonacoCodeEditor";

/**
 * Vista interattiva di un coding_challenge: editor Monaco con lo
 * `starterCode`/le modifiche dell'utente (stato tenuto dal chiamante,
 * DuolingoQuiz, così sopravvive all'avanzamento nel flusso) più i criteri
 * di valutazione (`evaluationHints`), se presenti. La soluzione attesa non
 * viene mai passata/renderizzata qui: resta nel pannello di feedback di
 * DuolingoQuiz, mostrato solo dopo la verifica.
 */
export function CodingChallengeQuestion({
  exercise,
  value,
  readOnly,
  onChange,
}: {
  exercise: CodingChallengeExercise;
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-base-content/60 text-xs">
        Linguaggio: <span className="badge badge-sm">{exercise.language}</span>
      </p>

      <LazyMonacoCodeEditor value={value} language={exercise.language} readOnly={readOnly} onChange={onChange} />

      {exercise.evaluationHints && exercise.evaluationHints.length > 0 && (
        <div className="bg-base-100 rounded-box p-3 text-sm">
          <p className="mb-1 flex items-center gap-2 font-medium">
            <ListChecks className="size-4" aria-hidden="true" />
            Criteri
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {exercise.evaluationHints.map((hint, index) => (
              <li key={index}>{hint}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
