import { z } from "zod";

export const analyzeBlockResponseSchema = z.object({
  topics: z.array(z.string()),
  key_concepts: z.array(z.object({ term: z.string(), definition: z.string() })),
  difficulty: z.enum(["easy", "medium", "hard"]),
});
export type AnalyzeBlockResponse = z.infer<typeof analyzeBlockResponseSchema>;

export const designResponseSchema = z.object({
  book_title: z.string().min(1),
  chapters: z
    .array(z.object({ title: z.string().min(1), lesson_numbers: z.array(z.number().int()).min(1) }))
    .min(1)
    .max(30),
  glossary: z.array(z.object({ term: z.string(), definition: z.string() })),
  exam_prep_tips: z.array(z.string()),
});
export type DesignResponse = z.infer<typeof designResponseSchema>;

export const authorResponseSchema = z.object({
  chapter_markdown: z.string().min(1),
});
export type AuthorResponse = z.infer<typeof authorResponseSchema>;

export const reviewResponseSchema = z.object({
  reviewed_markdown: z.string().min(1),
});
export type ReviewResponse = z.infer<typeof reviewResponseSchema>;
