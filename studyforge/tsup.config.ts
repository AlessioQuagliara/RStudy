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
  clean: true,
  external: ["electron", "better-sqlite3", "keytar", "pdf-parse", "mammoth"],
});
