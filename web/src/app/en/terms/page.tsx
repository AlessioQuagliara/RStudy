import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Terms of Service",
  alternates: { languages: { it: "/terms", "x-default": "/terms" } },
};

export default function TermsPageEn() {
  return (
    <PageShell locale="en" pathWithoutLocale="/terms">
      <article className="prose prose-invert container py-16">
        <h1>Terms of Service</h1>
        <p className="text-base-content/60">Last updated: [insert publication date]</p>

        <h2>The product</h2>
        <p>
          RStudy is a desktop application for macOS, Windows and Linux, with generative AI running entirely
          locally. The license is granted by [Alessio Quagliara] (&quot;we&quot;, &quot;us&quot;).
        </p>

        <h2>Authorized reseller (Paddle)</h2>
        <p>
          Purchases are processed by Paddle.com Market Limited, acting as our authorized reseller (Merchant of
          Record) for this product. Paddle is responsible for billing, collecting applicable sales tax/VAT, and
          payment support. By purchasing, you also agree to{" "}
          <a href="https://www.paddle.com/legal/checkout-buyer-terms">Paddle&apos;s Buyer Terms</a>.
        </p>

        <h2>License</h2>
        <ul>
          <li>The license is <strong>perpetual and one-time</strong>: a single payment, no automatic renewal.</li>
          <li>
            It includes <strong>1 year of free updates</strong> from the purchase date. After that period the app
            keeps working normally; only versions released after the included year aren&apos;t covered for free
            by the original license.
          </li>
          <li>The license is granted for personal use and is not transferable without our written consent.</li>
        </ul>

        <h2>Refunds</h2>
        <p>
          We offer a full refund within <strong>14 days</strong> of purchase if RStudy doesn&apos;t meet your
          expectations — request one by opening a report on{" "}
          <a href="https://github.com/AlessioQuagliara/alessioquagliara-study-camp/issues">GitHub Issues</a> with
          your Paddle transaction ID. Refunds are processed by Paddle according to their standard procedures.
        </p>

        <h2>Limitations</h2>
        <p>
          RStudy is provided &quot;as is&quot;. AI generations may contain inaccuracies: always review generated
          content before relying on it for studying or exams. We do not guarantee the app is free of errors or
          interruptions.
        </p>

        <h2>Governing law</h2>
        <p>[Insert applicable law and jurisdiction for your location.]</p>

        <h2>Contact</h2>
        <p>
          For questions about these terms, open a report on{" "}
          <a href="https://github.com/AlessioQuagliara/alessioquagliara-study-camp/issues">GitHub Issues</a>.
        </p>
      </article>
    </PageShell>
  );
}
