export interface VectorRecord {
  id: string;
  embedding: number[];
  /** Metadati liberi propagati nei risultati di ricerca. */
  metadata: Record<string, unknown>;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  metadata: Record<string, unknown>;
}

/**
 * Interfaccia di storage/ricerca vettoriale. L'implementazione di default usa
 * cosine similarity in TypeScript su embedding persistiti come JSON in SQLite
 * (colonna `document_chunks.embedding`): nessuna dipendenza nativa richiesta.
 * Un backend `sqlite-vec` potrebbe implementare la stessa interfaccia in futuro
 * senza cambiare RagService.
 */
export interface VectorStore {
  search(query: number[], candidates: VectorRecord[], topK: number): VectorSearchResult[];
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class CosineVectorStore implements VectorStore {
  search(query: number[], candidates: VectorRecord[], topK: number): VectorSearchResult[] {
    return candidates
      .map((c) => ({ id: c.id, score: cosineSimilarity(query, c.embedding), metadata: c.metadata }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}
