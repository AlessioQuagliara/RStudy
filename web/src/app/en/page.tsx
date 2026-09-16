import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { HomeContent } from "@/components/HomeContent";

export const metadata: Metadata = {
  title: "RStudy — Study fast, study more",
  alternates: { languages: { it: "/", "x-default": "/" } },
};

export default function HomePageEn() {
  return (
    <PageShell locale="en" pathWithoutLocale="/">
      <HomeContent locale="en" />
    </PageShell>
  );
}
