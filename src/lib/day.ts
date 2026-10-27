import { category, type Category } from './categories';
import { parseRecords, type ThoughtRecord } from './cbt';
import { parseTasks, type Task } from './dashboard';
import { parseNote } from './frontmatter';

/** A stretch of logged time under a task, like `    - 10:56–11:09`, in minutes since midnight. */
export interface TimeBlock {
  start: number;
  end: number;
  /** Zero-based line of the block in the note. */
  line: number;
}

export interface DayTask extends Omit<Task, 'category'> {
  /** The task as it reads: no tag, fields or comments. */
  label: string;
  category?: Category;
  blocks: TimeBlock[];
}

export interface DayTotals {
  /** Minutes logged on tasks, ticked or not: the vault counts time when it is logged. */
  logged: number;
  /** Of those, minutes in productive and in recovery categories. */
  main: number;
  recovery: number;
  /** Logged minutes at each category's rate, and the part earned by ticked tasks. */
  xp: number;
  claimed: number;
  tasksDone: number;
  tasks: number;
  habitsDone: number;
  habits: number;
}

export interface Day {
  tasks: DayTask[];
  habits: DayTask[];
  /** Every numeric property, by name. */
  numbers: Record<string, number>;
  /** Every property's name, filled in or not: what the note tracks. */
  keys: string[];
  /** The `[!tldr]` callout's text. */
  summary?: string;
  /** The `important` property. */
  important?: string;
  gratitude?: string;
  /** The stream of consciousness, as paragraphs, without the thought-record table. */
  stream: string[];
  /** Thought records: each filled row of the stream's table. */
  records: ThoughtRecord[];
  /** Albums and films the day links as listened to or watched. */
  media: { kind: 'listened' | 'watched'; title: string }[];
  /** Logged minutes per category, most first. */
  byCategory: [Category, number][];
  totals: DayTotals;
}

const BLOCK = /^[ \t]*(?:>[ \t]*)*[-*+][ \t]+(\d{1,2}):(\d{2})[ \t]*[–—-][ \t]*(\d{1,2}):(\d{2})\b/;
const SUBTASK = /^[ \t]*(?:>[ \t]*)*(?:[-*+]|\d+[.)])[ \t]+\[[ xX]\]/;
const indent = (line: string) => /^[ \t]*/.exec(line)?.[0].replace(/\t/g, '    ').length ?? 0;

/**
 * The time blocks listed under the task on that line, one indent deeper. A subtask's blocks
 * are its own, not its parent's too. The calendar's writes use this as well.
 */
export function blocksUnder(lines: string[], line: number): TimeBlock[] {
  const depth = indent(lines[line] ?? '');
  const blocks: TimeBlock[] = [];
  let subtask: number | undefined;
  for (let i = line + 1; i < lines.length; i += 1) {
    const text = lines[i] ?? '';
    if (!text.trim()) continue;
    const at = indent(text);
    if (at <= depth) break;
    if (subtask !== undefined && at > subtask) continue;
    subtask = SUBTASK.test(text) ? at : undefined;
    if (subtask !== undefined) continue;
    const match = BLOCK.exec(text);
    if (!match) continue;
    const start = Number(match[1]) * 60 + Number(match[2]);
    let end = Number(match[3]) * 60 + Number(match[4]);
    // A block past midnight ends the next day.
    if (end < start) end += 24 * 60;
    blocks.push({ start, end, line: i });
  }
  return blocks;
}

