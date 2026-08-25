import { describe, expect, it } from "vitest";
import { computeNextReviewAt } from "./repositories";

describe("computeNextReviewAt (SRS)", () => {
  const from = new Date("2026-01-01T10:00:00.000Z");

  it("easy -> +7 giorni", () => {
    const next = new Date(computeNextReviewAt("easy", from));
    expect(next.getUTCDate()).toBe(8);
    expect(next.getUTCMonth()).toBe(0);
  });

  it("medium -> +3 giorni", () => {
    const next = new Date(computeNextReviewAt("medium", from));
    expect(next.getUTCDate()).toBe(4);
  });

  it("hard -> +1 giorno", () => {
    const next = new Date(computeNextReviewAt("hard", from));
    expect(next.getUTCDate()).toBe(2);
  });

  it("gestisce correttamente il cambio di mese", () => {
    const endOfMonth = new Date("2026-01-30T00:00:00.000Z");
    const next = new Date(computeNextReviewAt("easy", endOfMonth));
    expect(next.getUTCMonth()).toBe(1); // febbraio
    expect(next.getUTCDate()).toBe(6);
  });
});
