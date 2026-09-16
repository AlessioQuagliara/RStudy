export type Locale = "it" | "en";

export const locales: Locale[] = ["it", "en"];

export function localePath(locale: Locale, path = ""): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return locale === "it" ? suffix || "/" : `/en${suffix === "/" ? "" : suffix}`;
}

export const dict = {
  it: {
    locale: "it" as const,
    htmlLang: "it",
    nav: {
      features: "Funzionalità",
      how: "Come funziona",
      pricing: "Prezzo",
      faq: "FAQ",
      buy: "Acquista",
    },
    hero: {
      pill: "App desktop per macOS, Windows e Linux · AI locale",
      tagline: "Study fast, study more",
      title: "I tuoi appunti diventano",
      titleAccent: "esercizi e presentazioni",
      lead: "RStudy trasforma i tuoi appunti universitari in esercizi interattivi e presentazioni per studiare in modo attivo. Pensato per materie tecniche: formule, codice e teoria, non solo testo.",
      ctaPrimary: "Acquista RStudy",
      ctaSecondary: "Vedi il codice",
      note: "Licenza one-time, nessun abbonamento · AI generativa eseguita in locale (llama.cpp) · macOS, Windows e Linux",
    },
    features: {
      pill: "Funzionalità",
      title: "Pensato per come si studia davvero",
      lead: "Dagli appunti al ripasso attivo, in un'unica app locale.",
      items: [
        {
          icon: "notebook-pen",
          title: "Appunti e organizzazione",
          body: "Corsi, lezioni e materiali in un unico posto, con un editor pensato per prendere appunti mentre segui la lezione.",
        },
        {
          icon: "target",
          title: "Quiz stile Duolingo",
          body: "Esercizi a step generati dai tuoi appunti: scelta multipla e risposta aperta, con verifica immediata e difficoltà crescente.",
        },
        {
          icon: "sigma",
          title: "Formule LaTeX",
          body: "Notazione matematica resa correttamente in domande e appunti: niente formule spezzate o illeggibili.",
        },
        {
          icon: "code-2",
          title: "Coding challenge",
          body: "Esercizi di programmazione con editor dedicato e syntax highlighting, per materie tecniche e informatiche.",
        },
        {
          icon: "presentation",
          title: "Presentazioni da appunti",
          body: "Una presentazione sintetica generata dai tuoi appunti, slide dopo slide, per un ripasso veloce prima dell'esame.",
        },
        {
          icon: "shield-check",
          title: "AI locale, zero cloud",
          body: "Le generazioni girano sul tuo computer con llama.cpp: nessun appunto lascia mai il dispositivo, anche offline.",
        },
      ],
    },
    how: {
      pill: "Come funziona",
      title: "Dai tuoi appunti allo studio attivo, in tre passaggi",
      steps: [
        { num: "01", title: "Prendi appunti", body: "Scrivi le lezioni con un editor pensato per lo studio: testo, formule, codice." },
        { num: "02", title: "Genera quiz e slide", body: "In un clic, gli appunti diventano un set di esercizi progressivi e una presentazione di ripasso." },
        { num: "03", title: "Ripassa con esercizi progressivi", body: "Rispondi, verifica, avanza: difficoltà crescente, un esercizio alla volta." },
      ],
    },
    pricing: {
      pill: "Licenza one-time",
      title: "Un solo pagamento, per sempre",
      lead: "Nessun abbonamento: paghi una volta, la licenza non scade. Include 1 anno di aggiornamenti gratuiti.",
      planName: "RStudy",
      amount: "39,00 €",
      per: "una tantum",
      features: [
        "Licenza perpetua: nessun rinnovo, nessun abbonamento",
        "1 anno di aggiornamenti gratuiti inclusi dall'acquisto",
        "AI locale illimitata (llama.cpp) — nessuna quota, nessun costo per generazione",
        "Appunti, corsi, quiz e presentazioni senza limiti",
        "Dati sempre locali sul tuo dispositivo",
      ],
      cta: "Acquista RStudy",
      note: "Pagamento sicuro gestito da Paddle. Ricevi la chiave di licenza subito dopo l'acquisto, via email e nella pagina di checkout.",
    },
    faq: {
      pill: "Domande frequenti",
      title: "Tutto quello che c'è da sapere",
      items: [
        {
          q: "Devo pagare un abbonamento?",
          a: "No. RStudy è una licenza one-time: paghi una volta sola e la licenza non scade. Sono inclusi 1 anno di aggiornamenti gratuiti dall'acquisto.",
        },
        {
          q: "I miei appunti finiscono su un server?",
          a: "No. Appunti, materiali e generazioni AI restano sul tuo computer. L'AI gira in locale con llama.cpp, nessun testo viene inviato a servizi esterni.",
        },
        {
          q: "Per quali sistemi operativi è disponibile?",
          a: "macOS (Apple Silicon), Windows e Linux.",
        },
        {
          q: "Come ricevo la licenza dopo l'acquisto?",
          a: "Subito dopo il pagamento, la pagina di checkout mostra la tua chiave di licenza e sblocca i link di download. Te la inviamo anche via email con la ricevuta Paddle.",
        },
        {
          q: "Cosa succede dopo l'anno di aggiornamenti gratuiti?",
          a: "L'app continua a funzionare normalmente. Solo le nuove versioni rilasciate dopo la scadenza della finestra non sono coperte gratuitamente dalla licenza originale.",
        },
      ],
    },
    checkout: {
      title: "Acquista RStudy",
      lead: "Pagamento sicuro gestito da Paddle. Dopo l'acquisto, questa pagina mostra la tua chiave di licenza e i link di download.",
      buy: "Acquista RStudy — 39,00 €",
      lockedTitle: "Download bloccati",
      lockedBody: "I link di download si sbloccano subito dopo il pagamento qui sopra, insieme alla tua chiave di licenza.",
      successTitle: "✓ Pagamento completato",
      successBody: "Copia e conserva questa chiave: ti serve per attivare l'app al primo avvio. Te l'abbiamo inviata anche via email con la ricevuta Paddle.",
      copy: "Copia",
      copied: "Copiata ✓",
      copyFallback: "Selezionata — usa Cmd/Ctrl+C",
      downloadTitle: "Scarica RStudy",
      detecting: "Rilevamento del sistema operativo in corso…",
      detected: (os: string) => `Abbiamo rilevato ${os}: ecco il pacchetto consigliato per il tuo sistema.`,
      chooseOs: "Scegli il pacchetto per il tuo sistema operativo qui sotto.",
      recommended: "Consigliato per te",
      platforms: {
        mac: { name: "macOS", hint: "Apple Silicon (M1/M2/M3/M4) · file .dmg", cta: "Scarica per macOS" },
        win: { name: "Windows", hint: "Windows 10/11 · installer .exe", cta: "Scarica per Windows" },
        linux: { name: "Linux", hint: "AppImage o pacchetto .deb", cta: "Scarica per Linux" },
      },
    },
    cookieBar: {
      text: "Usiamo solo cookie tecnici necessari al checkout (Paddle) e un cookie per ricordare questa scelta. Nessun tracciamento pubblicitario.",
      accept: "Ho capito",
      link: "Privacy",
    },
    footer: {
      tagline: "RStudy — sviluppato da Alessio Quagliara",
      repo: "Repository",
      issues: "Issue",
      privacy: "Privacy",
      terms: "Termini",
    },
    privacy: { title: "Privacy Policy" },
    terms: { title: "Termini di Servizio" },
  },
  en: {
    locale: "en" as const,
    htmlLang: "en",
    nav: {
      features: "Features",
      how: "How it works",
      pricing: "Pricing",
      faq: "FAQ",
      buy: "Buy now",
    },
    hero: {
      pill: "Desktop app for macOS, Windows and Linux · Local AI",
      tagline: "Study fast, study more",
      title: "Your notes become",
      titleAccent: "exercises and slides",
      lead: "RStudy turns your university notes into interactive exercises and presentations so you study actively. Built for technical subjects: formulas, code and theory, not just text.",
      ctaPrimary: "Buy RStudy",
      ctaSecondary: "View the code",
      note: "One-time license, no subscription · Generative AI runs locally (llama.cpp) · macOS, Windows and Linux",
    },
    features: {
      pill: "Features",
      title: "Built for how studying actually works",
      lead: "From notes to active recall, in a single local app.",
      items: [
        {
          icon: "notebook-pen",
          title: "Notes & organization",
          body: "Courses, lessons and materials in one place, with an editor built for taking notes while you follow along.",
        },
        {
          icon: "target",
          title: "Duolingo-style quizzes",
          body: "Step-by-step exercises generated from your notes: multiple choice and open answers, instant feedback, rising difficulty.",
        },
        {
          icon: "sigma",
          title: "LaTeX formulas",
          body: "Math notation rendered correctly in questions and notes: no broken or unreadable formulas.",
        },
        {
          icon: "code-2",
          title: "Coding challenges",
          body: "Programming exercises with a dedicated editor and syntax highlighting, for technical and CS subjects.",
        },
        {
          icon: "presentation",
          title: "Presentations from your notes",
          body: "A concise presentation generated from your notes, slide by slide, for a quick review before the exam.",
        },
        {
          icon: "shield-check",
          title: "Local AI, zero cloud",
          body: "Generations run on your computer with llama.cpp: your notes never leave the device, even offline.",
        },
      ],
    },
    how: {
      pill: "How it works",
      title: "From your notes to active studying, in three steps",
      steps: [
        { num: "01", title: "Take notes", body: "Write your lessons with an editor built for studying: text, formulas, code." },
        { num: "02", title: "Generate quizzes and slides", body: "In one click, your notes become a set of progressive exercises and a review presentation." },
        { num: "03", title: "Review with progressive exercises", body: "Answer, check, advance: rising difficulty, one exercise at a time." },
      ],
    },
    pricing: {
      pill: "One-time license",
      title: "Pay once, own it forever",
      lead: "No subscription: pay once, the license never expires. Includes 1 year of free updates.",
      planName: "RStudy",
      amount: "€39.00",
      per: "one-time",
      features: [
        "Perpetual license: no renewal, no subscription",
        "1 year of free updates included from purchase",
        "Unlimited local AI (llama.cpp) — no quota, no per-generation cost",
        "Unlimited notes, courses, quizzes and presentations",
        "Your data always stays on your device",
      ],
      cta: "Buy RStudy",
      note: "Secure payment handled by Paddle. You get your license key right after purchase, by email and on the checkout page.",
    },
    faq: {
      pill: "Frequently asked questions",
      title: "Everything you need to know",
      items: [
        {
          q: "Do I need a subscription?",
          a: "No. RStudy is a one-time license: you pay once and it never expires. 1 year of free updates from purchase is included.",
        },
        {
          q: "Do my notes go to a server?",
          a: "No. Notes, materials and AI generations stay on your computer. AI runs locally with llama.cpp, no text is sent to external services.",
        },
        {
          q: "Which operating systems are supported?",
          a: "macOS (Apple Silicon), Windows and Linux.",
        },
        {
          q: "How do I get my license after buying?",
          a: "Right after payment, the checkout page shows your license key and unlocks the download links. We also email it to you with the Paddle receipt.",
        },
        {
          q: "What happens after the free-update year?",
          a: "The app keeps working normally. Only new versions released after that window aren't covered for free by the original license.",
        },
      ],
    },
    checkout: {
      title: "Buy RStudy",
      lead: "Secure payment handled by Paddle. After purchase, this page shows your license key and the download links.",
      buy: "Buy RStudy — €39.00",
      lockedTitle: "Downloads locked",
      lockedBody: "Download links unlock right after payment above, together with your license key.",
      successTitle: "✓ Payment completed",
      successBody: "Copy and keep this key: you'll need it to activate the app on first launch. We also emailed it to you with the Paddle receipt.",
      copy: "Copy",
      copied: "Copied ✓",
      copyFallback: "Selected — use Cmd/Ctrl+C",
      downloadTitle: "Download RStudy",
      detecting: "Detecting your operating system…",
      detected: (os: string) => `We detected ${os}: here's the recommended package for your system.`,
      chooseOs: "Pick the package for your operating system below.",
      recommended: "Recommended for you",
      platforms: {
        mac: { name: "macOS", hint: "Apple Silicon (M1/M2/M3/M4) · .dmg file", cta: "Download for macOS" },
        win: { name: "Windows", hint: "Windows 10/11 · .exe installer", cta: "Download for Windows" },
        linux: { name: "Linux", hint: "AppImage or .deb package", cta: "Download for Linux" },
      },
    },
    cookieBar: {
      text: "We only use technical cookies required for checkout (Paddle) and one cookie to remember this choice. No advertising tracking.",
      accept: "Got it",
      link: "Privacy",
    },
    footer: {
      tagline: "RStudy — built by Alessio Quagliara",
      repo: "Repository",
      issues: "Issues",
      privacy: "Privacy",
      terms: "Terms",
    },
    privacy: { title: "Privacy Policy" },
    terms: { title: "Terms of Service" },
  },
} as const;

export type Dict = (typeof dict)[Locale];
