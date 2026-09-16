// Turbopack (Next 16) rifiuta un `distDir` fuori da web/ ("distDirRoot should
// not navigate out of the projectPath"), quindi `next build` scrive sempre in
// web/out. Questo script copia il risultato in <repo-root>/docs subito dopo:
// è la cartella da configurare una sola volta in GitHub Pages (Settings →
// Pages → Source: branch main, cartella /docs) e resta aggiornata ad ogni
// `pnpm build`, senza copie manuali.
import { cpSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const webDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(webDir, "out");
const destination = path.join(webDir, "..", "docs");

if (!existsSync(source)) {
  console.error("[publish-docs] web/out non esiste: esegui prima `next build`.");
  process.exit(1);
}

rmSync(destination, { recursive: true, force: true });
cpSync(source, destination, { recursive: true });
console.log(`[publish-docs] Copiato in ${path.relative(path.join(webDir, ".."), destination)}/`);
