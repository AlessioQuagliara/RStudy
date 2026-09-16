import { defineConfig } from "tsup";

/**
 * Un'unica build con due entry (main + preload): tsup con un array di
 * config separate esegue `--onSuccess` una volta per ogni config, il che
 * lanciava due processi Electron (e quindi due finestre) in `pnpm dev`.
 * Un solo config con più entry produce un solo build pass e un solo
 * `onSuccess`.
 */
export default defineConfig({
  entry: {
    "main/index": "electron/main/index.ts",
    "preload/index": "electron/preload/index.ts",
  },
  outDir: "dist",
  format: "cjs",
  platform: "node",
  target: "node20",
  sourcemap: true,
  // NON true: `outDir` è "dist", la stessa cartella genitore in cui `pnpm
  // build:renderer` (vite, build.outDir: "dist/renderer") scrive il
  // renderer. `clean: true` di tsup cancella l'intero outDir prima di
  // scrivere, quindi in `pnpm build` (build:renderer poi build:electron)
  // wipeava dist/renderer appena costruito, lasciando un pacchetto senza
  // renderer. tsup emette sempre gli stessi due file (main/index.js,
  // preload/index.js, nomi fissi non hashati): non pulire prima non lascia
  // residui stantii da ripulire, a differenza dei chunk hashati di vite.
  clean: false,
  external: ["electron", "better-sqlite3", "node-llama-cpp", "pdf-parse", "mammoth"],
});
