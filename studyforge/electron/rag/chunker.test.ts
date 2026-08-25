import { describe, expect, it } from "vitest";
import { chunkText } from "./chunker";

describe("chunkText", () => {
  it("restituisce un array vuoto per testo vuoto", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("mantiene un solo chunk se il testo è più corto del target", () => {
    const chunks = chunkText("Paragrafo breve di appunti.", { targetChars: 1000, overlapChars: 100 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.content).toContain("Paragrafo breve");
  });

  it("suddivide un testo lungo in più chunk con overlap non vuoto", () => {
    const paragraph = "Frase di esempio ripetuta per riempire il paragrafo. ".repeat(50);
    const longText = Array.from({ length: 5 }, (_, i) => `${paragraph} (paragrafo ${i})`).join("\n\n");

    const chunks = chunkText(longText, { targetChars: 400, overlapChars: 80 });

    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]!.content.length).toBeGreaterThan(0);
    }
    expect(chunks.every((c) => c.content.length > 0)).toBe(true);
  });

  it("spezza un singolo paragrafo troppo lungo con overlap tra i pezzi", () => {
    const hugeParagraph = "x".repeat(5000);
    const chunks = chunkText(hugeParagraph, { targetChars: 1000, overlapChars: 100 });

    expect(chunks.length).toBeGreaterThanOrEqual(5);
    // Verifica che ci sia sovrapposizione: la fine di un chunk anticipa l'inizio del successivo.
    const first = chunks[0]!.content;
    const second = chunks[1]!.content;
    expect(second.startsWith(first.slice(-50))).toBe(true);
  });

  it("assegna chunkIndex progressivi", () => {
    const chunks = chunkText("a".repeat(3000), { targetChars: 500, overlapChars: 50 });
    chunks.forEach((c, i) => expect(c.chunkIndex).toBe(i));
  });
});
