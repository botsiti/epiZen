import { parseDay, planDone } from './day';
import { lineEnding } from './text';

// The two changes a periodic page makes besides ticking a box. Each returns the note's new text,
// with every line it didn't mean to change byte for byte as it was, or throws and changes nothing.

const KEY = /^[\w-]+$/;

/**
 * Sets one property in the note's frontmatter: rewrites its `key: value` line, or adds the line
 * at the end of the block when the note doesn't have it. A value written over several lines (a
 * list) is left alone, and so is a note without frontmatter. `''` empties the value.
 */
export function setProperty(text: string, key: string, value: string): string {
  if (!KEY.test(key)) throw new Error(`“${key}” isn't a property name Epizen writes.`);
  if (/[\r\n]/.test(value)) throw new Error('A property value is one line.');
  const lines = text.split('\n');
  if ((lines[0] ?? '').replace(/\r$/, '') !== '---') throw new Error('This note has no properties.');
  const close = lines.findIndex((line, i) => i > 0 && /^---[ \t]*\r?$/.test(line));
  if (close < 0) throw new Error("This note's properties never close.");
  const cr = (line: string) => (line.endsWith('\r') ? '\r' : '');
  const written = (line: string) => `${key}:${value ? ` ${value}` : ''}${cr(line)}`;

  const at = lines.findIndex((line, i) => i > 0 && i < close && new RegExp(`^${key}[ \\t]*:`).test(line));
  if (at < 0) {
    lines.splice(close, 0, written(lines[close] ?? ''));
    return lines.join('\n');
  }
  // A value carried on to indented lines (a list, a folded string) is more than one line to rewrite.
  if (at + 1 < close && /^[ \t]+\S|^-[ \t]/.test(lines[at + 1] ?? '')) {
    throw new Error(`“${key}” holds more than one line, so Epizen leaves it to the editor.`);
  }
  const current = lines[at] ?? '';
  if (/^[ \t]*[|>[{]/.test(current.slice(current.indexOf(':') + 1))) throw new Error(`“${key}” isn't a plain value, so Epizen leaves it to the editor.`);
  lines[at] = written(current);
  return lines.join('\n');
}

const TASK = /^[ \t]*[-*+][ \t]+\[[ xX]\]/;
const EMPTY_TASK = /^[ \t]*[-*+][ \t]+\[ \][ \t]*\r?$/;

/**
 * Adds `- [ ] #daily/<category> — <words>` to the note's Tasks section, after its last task and
 * the time listed under it. The template's empty `- [ ] ` is filled in rather than left above it.
 * With `minutes` (0 too, for a task the timer or the calendar is about to log time on) the line
 * ends in `[minutes::N]`.
 */
export function addTask(text: string, categoryName: string, words: string, minutes?: number): string {
  const category = categoryName.trim().toLowerCase();
  const label = words.trim();
  if (!KEY.test(category)) throw new Error('A category is one word, like code or sport.');
  if (!label) throw new Error('Say what the task is.');
  if (/[\r\n]/.test(label)) throw new Error('A task is one line.');
  const eol = lineEnding(text);
  if (!eol) throw new Error("This note mixes line endings, so Epizen won't add to it.");
  const lines = text.split(eol);
  const heading = lines.findIndex((line) => /^#{1,6}[ \t]+Tasks[ \t]*$/i.test(line));
  if (heading < 0) throw new Error('This note has no Tasks heading to add to.');

  // The section's last task, and the lines indented under it.
  let last = heading;
  for (let i = heading + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (/^#{1,6}[ \t]/.test(line)) break;
    if (TASK.test(line) || (last > heading && /^[ \t]+\S/.test(line))) last = i;
    else if (line.trim()) break;
  }
  const task = `- [ ] #daily/${category} — ${label}${minutes !== undefined && minutes >= 0 ? ` [minutes::${Math.round(minutes)}]` : ''}`;
  if (last > heading && EMPTY_TASK.test(lines[last] ?? '')) lines[last] = task;
  else lines.splice(last + 1, 0, task);
  return lines.join(eol);
}

/**
 * Writes the day's plan done (the share of its tasks ticked) into its `done` property, as the
 * vault keeps it, after a change to its tasks. A note without properties, or whose `done` isn't a
 * plain value, is left as it is: the page shows the share either way.
 */
export function syncPlanDone(text: string): string {
  try {
    return setProperty(text, 'done', String(planDone(parseDay(text).tasks)));
  } catch {
    return text;
  }
}

const TLDR = /^>\s*\[!tldr\]/i;

/**
 * Sets the day's summary: the text of its `[!tldr]` callout, each line quoted, under the callout's
 * own title line. A note without the callout gets one after its properties. `''` empties it.
 */
export function setSummary(text: string, summary: string): string {
  const eol = lineEnding(text);
  if (!eol) throw new Error("This note mixes line endings, so Epizen won't change it.");
  const lines = text.split(eol);
  const body = summary
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line, i, all) => line || (i > 0 && i < all.length - 1))
    .map((line) => (line ? `> ${line}` : '>'));
  const quoted = body.length ? body : ['> '];
  const at = lines.findIndex((line) => TLDR.test(line));
  if (at >= 0) {
    let end = at + 1;
    while (end < lines.length && (lines[end] ?? '').startsWith('>')) end += 1;
    lines.splice(at + 1, end - at - 1, ...quoted);
    return lines.join(eol);
  }
  // After the properties, or at the very top.
  let top = 0;
  if ((lines[0] ?? '') === '---') {
    const close = lines.findIndex((line, i) => i > 0 && /^---[ \t]*$/.test(line));
    if (close > 0) top = close + 1;
  }
  lines.splice(top, 0, ...(top ? [''] : []), '> [!tldr]+ **Summary of the day:**', ...quoted, ...(top ? [] : ['']));
  return lines.join(eol);
}
