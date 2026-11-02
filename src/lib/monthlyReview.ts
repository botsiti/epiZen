import { SPHERES, type Sphere } from './categories';
import { lineEnding } from './text';

/** These sections are ordinary Markdown, independent of Obsidian plugins. */
export type MonthlyField = 'summary' | 'decisions' | 'spending' | 'expenses' | `sphere:${Sphere}`;
export const monthlyFields: MonthlyField[] = ['summary', 'decisions', 'spending', 'expenses', ...SPHERES.map(({ name }): MonthlyField => `sphere:${name}`)];

export function monthlyHeading(field: MonthlyField): string {
  if (field === 'summary') return 'Monthly reflection';
  if (field === 'expenses') return 'Expenses and finances';
  if (field === 'decisions') return 'Decisions';
  if (field === 'spending') return 'Monthly spending';
  return `Life area: ${field.slice('sphere:'.length)}`;
}

interface Span { heading: number; end: number; bodyEnd: number }
const startsFrontmatter = (lines: string[]) => lines[0] === '---' || lines[0] === '\uFEFF---';

function commentContinues(line: string, open: boolean): boolean {
  let at = 0;
  while (true) {
    const token = open ? '-->' : '<!--';
    const found = line.indexOf(token, at);
    if (found < 0) return open;
    open = !open;
    at = found + token.length;
  }
}

/** Scan only real Markdown headings, never headings inside a fenced code block. */
function sections(lines: string[], title: string, level = 2, stopAt = level): Span[] {
  let fence: { char: string; length: number } | undefined;
  let comment = false;
  const frontmatterEnd = startsFrontmatter(lines) ? lines.findIndex((line, i) => i > 0 && /^---[ \t]*$/.test(line)) : -1;
  let open: number | undefined;
  const spans: Span[] = [];
  const close = (end: number) => {
    if (open === undefined) return;
    let bodyEnd = end;
    while (bodyEnd > open + 1 && !(lines[bodyEnd - 1] ?? '').trim()) bodyEnd--;
    // Keep one separator (or the final newline) outside the editable body. Additional blank
    // lines belong to the section, so a draft ending in newlines round-trips without growing.
    if (bodyEnd < end) bodyEnd = end - 1;
    spans.push({ heading: open, end, bodyEnd });
    open = undefined;
  };
  lines.forEach((line, i) => {
    if (frontmatterEnd >= 0 && i <= frontmatterEnd) return;
    if (comment) { comment = commentContinues(line, true); return; }
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = { char: marker[0]!, length: marker.length };
      else if (marker[0] === fence.char && marker.length >= fence.length) fence = undefined;
      return;
    }
    if (fence) return;
    if (line.includes('<!--')) { comment = commentContinues(line, false); return; }
    const heading = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
    if (!heading) return;
    const depth = heading[1]?.length ?? 0;
    if (depth <= stopAt) close(i);
    if (depth === level && heading[2]?.trim().toLowerCase() === title.toLowerCase()) open = i;
  });
  close(lines.length);
  return spans;
}

/** Obsidian's existing dashboard uses level-three sections and one line per life area. */
function legacySections(lines: string[], title: string): Span[] {
  return [...sections(lines, title, 2, 6), ...sections(lines, title, 3, 6)].sort((a, b) => a.heading - b.heading);
}

