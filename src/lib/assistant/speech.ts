/** Complete Unicode-safe chunks, small enough for bounded speech generation and quick cancellation. */
export function speechChunks(text: string, limit = 1200): string[] {
  if (!Number.isInteger(limit) || limit < 32 || limit > 1200) throw new Error('Invalid speech chunk size.');
  const points = Array.from(text), chunks: string[] = [];
  for (let start = 0; start < points.length;) {
    let end = Math.min(start + limit, points.length);
    if (end < points.length) {
      for (let index = end - 1; index >= start + Math.floor(limit / 2); index--) {
        if (/[\s.!?。！？]/u.test(points[index]!)) { end = index + 1; break; }
      }
    }
    chunks.push(points.slice(start, end).join('')); start = end;
  }
  return chunks;
}
