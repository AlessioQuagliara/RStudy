import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sqlite: Database.Database | null = null;

export function initDb(dbFilePath: string) {
  if (dbInstance) return dbInstance;
  sqlite = new Database(dbFilePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  dbInstance = drizzle(sqlite, { schema });
  return dbInstance;
}

export function getDb() {
  if (!dbInstance) {
    throw new Error("Database non inizializzato: chiamare initDb() all'avvio dell'app.");
  }
  return dbInstance;
}

export function closeDb() {
  sqlite?.close();
  sqlite = null;
  dbInstance = null;
}

type FullDb = ReturnType<typeof initDb>;
type TransactionDb = Parameters<Parameters<FullDb["transaction"]>[0]>[0];

/**
 * Unione tra il database completo e il tipo di sessione passato dentro
 * `db.transaction(tx => ...)`: entrambi supportano select/insert/update/delete,
 * ma solo il primo espone `$client`. I repository accettano questo union type
 * così da poter essere chiamati sia fuori che dentro una transazione.
 */
export type Db = FullDb | TransactionDb;