function legacySphere(lines: string[], field: MonthlyField, eol: string): MonthlySection | undefined {
  if (!field.startsWith('sphere:')) return undefined;
  const areas = legacySections(lines, 'Spheres of Life');
  if (areas.length > 1) return { value: '', snapshot: '', problem: 'This note has more than one Spheres of Life section. Edit it in the note editor.' };
  const area = areas[0];
  if (!area) return undefined;
  const name = field.slice('sphere:'.length);
  const entries: { line: number; raw: string }[] = [];
  for (let i = area.heading + 1; i < area.end; i++) {
    const line = lines[i] ?? '';
    const match = /^\s*[-*+]\s+([^:]+):/.exec(line);
    if (match?.[1]?.trim() === name) entries.push({ line: i, raw: line });
  }
  if (entries.length > 1) return { value: '', snapshot: '', problem: `This note has more than one ${name} rating. Edit it in the note editor.` };
  const entry = entries[0];
  const snapshot = `legacy-sphere:${lines[area.heading]}${eol}${entry?.raw ?? '<absent>'}`;
  if (!entry) return { value: '', snapshot };
  const match = /^\s*[-*+]\s+[^:]+:\s*(10|[0-9])(?:\s*[—-]\s*(.*))?\s*$/.exec(entry.raw);
  if (!match) return { value: '', snapshot, problem: `The ${name} rating has an unfamiliar format. Edit it in the note editor.` };
  const next = lines.slice(entry.line + 1, area.end).find((line) => line.trim()) ?? '';
  const indentation = (line: string) => /^\s*/.exec(line)?.[0].length ?? 0;
  if (next && indentation(next) > indentation(entry.raw)) return { value: '', snapshot, problem: `The ${name} rating has nested text. Edit it in the note editor.` };
  return { value: sphereValue(match[1] ?? '', match[2]?.trim() ?? ''), snapshot };
}

/** Refuse to add content inside an unfinished frontmatter block, fence or HTML comment. */
function structureProblem(lines: string[]): string | undefined {
  const frontmatterEnd = startsFrontmatter(lines) ? lines.findIndex((line, i) => i > 0 && /^---[ \t]*$/.test(line)) : -1;
  if (startsFrontmatter(lines) && frontmatterEnd < 0) return 'This note has unclosed frontmatter. Edit it in the note editor.';
  let fence: { char: string; length: number } | undefined;
  let comment = false;
  for (let i = frontmatterEnd + 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (comment) { comment = commentContinues(line, true); continue; }
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = { char: marker[0]!, length: marker.length };
      else if (marker[0] === fence.char && marker.length >= fence.length) fence = undefined;
    } else if (!fence && line.includes('<!--')) comment = commentContinues(line, false);
  }
  if (fence) return 'This note has an unclosed code fence. Edit it in the note editor.';
  if (comment) return 'This note has an unclosed comment. Edit it in the note editor.';
  return undefined;
}

export interface MonthlySection {
  value: string;
  /** Exact body as displayed, used to reject an outside edit to the same section. */
  snapshot: string;
  problem?: string;
}

