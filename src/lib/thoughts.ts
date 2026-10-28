import { parseNote } from './frontmatter';
import { lineEnding } from './text';

// A rated note's own writing, apart from what sits at its top. The vault's album, film, book and
// podcast notes open with their properties, then a link to the year's overview and the cover,
// then what was thought of it: "[[00. Kino 2024 MOC]]\nAdam, a lonely man…". The media page edits
// only that last part, in place, and leaves every line above it as it was.

export interface NoteParts {
  /** The properties block as written, `---` lines and all, or `''` when the note has none. */
  properties: string;
  /** The lines under it that hold only links and embeds, with the blank lines among them. */
  links: string;
  /** Everything after: the note's own text, from the start of its first other line. */
  thoughts: string;
}

// A line of nothing but `[[links]]` and `![[embeds]]`.
const LINKS_ONLY = /^(?:\s*!?\[\[[^\]\r\n]+\]\])+\s*$/;

/** The note in its three parts; `properties + links + thoughts` is the note, exactly. */
export function splitThoughts(text: string): NoteParts {
  const { body } = parseNote(text);
  const start = text.length - body.length;
  let at = start;
  while (at < text.length) {
    const newline = text.indexOf('\n', at);
    const next = newline === -1 ? text.length : newline + 1;
    const line = text.slice(at, next).replace(/\r?\n$/, '');
    if (line.trim() && !LINKS_ONLY.test(line)) break;
    at = next;
  }
  return { properties: text.slice(0, start), links: text.slice(start, at), thoughts: text.slice(at) };
}

/** Why the thoughts weren't written: the note's text isn't what the page last saw. */
export const CHANGED_ELSEWHERE = "the note's text was changed somewhere else";

/**
 * The note with its thoughts rewritten from `before` (what the page last saw, or saved) to
 * `after`, every line above them as it is now: a rating set meanwhile stays set. Throws when the
 * note no longer ends with `before`, or (for a first thought) when it has gained text of its own:
 * the text changed somewhere else, and writing over it would lose that.
 *
 * A first thought under a link or a cover starts a paragraph of its own, after a blank line.
 */
export function replaceThoughts(text: string, before: string, after: string): string {
  const fresh = before ? text.endsWith(before) : splitThoughts(text).thoughts === '';
  if (!fresh) throw new Error(CHANGED_ELSEWHERE);
  if (after === before) return text;
  let head = text.slice(0, text.length - before.length);
  if (!after || before) return head + after;
  const separator = lineEnding(text) ?? '\n';
  if (head && !head.endsWith('\n')) head += separator;
  if (splitThoughts(text).links.trim() && !/\n[ \t]*\r?\n$/.test(head)) head += separator;
  return head + after;
}
