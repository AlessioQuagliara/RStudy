import { Check, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { MultipleChoiceExercise } from "@shared/schemas";
import { QuestionMarkdown } from "../shared/QuestionMarkdown";

/**
 * 4 opzioni selezionabili. Prima della verifica: selezione singola tramite
 * `aria-pressed` (nessun nuovo click accettato una volta verificato, i
 * bottoni diventano `disabled`). Dopo la verifica: la corretta è evidenziata
 * in verde, quella eventualmente scelta ma sbagliata in rosso — sempre
 * accompagnate da un'icona (Check/X), non solo dal colore, per non affidare
 * il significato al solo colore.
 */
export function MultipleChoiceQuestion({
  exercise,
  selectedOption,
  verified,
  onSelect,
}: {
  exercise: MultipleChoiceExercise;
  selectedOption: string | null;
  verified: boolean;
  onSelect: (option: string) => void;
}) {
  return (
    <div role="group" aria-label="Opzioni di risposta" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {exercise.options.map((option) => {
        const isSelected = selectedOption === option;
        const isCorrectOption = option === exercise.correctAnswer;
        const showAsCorrect = verified && isCorrectOption;
        const showAsWrong = verified && isSelected && !isCorrectOption;

        return (
          <button
            key={option}
            type="button"
            className={cn(
              "btn btn-outline h-auto min-h-16 justify-start px-4 py-3 text-left whitespace-normal normal-case",
              !verified && isSelected && "btn-primary",
              showAsCorrect && "btn-success text-success-content",
              showAsWrong && "btn-error text-error-content",
            )}
            aria-pressed={isSelected}
            disabled={verified}
            onClick={() => onSelect(option)}
          >
            {showAsCorrect && <Check className="size-4 shrink-0" aria-hidden="true" />}
            {showAsWrong && <X className="size-4 shrink-0" aria-hidden="true" />}
            <span className="[&_p]:m-0">
              <QuestionMarkdown>{option}</QuestionMarkdown>
            </span>
          </button>
        );
      })}
    </div>
  );
}
