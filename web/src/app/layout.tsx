import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://alessioquagliara.github.io/RStudy/"),
  title: {
    default: "RStudy — Study fast, study more",
    template: "%s — RStudy",
  },
  description:
    "RStudy trasforma i tuoi appunti universitari in esercizi interattivi e presentazioni per studiare in modo attivo. AI locale, licenza one-time, per macOS, Windows e Linux.",
  openGraph: {
    type: "website",
    images: ["/og-image.png"],
  },
  twitter: {
    card: "summary",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it" className="h-full">
      <body className="flex min-h-full flex-col antialiased">{children}</body>
    </html>
  );
}
