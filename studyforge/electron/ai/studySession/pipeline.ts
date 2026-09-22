import type { z } from "zod";
import type { ChatJsonClient } from "../openAiCompatibleStudyGenerator";
import { parseModelJson } from "../schemas";
import { chunkText } from "../../rag/chunker";
import type { CollectedCourseContent } from "./contentCollector";
import { createCallBudget } from "./callBudget";
import {
  STUDY_SESSION_ANALYZE_SYSTEM_PROMPT,
  buildAnalyzeUserPrompt,
  STUDY_SESSION_DESIGN_SYSTEM_PROMPT,
  buildDesignUserPrompt,
  STUDY_SESSION_AUTHOR_SYSTEM_PROMPT,
  buildAuthorUserPrompt,
  STUDY_SESSION_REVIEW_SYSTEM_PROMPT,
  buildReviewUserPrompt,
} from "./prompts";
import {
  analyzeBlockResponseSchema,
  type AnalyzeBlockResponse,
  designResponseSchema,
  authorResponseSchema,
  reviewResponseSchema,
} from "./schemas";

export type StudySessionStep = "collect" | "analyze" | "design" | "author" | "review" | "render";

export interface StudySessionChapterResult {
  title: string;
  markdown: string;
}

export interface StudySessionPipelineResult {
  bookTitle: string;
  chapters: StudySessionChapterResult[];
  glossary: Array<{ term: string; definition: string }>;
  examPrepTips: string[];
  cloudCallsUsed: number;
}

export interface PipelineHooks {
  onProgress(step: StudySessionStep, percentage: number): void;
  onStepDone(step: StudySessionStep, stepIndex: number, outputJson: string): void;
}

const MAX_ATTEMPTS = 2;

/**
 * Chiama il provider e valida la risposta come JSON conforme allo schema,
 * con UN retry di riparazione se il fallimento è "di contenuto" (JSON non
 * valido/non conforme) — stesso pattern di
 * electron/ai/openAiCompatibleStudyGenerator.ts. Un errore infrastrutturale
 * (rete, timeout, budget esaurito, limite giornaliero) propaga SUBITO senza
 * retry: non è un problema che un secondo tentativo possa risolvere.
 */
async function callJsonPhase<T>(
  client: ChatJsonClient,
  budget: ReturnType<typeof createCallBudget>,
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodType<T>,
): Promise<T> {
  let lastError: unknown;
  let lastRaw: string | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    budget.reserve();
    const messages =
      attempt === 1 || lastRaw === null
        ? [
            { role: "system" as const, content: systemPrompt },
            { role: "user" as const, content: userPrompt },
          ]
        : [
            { role: "system" as const, content: systemPrompt },
            { role: "user" as const, content: userPrompt },
            { role: "user" as const, content: buildRepairPrompt(lastRaw, lastError) },
          ];

    const raw = await client.chatJSON(messages, schema);
    try {
      return parseModelJson(raw, schema);
    } catch (error) {
      lastError = error;
      lastRaw = raw;
      if (attempt >= MAX_ATTEMPTS) throw error;
    }
  }
  // Irraggiungibile (il loop sopra ritorna o lancia), solo per soddisfare TS.
  throw lastError;
}

function buildRepairPrompt(previousRaw: string, error: unknown): string {
  const message = error instanceof Error ? error.message : "Risposta non valida.";
  return `La tua risposta precedente non è stata accettata per questo motivo:\n${message}\n\nEcco la tua risposta precedente:\n${previousRaw}\n\nCorreggi ESCLUSIVAMENTE il problema indicato, mantenendo invariato il resto del contenuto. Rispondi di nuovo con l'intero oggetto JSON corretto, senza testo prima o dopo.`;
}

/** Blocchi di contenuto per l'agente di analisi: target più ampio di quello usato per il RAG (electron/rag/chunker.ts), perché qui il modello riceve tutto il blocco in un colpo solo per estrarne una mappa concettuale, non deve "cercare" un passaggio specifico. */
function buildAnalysisBlocks(collected: CollectedCourseContent): string[] {
  const combined = collected.lessons
    .map((l) => `[Lezione ${l.lessonNumber}: ${l.lessonTitle}]\n${l.text}`)
    .join("\n\n");
  return chunkText(combined, { targetChars: 6000, overlapChars: 0 }).map((c) => c.content);
}

