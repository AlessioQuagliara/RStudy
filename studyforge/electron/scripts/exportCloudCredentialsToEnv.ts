import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

/**
 * Script one-shot da eseguire UNA VOLTA, localmente, per migrare le
 * credenziali cloud AI già presenti nel DB SQLite (inserite manualmente
 * dall'utente prima della centralizzazione) in un file `.env` locale, senza
 * doverle rigenerare. Non scrive mai nel DB, non stampa mai un valore
 * segreto (solo nomi di variabili ed esiti), ed è idempotente: rieseguirlo
 * non sovrascrive variabili già valorizzate salvo `--force`.
 *
 * Uso: pnpm tsx electron/scripts/exportCloudCredentialsToEnv.ts --db <path> [--force]
 * (oppure impostare RSTUDY_DB_PATH invece di --db)
 */

interface LegacyAppSettings {
  cloudApiKey?: string | null;
  cloudBaseUrl?: string | null;
  cloudModel?: string | null;
  transcriptionApiKey?: string | null;
  transcriptionBaseUrl?: string | null;
  transcriptionModel?: string | null;
}

const ENV_VAR_MAP: Array<{ envVar: string; field: keyof LegacyAppSettings }> = [
  { envVar: "RSTUDY_CLOUD_API_KEY", field: "cloudApiKey" },
  { envVar: "RSTUDY_CLOUD_BASE_URL", field: "cloudBaseUrl" },
  { envVar: "RSTUDY_CLOUD_MODEL", field: "cloudModel" },
  { envVar: "RSTUDY_TRANSCRIPTION_API_KEY", field: "transcriptionApiKey" },
  { envVar: "RSTUDY_TRANSCRIPTION_BASE_URL", field: "transcriptionBaseUrl" },
  { envVar: "RSTUDY_TRANSCRIPTION_MODEL", field: "transcriptionModel" },
];

function parseArgs(argv: string[]): { dbPath: string | null; force: boolean } {
  let dbPath: string | null = process.env.RSTUDY_DB_PATH ?? null;
  let force = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--db") dbPath = argv[++i] ?? null;
    else if (argv[i] === "--force") force = true;
  }
  return { dbPath, force };
}

function readLegacySettings(dbPath: string): LegacyAppSettings | null {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const row = db
      .prepare("SELECT value_json FROM app_settings WHERE key = 'app_settings'")
      .get() as { value_json: string } | undefined;
    if (!row) return null;
    return JSON.parse(row.value_json) as LegacyAppSettings;
  } finally {
    db.close();
  }
}

/** Sostituisce una riga `KEY=...` esistente, o la appende se assente. Non tocca il resto del contenuto. */
function upsertEnvLine(content: string, key: string, value: string): string {
  const re = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}=${value}`;
  return re.test(content) ? content.replace(re, line) : `${content.trimEnd()}\n${line}\n`;
}

function hasNonEmptyValue(content: string, key: string): boolean {
  const match = content.match(new RegExp(`^${key}=(.*)$`, "m"));
  return Boolean(match?.[1]?.trim().length);
}

function main(): void {
  const { dbPath, force } = parseArgs(process.argv.slice(2));
  if (!dbPath) {
    console.error("Specifica il DB da migrare con --db <path> oppure la variabile RSTUDY_DB_PATH.");
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(dbPath)) {
    console.error(`Nessun file DB trovato in: ${dbPath}`);
    process.exitCode = 1;
    return;
  }

  const legacy = readLegacySettings(dbPath);
  if (!legacy) {
    console.log("Nessuna configurazione app_settings da migrare: niente da fare.");
    return;
  }

  const repoRoot = path.resolve(import.meta.dirname, "../..");
  const envPath = path.join(repoRoot, ".env");
  const envExamplePath = path.join(repoRoot, ".env.example");

  let envContent = "";
  if (fs.existsSync(envPath)) {
    const backupPath = path.join(repoRoot, `.env.bak.${new Date().toISOString().replace(/[:.]/g, "-")}`);
    fs.copyFileSync(envPath, backupPath);
    console.log(`.env esistente: backup creato in ${path.basename(backupPath)}`);
    envContent = fs.readFileSync(envPath, "utf8");
  }

  let written = 0;
  let skipped = 0;
  for (const { envVar, field } of ENV_VAR_MAP) {
    const value = legacy[field];
    if (!value) continue; // niente da migrare per questo campo

    if (!force && hasNonEmptyValue(envContent, envVar)) {
      console.log(`${envVar}: già presente in .env, saltata (usa --force per sovrascrivere)`);
      skipped++;
      continue;
    }
    envContent = upsertEnvLine(envContent, envVar, value);
    console.log(`${envVar}: scritta`);
    written++;
  }

  if (written > 0) {
    fs.writeFileSync(envPath, envContent, "utf8");
  }

  // .env.example: sempre solo placeholder vuoti, mai un valore reale.
  let exampleContent = fs.existsSync(envExamplePath) ? fs.readFileSync(envExamplePath, "utf8") : "";
  let exampleChanged = false;
  for (const { envVar } of ENV_VAR_MAP) {
    if (!new RegExp(`^${envVar}=`, "m").test(exampleContent)) {
      exampleContent = upsertEnvLine(exampleContent, envVar, "");
      exampleChanged = true;
    }
  }
  if (!/^CLOUD_AI_DAILY_USAGE_LIMIT=/m.test(exampleContent)) {
    exampleContent = upsertEnvLine(exampleContent, "CLOUD_AI_DAILY_USAGE_LIMIT", "35");
    exampleChanged = true;
  }
  if (exampleChanged) fs.writeFileSync(envExamplePath, exampleContent, "utf8");

  console.log(`Fatto: ${written} variabili scritte, ${skipped} saltate (già presenti). Nessun valore stampato sopra.`);
}

main();
