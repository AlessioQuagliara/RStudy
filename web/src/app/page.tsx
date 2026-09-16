import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { HomeContent } from "@/components/HomeContent";

export const metadata: Metadata = {
  title: "RStudy — Study fast, study more",
  alternates: { languages: { en: "/en", "x-default": "/" } },
};

export default function HomePage() {
  return (
    <PageShell locale="it" pathWithoutLocale="/">
      <HomeContent locale="it" />
    </PageShell>
  );
}
