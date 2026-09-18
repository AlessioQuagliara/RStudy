import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

/**
 * Interfaccia comune a LocalAiClient (node-llama-cpp) e CloudAiClient
 * (endpoint chat-completions OpenAI-compatible, electron/ai/cloudAiClient.ts):
 * unica fonte di verità per il "confine" verso l'inferenza AI, così
 * RagService/OpenAiCompatibleStudyGenerator/i test possono dipendere da
 * questa interfaccia invece che da una classe concreta specifica.
 */
export interface AiChatClient {
  testConnection(): Promise<{ ok: boolean; message: string }>;
  chatJSON(messages: ChatMessage[], schema?: z.ZodTypeAny): Promise<string>;
  chatText(messages: ChatMessage[]): Promise<string>;
  answerWithContext(input: { question: string; context: string }): Promise<string>;
}

/**
 * Entrambi i client sono "single-turn" verso il provider: non mantengono
 * cronologia assistant/user multi-turno (LocalAiClient apre una nuova
 * LlamaChatSession ad ogni chiamata, senza stato pregresso). Per questo i
 * messaggi vengono appiattiti in un solo prompt di sistema e un solo prompt
 * utente prima di essere inviati, invece di passare l'array `messages`
 * grezzo al provider: più semplice, e garantisce lo stesso comportamento su
 * entrambi i client quando electron/ai/openAiCompatibleStudyGenerator.ts
 * aggiunge un messaggio "user" extra per il retry di riparazione (vedi
 * buildRepairPrompt lì).
 */
export function flattenSystemPrompt(messages: ChatMessage[]): string {
  return messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
}

export function flattenUserPrompt(messages: ChatMessage[], schema?: z.ZodTypeAny): string {
  const userContent = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n\n");
  if (!schema) return userContent;

  const jsonSchema = zodToJsonSchema(schema);
  return `${userContent}\n\nRispondi ESCLUSIVAMENTE con un JSON conforme a questo JSON Schema (nessun testo fuori dal JSON):\n${JSON.stringify(jsonSchema)}`;
}
