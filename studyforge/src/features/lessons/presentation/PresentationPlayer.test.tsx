import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PresentationPlayer } from "./PresentationPlayer";
import type { Presentation } from "@shared/schemas";

// Stesso motivo di DuolingoQuiz.test.tsx: il vero monaco-editor non è
// compatibile con jsdom ed è troppo pesante per un test unitario. Si mocka
// il modulo lazy-caricato con un elemento equivalente ai fini del
// comportamento testato (contenuto visibile, nessuna interazione richiesta:
// nella presentazione il codice è sempre readOnly).
vi.mock("../shared/MonacoCodeEditor", () => ({
  MonacoCodeEditor: ({ value }: { value: string }) => <pre data-testid="mock-monaco-editor">{value}</pre>,
}));

const PRESENTATION: Presentation = {
  version: 1,
  sourceLessonId: "lesson-1",
  title: "Ripasso: Limiti",
  generatedAt: new Date("2026-01-01T10:00:00.000Z").toISOString(),
  slides: [
    { id: "s1", type: "title", title: "Limiti e continuità", bullets: [] },
    {
      id: "s2",
      type: "content",
      title: "Cosa sono i limiti",
      bullets: [
        "Descrivono il comportamento vicino a un punto",
        "Non richiedono che la funzione sia definita nel punto",
      ],
      speakerNotes: "Ricorda l'esempio della funzione con un buco nel grafico.",
    },
    {
      id: "s3",
      type: "code",
      title: "Esempio in Python",
      bullets: ["Calcolo di un limite numerico approssimato"],
      codeBlocks: [
        {
          language: "python",
          code: "def f(x):\n    return (x**2 - 1) / (x - 1)",
          caption: "Limite per x -> 1",
        },
      ],
    },
    { id: "s4", type: "summary", title: "Riepilogo", bullets: ["Un limite è un valore di avvicinamento"] },
  ],
};

function renderPlayer(presentation: Presentation = PRESENTATION, onClose = vi.fn()) {
  const utils = render(<PresentationPlayer presentation={presentation} onClose={onClose} />);
  return { onClose, ...utils };
}

describe("PresentationPlayer - navigazione", () => {
  it("mostra la prima slide (1/4) e disabilita 'Precedente'", () => {
    renderPlayer();

    expect(screen.getByText("Limiti e continuità")).toBeInTheDocument();
    expect(screen.getAllByText("1/4").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /slide precedente/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /slide successiva/i })).toBeEnabled();
  });

  it("'Successiva' avanza alla slide successiva e abilita 'Precedente'", async () => {
    const user = userEvent.setup();
    renderPlayer();

    await user.click(screen.getByRole("button", { name: /slide successiva/i }));

    expect(screen.getByText("Cosa sono i limiti")).toBeInTheDocument();
    expect(screen.getAllByText("2/4").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /slide precedente/i })).toBeEnabled();
  });

  it("'Precedente' torna alla slide precedente", async () => {
    const user = userEvent.setup();
    renderPlayer();

    await user.click(screen.getByRole("button", { name: /slide successiva/i }));
    await user.click(screen.getByRole("button", { name: /slide precedente/i }));

    expect(screen.getByText("Limiti e continuità")).toBeInTheDocument();
    expect(screen.getAllByText("1/4").length).toBeGreaterThan(0);
  });

  it("disabilita 'Successiva' sull'ultima slide", async () => {
    const user = userEvent.setup();
    renderPlayer();

    for (let i = 0; i < 3; i++) {
      await user.click(screen.getByRole("button", { name: /slide successiva/i }));
    }

    expect(screen.getByText("Riepilogo")).toBeInTheDocument();
    expect(screen.getAllByText("4/4").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /slide successiva/i })).toBeDisabled();
  });
});

