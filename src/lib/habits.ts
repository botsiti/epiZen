import { parseDocument, isMap, isSeq, isScalar, stringify } from 'yaml';
import { parseNote } from './frontmatter';
import { addDays, formatDate, parseDate } from './dates';
import { parseDay, type Day, type DayTask } from './day';
import { parseTasks, toggleTask } from './dashboard';
import { lineEnding } from './text';
import type { DayEntry } from './rollup';

export interface HabitPeriod { from: string; until?: string; reset?: boolean }
export interface Habit {
  id: string;
  name: string;
  aliases: string[];
  periods: HabitPeriod[];
  path?: string;
  source?: string;
}
export interface HabitProblem { path: string; message: string }
export const habitNameKey = (name: string) => name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
const iso = (date: Date) => formatDate(date, 'YYYY-MM-DD');
const validDate = (value: unknown): value is string => typeof value === 'string' && Boolean(parseDate(value, 'YYYY-MM-DD')) && value >= '1900-01-01' && value <= '2200-12-31';
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function readHabit(path: string, source: string): Habit | undefined {
  const note = parseNote(source);
  if (note.error && /^type:\s*habit\s*$/m.test(source)) throw new Error(note.error);
  if (note.properties.type !== 'habit') return undefined;
  const p = note.properties;
  if (typeof p.habit_id !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(p.habit_id)) throw new Error('The habit needs a unique habit_id.');
  if (typeof p.name !== 'string' || !p.name.trim() || /[\r\n[\]<>]/.test(p.name)) throw new Error('The habit needs a plain name on one line.');
  if (!Array.isArray(p.aliases) || !p.aliases.every((alias) => typeof alias === 'string' && alias.trim())) throw new Error('Habit aliases must be a list of names.');
  if (!Array.isArray(p.periods) || !p.periods.length || p.periods.length > 100) throw new Error('The habit needs its tracking periods.');
  const periods: HabitPeriod[] = p.periods.map((period: unknown) => {
    if (!object(period) || !validDate(period.from) || (period.until !== undefined && (!validDate(period.until) || period.until < period.from)) || (period.reset !== undefined && typeof period.reset !== 'boolean')) throw new Error('A tracking period needs valid start and end dates.');
    if (Object.keys(period).some((key) => !['from', 'until', 'reset'].includes(key))) throw new Error('This tracking period has unfamiliar properties. Edit it in the note.');
    return { from: period.from, ...(period.until ? { until: period.until } : {}), ...(period.reset ? { reset: true } : {}) };
  });
  for (let i = 1; i < periods.length; i++) if (!periods[i - 1]!.until || periods[i]!.from < periods[i - 1]!.until!) throw new Error('Tracking periods overlap or are out of order.');
  return { id: p.habit_id, name: p.name.trim(), aliases: p.aliases as string[], periods, path, source };
}

