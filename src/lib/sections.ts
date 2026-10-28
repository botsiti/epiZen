import { lineEnding } from './text';

// A weekly note's Plus, Minus and Next, read and written as the vault's Obsidian weekly dashboard
// does (Templates/Scripts/rpg-week.js, extractSection and replaceSection):
//
//   #### Plus
//   Shipped on Friday, and slept before midnight.
//   #### Minus
//
// A section is the lines under a `###`–`######` heading of that name, up to the next heading. The
// vault's template has two `#### Plus` headings (the first holds "Goals") and a lone `-` under each
// heading; neither counts as words. Reading joins every section of that name, a blank line between.

export type WeekHeading = 'Plus' | 'Minus' | 'Next';
export const WEEK_HEADINGS: readonly WeekHeading[] = ['Plus', 'Minus', 'Next'];

const HEADING = /^#{1,6}\s/;

/** Each section of that name: its heading's line and the line after its last one. */
function sectionsOf(lines: string[], name: WeekHeading) {
  const heading = new RegExp(`^#{3,6}\\s+${name}\\s*$`, 'i');
  const found: { heading: number; end: number }[] = [];
  lines.forEach((line, i) => {
    if (!heading.test(line.trim())) return;
    let end = i + 1;
    while (end < lines.length && !HEADING.test(lines[end] ?? '')) end += 1;
    found.push({ heading: i, end });
  });
  return found;
}

/** A section's words: each line trimmed, without blank lines, the template's `-` or its "Goals". */
export const sectionWords = (text: string) =>
  text
    .split('\n')
    .map((line) => line.replace(/\r$/, '').trim())
    .filter((line) => line && line !== '-' && line.toLowerCase() !== 'goals')
    .join('\n');

/** What a weekly note says under a heading: every section of that name, a blank line between them. */
export function readSection(text: string, name: WeekHeading): string {
  const lines = text.split('\n').map((line) => line.replace(/\r$/, ''));
  return sectionsOf(lines, name)
    .map(({ heading, end }) => sectionWords(lines.slice(heading + 1, end).join('\n')))
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Puts `value` under the heading: the section's lines become the value's lines, trimmed, as the
 * Obsidian dashboard's Save writes them. The section written is the one with words in it, or the
 * first; two with words in them are left to the editor. A note without the heading gets it at its
 * end. Every other line stays as it was, the note's last line break too.
 */
export function writeSection(text: string, name: WeekHeading, value: string): string {
  const eol = lineEnding(text);
  if (!eol) throw new Error("This note mixes line endings, so Epizen won't change it.");
  const clean = value.trim();
  const replacement = clean ? clean.split(/\r?\n/) : [];
  if (replacement.some((line) => HEADING.test(line.trim()))) throw new Error(`A line starting with # would read as a new heading, not as ${name}.`);
  const lines = text.split(eol);
  const found = sectionsOf(lines, name);
  if (!found.length) {
    const block = `#### ${name}${eol}${replacement.join(eol)}${eol}`;
    if (!text) return block;
    const last = text.endsWith(eol) ? (lines.at(-2) ?? '') : (lines.at(-1) ?? '');
    return `${text}${text.endsWith(eol) ? '' : eol}${last.trim() ? eol : ''}${block}`;
  }
  const filled = found.filter(({ heading, end }) => sectionWords(lines.slice(heading + 1, end).join('\n')));
  if (filled.length > 1) throw new Error(`This note has ${filled.length} ${name} sections with words in them, so Epizen leaves them to the editor.`);
  const target = filled[0] ?? found[0];
  if (!target) throw new Error(`This note has no ${name} heading.`);
  // The empty text after the note's last line break is no line of the section.
  const end = target.end === lines.length && lines.at(-1) === '' && target.end - 1 > target.heading ? target.end - 1 : target.end;
  lines.splice(target.heading + 1, end - target.heading - 1, ...replacement);
  return lines.join(eol);
}
