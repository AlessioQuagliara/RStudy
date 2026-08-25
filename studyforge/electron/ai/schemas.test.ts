import { describe, expect, it } from "vitest";
import { lessonStudyPackSchema, parseModelJson } from "./schemas";

const VALID_PACK = {
  summary_markdown: "Riepilogo di prova.",
  key_points: [{ title: "Punto 1", explanation: "Spiegazione" }],
  study_outline: [{ topic: "Argomento", subtopics: ["Sotto 1"] }],
  mermaid_diagram: "flowchart TD\nA-->B",
  flashcards: Array.from({ length: 8 }, (_, i) => ({
    front: `Domanda ${i}`,
    back: `Risposta ${i}`,
    tags: [],
    difficulty: "easy" as const,
  })),
  self_check_questions: [{ question: "Domanda?", answer: "Risposta." }],
};

describe("parseModelJson + lessonStudyPackSchema", () => {
  it("valida un JSON conforme", () => {
    const result = parseModelJson(JSON.stringify(VALID_PACK), lessonStudyPackSchema);
    expect(result.flashcards).toHaveLength(8);
  });

  it("ripulisce blocchi markdown attorno al JSON", () => {
    const wrapped = "```json\n" + JSON.stringify(VALID_PACK) + "\n```";
    const result = parseModelJson(wrapped, lessonStudyPackSchema);
    expect(result.summary_markdown).toBe(VALID_PACK.summary_markdown);
  });

  it("rifiuta JSON non valido", () => {
    expect(() => parseModelJson("non è json", lessonStudyPackSchema)).toThrow();
  });

  it("rifiuta un array di flashcard vuoto", () => {
    const invalid = { ...VALID_PACK, flashcards: [] };
    expect(() => parseModelJson(JSON.stringify(invalid), lessonStudyPackSchema)).toThrow();
  });

  it("accetta un numero ridotto di flashcard quando gli appunti sono scarni (nessun minimo di 8 imposto dallo schema)", () => {
    const sparse = { ...VALID_PACK, flashcards: VALID_PACK.flashcards.slice(0, 2) };
    const result = parseModelJson(JSON.stringify(sparse), lessonStudyPackSchema);
    expect(result.flashcards).toHaveLength(2);
  });

  it("rifiuta un difficulty non ammesso", () => {
    const invalid = {
      ...VALID_PACK,
      flashcards: [{ front: "a", back: "b", tags: [], difficulty: "impossible" }],
    };
    expect(() => parseModelJson(JSON.stringify(invalid), lessonStudyPackSchema)).toThrow();
  });
});
