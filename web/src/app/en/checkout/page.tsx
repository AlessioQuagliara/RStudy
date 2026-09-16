import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { CheckoutContent } from "@/components/CheckoutContent";

export const metadata: Metadata = {
  title: "Buy",
  alternates: { languages: { it: "/checkout", "x-default": "/checkout" } },
};

export default function CheckoutPageEn() {
  return (
    <PageShell locale="en" pathWithoutLocale="/checkout">
      <CheckoutContent locale="en" />
    </PageShell>
  );
}
