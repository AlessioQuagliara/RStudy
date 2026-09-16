/**
 * Interfaccia indipendente dal provider: la UI e il RagService non sanno mai
 * come viene calcolato l'embedding. Per aggiungere un provider alternativo
 * basta implementare questa interfaccia, senza toccare RagService o la UI.
 */
export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

const LOCAL_DIMENSIONS = 256;

/**
 * Unico provider di embedding dell'app: hashing trigram -> bag-of-features
 * normalizzato. Non è semanticamente potente quanto un vero modello, ma non
 * richiede rete né un modello aggiuntivo da scaricare/caricare in memoria, e
 * garantisce che la ricerca RAG funzioni sempre, anche offline.
 */
export class LocalHashEmbeddingProvider implements EmbeddingProvider {
  readonly name = "local-hash";
  readonly dimensions = LOCAL_DIMENSIONS;

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.embedOne(text));
  }

  private embedOne(text: string): number[] {
    const vector = new Array<number>(this.dimensions).fill(0);
    const normalized = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ");
    const tokens = normalized.split(/\s+/).filter(Boolean);

    for (const token of tokens) {
      const bucket = hashString(token) % this.dimensions;
      vector[bucket] = (vector[bucket] ?? 0) + 1;
    }

    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
    return vector.map((v) => v / norm);
  }
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}
