import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  alternates: { languages: { en: "/en/privacy", "x-default": "/privacy" } },
};

/**
 * Bozza ragionevole, non revisione legale: prima di vendere davvero, fai
 * controllare questo testo (e i placeholder [...]) da un professionista per
 * la tua giurisdizione — in particolare identità del titolare, base
 * giuridica e obblighi IVA/fiscali (Paddle agisce da Merchant of Record ma
 * questo non esaurisce i tuoi obblighi come sviluppatore del prodotto).
 */
export default function PrivacyPageIt() {
  return (
    <PageShell locale="it" pathWithoutLocale="/privacy">
      <article className="prose prose-invert container py-16">
        <h1>Privacy Policy</h1>
        <p className="text-base-content/60">Ultimo aggiornamento: [inserisci data pubblicazione]</p>

        <h2>Titolare del trattamento</h2>
        <p>
          [Alessio Quagliara] — contatto: apri una segnalazione su{" "}
          <a href="https://github.com/AlessioQuagliara/alessioquagliara-study-camp/issues">GitHub Issues</a>{" "}
          indicando che si tratta di una richiesta privacy. [Inserisci qui indirizzo email dedicato e, se
          applicabile, indirizzo/ragione sociale.]
        </p>

        <h2>Cosa raccogliamo su questo sito</h2>
        <ul>
          <li>
            <strong>Nessuna raccolta analitica</strong>: questo sito non usa cookie di profilazione né strumenti
            di analytics di terze parti.
          </li>
          <li>
            <strong>Cookie tecnici</strong>: un cookie/localStorage per ricordare che hai chiuso il banner cookie,
            e i cookie impostati da Paddle durante il checkout (necessari per elaborare il pagamento in modo
            sicuro).
          </li>
          <li>
            <strong>Dati di pagamento</strong>: il pagamento è gestito interamente da{" "}
            <a href="https://www.paddle.com/legal/checkout-buyer-terms">Paddle.com Market Limited</a>, che agisce
            come rivenditore ufficiale (Merchant of Record) di RStudy. Non vediamo né conserviamo i dati della tua
            carta: si applicano anche la privacy policy e i termini di Paddle.
          </li>
        </ul>

        <h2>Cosa raccoglie l&apos;app desktop RStudy</h2>
        <ul>
          <li>
            <strong>Appunti, corsi, materiali</strong>: restano esclusivamente sul tuo dispositivo, in un database
            SQLite locale. Non vengono mai caricati su un nostro server: non ne abbiamo uno.
          </li>
          <li>
            <strong>Generazioni AI</strong>: girano interamente in locale con llama.cpp. Nessun testo che scrivi
            nell&apos;app viene inviato a servizi esterni per generare esercizi, riassunti o presentazioni.
          </li>
          <li>
            <strong>Download del modello AI</strong>: al primo utilizzo, l&apos;app scarica un modello linguistico
            (~2GB) da Hugging Face. Questa è l&apos;unica richiesta di rete automatica legata all&apos;AI.
          </li>
          <li>
            <strong>Attivazione della licenza</strong>: quando inserisci la chiave di licenza, l&apos;app invia
            l&apos;identificativo della transazione all&apos;API di Paddle per verificarne la validità. Non
            inviamo questo dato a un nostro server.
          </li>
        </ul>

        <h2>Base giuridica e finalità</h2>
        <p>
          Trattiamo i dati necessari all&apos;acquisto (tramite Paddle) per l&apos;esecuzione del contratto di
          licenza. Non effettuiamo marketing diretto né profilazione.
        </p>

        <h2>I tuoi diritti</h2>
        <p>
          Se ti trovi nell&apos;Unione Europea, hai diritto di accesso, rettifica, cancellazione e portabilità dei
          dati che eventualmente trattiamo. Per esercitarli, contattaci come indicato sopra. Per i dati di
          pagamento gestiti da Paddle, puoi rivolgerti anche direttamente a Paddle.
        </p>

        <h2>Minori</h2>
        <p>RStudy non è rivolto a minori di 16 anni.</p>

        <h2>Modifiche</h2>
        <p>Possiamo aggiornare questa pagina; la data in cima riflette l&apos;ultima revisione.</p>
      </article>
    </PageShell>
  );
}
