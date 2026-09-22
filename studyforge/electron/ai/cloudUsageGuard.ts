import type { Db } from "../db/client";
import type { AiChatClient } from "./chatPrompt";
import { reserveCloudAiCall, type CloudUsageCategory } from "../services/cloudUsageService";

/**
 * Avvolge un client cloud imponendo il controllo/consumo del budget
 * giornaliero PRIMA di ogni chiamata di rete reale verso il provider: serve
 * perché il retry di OpenAiCompatibleStudyGenerator (fino a 2 tentativi) fa
 * fino a 2 chiamate reali per una singola generazione, e ognuna deve
 * consumare budget separatamente (ogni tentativo ha potenzialmente generato
 * costo). `testConnection` NON passa dal guard: è un self-check di
 * configurazione ("il provider centralizzato risponde?"), non un uso
 * applicativo dell'utente.
 */
export function withDailyUsageGuard(client: AiChatClient, db: Db, category: CloudUsageCategory): AiChatClient {
  return {
    testConnection: () => client.testConnection(),
    async chatJSON(messages, schema) {
      reserveCloudAiCall(db, category);
      return client.chatJSON(messages, schema);
    },
    async chatText(messages) {
      reserveCloudAiCall(db, category);
      return client.chatText(messages);
    },
    async answerWithContext(input) {
      reserveCloudAiCall(db, category);
      return client.answerWithContext(input);
    },
  };
}
