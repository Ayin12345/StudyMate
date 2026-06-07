const MAX_CHARS = 2000; // ~500 tokens at 4 chars/token
const SEPARATORS = ['\n\n', '\n', '. ', ' '];

export function chunkText(text: string): string[] {
  return split(text.trim(), SEPARATORS);
}

function split(text: string, separators: string[]): string[] {
  if (!text) return [];
  if (text.length <= MAX_CHARS) return [text];

  const [sep, ...rest] = separators;

  if (sep === undefined) {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += MAX_CHARS) {
      chunks.push(text.slice(i, i + MAX_CHARS));
    }
    return chunks;
  }

  const pieces = text.split(sep).filter(p => p.trim().length > 0);

  if (pieces.length <= 1) {
    return split(text, rest);
  }

  const chunks: string[] = [];
  let current = '';

  for (const piece of pieces) {
    const appended = current ? `${current}${sep}${piece}` : piece;
    if (appended.length <= MAX_CHARS) {
      current = appended;
    } else {
      if (current) chunks.push(current.trim());
      if (piece.length > MAX_CHARS) {
        chunks.push(...split(piece, rest));
        current = '';
      } else {
        current = piece;
      }
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
