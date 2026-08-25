export interface Chunk {
  content: string;
  chunkIndex: number;
}

export interface ChunkOptions {
  /** Dimensione target in caratteri (approssima 700-1000 token). */
  targetChars?: number;
  /** Overlap in caratteri tra chunk consecutivi (approssima 100-150 token). */
  overlapChars?: number;
}

const DEFAULTS: Required<ChunkOptions> = {
  targetChars: 3200, // ~ 700-900 token
  overlapChars: 500, // ~ 100-150 token
};

/**
 * Suddivide un testo normalizzato in chunk con overlap, spezzando su confini
 * di paragrafo quando possibile per non tagliare frasi a metà.
 */
export function chunkText(text: string, options: ChunkOptions = {}): Chunk[] {
  const { targetChars, overlapChars } = { ...DEFAULTS, ...options };
  const clean = text.replace(/\s+/g, (m) => (m.includes("\n\n") ? "\n\n" : " ")).trim();
  if (!clean) return [];

  const paragraphs = clean.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  const chunks: Chunk[] = [];
  let buffer = "";

  const pushBuffer = () => {
    const content = buffer.trim();
    if (content.length > 0) {
      chunks.push({ content, chunkIndex: chunks.length });
    }
  };

  for (const paragraph of paragraphs) {
    if ((buffer + "\n\n" + paragraph).length <= targetChars) {
      buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
      continue;
    }

    if (buffer) pushBuffer();

    if (paragraph.length <= targetChars) {
      buffer = paragraph;
    } else {
      // Paragrafo troppo lungo: spezza per lunghezza con overlap.
      let start = 0;
      while (start < paragraph.length) {
        const end = Math.min(start + targetChars, paragraph.length);
        chunks.push({ content: paragraph.slice(start, end).trim(), chunkIndex: chunks.length });
        if (end >= paragraph.length) break;
        start = end - overlapChars;
      }
      buffer = "";
    }
  }
  if (buffer) pushBuffer();

  // Applica overlap tra chunk risultanti dal raggruppamento per paragrafi.
  if (chunks.length <= 1 || overlapChars <= 0) return chunks;
  const withOverlap: Chunk[] = [chunks[0]!];
  for (let i = 1; i < chunks.length; i++) {
    const prev = chunks[i - 1]!.content;
    const overlapText = prev.slice(Math.max(0, prev.length - overlapChars));
    const current = chunks[i]!;
    withOverlap.push({
      content: `${overlapText ? overlapText + "\n\n" : ""}${current.content}`,
      chunkIndex: i,
    });
  }
  return withOverlap;
}
