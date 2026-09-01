import { describe, expect, it } from "vitest";
import { isOpenAnswerCorrect, normalizeAnswerText } from "./answerMatching";

describe("normalizeAnswerText", () => {
  it("fa il trim degli spazi iniziali/finali", () => {
    expect(normalizeAnswerText("  ciao  ")).toBe("ciao");
  });

  it("collassa spazi/tab ripetuti in uno solo", () => {
    expect(normalizeAnswerText("un   puntatore\t\tin C")).toBe("un puntatore in c");
  });

  it("è case-insensitive, accenti italiani inclusi", () => {
    expect(normalizeAnswerText("PERCHÉ")).toBe("perché");
  });
});

describe("isOpenAnswerCorrect", () => {
  const acceptedAnswers = ["Una variabile che contiene un indirizzo di memoria", "un indirizzo di memoria"];

  it("riconosce una corrispondenza esatta", () => {
    expect(isOpenAnswerCorrect("un indirizzo di memoria", acceptedAnswers)).toBe(true);
  });

  it("ignora maiuscole/minuscole e spazi ripetuti/di contorno", () => {
    expect(isOpenAnswerCorrect("  UN   INDIRIZZO   di MEMORIA  ", acceptedAnswers)).toBe(true);
  });

  it("rifiuta una risposta non presente tra quelle accettate", () => {
    expect(isOpenAnswerCorrect("un numero qualsiasi", acceptedAnswers)).toBe(false);
  });

  it("non dichiara mai corretta una risposta vuota o di soli spazi", () => {
    expect(isOpenAnswerCorrect("", acceptedAnswers)).toBe(false);
    expect(isOpenAnswerCorrect("   ", acceptedAnswers)).toBe(false);
  });

  it("non dichiara corretta una risposta semanticamente giusta ma testualmente diversa (limite noto: confronto testuale, non semantico)", () => {
    expect(isOpenAnswerCorrect("è un indirizzo in memoria dove sta un valore", acceptedAnswers)).toBe(false);
  });
});
