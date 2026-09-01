import { describe, expect, it } from "vitest";
import { evaluateCodingChallengeByTextComparison, normalizeCodeForComparison } from "./codingEvaluation";
import type { CodingChallengeExercise } from "@shared/schemas";

const EXERCISE: CodingChallengeExercise = {
  type: "coding_challenge",
  id: "cc-1",
  question: "Scrivi una funzione che somma due numeri.",
  language: "typescript",
  starterCode: "function sum(a: number, b: number) {\n  // TODO\n}",
  expectedSolution: "function sum(a: number, b: number) {\n  return a + b;\n}",
  evaluationHints: ["Deve gestire numeri negativi"],
  explanation: "La somma è l'operazione base richiesta.",
  difficulty: 1,
};

describe("normalizeCodeForComparison", () => {
  it("uniforma i fine riga CRLF a LF", () => {
    expect(normalizeCodeForComparison("a\r\nb\r\n")).toBe("a\nb");
  });

  it("fa il trim di spazi/newline iniziali e finali", () => {
    expect(normalizeCodeForComparison("\n\n  codice  \n\n")).toBe("codice");
  });

  it("NON collassa spazi interni né tocca l'indentazione (normalizzazione prudente)", () => {
    const a = "function f() {\n  return 1;\n}";
    const b = "function f() {\n    return 1;\n}"; // indentazione diversa
    expect(normalizeCodeForComparison(a)).not.toBe(normalizeCodeForComparison(b));
  });

  it("è case-sensitive", () => {
    expect(normalizeCodeForComparison("Return")).not.toBe(normalizeCodeForComparison("return"));
  });
});

describe("evaluateCodingChallengeByTextComparison", () => {
  it("codice vuoto -> not_verified, non chiama mai 'sbagliato'", () => {
    const result = evaluateCodingChallengeByTextComparison("", EXERCISE);
    expect(result.status).toBe("not_verified");
  });

  it("codice vuoto/di soli spazi -> not_verified", () => {
    expect(evaluateCodingChallengeByTextComparison("   \n  ", EXERCISE).status).toBe("not_verified");
  });

  it("codice identico alla soluzione -> matches_reference", () => {
    const result = evaluateCodingChallengeByTextComparison(EXERCISE.expectedSolution, EXERCISE);
    expect(result.status).toBe("matches_reference");
  });

  it("codice identico dopo normalizzazione prudente (CRLF, spazi/newline di contorno) -> matches_reference", () => {
    const messy = "\r\n" + EXERCISE.expectedSolution.replace(/\n/g, "\r\n") + "\r\n\r\n  ";
    expect(evaluateCodingChallengeByTextComparison(messy, EXERCISE).status).toBe("matches_reference");
  });

  it("codice diverso -> needs_review, MAI un giudizio definitivo di errore", () => {
    const result = evaluateCodingChallengeByTextComparison(
      "function sum(a: number, b: number) {\n  return b + a;\n}",
      EXERCISE,
    );
    expect(result.status).toBe("needs_review");
    expect(result.status).not.toBe("wrong" as unknown as typeof result.status);
    // Il messaggio può nominare "sbagliato" solo per escluderlo esplicitamente
    // (negazione), mai per affermarlo come giudizio.
    expect(result.message.toLowerCase()).toMatch(/non significa che (sia|è) sbagliato/);
  });

  it("una differenza di sola indentazione produce needs_review (confronto prudente, non collassa la formattazione)", () => {
    const reindented = "function sum(a: number, b: number) {\n    return a + b;\n}";
    expect(evaluateCodingChallengeByTextComparison(reindented, EXERCISE).status).toBe("needs_review");
  });
});
