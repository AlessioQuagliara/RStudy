import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DuolingoQuiz } from "./DuolingoQuiz";
import type { ExerciseSet } from "@shared/schemas";

// Il vero monaco-editor non è compatibile con jsdom (usa ResizeObserver e
// altre API browser assenti) ed è comunque troppo pesante per un test
// unitario: si mocka il componente lazy-loaded (../shared/MonacoCodeEditor,
// usato da LazyMonacoCodeEditor) con un textarea equivalente ai fini del
// comportamento testato (valore, onChange, readOnly).
vi.mock("../shared/MonacoCodeEditor", () => ({
  MonacoCodeEditor: ({
    value,
    onChange,
    readOnly,
  }: {
    value: string;
    onChange: (value: string) => void;
    readOnly: boolean;
  }) => (
    <textarea
      aria-label="Editor di codice"
      value={value}
      readOnly={readOnly}
      disabled={readOnly}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

const EXERCISE_SET: ExerciseSet = {
  version: 1,
  sourceLessonId: "lesson-1",
  title: "Esercizi su Limiti",
  generatedAt: new Date("2026-01-01T10:00:00.000Z").toISOString(),
  exercises: [
    {
      type: "multiple_choice",
      id: "ex-1",
      question: "Quanto fa 2 + 2?",
      options: ["3", "4", "5", "6"],
      correctAnswer: "4",
      explanation: "2 + 2 fa 4.",
      difficulty: 1,
    },
    {
      type: "open_answer",
      id: "ex-2",
      question: "Cos'è un limite?",
      acceptedAnswers: ["il valore a cui tende una funzione"],
      explanation: "Il limite descrive il comportamento della funzione vicino a un punto.",
      difficulty: 2,
    },
    {
      type: "multiple_choice",
      id: "ex-3",
      question: "Quanto fa 3 + 3?",
      options: ["5", "6", "7", "8"],
      correctAnswer: "6",
      explanation: "3 + 3 fa 6.",
      difficulty: 3,
    },
  ],
};

function renderQuiz(exerciseSet: ExerciseSet = EXERCISE_SET, onClose = vi.fn()) {
  const utils = render(<DuolingoQuiz exerciseSet={exerciseSet} onClose={onClose} />);
  return { onClose, ...utils };
}

/**
 * Il testo del punteggio è composto da più espressioni JSX ({gradableCorrect}
 * ecc.), quindi finisce in nodi di testo separati: un match per contenuto
 * esatto su tutto il paragrafo fallirebbe. Cerchiamo direttamente il <p> e
 * leggiamo il suo textContent aggregato.
 */
function scoreText(): string {
  return (
    screen.getByText(
      (_, element) =>
        element?.tagName.toLowerCase() === "p" && Boolean(element.textContent?.includes("risposte corrette")),
    ).textContent ?? ""
  );
}

describe("DuolingoQuiz", () => {
  it("mostra la prima domanda con l'avanzamento 1/3 e il bottone Verifica disabilitato senza risposta", () => {
    renderQuiz();

    expect(screen.getByText("Quanto fa 2 + 2?")).toBeInTheDocument();
    expect(screen.getAllByText("1/3").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /verifica/i })).toBeDisabled();
  });

  it("multiple_choice: selezionare un'opzione abilita Verifica; risposta corretta mostra feedback verde e blocca nuove selezioni", async () => {
    const user = userEvent.setup();
    renderQuiz();

    const correctOption = screen.getByRole("button", { name: "4" });
    await user.click(correctOption);
    expect(correctOption).toHaveAttribute("aria-pressed", "true");

    const verifyButton = screen.getByRole("button", { name: /verifica/i });
    expect(verifyButton).toBeEnabled();
    await user.click(verifyButton);

    expect(screen.getByText("Corretto!")).toBeInTheDocument();
    expect(screen.getByText("2 + 2 fa 4.")).toBeInTheDocument();

    for (const label of ["3", "4", "5", "6"]) {
      expect(screen.getByRole("button", { name: label })).toBeDisabled();
    }

    // Blocco dopo verifica: cliccare un'altra opzione (disabilitata) non cambia nulla.
    await user.click(screen.getByRole("button", { name: "3" }));
    expect(screen.getByText("Corretto!")).toBeInTheDocument();
  });

  it("multiple_choice: risposta errata mostra feedback rosso ed evidenzia sia la scelta sbagliata sia quella corretta", async () => {
    const user = userEvent.setup();
    renderQuiz();

    await user.click(screen.getByRole("button", { name: "3" }));
    await user.click(screen.getByRole("button", { name: /verifica/i }));

    expect(screen.getByText("Non proprio...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3" })).toHaveClass("btn-error");
    expect(screen.getByRole("button", { name: "4" })).toHaveClass("btn-success");
  });

  it("avanzamento: Continua porta alla domanda successiva (2/3)", async () => {
    const user = userEvent.setup();
    renderQuiz();

    await user.click(screen.getByRole("button", { name: "4" }));
    await user.click(screen.getByRole("button", { name: /verifica/i }));
    await user.click(screen.getByRole("button", { name: /continua/i }));

    expect(screen.getByText("Cos'è un limite?")).toBeInTheDocument();
    expect(screen.getAllByText("2/3").length).toBeGreaterThan(0);
  });

  it("open_answer: normalizza la risposta (spazi ripetuti, maiuscole) prima del confronto", async () => {
    const user = userEvent.setup();
    renderQuiz();

    await user.click(screen.getByRole("button", { name: "4" }));
    await user.click(screen.getByRole("button", { name: /verifica/i }));
    await user.click(screen.getByRole("button", { name: /continua/i }));

    const textarea = screen.getByLabelText(/la tua risposta/i);
    await user.type(textarea, "   IL   VALORE a cui TENDE una funzione  ");
    await user.click(screen.getByRole("button", { name: /verifica/i }));

    expect(screen.getByText("Corretto!")).toBeInTheDocument();
    expect(textarea).toBeDisabled();
  });

  it("open_answer: una risposta non tra quelle accettate mostra il feedback rosso e la risposta accettata", async () => {
    const user = userEvent.setup();
    renderQuiz();

    await user.click(screen.getByRole("button", { name: "4" }));
    await user.click(screen.getByRole("button", { name: /verifica/i }));
    await user.click(screen.getByRole("button", { name: /continua/i }));

    const textarea = screen.getByLabelText(/la tua risposta/i);
    await user.type(textarea, "una cosa a caso");
    await user.click(screen.getByRole("button", { name: /verifica/i }));

    expect(screen.getByText("Non proprio...")).toBeInTheDocument();
    expect(screen.getByText(/il valore a cui tende una funzione/i)).toBeInTheDocument();
  });

  it("ultimo esercizio: il bottone diventa 'Termina' e porta alla schermata finale con il punteggio", async () => {
    const user = userEvent.setup();
    renderQuiz();

    // Esercizio 1/3 (multiple_choice) - corretto
    await user.click(screen.getByRole("button", { name: "4" }));
    await user.click(screen.getByRole("button", { name: /verifica/i }));
    await user.click(screen.getByRole("button", { name: /continua/i }));

    // Esercizio 2/3 (open_answer) - corretto
    await user.type(screen.getByLabelText(/la tua risposta/i), "il valore a cui tende una funzione");
    await user.click(screen.getByRole("button", { name: /verifica/i }));
    await user.click(screen.getByRole("button", { name: /continua/i }));

    // Esercizio 3/3 (multiple_choice) - errato di proposito
    expect(screen.getByText("Quanto fa 3 + 3?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "5" }));
    await user.click(screen.getByRole("button", { name: /verifica/i }));
    const finishButton = screen.getByRole("button", { name: /termina/i });
    await user.click(finishButton);

    expect(screen.getByText("Sessione completata!")).toBeInTheDocument();
    expect(scoreText()).toMatch(/2 risposte corrette su 3/);
  });

  it("Ricomincia riporta alla prima domanda con lo stato pulito", async () => {
    const user = userEvent.setup();
    renderQuiz();

    await user.click(screen.getByRole("button", { name: "4" }));
    await user.click(screen.getByRole("button", { name: /verifica/i }));
    await user.click(screen.getByRole("button", { name: /continua/i }));
    await user.type(screen.getByLabelText(/la tua risposta/i), "il valore a cui tende una funzione");
    await user.click(screen.getByRole("button", { name: /verifica/i }));
    await user.click(screen.getByRole("button", { name: /continua/i }));
    await user.click(screen.getByRole("button", { name: "5" }));
    await user.click(screen.getByRole("button", { name: /verifica/i }));
    await user.click(screen.getByRole("button", { name: /termina/i }));

    await user.click(screen.getByRole("button", { name: /ricomincia/i }));

    expect(screen.getByText("Quanto fa 2 + 2?")).toBeInTheDocument();
    expect(screen.getAllByText("1/3").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "4" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "4" })).toHaveAttribute("aria-pressed", "false");
  });

  it("il pulsante di chiusura nell'header chiama onClose", async () => {
    const user = userEvent.setup();
    const { onClose } = renderQuiz();

    await user.click(screen.getByRole("button", { name: /chiudi esercizi/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("mostra un badge 'Da cache' quando fromCache è true", () => {
    render(<DuolingoQuiz exerciseSet={EXERCISE_SET} fromCache onClose={vi.fn()} />);
    expect(screen.getByText("Da cache")).toBeInTheDocument();
  });

  it("renderizza domande con notazione LaTeX senza errori (integrazione react-markdown + katex)", () => {
    const withMath: ExerciseSet = {
      ...EXERCISE_SET,
      exercises: [
        { ...EXERCISE_SET.exercises[0]!, question: "Quanto vale $x^2$ per $x = 3$?" },
        EXERCISE_SET.exercises[1]!,
        EXERCISE_SET.exercises[2]!,
      ],
    };
    render(<DuolingoQuiz exerciseSet={withMath} onClose={vi.fn()} />);
    expect(screen.getByText(/Quanto vale/)).toBeInTheDocument();
  });
});

describe("DuolingoQuiz - coding_challenge", () => {
  const CODING_EXERCISE = {
    type: "coding_challenge" as const,
    id: "ex-3",
    question: "Scrivi una funzione che somma due numeri.",
    language: "typescript" as const,
    starterCode: "function sum(a, b) {\n  // TODO\n}",
    expectedSolution: "function sum(a, b) {\n  return a + b;\n}",
    evaluationHints: ["Deve gestire anche numeri negativi", "Deve restituire un numero, non una stringa"],
    explanation: "La somma è l'operazione base richiesta.",
    difficulty: 1 as const,
  };

  const EXERCISE_SET_WITH_CODING: ExerciseSet = {
    ...EXERCISE_SET,
    exercises: [EXERCISE_SET.exercises[0]!, EXERCISE_SET.exercises[1]!, CODING_EXERCISE],
  };

  /** Porta il quiz al terzo esercizio (coding_challenge) rispondendo correttamente ai primi due. */
  async function advanceToCodingExercise(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "4" }));
    await user.click(screen.getByRole("button", { name: /verifica/i }));
    await user.click(screen.getByRole("button", { name: /continua/i }));

    await user.type(screen.getByLabelText(/la tua risposta/i), "il valore a cui tende una funzione");
    await user.click(screen.getByRole("button", { name: /verifica/i }));
    await user.click(screen.getByRole("button", { name: /continua/i }));

    return screen.findByLabelText(/editor di codice/i);
  }

  it("mostra lo starterCode precompilato e i criteri di valutazione (evaluationHints)", async () => {
    const user = userEvent.setup();
    render(<DuolingoQuiz exerciseSet={EXERCISE_SET_WITH_CODING} onClose={vi.fn()} />);

    const editor = await advanceToCodingExercise(user);
    expect(editor).toHaveValue(CODING_EXERCISE.starterCode);
    expect(screen.getByText("Criteri")).toBeInTheDocument();
    expect(screen.getByText("Deve gestire anche numeri negativi")).toBeInTheDocument();
  });

  it("il bottone Verifica è disabilitato se il codice è vuoto", async () => {
    const user = userEvent.setup();
    render(<DuolingoQuiz exerciseSet={EXERCISE_SET_WITH_CODING} onClose={vi.fn()} />);

    const editor = await advanceToCodingExercise(user);
    fireEvent.change(editor, { target: { value: "" } });
    expect(screen.getByRole("button", { name: /verifica/i })).toBeDisabled();
  });

  it("non mostra mai la soluzione attesa prima della verifica", async () => {
    const user = userEvent.setup();
    render(<DuolingoQuiz exerciseSet={EXERCISE_SET_WITH_CODING} onClose={vi.fn()} />);

    await advanceToCodingExercise(user);
    expect(screen.queryByText(/return a \+ b/)).not.toBeInTheDocument();
  });

  it("codice diverso dalla soluzione: stato 'Da rivedere', mostra la soluzione di riferimento e blocca ulteriori modifiche", async () => {
    const user = userEvent.setup();
    render(<DuolingoQuiz exerciseSet={EXERCISE_SET_WITH_CODING} onClose={vi.fn()} />);

    const editor = await advanceToCodingExercise(user);
    fireEvent.change(editor, { target: { value: "function sum(a, b) {\n  return a - b;\n}" } });
    await user.click(screen.getByRole("button", { name: /verifica/i }));

    expect(screen.getByText("Da rivedere")).toBeInTheDocument();
    expect(screen.getByText("Soluzione di riferimento")).toBeInTheDocument();
    expect(screen.getByText(/return a \+ b/)).toBeInTheDocument();
    expect(editor).toBeDisabled();
  });

  it("codice identico alla soluzione dopo normalizzazione prudente: 'Coincide con la soluzione di riferimento'", async () => {
    const user = userEvent.setup();
    render(<DuolingoQuiz exerciseSet={EXERCISE_SET_WITH_CODING} onClose={vi.fn()} />);

    const editor = await advanceToCodingExercise(user);
    fireEvent.change(editor, { target: { value: `  ${CODING_EXERCISE.expectedSolution}  ` } });
    await user.click(screen.getByRole("button", { name: /verifica/i }));

    expect(screen.getByText("Coincide con la soluzione di riferimento")).toBeInTheDocument();
    expect(screen.queryByText("Soluzione di riferimento")).not.toBeInTheDocument();
  });

  it("il punteggio finale mostra separatamente gli esercizi di coding con codice che combacia", async () => {
    const user = userEvent.setup();
    render(<DuolingoQuiz exerciseSet={EXERCISE_SET_WITH_CODING} onClose={vi.fn()} />);

    const editor = await advanceToCodingExercise(user);
    fireEvent.change(editor, { target: { value: CODING_EXERCISE.expectedSolution } });
    await user.click(screen.getByRole("button", { name: /verifica/i }));
    await user.click(screen.getByRole("button", { name: /termina/i }));

    expect(screen.getByText("Sessione completata!")).toBeInTheDocument();
    expect(scoreText()).toMatch(/2 risposte corrette su 2/);
    expect(screen.getByText(/1 su 1 esercizi di coding/)).toBeInTheDocument();
  });
});
