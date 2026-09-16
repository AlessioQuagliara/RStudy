import { describe, expect, it } from "vitest";
import {
  OpenAiCompatibleStudyGenerator,
  type ChatJsonClient,
} from "./openAiCompatibleStudyGenerator";
import type { GenerateExerciseSetInput, GeneratePresentationInput } from "../shared/schemas";

const EXERCISE_INPUT: GenerateExerciseSetInput = {
  lessonId: "lesson-1",
  sourceText: "I puntatori in C memorizzano indirizzi di memoria, non valori diretti.",
  requestedCount: 3,
  locale: "it-IT",
};

const PRESENTATION_INPUT: GeneratePresentationInput = {
  lessonId: "lesson-1",
  sourceText: "I puntatori in C memorizzano indirizzi di memoria, non valori diretti.",
  requestedCount: 3,
  locale: "it-IT",
};

const VALID_EXERCISE_SET_JSON = JSON.stringify({
  title: "Esercizi sui puntatori",
  exercises: [
    {
      type: "multiple_choice",
      id: "es-1",
      question: "Cosa memorizza un puntatore in C?",
      options: ["Un indirizzo di memoria", "Un valore float", "Una stringa", "Un booleano"],
      correctAnswer: "Un indirizzo di memoria",
      explanation: "Per definizione un puntatore contiene un indirizzo, non il valore stesso.",
      difficulty: 1,
    },
    {
      type: "open_answer",
      id: "es-2",
      question: "A cosa serve l'operatore & applicato a una variabile?",
      acceptedAnswers: ["Restituisce l'indirizzo di memoria della variabile"],
      explanation: "L'operatore & (address-of) restituisce l'indirizzo della variabile.",
      difficulty: 2,
    },
    {
      type: "coding_challenge",
      id: "es-3",
      question: "Scrivi una funzione swap che scambia due interi tramite puntatori.",
      language: "c",
      starterCode: "void swap(int *a, int *b) {\n  // TODO\n}",
      expectedSolution: "void swap(int *a, int *b) {\n  int t = *a;\n  *a = *b;\n  *b = t;\n}",
      explanation: "Serve dereferenziare i puntatori per scambiare i valori puntati.",
      difficulty: 3,
    },
  ],
});

const VALID_PRESENTATION_JSON = JSON.stringify({
  title: "Ripasso: puntatori in C",
  slides: [
    { id: "s-1", type: "title", title: "Puntatori in C", bullets: [] },
    {
      id: "s-2",
      type: "content",
      title: "Cosa sono",
      bullets: ["Contengono un indirizzo di memoria", "Si dichiarano con *"],
    },
    {
      id: "s-3",
      type: "summary",
      title: "Riepilogo",
      bullets: ["Un puntatore è un indirizzo, non un valore"],
    },
  ],
});

class FakeChatJsonClient implements ChatJsonClient {
  constructor(private readonly impl: () => Promise<string>) {}
  chatJSON(): Promise<string> {
    return this.impl();
  }
}

function abortError(): Error {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

describe("OpenAiCompatibleStudyGenerator.generateExerciseSet", () => {
  it("successo: JSON valido dal provider produce un ExerciseSet completo e validato", async () => {
    const client = new FakeChatJsonClient(async () => VALID_EXERCISE_SET_JSON);
    const generator = new OpenAiCompatibleStudyGenerator(client, "fake-model");

    const result = await generator.generateExerciseSet(EXERCISE_INPUT);

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.data.exercises).toHaveLength(3);
      expect(result.data.sourceLessonId).toBe("lesson-1");
      expect(result.data.version).toBe(1);
      expect(typeof result.data.generatedAt).toBe("string");
    }
  });

  it("JSON non parsabile dal provider -> errore invalid_response, mai un crash", async () => {
    const client = new FakeChatJsonClient(async () => "questo non è json");
    const generator = new OpenAiCompatibleStudyGenerator(client, "fake-model");

    const result = await generator.generateExerciseSet(EXERCISE_INPUT);

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.code).toBe("invalid_response");
      expect(result.error.message).not.toMatch(/questo non è json/);
    }
  });

  it("JSON sintatticamente valido ma non conforme allo schema -> errore invalid_response", async () => {
    const client = new FakeChatJsonClient(async () =>
      JSON.stringify({ title: "x", exercises: [] }),
    );
    const generator = new OpenAiCompatibleStudyGenerator(client, "fake-model");

    const result = await generator.generateExerciseSet(EXERCISE_INPUT);

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.code).toBe("invalid_response");
    }
  });

  it("timeout/abort del client -> errore timeout", async () => {
    const client = new FakeChatJsonClient(() => Promise.reject(abortError()));
    const generator = new OpenAiCompatibleStudyGenerator(client, "fake-model");

    const result = await generator.generateExerciseSet(EXERCISE_INPUT);

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.code).toBe("timeout");
    }
  });

  it("motore di inferenza locale non disponibile -> errore provider_error", async () => {
    const client = new FakeChatJsonClient(() =>
      Promise.reject(new Error("Contesto del modello AI locale non disponibile.")),
    );
    const generator = new OpenAiCompatibleStudyGenerator(client, "fake-model");

    const result = await generator.generateExerciseSet(EXERCISE_INPUT);

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.code).toBe("provider_error");
    }
  });

  it("errore di classe nota del motore locale (es. memoria insufficiente) -> errore provider_error", async () => {
    class InsufficientMemoryError extends Error {}
    const client = new FakeChatJsonClient(() =>
      Promise.reject(new InsufficientMemoryError("not enough memory to load the model")),
    );
    const generator = new OpenAiCompatibleStudyGenerator(client, "fake-model");

    const result = await generator.generateExerciseSet(EXERCISE_INPUT);

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.code).toBe("provider_error");
    }
  });

  it("errore non classificato -> errore unknown, mai propagato come eccezione", async () => {
    const client = new FakeChatJsonClient(() => Promise.reject(new Error("qualcosa di inatteso")));
    const generator = new OpenAiCompatibleStudyGenerator(client, "fake-model");

    await expect(generator.generateExerciseSet(EXERCISE_INPUT)).resolves.toMatchObject({
      status: "error",
      error: { code: "unknown" },
    });
  });
});

describe("OpenAiCompatibleStudyGenerator.generatePresentation", () => {
  it("successo: JSON valido dal provider produce una Presentation completa e validata", async () => {
    const client = new FakeChatJsonClient(async () => VALID_PRESENTATION_JSON);
    const generator = new OpenAiCompatibleStudyGenerator(client, "fake-model");

    const result = await generator.generatePresentation(PRESENTATION_INPUT);

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.data.slides).toHaveLength(3);
      expect(result.data.sourceLessonId).toBe("lesson-1");
    }
  });

  it("JSON non valido -> errore invalid_response", async () => {
    const client = new FakeChatJsonClient(async () => "{ non json");
    const generator = new OpenAiCompatibleStudyGenerator(client, "fake-model");

    const result = await generator.generatePresentation(PRESENTATION_INPUT);

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.code).toBe("invalid_response");
    }
  });
});
