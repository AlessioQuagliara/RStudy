import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { CheckoutContent } from "@/components/CheckoutContent";

export const metadata: Metadata = {
  title: "Acquista",
  alternates: { languages: { en: "/en/checkout", "x-default": "/checkout" } },
};

export default function CheckoutPage() {
  return (
    <PageShell locale="it" pathWithoutLocale="/checkout">
      <CheckoutContent locale="it" />
    </PageShell>
  );
}
