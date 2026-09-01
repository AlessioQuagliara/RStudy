import { describe, expect, it } from "vitest";
import { computeSourceContentHash, normalizeLessonContent } from "./contentHash";

describe("normalizeLessonContent", () => {
  it("collassa spazi/tab ripetuti e righe vuote multiple", () => {
    const raw = "Titolo\n\n\n\nParagrafo   con   spazi\t\tmultipli\n";
    expect(normalizeLessonContent(raw)).toBe("Titolo\n\nParagrafo con spazi multipli");
  });

  it("uniforma i fine riga CRLF a LF", () => {
    expect(normalizeLessonContent("riga1\r\nriga2\r\n")).toBe("riga1\nriga2");
  });

  it("rimuove spazi finali/iniziali per riga e a inizio/fine testo", () => {
    expect(normalizeLessonContent("  ciao mondo  \n  seconda riga  ")).toBe(
      "ciao mondo\nseconda riga",
    );
  });
});

describe("computeSourceContentHash", () => {
  it("è deterministico: stesso input produce lo stesso hash", () => {
    const text = "I puntatori memorizzano indirizzi di memoria.";
    expect(computeSourceContentHash(text)).toBe(computeSourceContentHash(text));
  });

  it("produce lo stesso hash per contenuti equivalenti dopo la normalizzazione", () => {
    const a = "Riga uno\nRiga due";
    const b = "Riga uno   \r\nRiga due\r\n";
    expect(computeSourceContentHash(a)).toBe(computeSourceContentHash(b));
  });

  it("produce lo stesso hash quando cambia solo il numero di righe vuote tra due paragrafi", () => {
    const a = "Paragrafo uno\n\nParagrafo due";
    const b = "Paragrafo uno\n\n\n\n\nParagrafo due";
    expect(computeSourceContentHash(a)).toBe(computeSourceContentHash(b));
  });

  it("produce hash diversi per contenuti semanticamente diversi", () => {
    const a = computeSourceContentHash("I puntatori memorizzano indirizzi di memoria.");
    const b = computeSourceContentHash("Le variabili memorizzano valori.");
    expect(a).not.toBe(b);
  });

  it("produce lo stesso hash indipendentemente dalla forma di normalizzazione Unicode (NFC/NFD)", () => {
    const nfc = "università perché".normalize("NFC");
    const nfd = "università perché".normalize("NFD");
    expect(computeSourceContentHash(nfc)).toBe(computeSourceContentHash(nfd));
  });

  it("restituisce un hash esadecimale SHA-256 (64 caratteri)", () => {
    const hash = computeSourceContentHash("contenuto qualsiasi");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
