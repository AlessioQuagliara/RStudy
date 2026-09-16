import type { NextConfig } from "next";

// GitHub Pages serve questo sito da https://<utente>.github.io/<repo>/ (project
// pages, non un repo <utente>.github.io dedicato): senza basePath/assetPrefix
// ogni asset e link assoluto (/logo.svg, /en, ...) risolverebbe alla radice del
// dominio invece che sotto /RStudy, restituendo 404. Se in
// futuro colleghi un dominio personalizzato (file public/CNAME), rimuovi questo
// blocco: con un dominio proprio il sito vive alla radice, basePath non serve.
const repoBasePath = "/RStudy";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: repoBasePath,
  assetPrefix: repoBasePath,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
