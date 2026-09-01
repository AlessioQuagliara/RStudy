import type {
  GenerateExerciseSetInput,
  GeneratePresentationInput,
  ExerciseSetGenerationResult,
  PresentationGenerationResult,
} from "../shared/schemas";

/**
 * Confine sostituibile verso il provider AI: l'orchestrazione (electron/ai/exerciseSet.ts,
 * electron/ai/presentation.ts) chiama solo questa interfaccia, mai un client HTTP
 * specifico. Un nuovo provider OpenAI-compatible (o non) si collega implementandola,
 * senza toccare cache, orchestrazione o renderer.
 * Entrambi i metodi restituiscono sempre un risultato "safe": non lanciano mai
 * per un errore del provider/di validazione, lo esprimono come
 * `{ status: "error", error: {...} }` già validato Zod (vedi electron/shared/schemas.ts).
 */
export interface AiStudyGenerator {
  generateExerciseSet(input: GenerateExerciseSetInput): Promise<ExerciseSetGenerationResult>;
  generatePresentation(input: GeneratePresentationInput): Promise<PresentationGenerationResult>;
}
