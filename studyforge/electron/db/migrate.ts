import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { initDb } from "./client";

/**
 * Applica le migrazioni Drizzle presenti in /drizzle a un database SQLite.
 * `migrationsFolder` è passato esplicitamente dal chiamante (main process
 * bundlato in CJS, oppure script CLI eseguito con tsx) per evitare di
 * dipendere da `import.meta.url`/`__dirname`, che si comportano diversamente
 * a seconda del formato di build.
 */
export function runMigrations(dbFilePath: string, migrationsFolder: string) {
  const db = initDb(dbFilePath);
  migrate(db, { migrationsFolder });
  return db;
}

const isDirectRun = process.argv[1] && process.argv[1].endsWith("migrate.ts");
if (isDirectRun) {
  const dbTarget = process.env.STUDYFORGE_DB_PATH ?? path.resolve(process.cwd(), "studyforge.sqlite3");
  const migrationsFolder = path.resolve(process.cwd(), "drizzle");
  runMigrations(dbTarget, migrationsFolder);
   
  console.log(`Migrazioni applicate a ${dbTarget}`);
}