export async function runStudySessionPipeline(
  client: ChatJsonClient,
  collected: CollectedCourseContent,
  budget: ReturnType<typeof createCallBudget>,
  hooks: PipelineHooks,
): Promise<StudySessionPipelineResult> {
  // --- Fase: analisi didattica (per blocco) ---
  const blocks = buildAnalysisBlocks(collected);
  const analyses: AnalyzeBlockResponse[] = [];
  for (let i = 0; i < blocks.length; i++) {
    hooks.onProgress("analyze", 5 + Math.round((i / blocks.length) * 25));
    const result = await callJsonPhase(
      client,
      budget,
      STUDY_SESSION_ANALYZE_SYSTEM_PROMPT,
      buildAnalyzeUserPrompt({ courseTitle: collected.course.title, blockLabel: `${i + 1}/${blocks.length}`, blockText: blocks[i]! }),
      analyzeBlockResponseSchema,
    );
    analyses.push(result);
    hooks.onStepDone("analyze", i, JSON.stringify(result));
  }

  // --- Fase: progettazione editoriale ---
  hooks.onProgress("design", 35);
  const lessonNumbers = collected.lessons.map((l) => l.lessonNumber);
  const design = await callJsonPhase(
    client,
    budget,
    STUDY_SESSION_DESIGN_SYSTEM_PROMPT,
    buildDesignUserPrompt({ courseTitle: collected.course.title, lessonNumbers, analyses }),
    designResponseSchema,
  );
  hooks.onStepDone("design", 0, JSON.stringify(design));

  const globalKeyConcepts = dedupeConcepts(analyses.flatMap((a) => a.key_concepts));
  const chapterTitles = design.chapters.map((c) => c.title);

  // --- Fasi: autore + revisore (per capitolo) ---
  const chapters: StudySessionChapterResult[] = [];
  for (let i = 0; i < design.chapters.length; i++) {
    const chapter = design.chapters[i]!;
    const progressBase = 40 + Math.round((i / design.chapters.length) * 55);
    hooks.onProgress("author", progressBase);

    const lessonTexts = collected.lessons
      .filter((l) => chapter.lesson_numbers.includes(l.lessonNumber))
      .map((l) => ({ lessonNumber: l.lessonNumber, lessonTitle: l.lessonTitle, text: l.text }));

    const authored = await callJsonPhase(
      client,
      budget,
      STUDY_SESSION_AUTHOR_SYSTEM_PROMPT,
      buildAuthorUserPrompt({
        courseTitle: collected.course.title,
        chapterTitle: chapter.title,
        otherChapterTitles: chapterTitles.filter((t) => t !== chapter.title),
        lessonTexts,
        keyConcepts: globalKeyConcepts,
      }),
      authorResponseSchema,
    );
    hooks.onStepDone("author", i, JSON.stringify(authored));

    hooks.onProgress("review", progressBase + Math.round((0.5 / design.chapters.length) * 55));
    const reviewed = await callJsonPhase(
      client,
      budget,
      STUDY_SESSION_REVIEW_SYSTEM_PROMPT,
      buildReviewUserPrompt({ chapterTitle: chapter.title, chapterMarkdown: authored.chapter_markdown }),
      reviewResponseSchema,
    );
    hooks.onStepDone("review", i, JSON.stringify(reviewed));

    chapters.push({ title: chapter.title, markdown: reviewed.reviewed_markdown });
  }

  hooks.onProgress("render", 96);

  return {
    bookTitle: design.book_title,
    chapters,
    glossary: design.glossary,
    examPrepTips: design.exam_prep_tips,
    cloudCallsUsed: budget.used,
  };
}

function dedupeConcepts(
  concepts: Array<{ term: string; definition: string }>,
): Array<{ term: string; definition: string }> {
  const seen = new Map<string, { term: string; definition: string }>();
  for (const c of concepts) {
    const key = c.term.trim().toLowerCase();
    if (key && !seen.has(key)) seen.set(key, c);
  }
  return [...seen.values()];
}
