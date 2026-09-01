import { describe, expect, it } from "vitest";
import { ipcInputSchemas } from "./ipcContract";

describe("ipcContract: canali studyAi:*", () => {
  it("studyAi:generateExercises è cablato e valida/applica i default come lo schema atteso", () => {
    const schema = ipcInputSchemas["studyAi:generateExercises"];
    const parsed = schema.parse({ lessonId: "lesson-1" });
    expect(parsed).toMatchObject({ lessonId: "lesson-1", requestedCount: 5, locale: "it-IT" });
  });

  it("studyAi:generatePresentation è cablato e valida/applica i default come lo schema atteso", () => {
    const schema = ipcInputSchemas["studyAi:generatePresentation"];
    const parsed = schema.parse({ lessonId: "lesson-1" });
    expect(parsed).toMatchObject({ lessonId: "lesson-1", requestedCount: 8, locale: "it-IT" });
  });

  it("entrambi i canali rifiutano un payload senza lessonId (come farebbe safeHandle prima di chiamare l'handler)", () => {
    expect(() => ipcInputSchemas["studyAi:generateExercises"].parse({})).toThrow();
    expect(() => ipcInputSchemas["studyAi:generatePresentation"].parse({})).toThrow();
  });
});