export function readMonthlySection(text: string, field: MonthlyField): MonthlySection {
  const eol = lineEnding(text);
  if (!eol) return { value: '', snapshot: '', problem: 'This note has mixed line endings. Edit it in the note editor.' };
  const lines = text.split(eol);
  const problem = structureProblem(lines);
  if (problem) return { value: '', snapshot: '', problem };
  const spans = sections(lines, monthlyHeading(field));
  if (spans.length > 1) return { value: '', snapshot: '', problem: `This note has more than one ${monthlyHeading(field)} section. Edit it in the note editor.` };
  const span = spans[0];
  if (!span) {
    const sphere = legacySphere(lines, field, eol);
    if (sphere) return sphere;
    // The Obsidian dashboard stores prose and expenses in ordinary level-three sections.
    // A Dataview block is not a reflection and must never be replaced by this editor.
    const legacy = field === 'summary' ? legacySections(lines, 'Month Summary') : field === 'expenses' ? (legacySections(lines, 'Expenses').length ? legacySections(lines, 'Expenses') : legacySections(lines, 'Finance')) : field === 'decisions' ? [...legacySections(lines, 'Decisions'), ...legacySections(lines, 'Decisions & Important')] : [];
    if (legacy.length > 1) return { value: '', snapshot: '', problem: 'This note has duplicate sections. Edit it in the note editor.' };
    if (legacy.length === 1) {
      const old = legacy[0]!;
      const body = lines.slice(old.heading + 1, old.bodyEnd).join(eol);
      if (field !== 'summary' || !/^ {0,3}(?:`{3,}|~{3,})/m.test(body)) return { value: body.replace(/\r\n/g, '\n'), snapshot: `legacy:${lines.slice(old.heading, old.bodyEnd).join(eol)}` };
    }
    return { value: '', snapshot: '' };
  }
  // A separately managed legacy subsection inside one of these sections must never be swallowed
  // by a whole-section edit. Leave that unusual layout to the note editor.
  const nested = ['Month Summary', 'Expenses', 'Finance', 'Decisions', 'Decisions & Important', 'Spheres of Life'].some((title) =>
    sections(lines, title, 3, 6).some((item) => item.heading > span.heading && item.heading < span.end),
  );
  if (nested) return { value: '', snapshot: '', problem: `This ${monthlyHeading(field)} section contains another monthly section. Edit it in the note editor.` };
  const body = lines.slice(span.heading + 1, span.bodyEnd).join(eol);
  // Include the heading as well, so adding/removing an empty section is a conflict too.
  return { value: body.replace(/\r\n/g, '\n'), snapshot: lines.slice(span.heading, span.bodyEnd).join(eol) };
}

/** Replace exactly one section, conditional on it still matching the one shown to the user. */
export function writeMonthlySection(text: string, field: MonthlyField, value: string, expected: string): string {
  const eol = lineEnding(text);
  if (!eol) throw new Error('This note has mixed line endings.');
  if (/\r(?!\n)/.test(value)) throw new Error('The text contains an unsupported line ending.');
  const normalized = value.replace(/\r\n/g, '\n');
  if (field === 'spending') readSpending(normalized);
  // A top-level heading would end this section and could turn the rest into unrelated content.
  const contentLines = normalized.split('\n');
  const contentProblem = structureProblem(contentLines);
  if (contentProblem) throw new Error(contentProblem.replace('This note', 'This draft'));
  let fence: { char: string; length: number } | undefined;
  for (const line of contentLines) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = { char: marker[0]!, length: marker.length };
      else if (marker[0] === fence.char && marker.length >= fence.length) fence = undefined;
    } else if (!fence && (expected.startsWith('legacy:') ? /^ {0,3}#{1,6}[ \t]/ : /^ {0,3}#{1,2}[ \t]/).test(line)) throw new Error(expected.startsWith('legacy:') ? 'Headings end this existing section; use plain text or the note editor.' : 'Use headings of level 3 or deeper inside this section.');
  }
  const before = readMonthlySection(text, field);
  if (before.problem) throw new Error(before.problem);
  if (before.snapshot !== expected) throw new Error('This section changed outside Epizen. Your draft is still available for recovery.');
  if (before.value === normalized) return text;
  const lines = text.split(eol);
  if (expected.startsWith('legacy-sphere:') && field.startsWith('sphere:')) {
    const area = legacySections(lines, 'Spheres of Life')[0];
    if (!area) throw new Error('The life-area section changed outside Epizen.');
    const name = field.slice('sphere:'.length);
    const index = lines.findIndex((line, i) => i > area.heading && i < area.end && /^\s*[-*+]\s+([^:]+):/.exec(line)?.[1]?.trim() === name);
    const { rating, notes } = readSphere(normalized);
    if (notes.includes('\n')) throw new Error('This existing life-area format keeps each reflection on one line.');
    if (!rating && notes) throw new Error('Choose a rating before saving this existing life-area reflection.');
    if (!rating) { if (index >= 0) lines.splice(index, 1); }
    else {
      const original = index >= 0 ? /^(\s*[-*+]\s*[^:]+:\s*)(10|[0-9])(?:(\s*[—-]\s*)(.*?))?(\s*)$/.exec(lines[index] ?? '') : undefined;
      const oldNotes = (original?.[4] ?? '').trim();
      const suffix = original && notes === oldNotes ? `${original[3] ?? ''}${original[4] ?? ''}${original[5] ?? ''}` : notes ? `${original?.[3] ?? ' — '}${notes}${original?.[5] ?? ''}` : original?.[5] ?? '';
      const line = `${original?.[1] ?? `- ${name}: `}${rating}${suffix}`;
      if (index >= 0) lines[index] = line;
      else lines.splice(area.bodyEnd, 0, line);
    }
    return lines.join(eol);
  }
  if (expected.startsWith('legacy:')) {
    const legacy = field === 'summary' ? legacySections(lines, 'Month Summary') : field === 'decisions' ? [...legacySections(lines, 'Decisions'), ...legacySections(lines, 'Decisions & Important')] : (legacySections(lines, 'Expenses').length ? legacySections(lines, 'Expenses') : legacySections(lines, 'Finance'));
    const target = legacy[0];
    if (!target) throw new Error('This section changed outside Epizen.');
    lines.splice(target.heading + 1, target.bodyEnd - target.heading - 1, ...(normalized ? normalized.split('\n') : []));
    return lines.join(eol);
  }
  const span = sections(lines, monthlyHeading(field))[0];
  if (!span) {
    if (!normalized.trim() && !expected) return text;
    const sep = !text ? '' : text.endsWith(eol + eol) ? '' : text.endsWith(eol) ? eol : eol + eol;
    if (field.startsWith('sphere:')) {
      const { rating, notes } = readSphere(normalized);
      if (notes.includes('\n')) throw new Error('The life-area format keeps each reflection on one line.');
      if (!rating) throw new Error('Choose a rating before saving this life-area reflection.');
      const name = field.slice('sphere:'.length);
      return `${text}${sep}## Life areas${eol}${eol}### Spheres of Life${eol}- ${name}: ${rating}${notes ? ` — ${notes}` : ''}${eol}`;
    }
    return `${text}${sep}## ${monthlyHeading(field)}${eol}${normalized.replace(/\n/g, eol)}${eol}`;
  }
  lines.splice(span.heading + 1, span.bodyEnd - span.heading - 1, ...(normalized ? normalized.split('\n') : []));
  return lines.join(eol);
}

/** The first line is a plain Markdown rating; the remainder is the user's own reflection. */
export function readSphere(value: string): { rating: string; notes: string } {
  const lines = value.split('\n');
  const match = /^\*\*Rating:\*\*\s*(10|[0-9])\s*\/\s*10\s*$/i.exec(lines[0] ?? '');
  return match ? { rating: match[1] ?? '', notes: lines.slice(1).join('\n').replace(/^\n/, '') } : { rating: '', notes: value };
}

export function sphereValue(rating: string, notes: string): string {
  if (rating && !/^(?:[0-9]|10)$/.test(rating)) throw new Error('Choose a rating from 0 to 10.');
  return [rating ? `**Rating:** ${rating} / 10` : '', notes].filter(Boolean).join('\n\n');
}

/** Plain Markdown, with an optional currency; never infer a currency from the computer. */
export function spendingValue(amount: string, currency: string): string {
  const clean = amount.trim();
  if (!clean && !currency.trim()) return '';
  if (!/^(?:\d+|\d{1,3}(?:[, \u00a0]\d{3})+)(?:\.\d{1,2})?$/.test(clean)) throw new Error('Enter an amount such as 150,000 or 150000.50.');
  const number = Number(clean.replace(/[, \u00a0]/g, ''));
  if (!Number.isFinite(number) || number > Number.MAX_SAFE_INTEGER / 100) throw new Error('That amount is too large.');
  const unit = currency.trim().toUpperCase();
  if (unit && !/^[A-Z]{3}$/.test(unit)) throw new Error('Use a three-letter currency, such as RUB, USD or EUR.');
  return `**Amount:** ${number}${unit ? `\n**Currency:** ${unit}` : ''}`;
}

export function readSpending(value: string): { amount: string; currency: string } {
  if (!value.trim()) return { amount: '', currency: '' };
  const match = /^\*\*Amount:\*\* (\d+(?:\.\d{1,2})?)(?:\n\*\*Currency:\*\* ([A-Z]{3}))?\s*$/.exec(value);
  if (!match) throw new Error('This spending total has an unfamiliar format. Edit it in the note editor.');
  const amount = match[1]!;
  const currency = match[2] ?? '';
  spendingValue(amount, currency);
  return { amount, currency };
}

export function spendingLabel(value: string): string {
  try {
    const { amount, currency } = readSpending(value);
    return amount === '' ? '—' : `${Number(amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ''}`;
  } catch { return 'Check month note'; }
}

/** Prepare recovery text without ever touching the note on disk. */
export function recoveryText(source: string, field: MonthlyField, draft: string, expected: string): string {
  try { return writeMonthlySection(source, field, draft, expected); }
  catch { return `${source}\n\n---\nUnsaved ${monthlyHeading(field)} draft:\n\n${draft}`; }
}
