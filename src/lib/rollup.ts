import type { Category } from './categories';
import type { Day, DayTotals } from './day';

/** A day a week or month sums: its note's path and what the note holds, when it has one. */
export interface DayEntry {
  date: Date;
  path?: string;
  day?: Day;
}

export interface Rollup {
  days: DayEntry[];
  /** Days that have a note. */
  noted: number;
  totals: DayTotals;
  byCategory: [Category, number][];
  /** A property's average over the days that logged it. */
  average: (key: string) => number | undefined;
  /** A property's value on each day, `undefined` where it wasn't logged. */
  series: (key: string) => (number | undefined)[];
  /** Days whose plan was all done (`done` 100). */
  perfect: number;
  /** Each habit, in the order the days list them, ticked (true), not (false) or absent (null) per day. */
  habits: { name: string; marks: (boolean | null)[] }[];
}

/**
 * A number counts as logged when it is there and, on a 1–5 or 1–10 scale, isn't 0: the vault's
 * template leaves those empty, and a 0 there has only ever meant "not filled in".
 */
const logged = (key: string, value: number | undefined) =>
  value !== undefined && !(value === 0 && key !== 'done' && key !== 'sleep');

/** Adds days together: a week's seven, or a month's. */
export function rollup(days: DayEntry[]): Rollup {
  const totals: DayTotals = { logged: 0, main: 0, recovery: 0, xp: 0, claimed: 0, tasksDone: 0, tasks: 0, habitsDone: 0, habits: 0 };
  const minutes = new Map<string, [Category, number]>();
  const habitNames: string[] = [];
  for (const { day } of days) {
    if (!day) continue;
    for (const key of Object.keys(totals) as (keyof DayTotals)[]) totals[key] += day.totals[key];
    for (const [meta, total] of day.byCategory) minutes.set(meta.name, [meta, (minutes.get(meta.name)?.[1] ?? 0) + total]);
    for (const habit of day.habits) if (!habitNames.includes(habit.label)) habitNames.push(habit.label);
  }
  const series = (key: string) =>
    days.map(({ day }) => {
      const value = day?.numbers[key];
      return logged(key, value) ? value : undefined;
    });
  const average = (key: string) => {
    const values = series(key).filter((value): value is number => value !== undefined);
    return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : undefined;
  };
  return {
    days,
    noted: days.filter((entry) => entry.day).length,
    totals,
    byCategory: [...minutes.values()].sort((a, b) => b[1] - a[1] || a[0].name.localeCompare(b[0].name)),
    average,
    series,
    perfect: series('done').filter((value) => value !== undefined && value >= 100).length,
    habits: habitNames.map((name) => ({
      name,
      marks: days.map(({ day }) => {
        const habit = day?.habits.find((h) => h.label === name);
        return habit ? habit.done : null;
      }),
    })),
  };
}

/**
 * What a metric is out of, read from every day that logged it: 5 when no day went above 5,
 * 10 up to 10, else 100. `done` is a percentage and `sleep` hours (of 10).
 */
export function metricScale(key: string, values: number[]): number {
  if (key === 'done') return 100;
  if (key === 'sleep') return 10;
  const most = Math.max(0, ...values);
  return most <= 5 ? 5 : most <= 10 ? 10 : 100;
}

/** min, max, median and mean of the values there are. */
export function spread(values: (number | undefined)[]) {
  const sorted = values.filter((value): value is number => value !== undefined).sort((a, b) => a - b);
  if (!sorted.length) return undefined;
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  return { min: sorted[0] ?? 0, max: sorted.at(-1) ?? 0, median: Math.round(median * 10) / 10, mean: Math.round(mean * 10) / 10 };
}

/** Which of the numbers a day tracks, and its habits, were never filled in, in the order the day shows them. */
export function missingFromDay(day: Day): string[] {
  const missing = [
    ['mood', 'mood'],
    ['energy', 'energy'],
    ['focus', 'focus'],
    ['soc', 'social'],
    ['sleep', 'sleep'],
  ]
    .filter(([key = '']) => day.keys.includes(key) && !logged(key, day.numbers[key]))
    .map(([, label]) => label ?? '');
  if (day.habits.length && !day.habits.some((habit) => habit.done)) missing.push('habits');
  return missing;
}

export interface Reflections {
  plus: string[];
  minus: string[];
  next: string[];
}

/** A weekly note's Plus, Minus and Next: the list items under each heading of that name, all of them. */
export function reflections(text: string): Reflections {
  const found: Reflections = { plus: [], minus: [], next: [] };
  let into: string[] | undefined;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    const heading = /^#{1,6}\s+(.*?)\s*$/.exec(line);
    if (heading) {
      const name = (heading[1] ?? '').toLowerCase();
      into = name === 'plus' || name === 'minus' || name === 'next' ? found[name] : undefined;
      continue;
    }
    const item = /^\s*(?:[-*+]|\d+[.)])\s+(.*\S)\s*$/.exec(line)?.[1];
    if (into && item) into.push(item);
  }
  return found;
}