export function collectHabits(notes: ReadonlyMap<string, string>): { habits: Habit[]; problems: HabitProblem[] } {
  const habits: Habit[] = []; const problems: HabitProblem[] = [];
  for (const [path, source] of notes) {
    if (!/^type:\s*['"]?habit['"]?\s*(?:#.*)?$/m.test(source)) continue;
    try { const habit = readHabit(path, source); if (habit) habits.push(habit); }
    catch (err) { problems.push({ path, message: (err as Error).message }); }
  }
  const invalid = new Set<string>();
  for (let i = 0; i < habits.length; i++) for (let j = i + 1; j < habits.length; j++) {
    const a = habits[i]!; const b = habits[j]!;
    if (a.id === b.id || [a.name, ...a.aliases].some((name) => [b.name, ...b.aliases].some((other) => habitNameKey(name) === habitNameKey(other)))) {
      for (const h of [a, b]) { invalid.add(h.id); problems.push({ path: h.path!, message: 'This habit shares an identity or historical name with another definition. Resolve the duplicate in the notes.' }); }
    }
  }
  return { habits: habits.filter((h) => !invalid.has(h.id)), problems };
}

export function habitActive(habit: Habit, date: Date | string): boolean {
  const key = typeof date === 'string' ? date : iso(date);
  return habit.periods.some((p) => p.from <= key && (!p.until || key < p.until));
}
export const habitMatches = (habit: Habit, record: Pick<DayTask, 'habitId' | 'label'>) => record.habitId ? record.habitId === habit.id : [habit.name, ...habit.aliases].some((name) => habitNameKey(name) === habitNameKey(record.label));

/** Read legacy checkboxes as history without changing a single daily note. */
export function discoveredHabits(days: DayEntry[], managed: Habit[]): Habit[] {
  const found = new Map<string, { name: string; dates: string[] }>();
  for (const entry of days) for (const record of entry.day?.habits ?? []) {
    if (record.habitId || managed.some((h) => habitMatches(h, record))) continue;
    const key = habitNameKey(record.label); const value = found.get(key) ?? { name: record.label, dates: [] };
    value.dates.push(iso(entry.date)); found.set(key, value);
  }
  return [...found].map(([key, { name, dates }]) => {
    dates.sort(); const end = addDays(parseDate(dates.at(-1)!, 'YYYY-MM-DD')!, 1);
    return { id: `legacy:${key}`, name, aliases: [], periods: [{ from: dates[0]!, until: iso(end) }] };
  });
}

export function newHabit(name: string, from: string, id: string, history?: Habit): { path: string; text: string } {
  name = name.trim();
  if (!name || name.length > 100 || /[\r\n[\]<>]/.test(name)) throw new Error('Choose a name of up to 100 characters, without brackets or line breaks.');
  if (!validDate(from)) throw new Error('Choose a valid start date.');
  let periods: HabitPeriod[];
  if (history) {
    const past = history.periods[0]!;
    periods = past.until && past.until < from ? [{ ...past }, { from }] : [{ from: past.from < from ? past.from : from }];
  } else periods = [{ from }];
  const data = { type: 'habit', habit_id: id, name, aliases: history && history.name !== name ? [history.name] : [], periods };
  const text = `---\n${stringify(data, { lineWidth: 0 })}---\n\n# ${name}\n\nA daily habit. Tracking periods keep its history when it is archived and resumed.\n`;
  const safe = name.replace(/[\\/:*?"|#%]/g, '-').replace(/^\.+|\.+$/g, '').trim() || 'Habit';
  const path = `Habits/${safe}-${id.slice(0, 8)}.md`;
  readHabit(path, text);
  return { path, text };
}

export type HabitLifecycle = { kind: 'archive'; date: string } | { kind: 'resume'; date: string; restart: boolean };
export function changeHabit(source: string, shown: Habit, change: HabitLifecycle): string {
  if (source !== shown.source) throw new Error('This habit changed outside Epizen. Reopen it before changing its schedule.');
  const current = readHabit(shown.path!, source);
  if (!current) throw new Error('This is no longer a habit note.');
  if (!validDate(change.date)) throw new Error('Choose a valid date.');
  const periods = current.periods.map((p) => ({ ...p })); const last = periods.at(-1)!;
  if (change.kind === 'archive') {
    if (last.until) throw new Error('This habit is already archived.');
    if (change.date < last.from) throw new Error('Archive on or after the start date.');
    last.until = change.date;
  } else {
    if (!last.until) throw new Error('This habit is already active.');
    if (change.date < last.until) throw new Error('Resume on or after the archive date.');
    periods.push({ from: change.date, ...(change.restart ? { reset: true } : {}) });
  }
  const eol = lineEnding(source); const header = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  if (!eol || !header) throw new Error('The habit note needs consistent Markdown frontmatter.');
  const doc = parseDocument(header[1]!);
  if (doc.errors.length || !isMap(doc.contents)) throw new Error('The habit properties cannot be read.');
  const pairs = doc.contents.items.filter((p) => isScalar(p.key) && p.key.value === 'periods');
  const value = pairs[0]?.value;
  if (pairs.length !== 1 || !isSeq(value) || !value.range) throw new Error('Resolve the habit tracking periods in the note editor.');
  const [from, to] = value.range; const offset = 3 + eol.length; const old = header[1]!.slice(from, to);
  const next = source.slice(0, offset + from) + JSON.stringify(periods) + (old.endsWith(eol) ? eol : '') + source.slice(offset + to);
  readHabit(shown.path!, next);
  return next;
}

/** Overlay scheduled habits without writing a note just by opening it. */
export function withHabits(day: Day, habits: Habit[], date: Date, today: Date): Day {
  const records = day.habits.filter((record) => {
    const owner = habits.find((h) => habitMatches(h, record));
    return !owner || iso(date) < iso(today) || habitActive(owner, date);
  }).map((record) => {
    const owner = habits.find((h) => habitMatches(h, record));
    return owner ? { ...record, habitId: owner.id, label: owner.name } : record;
  });
  for (const habit of habits) if (habitActive(habit, date) && !records.some((r) => habitMatches(habit, r))) records.push({ line: -1, offset: -1, text: habit.name, label: habit.name, done: false, habit: true, habitId: habit.id, blocks: [] });
  return { ...day, habits: records, totals: { ...day.totals, habits: records.length, habitsDone: records.filter((r) => r.done).length } };
}

export function setHabitCompletion(text: string, habit: Habit, expectedDone: boolean, done: boolean): string {
  const records = parseDay(text).habits.filter((r) => habitMatches(habit, r));
  if (records.length > 1) throw new Error('This note has duplicate records for this habit. Resolve them in the note editor.');
  const record = records[0];
  if ((record?.done ?? false) !== expectedDone) throw new Error('This habit completion changed outside Epizen. Refresh before trying again.');
  if (record) {
    if (record.done === done) return text;
    const task = parseTasks(text).find((t) => t.line === record.line)!;
    return toggleTask(text, task);
  }
  if (!done) return text;
  const eol = lineEnding(text);
  if (!eol) throw new Error('The daily note has mixed line endings.');
  if (parseNote(text).error) throw new Error('The daily note has unreadable frontmatter.');
  const lines = text.split(eol);
  let start = 0;
  if (/^\uFEFF?---[ \t]*$/.test(lines[0] ?? '')) {
    const close = lines.findIndex((line, i) => i > 0 && /^---[ \t]*$/.test(line));
    if (close < 0) throw new Error('Close the note’s frontmatter before adding a habit.');
    start = close + 1;
  }
  let fence: { char: string; length: number; depth: number } | undefined;
  let comment = false; let existing = -1;
  for (let i = start; i < lines.length; i++) {
    const raw = lines[i]!; const depth = (/^\s*(?:>\s*)*/.exec(raw)?.[0].match(/>/g) ?? []).length;
    if (fence && depth < fence.depth) fence = undefined;
    if (comment) { if (raw.includes('-->')) comment = false; continue; }
    const marker = /^\s*(?:>\s*)*(`{3,}|~{3,})(.*)$/.exec(raw);
    if (marker) {
      if (!fence) fence = { char: marker[1]![0]!, length: marker[1]!.length, depth };
      else if (marker[1]![0] === fence.char && marker[1]!.length >= fence.length && !marker[2]!.trim()) fence = undefined;
      continue;
    }
    if (fence) continue;
    if (raw.includes('<!--')) { comment = raw.lastIndexOf('<!--') > raw.lastIndexOf('-->'); continue; }
    if (existing < 0 && /^>\s*\[!habits\]/i.test(raw)) existing = i;
  }
  if (fence || comment) throw new Error('Close the note’s code fence or comment before adding a habit.');
  if (existing >= 0) {
    let end = existing + 1;
    while (end < lines.length && /^>/.test(lines[end]!) && !/^>\s*\[!/.test(lines[end]!)) end++;
    lines.splice(end, 0, `> - [x] ${habit.name} [habit::${habit.id}]`);
    return lines.join(eol);
  }
  return `${text}${text.endsWith(eol + eol) ? '' : text.endsWith(eol) ? eol : eol + eol}> [!habits]- Habits${eol}> - [x] ${habit.name} [habit::${habit.id}]${eol}`;
}

export interface HabitMark { date: Date; done: boolean; due: boolean; reset: boolean }
export function habitHistory(habit: Habit, days: DayEntry[], today: Date): HabitMark[] {
  const records = new Map(days.map((entry) => [iso(entry.date), entry.day?.habits.filter((r) => habitMatches(habit, r)) ?? []]));
  const starts = [...habit.periods.map((p) => p.from), ...[...records].filter(([, r]) => r.length).map(([key]) => key)].sort();
  const first = parseDate(starts[0]!, 'YYYY-MM-DD');
  if (!first || iso(first) > iso(today)) return [];
  const marks: HabitMark[] = [];
  for (let cursor = first; cursor <= today; cursor = addDays(cursor, 1)) {
    const key = iso(cursor); const recorded = records.get(key) ?? [];
    marks.push({ date: cursor, done: recorded.some((r) => r.done), due: habitActive(habit, key) || recorded.some((r) => r.done), reset: habit.periods.some((p) => p.from === key && Boolean(p.reset)) });
  }
  return marks;
}
export function habitStats(marks: HabitMark[], today: Date) {
  let run = 0; let best = 0; let completed = 0; let due = 0;
  for (const mark of marks) {
    if (mark.reset) run = 0;
    if (!mark.due) continue;
    if (mark.done) { run++; completed++; best = Math.max(best, run); due++; }
    else if (iso(mark.date) !== iso(today)) { run = 0; due++; }
  }
  return { current: run, best, completed, due, rate: due ? Math.round(completed * 100 / due) : undefined };
}
