import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Termini di Servizio",
  alternates: { languages: { en: "/en/terms", "x-default": "/terms" } },
};

export default function TermsPageIt() {
  return (
    <PageShell locale="it" pathWithoutLocale="/terms">
      <article className="prose prose-invert container py-16">
        <h1>Termini di Servizio</h1>
        <p className="text-base-content/60">Ultimo aggiornamento: [inserisci data pubblicazione]</p>

        <h2>Il prodotto</h2>
        <p>
          RStudy è un&apos;applicazione desktop per macOS, Windows e Linux, con AI generativa eseguita interamente
          in locale. La licenza è concessa da [Alessio Quagliara] (&quot;noi&quot;).
        </p>

        <h2>Rivenditore ufficiale (Paddle)</h2>
        <p>
          Gli acquisti sono elaborati da Paddle.com Market Limited, che agisce come rivenditore autorizzato
          (Merchant of Record) dei nostri prodotti. Paddle è responsabile della fatturazione, della raccolta
          dell&apos;IVA applicabile e dell&apos;assistenza sui pagamenti. Acquistando accetti anche i{" "}
          <a href="https://www.paddle.com/legal/checkout-buyer-terms">Termini per gli acquirenti di Paddle</a>.
        </p>

        <h2>Licenza</h2>
        <ul>
          <li>La licenza è <strong>perpetua e one-time</strong>: un solo pagamento, nessun rinnovo automatico.</li>
          <li>
            Include <strong>1 anno di aggiornamenti gratuiti</strong> a partire dalla data di acquisto. Dopo tale
            periodo l&apos;app continua a funzionare regolarmente; solo le versioni rilasciate successivamente
            all&apos;anno incluso non sono coperte gratuitamente dalla licenza originale.
          </li>
          <li>La licenza è concessa per uso personale, non trasferibile a terzi senza nostro consenso scritto.</li>
        </ul>

        <h2>Rimborsi</h2>
        <p>
          Offriamo un rimborso completo entro <strong>14 giorni</strong> dall&apos;acquisto se RStudy non
          soddisfa le tue aspettative, richiedibile aprendo una segnalazione su{" "}
          <a href="https://github.com/AlessioQuagliara/alessioquagliara-study-camp/issues">GitHub Issues</a> con
          l&apos;ID della transazione Paddle. I rimborsi vengono elaborati da Paddle secondo le loro procedure
          standard.
        </p>

        <h2>Limitazioni</h2>
        <p>
          RStudy è fornito &quot;così com&apos;è&quot;. Le generazioni AI possono contenere imprecisioni: verifica
          sempre i contenuti generati prima di usarli per lo studio o l&apos;esame. Non garantiamo che l&apos;app
          sia priva di errori o interruzioni.
        </p>

        <h2>Legge applicabile</h2>
        <p>[Inserisci la legge applicabile e il foro competente per la tua giurisdizione.]</p>

        <h2>Contatti</h2>
        <p>
          Per domande sui termini, apri una segnalazione su{" "}
          <a href="https://github.com/AlessioQuagliara/alessioquagliara-study-camp/issues">GitHub Issues</a>.
        </p>
      </article>
    </PageShell>
  );
}
