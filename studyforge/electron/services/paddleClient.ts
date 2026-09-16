/**
 * Verifica server-to-server (main process) delle transazioni Paddle. La API
 * key resta sempre nel main, mai esposta al renderer.
 *
 * Nota di sicurezza onesta: questa è un'app desktop distribuita all'utente
 * finale, quindi la API key Paddle (letta da `.env`, incluso come
 * extraResource nel pacchetto — vedi electron-builder.yml) è in linea di
 * principio estraibile da chi decompila l'installer. Per limitare il danno,
 * usa nel Dashboard Paddle una API key con scope minimo (sola lettura
 * Transactions), non la chiave admin dell'account. Senza un vero backend
 * (che questo progetto non ha: la landing è statica su GitHub Pages) non
 * esiste un modo per evitare del tutto questa esposizione — è un compromesso
 * accettato esplicitamente per restare senza server.
 */

interface PaddleTransactionItem {
  price?: { id?: string };
}

export interface PaddleTransaction {
  id: string;
  status: string;
  createdAt: string;
  priceIds: string[];
}

function getApiKey(): string {
  const live = process.env.PADDLE_API?.trim();
  const sandbox = process.env.PADDLE_API_SANDBOX?.trim();
  const key = live || sandbox;
  if (!key) {
    throw new Error(
      "Nessuna API key Paddle configurata (PADDLE_API / PADDLE_API_SANDBOX in .env).",
    );
  }
  return key;
}

/** Usa l'ambiente Live solo se PADDLE_API è valorizzata, altrimenti Sandbox. */
function getBaseUrl(): string {
  const live = process.env.PADDLE_API?.trim();
  return live ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
}

/**
 * Recupera una transazione Paddle by ID. Lancia se la richiesta fallisce o
 * se l'ID non esiste; non interpreta qui lo stato "completed" o il price ID
 * atteso, quella logica di business resta in licenseService.ts.
 */
export async function fetchPaddleTransaction(transactionId: string): Promise<PaddleTransaction> {
  const apiKey = getApiKey();
  const baseUrl = getBaseUrl();
  const startedAt = Date.now();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/transactions/${encodeURIComponent(transactionId)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });
  } catch {
    throw new Error("Impossibile contattare Paddle. Verifica la connessione a internet e riprova.");
  }

  const durationMs = Date.now() - startedAt;
  console.log(`[PaddleClient] GET /transactions/{id} → HTTP ${response.status} (${durationMs}ms)`);

  if (response.status === 404) {
    throw new Error("Chiave di licenza non riconosciuta da Paddle.");
  }
  if (!response.ok) {
    throw new Error(`Paddle ha risposto con HTTP ${response.status}.`);
  }

  const json = (await response.json()) as {
    data?: { id?: string; status?: string; created_at?: string; items?: PaddleTransactionItem[] };
  };
  const data = json.data;
  if (!data?.id || !data.status || !data.created_at) {
    throw new Error("Risposta Paddle in un formato inatteso.");
  }

  return {
    id: data.id,
    status: data.status,
    createdAt: data.created_at,
    priceIds: (data.items ?? [])
      .map((item) => item.price?.id)
      .filter((id): id is string => Boolean(id)),
  };
}
