import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, HelpCircle, StickyNote } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Presentation, PresentationCodeBlock, PresentationSlide } from "@shared/schemas";
import { QuestionMarkdown } from "../shared/QuestionMarkdown";
import { LazyMonacoCodeEditor } from "../shared/LazyMonacoCodeEditor";
import { SlideErrorBoundary } from "./SlideErrorBoundary";

export interface PresentationPlayerProps {
  presentation: Presentation;
  /** Se la presentazione proviene dalla cache (nessuna nuova chiamata al provider AI): mostrato in modo discreto nell'header. */
  fromCache?: boolean;
  onClose: () => void;
}

/**
 * Player di presentazione a slide, una alla volta, sul contratto strutturato
 * `Presentation` (electron/shared/schemas.ts) già validato Zod: nessun
 * HTML/Markdown reveal.js richiesto al provider, solo componenti React che
 * renderizzano dati tipizzati. Nessuna dipendenza da provider AI/database:
 * riceve i dati via prop e vive di solo stato locale (slide corrente, note
 * visibili/nascoste). Il chiamante decide come mostrarlo (dialog/pagina/
 * modal) tramite `onClose`, stesso pattern di DuolingoQuiz.
 */
export function PresentationPlayer({ presentation, fromCache, onClose }: PresentationPlayerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [notesVisible, setNotesVisible] = useState(false);
  const slideHeadingRef = useRef<HTMLDivElement>(null);

  const total = presentation.slides.length;
  const currentSlide = presentation.slides[currentIndex]!;
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === total - 1;

  // Sposta il focus sul titolo della slide ad ogni navigazione (accessibilità
  // tastiera/screen reader). Solo il primissimo mount rimanda al frame
  // successivo per non competere con showModal() del dialog che lo ospita
  // (stessa cautela già presa in DuolingoQuiz.tsx, dove rimandare SEMPRE il
  // focus con requestAnimationFrame aveva causato un bug reale: la callback
  // poteva scattare mentre l'utente interagiva già con la slide successiva).
  const isFirstFocusRun = useRef(true);
  useEffect(() => {
    if (isFirstFocusRun.current) {
      isFirstFocusRun.current = false;
      const raf = requestAnimationFrame(() => slideHeadingRef.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
    slideHeadingRef.current?.focus();
  }, [currentIndex]);

  const goPrevious = () => setCurrentIndex((i) => Math.max(0, i - 1));
  const goNext = () => setCurrentIndex((i) => Math.min(total - 1, i + 1));

  // Escape è già gestito anche dal <dialog> nativo che ospita questo
  // componente (Modal.tsx: onCancel -> onClose); gestirlo anche qui rende il
  // comportamento testabile in isolamento e il componente robusto anche se
  // in futuro venisse usato fuori da un <dialog> (es. una pagina intera):
  // chiamare onClose due volte è innocuo (si limita a resettare la mutation).
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    // Un blocco di codice (sempre readOnly, ma Monaco permette comunque lo
    // spostamento del cursore/la selezione con le frecce): non deve far
    // avanzare/tornare indietro la slide sotto ai piedi dell'utente.
    if (target.closest(".monaco-editor")) return;
    if (event.key === "Escape") {
      onClose();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      goNext();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      goPrevious();
    }
  };

  return (
    <div className="flex h-[min(90vh,760px)] flex-col overflow-hidden" onKeyDown={handleKeyDown}>
      <PresentationHeader
        title={presentation.title}
        fromCache={fromCache}
        currentPosition={currentIndex + 1}
        total={total}
        notesAvailable={Boolean(currentSlide.speakerNotes)}
        notesVisible={notesVisible}
        onToggleNotes={() => setNotesVisible((v) => !v)}
        onClose={onClose}
      />

      <div className="flex-1 overflow-y-auto p-6 sm:p-10">
        <SlideErrorBoundary key={currentSlide.id}>
          <SlideContent slide={currentSlide} headingRef={slideHeadingRef} />
          {notesVisible && currentSlide.speakerNotes && (
            <div className="bg-base-200 rounded-box mx-auto mt-6 max-w-3xl p-3 text-sm">
              <p className="text-base-content/60 mb-1 flex items-center gap-1 text-xs font-medium">
                <StickyNote className="size-3" aria-hidden="true" />
                Note del relatore
              </p>
              <QuestionMarkdown>{currentSlide.speakerNotes}</QuestionMarkdown>
            </div>
          )}
        </SlideErrorBoundary>
      </div>

      <div className="border-base-200 flex shrink-0 items-center justify-between gap-3 border-t p-4 sm:p-6">
        <button
          type="button"
          className="btn btn-sm"
          disabled={isFirst}
          onClick={goPrevious}
          aria-label="Slide precedente"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Precedente
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={isLast}
          onClick={goNext}
          aria-label="Slide successiva"
        >
          Successiva
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function PresentationHeader({
  title,
  fromCache,
  currentPosition,
  total,
  notesAvailable,
  notesVisible,
  onToggleNotes,
  onClose,
}: {
  title: string;
  fromCache: boolean | undefined;
  currentPosition: number;
  total: number;
  notesAvailable: boolean;
  notesVisible: boolean;
  onToggleNotes: () => void;
  onClose: () => void;
}) {
  return (
    <div className="border-base-200 flex shrink-0 flex-col gap-2 border-b p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-circle"
          onClick={onClose}
          aria-label="Chiudi presentazione"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </button>
        <h2 className="flex-1 truncate text-base font-semibold">{title}</h2>
        {fromCache && <span className="badge badge-ghost badge-sm shrink-0">Da cache</span>}
        {notesAvailable && (
          <button
            type="button"
            className={cn("btn btn-sm shrink-0", notesVisible && "btn-active")}
            onClick={onToggleNotes}
            aria-pressed={notesVisible}
          >
            <StickyNote className="size-4" aria-hidden="true" />
            Note
          </button>
        )}
      </div>
      <div className="flex items-center gap-3">
        <progress
          className="progress progress-primary w-full"
          value={currentPosition}
          max={total}
          aria-label={`Slide ${currentPosition} di ${total}`}
        />
        <span className="text-base-content/60 shrink-0 text-xs">
          {currentPosition}/{total}
        </span>
      </div>
    </div>
  );
}

/** Considerata "non renderizzabile" solo nei casi in cui mostrarla darebbe una slide vuota/rotta, non semplicemente sparsa (es. una "content" senza bullet è valida). */
function isSlideRenderable(slide: PresentationSlide): boolean {
  if (!slide.title.trim()) return false;
  if (slide.type === "code" && (!slide.codeBlocks || slide.codeBlocks.length === 0)) return false;
  return true;
}

function SlideContent({
  slide,
  headingRef,
}: {
  slide: PresentationSlide;
  headingRef: RefObject<HTMLDivElement>;
}) {
  if (!isSlideRenderable(slide)) {
    return (
      <div
        ref={headingRef}
        tabIndex={-1}
        className="mx-auto flex max-w-3xl flex-col items-center gap-2 py-12 text-center outline-none"
      >
        <p className="text-base-content/70 font-medium">Questa slide non può essere visualizzata</p>
        <p className="text-base-content/50 text-sm">Usa i controlli per passare a un&apos;altra slide.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {slide.type === "quiz" && (
        <span className="badge badge-accent badge-sm w-fit gap-1">
          <HelpCircle className="size-3" aria-hidden="true" />
          Autoverifica
        </span>
      )}

      {/* Non un vero <h2>: react-markdown produce elementi di blocco (<p>, <ul>, ...)
          che non sono validi dentro un heading nativo (stesso vincolo già
          risolto in DuolingoQuiz.tsx). role="heading" espone comunque la
          semantica corretta per lo screen reader. */}
      <div
        ref={headingRef}
        tabIndex={-1}
        role="heading"
        aria-level={2}
        className={cn(
          "font-semibold outline-none",
          slide.type === "title" ? "text-center text-3xl" : "text-2xl",
        )}
      >
        <QuestionMarkdown>{slide.title}</QuestionMarkdown>
      </div>

      {slide.bullets.length > 0 && (
        <ul
          className={cn(
            "list-disc space-y-2 pl-6 text-lg",
            slide.type === "title" && "mx-auto max-w-xl list-none pl-0 text-center",
          )}
        >
          {slide.bullets.map((bullet, index) => (
            <li key={index}>
              <QuestionMarkdown>{bullet}</QuestionMarkdown>
            </li>
          ))}
        </ul>
      )}

      {slide.type === "code" && slide.codeBlocks && (
        <div className="flex flex-col gap-4">
          {slide.codeBlocks.map((block, index) => (
            <PresentationCodeBlockView key={index} block={block} />
          ))}
        </div>
      )}
    </div>
  );
}

function PresentationCodeBlockView({ block }: { block: PresentationCodeBlock }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-xs">
        {block.caption && <span className="text-base-content/60">{block.caption}</span>}
        <span className="badge badge-sm">{block.language}</span>
      </div>
      {/* Sempre readOnly e onChange no-op: la presentazione mostra codice, non lo fa modificare. */}
      <LazyMonacoCodeEditor value={block.code} language={block.language} readOnly onChange={() => {}} height="200px" />
    </div>
  );
}
