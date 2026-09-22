import type { DriveStep, DriverHook } from "driver.js";
import type { NavigateFunction } from "react-router-dom";

export interface TourContext {
  sampleCourseId: string | null;
  sampleLessonId: string | null;
}

type HookOpts = Parameters<DriverHook>[2];

/**
 * Naviga verso la pagina dello step successivo, poi chiede a Driver.js di
 * avanzare. Driver.js resta in attesa (MutationObserver, config globale
 * `waitForElement`) che l'elemento del prossimo step compaia nel DOM dopo il
 * render React innescato dalla navigazione, ed è quindi già sincronizzato
 * con l'attesa: non serve alcun polling manuale qui.
 */
function goTo(navigate: NavigateFunction, path: string): DriverHook {
  return (_element: Element | undefined, _step: DriveStep, opts: HookOpts) => {
    navigate(path);
    opts.driver.moveNext();
  };
}

/**
 * Costruisce l'elenco degli step una sola volta, PRIMA di avviare
 * `driver()`: gli step su un corso/lezione di esempio vengono inclusi solo
 * se esistono davvero dati nel DB locale (nessun tentativo di navigare verso
 * un corso o una lezione inesistenti). Il testo dello step "Corsi"/"Corso"
 * si adatta per spiegare cosa sbloccherà creare i dati mancanti.
 */
export function buildTourSteps(navigate: NavigateFunction, ctx: TourContext): DriveStep[] {
  const steps: DriveStep[] = [
    {
      element: '[data-tour="nav-dashboard"]',
      popover: {
        title: "Dashboard",
        description: "La tua pagina di partenza: statistiche a colpo d'occhio e azioni rapide.",
      },
    },
    {
      element: '[data-tour="nav-courses"]',
      popover: {
        title: "Corsi",
        description: "Qui organizzi le materie: lezioni, materiali e flashcard di ogni corso.",
      },
    },
    {
      element: '[data-tour="nav-flashcards"]',
      popover: {
        title: "Flashcard",
        description: "Ripassa con la ripetizione dilazionata: solo le carte che servono, quando servono.",
      },
    },
    {
      element: '[data-tour="nav-settings"]',
      popover: {
        title: "Impostazioni",
        description: "Provider AI, modello locale, backup e aspetto dell'app.",
        onNextClick: goTo(navigate, "/"),
      },
    },
    {
      element: '[data-tour="dashboard-quick-actions"]',
      popover: {
        title: "Azioni rapide",
        description: "Crea un nuovo corso o apri subito la modalità focus per ripassare le flashcard di oggi.",
      },
    },
    {
      element: '[data-tour="dashboard-stats"]',
      popover: {
        title: "Le tue statistiche",
        description: "Corsi attivi, CFU, prossimo esame, lezioni completate e flashcard da ripassare oggi.",
        onNextClick: goTo(navigate, "/courses"),
      },
    },
    {
      element: '[data-tour="courses-new-button"]',
      popover: {
        title: "Crea il tuo primo corso",
        description: ctx.sampleCourseId
          ? "Da qui aggiungi materia, CFU e data d'esame."
          : "Da qui aggiungi materia, CFU e data d'esame. Una volta creato un corso con almeno una lezione, riapri il tutorial dalla Sidebar per vedere anche Studio AI.",
        onNextClick: goTo(navigate, ctx.sampleCourseId ? `/courses/${ctx.sampleCourseId}` : "/flashcards"),
      },
    },
  ];

  if (ctx.sampleCourseId) {
    steps.push({
      element: '[data-tour="course-tabs"]',
      popover: {
        title: "Dentro un corso",
        description: ctx.sampleLessonId
          ? "Panoramica, lezioni, materiali, flashcard, chat con l'AI sui tuoi materiali e riassunto del corso."
          : "Panoramica, lezioni, materiali, flashcard, chat con l'AI e riassunto del corso. Aggiungi una lezione per sbloccare anche Studio AI.",
        onNextClick: goTo(navigate, ctx.sampleLessonId ? `/courses/${ctx.sampleCourseId}/lessons/${ctx.sampleLessonId}` : "/flashcards"),
      },
    });
  }

  if (ctx.sampleCourseId && ctx.sampleLessonId) {
    steps.push({
      element: '[data-tour="lesson-ai-tab"]',
      popover: {
        title: "Studio AI",
        description: "Da qui generi riassunto, esercizi e presentazione a partire dai tuoi appunti della lezione.",
        onNextClick: goTo(navigate, "/flashcards"),
      },
    });
  }

  steps.push(
    {
      element: '[data-tour="flashcards-focus-button"]',
      popover: {
        title: "Modalità focus",
        description: "Studia solo le flashcard in scadenza oggi, con la ripetizione dilazionata.",
        onNextClick: goTo(navigate, "/settings"),
      },
    },
    {
      element: '[data-tour="settings-ai-provider"]',
      popover: {
        title: "Provider AI",
        description: "Scegli tra AI locale (offline, gratis) o cloud (serve una chiave API tua).",
      },
    },
    {
      element: '[data-tour="settings-backup"]',
      popover: {
        title: "Backup",
        description: "Esporta o importa un backup JSON di tutti i tuoi dati quando vuoi.",
      },
    },
    {
      element: '[data-tour="settings-theme"]',
      popover: {
        title: "Aspetto",
        description: "Cambia il tema chiaro/scuro qui, oppure dal pulsante in alto a destra.",
      },
    },
  );

  return steps;
}
