// Locate the daily dashboard blocks in ordinary Markdown. Quoted fences end with
// their enclosing quote, and callout markers inside examples are literal text.
export function dailySections(lines: string[]) {
  const habits: { start: number; end: number }[] = [];
  let stream = -1;
  let openHabit: (typeof habits)[number] | undefined;
  let frontmatter = /^\uFEFF?---[ \t]*$/.test(lines[0] ?? '');
  let fence: { char: string; length: number; depth: number } | undefined;
  let comment = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    if (frontmatter) {
      if (i > 0 && /^---[ \t]*$/.test(raw)) frontmatter = false;
      continue;
    }
    const quote = /^[ \t]*(?:>[ \t]*)*/.exec(raw)![0];
    const depth = quote.split('>').length - 1;
    if (!depth) openHabit = undefined;
    if (openHabit) openHabit.end = i + 1;
    if (fence && depth < fence.depth) fence = undefined;
    const body = raw.slice(quote.length);
    const marker = /^(`{3,}|~{3,})(.*)$/.exec(body);
    if (fence) {
      if (marker && marker[1]![0] === fence.char && marker[1]!.length >= fence.length && !marker[2]!.trim()) fence = undefined;
      continue;
    }
    if (comment || raw.includes('<!--')) {
      if (raw.includes('-->') || raw.includes('<!--')) comment = raw.lastIndexOf('<!--') > raw.lastIndexOf('-->');
      continue;
    }
    if (marker) {
      fence = { char: marker[1]![0]!, length: marker[1]!.length, depth };
      continue;
    }
    if (depth === 1 && /^ {0,3}>/.test(raw) && /^\[!/.test(body)) {
      if (openHabit) openHabit.end = i;
      openHabit = /^\[!habits\]/i.test(body) ? { start: i, end: i + 1 } : undefined;
      if (openHabit) habits.push(openHabit);
    }
    if (stream < 0 && /^#{1,6}\s+stream of consc/i.test(raw)) stream = i;
  }
  return { habits, stream, frontmatter, unfinished: Boolean(fence || comment) };
}
