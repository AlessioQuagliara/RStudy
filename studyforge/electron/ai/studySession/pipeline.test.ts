import { describe, expect, it } from "vitest";
import { runStudySessionPipeline } from "./pipeline";
import { createCallBudget, StudySessionCallBudgetExceededError } from "./callBudget";
import {
  STUDY_SESSION_ANALYZE_SYSTEM_PROMPT,
  STUDY_SESSION_DESIGN_SYSTEM_PROMPT,
  STUDY_SESSION_AUTHOR_SYSTEM_PROMPT,
  STUDY_SESSION_REVIEW_SYSTEM_PROMPT,
} from "./prompts";
import type { CollectedCourseContent } from "./contentCollector";
import type { ChatMessage } from "../chatPrompt";
import type { Course } from "../../shared/schemas";

const COURSE: Course = {
  id: "course-1",
  title: "Analisi 1",
  code: null,
  cfu: 9,
  examDate: null,
  introduction: null,
  objectives: null,
  targetLessons: null,
  status: "active",
  color: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const COLLECTED: CollectedCourseContent = {
  course: COURSE,
  lessons: [
    { lessonId: "l1", lessonNumber: 1, lessonTitle: "Limiti", text: "I limiti descrivono il comportamento di una funzione vicino a un punto." },
    { lessonId: "l2", lessonNumber: 2, lessonTitle: "Derivate", text: "La derivata è il tasso di variazione istantaneo di una funzione." },
  ],
  materialsText: [],
  contentHash: "fakehash",
};

const ANALYZE_JSON = JSON.stringify({
  topics: ["limiti", "derivate"],
  key_concepts: [{ term: "limite", definition: "valore a cui si avvicina una funzione" }],
  difficulty: "medium",
});

const DESIGN_JSON = JSON.stringify({
  book_title: "Analisi 1 — Libro di studio",
  chapters: [{ title: "Fondamenti del calcolo", lesson_numbers: [1, 2] }],
  glossary: [{ term: "limite", definition: "valore a cui si avvicina una funzione" }],
  exam_prep_tips: ["Ripassa la definizione di limite prima dell'esame."],
});

const AUTHOR_JSON = JSON.stringify({ chapter_markdown: "# Fondamenti del calcolo\n\nContenuto del capitolo." });
const REVIEW_JSON = JSON.stringify({ reviewed_markdown: "# Fondamenti del calcolo\n\nContenuto rivisto del capitolo." });

/** Dispatcha la risposta canned in base al system prompt, indipendentemente dal numero esatto di chiamate per fase. */
function fakeClient(overrides: Partial<Record<"analyze" | "design" | "author" | "review", () => string>> = {}) {
  return {
    async chatJSON(messages: ChatMessage[]): Promise<string> {
      const system = messages.find((m) => m.role === "system")?.content ?? "";
      if (system === STUDY_SESSION_ANALYZE_SYSTEM_PROMPT) return (overrides.analyze ?? (() => ANALYZE_JSON))();
      if (system === STUDY_SESSION_DESIGN_SYSTEM_PROMPT) return (overrides.design ?? (() => DESIGN_JSON))();
      if (system === STUDY_SESSION_AUTHOR_SYSTEM_PROMPT) return (overrides.author ?? (() => AUTHOR_JSON))();
      if (system === STUDY_SESSION_REVIEW_SYSTEM_PROMPT) return (overrides.review ?? (() => REVIEW_JSON))();
      throw new Error("system prompt non riconosciuto nel test");
    },
  };
}

describe("runStudySessionPipeline", () => {
  it("produce un libro completo con capitoli, glossario e piano di ripasso", async () => {
    const budget = createCallBudget(40);
    const progressCalls: Array<[string, number]> = [];
    const stepResults: string[] = [];

    const result = await runStudySessionPipeline(fakeClient(), COLLECTED, budget, {
      onProgress: (step, pct) => progressCalls.push([step, pct]),
      onStepDone: (step) => stepResults.push(step),
    });

    expect(result.bookTitle).toBe("Analisi 1 — Libro di studio");
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0]?.markdown).toContain("Contenuto rivisto del capitolo");
    expect(result.glossary).toHaveLength(1);
    expect(result.examPrepTips).toHaveLength(1);
    expect(result.cloudCallsUsed).toBeGreaterThan(0);
    expect(stepResults).toEqual(expect.arrayContaining(["analyze", "design", "author", "review"]));
    expect(progressCalls.length).toBeGreaterThan(0);
  });

  it("un budget troppo basso interrompe la pipeline con StudySessionCallBudgetExceededError, senza andare in loop", async () => {
    const budget = createCallBudget(1); // basta per l'analisi, non per design+autore+revisore
    await expect(
      runStudySessionPipeline(fakeClient(), COLLECTED, budget, { onProgress: () => {}, onStepDone: () => {} }),
    ).rejects.toThrow(StudySessionCallBudgetExceededError);
  });

  it("un JSON non valido al primo tentativo viene corretto dal retry di riparazione (max 2 tentativi)", async () => {
    let analyzeAttempts = 0;
    const budget = createCallBudget(40);
    const client = fakeClient({
      analyze: () => {
        analyzeAttempts++;
        return analyzeAttempts === 1 ? "questo non è json" : ANALYZE_JSON;
      },
    });

    const result = await runStudySessionPipeline(client, COLLECTED, budget, { onProgress: () => {}, onStepDone: () => {} });
    expect(analyzeAttempts).toBe(2);
    expect(result.chapters).toHaveLength(1);
  });
});
