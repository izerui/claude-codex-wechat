export const MAX_TEXT_LENGTH = 4_000;

/** Split at paragraph, line, or word boundaries before falling back to a hard split. */
export function chunkText(text: string, limit = MAX_TEXT_LENGTH): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    const window = remaining.slice(0, limit);
    let splitAt = -1;
    for (const separator of ['\n\n', '\n', ' ']) {
      const index = window.lastIndexOf(separator);
      if (index > limit * 0.3) {
        splitAt = index + separator.length;
        break;
      }
    }
    if (splitAt === -1) {
      splitAt = limit;
      // Do not split a UTF-16 surrogate pair.
      const unit = remaining.charCodeAt(splitAt - 1);
      if (unit >= 0xD800 && unit <= 0xDBFF) splitAt--;
    }
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