describe("PresentationPlayer - tastiera", () => {
  // Bersaglio stabile e univoco per fireEvent.keyDown: il titolo della slide
  // usa role="heading" ma l'header ha anche un <h2> nativo (livello 2 per
  // default), quindi "heading" da solo è ambiguo. Il bottone "Chiudi" è
  // sempre presente, mai disabilitato, invariato su ogni slide: gli eventi
  // tastiera ci arrivano comunque per bubbling verso il div radice in
  // ascolto (onKeyDown), indipendentemente da chi ha davvero il focus.
  const keyTarget = () => screen.getByRole("button", { name: /chiudi presentazione/i });

  it("ArrowRight/ArrowLeft navigano tra le slide", () => {
    renderPlayer();

    fireEvent.keyDown(keyTarget(), { key: "ArrowRight" });
    expect(screen.getByText("Cosa sono i limiti")).toBeInTheDocument();

    fireEvent.keyDown(keyTarget(), { key: "ArrowLeft" });
    expect(screen.getByText("Limiti e continuità")).toBeInTheDocument();
  });

  it("ArrowRight non oltrepassa l'ultima slide", () => {
    renderPlayer();

    for (let i = 0; i < 5; i++) {
      fireEvent.keyDown(keyTarget(), { key: "ArrowRight" });
    }

    expect(screen.getByText("Riepilogo")).toBeInTheDocument();
    expect(screen.getAllByText("4/4").length).toBeGreaterThan(0);
  });

  it("Escape chiude la presentazione", () => {
    const { onClose } = renderPlayer();

    fireEvent.keyDown(keyTarget(), { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("PresentationPlayer - chiusura", () => {
  it("il pulsante di chiusura nell'header chiama onClose", async () => {
    const user = userEvent.setup();
    const { onClose } = renderPlayer();

    await user.click(screen.getByRole("button", { name: /chiudi presentazione/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("PresentationPlayer - slide con codice", () => {
  it("mostra linguaggio, caption e codice tramite l'editor (readOnly)", async () => {
    const user = userEvent.setup();
    renderPlayer();

    await user.click(screen.getByRole("button", { name: /slide successiva/i }));
    await user.click(screen.getByRole("button", { name: /slide successiva/i }));

    expect(screen.getByText("Esempio in Python")).toBeInTheDocument();
    expect(screen.getByText("python")).toBeInTheDocument();
    expect(screen.getByText("Limite per x -> 1")).toBeInTheDocument();
    expect(screen.getByTestId("mock-monaco-editor")).toHaveTextContent(/return \(x\*\*2 - 1\)/);
  });
});

describe("PresentationPlayer - note del relatore", () => {
  it("le note sono nascoste per default e mostrabili con il comando esplicito 'Note'", async () => {
    const user = userEvent.setup();
    renderPlayer();

    await user.click(screen.getByRole("button", { name: /slide successiva/i }));
    expect(screen.queryByText(/esempio della funzione con un buco/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^note$/i }));
    expect(screen.getByText(/esempio della funzione con un buco/i)).toBeInTheDocument();
  });

  it("il comando 'Note' non appare su una slide senza speakerNotes", () => {
    renderPlayer();
    expect(screen.queryByRole("button", { name: /^note$/i })).not.toBeInTheDocument();
  });
});

describe("PresentationPlayer - stato vuoto/fallback", () => {
  it("una slide non renderizzabile (titolo vuoto) mostra un fallback invece di andare in crash", () => {
    const brokenPresentation: Presentation = {
      ...PRESENTATION,
      slides: [
        { id: "broken", type: "content", title: " ", bullets: ["qualcosa"] },
        PRESENTATION.slides[1]!,
        PRESENTATION.slides[2]!,
      ],
    };

    expect(() => renderPlayer(brokenPresentation)).not.toThrow();
    expect(screen.getByText("Questa slide non può essere visualizzata")).toBeInTheDocument();
  });
});

describe("PresentationPlayer - cache", () => {
  it("mostra il badge 'Da cache' quando fromCache è true", () => {
    render(<PresentationPlayer presentation={PRESENTATION} fromCache onClose={vi.fn()} />);
    expect(screen.getByText("Da cache")).toBeInTheDocument();
  });
});
