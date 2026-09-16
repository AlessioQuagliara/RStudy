import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  alternates: { languages: { it: "/privacy", "x-default": "/privacy" } },
};

export default function PrivacyPageEn() {
  return (
    <PageShell locale="en" pathWithoutLocale="/privacy">
      <article className="prose prose-invert container py-16">
        <h1>Privacy Policy</h1>
        <p className="text-base-content/60">Last updated: [insert publication date]</p>

        <h2>Data controller</h2>
        <p>
          [Alessio Quagliara] — contact: open a report on{" "}
          <a href="https://github.com/AlessioQuagliara/RStudy/issues">GitHub Issues</a>{" "}
          noting it&apos;s a privacy request. [Insert a dedicated email address and, if applicable, business
          name/address here.]
        </p>

        <h2>What we collect on this website</h2>
        <ul>
          <li>
            <strong>No analytics collection</strong>: this site uses no profiling cookies and no third-party
            analytics tools.
          </li>
          <li>
            <strong>Technical cookies</strong>: one cookie/localStorage entry to remember you dismissed the cookie
            banner, plus cookies set by Paddle during checkout (required to process payment securely).
          </li>
          <li>
            <strong>Payment data</strong>: payment is handled entirely by{" "}
            <a href="https://www.paddle.com/legal/checkout-buyer-terms">Paddle.com Market Limited</a>, acting as
            RStudy&apos;s Merchant of Record. We never see or store your card details; Paddle&apos;s own privacy
            policy and terms also apply.
          </li>
        </ul>

        <h2>What the RStudy desktop app collects</h2>
        <ul>
          <li>
            <strong>Notes, courses, materials</strong>: stay exclusively on your device, in a local SQLite
            database. They are never uploaded to a server of ours — we don&apos;t have one.
          </li>
          <li>
            <strong>AI generations</strong>: run entirely locally with llama.cpp. No text you write in the app is
            sent to external services to generate exercises, summaries or presentations.
          </li>
          <li>
            <strong>AI model download</strong>: on first use, the app downloads a language model (~2GB) from
            Hugging Face. This is the only automatic AI-related network request.
          </li>
          <li>
            <strong>License activation</strong>: when you enter your license key, the app sends the transaction
            identifier to Paddle&apos;s API to verify it. We don&apos;t send this to a server of ours.
          </li>
        </ul>

        <h2>Legal basis and purpose</h2>
        <p>
          We process the data necessary for your purchase (via Paddle) to perform the license contract. We do not
          run direct marketing or profiling.
        </p>

        <h2>Your rights</h2>
        <p>
          If you&apos;re in the European Union, you have the right to access, rectify, erase and port any data we
          process. To exercise these rights, contact us as above. For payment data handled by Paddle, you can also
          reach out to Paddle directly.
        </p>

        <h2>Children</h2>
        <p>RStudy is not directed at children under 16.</p>

        <h2>Changes</h2>
        <p>We may update this page; the date at the top reflects the latest revision.</p>
      </article>
    </PageShell>
  );
}
