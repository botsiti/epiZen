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
 * What a first thought needs before it in this note: a line break if the note's last line has
 * none, and a blank line under a link or a cover, so it reads as a paragraph of its own. The page
 * writes it with the thought and takes it away with it, so a thought typed and erased leaves the
 * note as it was.
 */
export function firstThoughtLead(text: string): string {
  const separator = lineEnding(text) ?? '\n';
  let lead = text && !text.endsWith('\n') ? separator : '';
  if (splitThoughts(text).links.trim() && !/\n[ \t]*\r?\n$/.test(text + lead)) lead += separator;
  return lead;
}

/**
 * The note with the end the page owns rewritten from `before` to `after`. That end is the text as
 * the page last saw or saved it, with a first thought's lead (`firstThoughtLead`). Every line above
 * it stays as it is now, so a rating set meanwhile stays set.
 *
 * Throws when the note no longer ends with `before`, or has text of its own above it: the text was
 * changed somewhere else, and writing would lose that or mix it in.
 */
export function replaceThoughts(text: string, before: string, after: string): string {
  const head = text.slice(0, text.length - before.length);
  if (!text.endsWith(before) || splitThoughts(head).thoughts !== '') throw new Error(CHANGED_ELSEWHERE);
  return head + after;
}
