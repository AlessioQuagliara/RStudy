import { app } from "electron";
import path from "node:path";
import fs from "node:fs";

/**
 * Tutte le posizioni su disco usate dall'app vivono sotto userData:
 * ~/Library/Application Support/RStudy su macOS.
 */
export function getUserDataDir(): string {
  return app.getPath("userData");
}

export function getDbPath(): string {
  return path.join(getUserDataDir(), "rstudy.sqlite3");
}

export function getMaterialsDir(): string {
  const dir = path.join(getUserDataDir(), "materials");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getBackupsDir(): string {
  const dir = path.join(getUserDataDir(), "backups");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
