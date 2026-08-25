import type { Db } from "../db/client";
import { DocumentChunksRepo, LessonsRepo } from "../db/repositories";
import { CosineVectorStore, type VectorRecord } from "./vectorStore";
import type { EmbeddingProvider } from "./embeddingProvider";
import type { RagQueryResult } from "../shared/schemas";
import { DeepSeekClient } from "../ai/deepseekClient";

const TOP_K = 6;
const LESSON_PRIORITY_BOOST = 0.08;

export interface RagServiceDeps {
  db: Db;
  embeddingProvider: EmbeddingProvider;
  deepSeekClient: DeepSeekClient | null;
}

/**
 * Servizio RAG indipendente dalla UI: recupera i chunk più rilevanti per una
 * domanda, limitandoli al corso corrente (con boost per la lezione attiva),
 * e chiede al modello una risposta in italiano con citazioni verificabili.
 * Se il contesto recuperato è vuoto o poco pertinente, non inventa fonti.
 */
export class RagService {
  private readonly vectorStore = new CosineVectorStore();

  constructor(private readonly deps: RagServiceDeps) {}

  async query(courseId: string, question: string, activeLessonId?: string | null): Promise<RagQueryResult> {
    const chunks = DocumentChunksRepo.listByCourse(this.deps.db, courseId);
    const withEmbedding = chunks.filter((c) => c.embedding);

    if (withEmbedding.length === 0) {
      return {
        answer:
          "Il materiale caricato per questo corso non contiene ancora informazioni indicizzate. Importa materiali o salva una lezione per poter rispondere.",
        citations: [],
        insufficientContext: true,
      };
    }

    const [queryEmbedding] = await this.deps.embeddingProvider.embed([question]);
    if (!queryEmbedding) {
      return {
        answer: "Impossibile calcolare l'embedding della domanda.",
        citations: [],
        insufficientContext: true,
      };
    }

    const records: VectorRecord[] = withEmbedding.map((c) => ({
      id: c.id,
      embedding: JSON.parse(c.embedding as string) as number[],
      metadata: {
        content: c.content,
        sourceLabel: c.sourceLabel,
        lessonId: c.lessonId,
        materialId: c.materialId,
      },
    }));

    let results = this.vectorStore.search(queryEmbedding, records, TOP_K * 2);
    if (activeLessonId) {
      results = results
        .map((r) => ({
          ...r,
          score: r.metadata.lessonId === activeLessonId ? r.score + LESSON_PRIORITY_BOOST : r.score,
        }))
        .sort((a, b) => b.score - a.score);
    }
    results = results.slice(0, TOP_K).filter((r) => r.score > 0.05);

    if (results.length === 0) {
      return {
        answer:
          "Il materiale caricato non contiene informazioni sufficienti per rispondere a questa domanda.",
        citations: [],
        insufficientContext: true,
      };
    }

    const citations = results.map((r) => ({
      sourceLabel: String(r.metadata.sourceLabel),
      excerpt: String(r.metadata.content).slice(0, 400),
      materialId: (r.metadata.materialId as string | null) ?? null,
      lessonId: (r.metadata.lessonId as string | null) ?? null,
    }));

    if (!this.deps.deepSeekClient) {
      return {
        answer:
          "Ho trovato passaggi rilevanti nel materiale del corso, ma la chiave API DeepSeek non è configurata: consulta le fonti qui sotto.",
        citations,
        insufficientContext: false,
      };
    }

    const context = results
      .map((r, i) => `[Fonte ${i + 1}: ${String(r.metadata.sourceLabel)}]\n${String(r.metadata.content)}`)
      .join("\n\n---\n\n");

    const answer = await this.deps.deepSeekClient.answerWithContext({ question, context });

    return { answer, citations, insufficientContext: false };
  }

  async indexMaterial(courseId: string, lessonId: string | null, materialId: string, sourceLabel: string, chunks: string[]) {
    if (chunks.length === 0) return;
    const embeddings = await this.deps.embeddingProvider.embed(chunks);
    DocumentChunksRepo.insertMany(
      this.deps.db,
      chunks.map((content, i) => ({
        courseId,
        lessonId,
        materialId,
        content,
        sourceLabel,
        chunkIndex: i,
        embedding: JSON.stringify(embeddings[i] ?? []),
      })),
    );
  }

  async indexLessonNotes(courseId: string, lessonId: string, plainText: string) {
    if (!plainText.trim()) return;
    const lesson = LessonsRepo.get(this.deps.db, lessonId);
    const label = lesson ? `Appunti — Lezione ${lesson.lessonNumber}: ${lesson.title}` : "Appunti lezione";
    // Rimuove chunk precedenti di questa lezione derivati dagli appunti (materialId null).
    const existing = DocumentChunksRepo.listByCourse(this.deps.db, courseId).filter(
      (c) => c.lessonId === lessonId && c.materialId === null,
    );
    if (existing.length > 0) {
      const { getDb } = await import("../db/client");
      const db = getDb();
      const { documentChunks } = await import("../db/schema");
      const { inArray } = await import("drizzle-orm");
      db.delete(documentChunks)
        .where(inArray(documentChunks.id, existing.map((e) => e.id)))
        .run();
    }
    const { chunkText } = await import("./chunker");
    const chunks = chunkText(plainText).map((c) => c.content);
    if (chunks.length === 0) return;
    const embeddings = await this.deps.embeddingProvider.embed(chunks);
    DocumentChunksRepo.insertMany(
      this.deps.db,
      chunks.map((content, i) => ({
        courseId,
        lessonId,
        materialId: null,
        content,
        sourceLabel: label,
        chunkIndex: i,
        embedding: JSON.stringify(embeddings[i] ?? []),
      })),
    );
  }
}

export function resolveMaterialSourceLabel(materialTitle: string, lessonId: string | null, db: Db): string {
  if (!lessonId) return materialTitle;
  const lesson = LessonsRepo.get(db, lessonId);
  return lesson ? `${materialTitle} (Lezione ${lesson.lessonNumber}: ${lesson.title})` : materialTitle;
}
