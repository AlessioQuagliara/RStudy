import { describe, expect, it } from "vitest";
import { CosineVectorStore } from "./vectorStore";
import { LocalHashEmbeddingProvider } from "./embeddingProvider";

describe("CosineVectorStore", () => {
  it("classifica il vettore identico come il più simile", () => {
    const store = new CosineVectorStore();
    const results = store.search(
      [1, 0, 0],
      [
        { id: "a", embedding: [1, 0, 0], metadata: {} },
        { id: "b", embedding: [0, 1, 0], metadata: {} },
        { id: "c", embedding: [0.9, 0.1, 0], metadata: {} },
      ],
      3,
    );
    expect(results[0]!.id).toBe("a");
    expect(results[0]!.score).toBeCloseTo(1, 5);
  });

  it("rispetta topK", () => {
    const store = new CosineVectorStore();
    const results = store.search(
      [1, 0],
      [
        { id: "a", embedding: [1, 0], metadata: {} },
        { id: "b", embedding: [0.5, 0.5], metadata: {} },
        { id: "c", embedding: [0, 1], metadata: {} },
      ],
      2,
    );
    expect(results).toHaveLength(2);
  });
});

describe("LocalHashEmbeddingProvider (adapter RAG offline)", () => {
  it("produce vettori normalizzati (norma ~1)", async () => {
    const provider = new LocalHashEmbeddingProvider();
    const [vector] = await provider.embed(["algoritmi e strutture dati"]);
    const norm = Math.sqrt(vector!.reduce((sum, v) => sum + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("testi identici producono lo stesso embedding", async () => {
    const provider = new LocalHashEmbeddingProvider();
    const [a] = await provider.embed(["complessità computazionale"]);
    const [b] = await provider.embed(["complessità computazionale"]);
    expect(a).toEqual(b);
  });

  it("testi diversi producono similarità inferiore a 1", async () => {
    const provider = new LocalHashEmbeddingProvider();
    const store = new CosineVectorStore();
    const [a] = await provider.embed(["algoritmi di ordinamento"]);
    const [b] = await provider.embed(["ricette di cucina italiana"]);
    const [result] = store.search(a!, [{ id: "b", embedding: b!, metadata: {} }], 1);
    expect(result!.score).toBeLessThan(1);
  });
});
