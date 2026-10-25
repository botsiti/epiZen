import { parseNote } from './frontmatter';

export interface Task {
  /** Zero-based line in the note. */
  line: number;
  /** Where the box's mark (` ` or `x`) sits in the note's text. */
  offset: number;
  done: boolean;
  /** The task as it reads, without the list marker and box. */
  text: string;
  /** From a `#daily/<category>` tag. */
  category?: string;
  /** From a `[minutes::N]` field. */
  minutes?: number;
  /** Inside a callout, like the daily note's habits: kept apart from the day's tasks. */
  habit: boolean;
}

export interface DaySummary {
  tasks: Task[];
  /** Minutes per category: ticked, and planned (every task). */
  minutes: Map<string, { done: number; planned: number }>;
  /** The note's numeric properties, in the note's order (mood, sleep, focus…). */
  numbers: [string, number][];
}

// A task line: optional quote marks (a task inside a callout), a list marker, a box.
const TASK = /^([ \t]*(?:>[ \t]*)*(?:[-*+]|\d+[.)])[ \t]+\[)([ xX])(\][ \t]+)(.*)$/;
const FENCE = /^[ \t]*(?:>[ \t]*)*(`{3,}|~{3,})/;

/** Every `- [ ]` and `- [x]` task in a note, also inside callouts, but not inside code. */
export function parseTasks(text: string): Task[] {
  const tasks: Task[] = [];
  let offset = 0;
  let fence: string | undefined;
  text.split('\n').forEach((raw, line) => {
    const content = raw.replace(/\r$/, '');
    const opens = FENCE.exec(content)?.[1];
    if (opens && (!fence || opens.startsWith(fence))) fence = fence ? undefined : opens;
    else if (!fence) {
      const match = TASK.exec(content);
      if (match) {
        const body = match[4] ?? '';
        tasks.push({
          line,
          offset: offset + (match[1] ?? '').length,
          done: match[2] !== ' ',
          text: body,
          category: /#daily\/([\w-]+)/.exec(body)?.[1],
          minutes: Number(/\[minutes::\s*(\d+)\s*\]/.exec(body)?.[1]) || undefined,
          habit: (match[1] ?? '').includes('>'),
        });
      }
    }
    offset += raw.length + 1;
  });
  return tasks;
}

/** The note with that one task ticked or unticked: one character changes, nothing else. */
export function toggleTask(text: string, task: Task): string {
  const mark = text[task.offset];
  if (mark === undefined || !/[ xX]/.test(mark) || (mark !== ' ') !== task.done) throw new Error('That task has changed in the note.');
  return text.slice(0, task.offset) + (task.done ? ' ' : 'x') + text.slice(task.offset + 1);
}

export function summarizeDay(text: string): DaySummary {
  const tasks = parseTasks(text);
  const minutes = new Map<string, { done: number; planned: number }>();
  for (const task of tasks) {
    if (!task.category || !task.minutes) continue;
    const entry = minutes.get(task.category) ?? { done: 0, planned: 0 };
    entry.planned += task.minutes;
    if (task.done) entry.done += task.minutes;
    minutes.set(task.category, entry);
  }
  const numbers = Object.entries(parseNote(text).properties).filter((entry): entry is [string, number] => typeof entry[1] === 'number');
  return { tasks, minutes, numbers };
}

export interface Totals {
  /** Notes that went into the totals. */
  days: number;
  tasksDone: number;
  tasks: number;
  minutes: Map<string, { done: number; planned: number }>;
  /** Each numeric property's average over the notes that have it. */
  averages: [string, number][];
}

/** Adds days (or weeks' totals, as days) together. */
export function combine(summaries: DaySummary[]): Totals {
  const minutes = new Map<string, { done: number; planned: number }>();
  const sums = new Map<string, { total: number; count: number }>();
  let tasksDone = 0;
  let tasks = 0;
  for (const day of summaries) {
    const real = day.tasks.filter((task) => !task.habit);
    tasks += real.length;
    tasksDone += real.filter((task) => task.done).length;
    for (const [category, entry] of day.minutes) {
      const sum = minutes.get(category) ?? { done: 0, planned: 0 };
      minutes.set(category, { done: sum.done + entry.done, planned: sum.planned + entry.planned });
    }
    for (const [key, value] of day.numbers) {
      const sum = sums.get(key) ?? { total: 0, count: 0 };
      sums.set(key, { total: sum.total + value, count: sum.count + 1 });
    }
  }
  const averages = [...sums].map(([key, { total, count }]): [string, number] => [key, Math.round((total / count) * 10) / 10]);
  return { days: summaries.length, tasksDone, tasks, minutes, averages };
}

/** What a meter fills up to: a 0–10 score, a percentage, or hours of sleep out of 10. */
export const meterMax = (value: number) => (value <= 10 ? 10 : value <= 100 ? 100 : undefined);

/** 125 → "2h 5m". */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}
