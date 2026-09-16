/**
 * Deve restare identico a `basePath` in next.config.ts. `next/link` e le
 * pagine generate da Next aggiungono il basePath da sole; un `<img>`/`<a>`
 * puro che referenzia un file di `public/` no (vedi doc Next.js su basePath
 * + next/image) — da qui l'uso esplicito ovunque serva un asset statico.
 */
export const BASE_PATH = "/RStudy";

export function withBasePath(path: string): string {
  return `${BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
}
