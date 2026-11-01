/** Image links stay in ordinary Markdown, but the money editor presents them as photos. */
export interface ExpensePhoto { target: string; raw: string; embed: string; start: number; end: number }
const EMBED = /!\[\[([^\]|#\r\n]+)(?:\|[^\]\r\n]*)?\]\]|!\[[^\]\r\n]*\]\(([^)\r\n]+)\)/g;
const IMAGE = /\.(?:png|jpe?g|gif|webp|svg)(?:[?#].*)?$/i;

export function expensePhotos(raw: string): ExpensePhoto[] {
  const found: ExpensePhoto[] = [];
  for (const match of raw.matchAll(EMBED)) {
    const target = (match[1] ?? match[2] ?? '').trim();
    if (!IMAGE.test(target)) continue;
    let start = match.index;
    let end = start + match[0].length;
    const lineStart = raw.lastIndexOf('\n', start - 1) + 1;
    const nextBreak = raw.indexOf('\n', end);
    const lineEnd = nextBreak < 0 ? raw.length : nextBreak;
    if (!raw.slice(lineStart, start).trim() && !raw.slice(end, lineEnd).trim()) {
      start = lineStart;
      end = nextBreak < 0 ? lineEnd : nextBreak + 1;
    }
    found.push({ target, raw: raw.slice(start, end), embed: match[0], start, end });
  }
  return found;
}

/** Visible text and boundaries into the source, leaving each hidden photo untouched. */
function projection(raw: string) {
  const photos = expensePhotos(raw);
  let text = '';
  const boundary = [0];
  let at = 0;
  for (const photo of photos) {
    while (at < photo.start) { text += raw[at]; at++; boundary.push(at); }
    at = photo.end;
    boundary[text.length] = at;
  }
  while (at < raw.length) { text += raw[at]; at++; boundary.push(at); }
  return { text, boundary, photos };
}

export const expenseText = (raw: string) => projection(raw).text;

/** Apply the user's text edit while carrying every hidden image link through the change. */
export function editExpenseText(raw: string, next: string): string {
  const before = projection(raw);
  if (before.text === next) return raw;
  let start = 0;
  while (start < before.text.length && start < next.length && before.text[start] === next[start]) start++;
  let tail = 0;
  while (tail < before.text.length - start && tail < next.length - start && before.text[before.text.length - 1 - tail] === next[next.length - 1 - tail]) tail++;
  const from = before.boundary[start] ?? raw.length;
  const to = before.boundary[before.text.length - tail] ?? raw.length;
  const selected = before.photos.filter((photo) => photo.start >= from && photo.end <= to);
  const left = raw.slice(0, from);
  const right = raw.slice(to);
  const replacement = next.slice(start, next.length - tail);
  const wrapped = selected.map((photo) => photo.raw).join('');
  const expected = before.photos.map((photo) => photo.embed);
  for (const candidate of [left + wrapped + replacement + right, left + replacement + wrapped + right, left + selected.map((photo) => photo.embed).join('') + replacement + right]) {
    const images = expensePhotos(candidate).map((photo) => photo.embed);
    if (expenseText(candidate) === next && images.length === expected.length && images.every((image, i) => image === expected[i])) return candidate;
  }
  // Literal image syntax typed into the reflection is left as typed; existing photos survive.
  return left + selected.map((photo) => photo.embed).join('') + replacement + right;
}

export function addExpensePhoto(raw: string, path: string): string {
  if (!path || /[\r\n[\]|#]/.test(path)) throw new Error('The photo name cannot be linked safely.');
  return `![[${path}]]${raw ? `\n${raw}` : ''}`;
}

/** Removes only the link, never the image file. */
export function removeExpensePhoto(raw: string, index: number): string {
  const photo = expensePhotos(raw)[index];
  return photo ? raw.slice(0, photo.start) + raw.slice(photo.end) : raw;
}