/** A task's words, without its `#daily/…` tag, `[key::value]` fields and HTML comments. */
export const taskLabel = (text: string) =>
  text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\[[\w-]+::[^\]]*\]/g, '')
    .replace(/#daily\/[\w-]+/g, '')
    .replace(/^\s*[—–-]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();

/** The text of the callout of that type, its title line left out. */
function calloutText(lines: string[], type: string): string | undefined {
  const start = lines.findIndex((line) => new RegExp(`^>\\s*\\[!${type}\\]`, 'i').test(line));
  if (start < 0) return undefined;
  const body: string[] = [];
  for (let i = start + 1; i < lines.length && /^>/.test(lines[i] ?? ''); i += 1) body.push((lines[i] ?? '').replace(/^>\s?/, ''));
  return body.join('\n').trim() || undefined;
}

/** The lines under the first heading that matches, up to the next heading. */
function section(lines: string[], heading: RegExp): string[] {
  const start = lines.findIndex((line) => /^#{1,6}\s/.test(line) && heading.test(line.replace(/^#{1,6}\s+/, '')));
  if (start < 0) return [];
  const end = lines.findIndex((line, i) => i > start && /^#{1,6}\s/.test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end);
}

// Prompts the vault's daily template writes into the stream; they aren't the day's own words.
const PROMPTS = [/^reflection on good thoughts:?$/i, /^recognise irrational thoughts/i];

/** The stream of consciousness as paragraphs: its own words, not the template's prompts or the thought-record table. */
function stream(lines: string[]): string[] {
  return section(lines, /^stream of consc/i)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('|') && !PROMPTS.some((prompt) => prompt.test(line)));
}

const MEDIA = /^\*\*(Listened|Watched):\*\*\s*\[\[([^\]|#]+)/i;

/** Everything a daily note holds that its page shows: tasks with their time, habits, numbers and words. */
export function parseDay(text: string): Day {
  const lines = text.split('\n').map((line) => line.replace(/\r$/, ''));
  const { properties } = parseNote(text);
  const all = parseTasks(text).map(
    (task): DayTask => ({
      ...task,
      label: task.habit ? task.text.trim() : taskLabel(task.text),
      category: task.category === undefined ? undefined : category(task.category),
      blocks: blocksUnder(lines, task.line),
    }),
  );
  // The template's empty `- [ ] ` is a place to type, not a task.
  const tasks = all.filter((task) => !task.habit && (task.label || task.category || task.minutes));
  const habits = all.filter((task) => task.habit && task.label);

  const numbers: Record<string, number> = {};
  for (const [key, value] of Object.entries(properties)) if (typeof value === 'number' && Number.isFinite(value)) numbers[key] = value;

  const minutes = new Map<string, { meta: Category; total: number }>();
  const totals: DayTotals = { logged: 0, main: 0, recovery: 0, xp: 0, claimed: 0, tasksDone: 0, tasks: tasks.length, habitsDone: 0, habits: habits.length };
  for (const task of tasks) {
    if (task.done) totals.tasksDone += 1;
    const logged = task.minutes ?? 0;
    if (!logged) continue;
    const meta = task.category ?? category('other');
    const xp = Math.round(logged * meta.multiplier);
    totals.logged += logged;
    totals[meta.kind] += logged;
    totals.xp += xp;
    if (task.done) totals.claimed += xp;
    const entry = minutes.get(meta.name) ?? { meta, total: 0 };
    minutes.set(meta.name, { meta, total: entry.total + logged });
  }
  totals.habitsDone = habits.filter((habit) => habit.done).length;


  const important = typeof properties.important === 'string' ? properties.important.trim() : undefined;
  return {
    tasks,
    habits,
    numbers,
    keys: Object.keys(properties),
    summary: calloutText(lines, 'tldr'),
    important: important || undefined,
    gratitude: /^\*\*Gratitude practice:\*\*[ \t]*(.*)$/im.exec(text)?.[1]?.trim() || undefined,
    stream: stream(lines),
    records: parseRecords(text),
    media: lines.flatMap((line) => {
      const match = MEDIA.exec(line.trim());
      return match ? [{ kind: (match[1] ?? '').toLowerCase() as 'listened' | 'watched', title: (match[2] ?? '').trim() }] : [];
    }),
    byCategory: [...minutes.values()].sort((a, b) => b.total - a.total || a.meta.name.localeCompare(b.meta.name)).map(({ meta, total }): [Category, number] => [meta, total]),
    totals,
  };
}

/** 125 → "2h 5m"; 40 → "40m". */
export function formatMinutes(minutes: number): string {
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  return hours ? `${hours}h ${rounded % 60}m` : `${rounded}m`;
}

/** 610 → "10:10". */
export const clock = (minutes: number) => `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
