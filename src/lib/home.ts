import { category, METRICS, SPHERES, type Category, type Sphere } from './categories';
import { addDays, day, parseDate, startOfMonth, startOfWeek } from './dates';
import type { MediaItem } from './media';
import type { DayEntry } from './rollup';

// What the homepage shows, worked out from the daily notes. The formulas are the vault's own
// Obsidian scripts' (Templates/Scripts/rpg-shared.js and home-main.js), so the two homepages agree.
// Nothing here reads the clock: "today" always comes in from the caller.

const DAY_MS = 86_400_000;
/** Whole days from one local midnight to another; rounding absorbs a daylight-saving hour. */
const daysBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / DAY_MS);
const clamp = (share: number) => Math.max(0, Math.min(1, share));
const key = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

/** The XP a level starts at: 0 for level 1, 1,000 for 2, 3,000 for 3, each level 1,000 more than the last. */
export const xpForLevel = (level: number) => 500 * level * (level - 1);

/** The level that much XP reaches, the inverse of `xpForLevel`. Never below 1. */
export function levelOf(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 1;
  return Math.max(1, Math.floor((1 + Math.sqrt(1 + (8 * xp) / 1000)) / 2));
}

export interface Progress {
  level: number;
  xp: number;
  /** The XP this level started at, and the next one starts at. */
  start: number;
  next: number;
  /** How far through this level, 0 to 1. */
  share: number;
  /** XP still to go to the next level. */
  left: number;
}

export function progress(xp: number): Progress {
  const level = levelOf(xp);
  const start = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, xp, start, next, share: clamp((xp - start) / (next - start)), left: Math.max(0, next - xp) };
}

// The Obsidian scripts' title ladder, climbed here by level rather than by renown (achievements
// aren't counted in Epizen). The steps widen as levels do: each one takes more XP than the last.
const RANKS: [number, string][] = [
  [50, 'Immortal'],
  [40, 'Paragon'],
  [30, 'Ascendant'],
  [25, 'Luminary'],
  [20, 'Archon'],
  [16, 'Sage'],
  [13, 'Mystic'],
  [10, 'Adept'],
  [7, 'Seeker'],
  [5, 'Journeyman'],
  [3, 'Apprentice'],
];

/** The title that goes with a level: Novice, Apprentice, Journeyman … Immortal. */
export const rankOf = (level: number) => RANKS.find(([from]) => level >= from)?.[1] ?? 'Novice';

/**
 * Life XP: every daily task's XP, ticked or not, since the vault counts time when it is logged.
 * `extra` is XP from elsewhere, such as finished quests, once those are counted.
 */
export const lifeXp = (days: DayEntry[], extra = 0) => days.reduce((sum, entry) => sum + (entry.day?.totals.xp ?? 0), extra);

/** A day keeps the streak when it has a ticked task or any time logged. */
const kept = (entry: DayEntry) => Boolean(entry.day && (entry.day.totals.tasksDone > 0 || entry.day.totals.logged > 0));

/**
 * Days in a row that kept the streak, back from today, and the longest such run. Today is a
 * grace day: until something is logged it neither counts nor breaks the run, so the morning
 * doesn't read as a lost streak.
 */
export function streak(days: DayEntry[], today: Date): { current: number; best: number } {
  const active = new Set(days.filter(kept).map((entry) => key(entry.date)));
  let cursor = active.has(key(today)) ? today : addDays(today, -1);
  let current = 0;
  while (active.has(key(cursor))) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  const dates = days.filter(kept).map((entry) => entry.date).sort((a, b) => a.getTime() - b.getTime());
  let best = 0;
  let run = 0;
  dates.forEach((date, i) => {
    const previous = dates[i - 1];
    if (previous && daysBetween(previous, date) === 0) return;
    run = previous && daysBetween(previous, date) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return { current, best };
}

/** The last `count` days, today last. */
export const lastDays = (dayOf: (date: Date) => DayEntry, today: Date, count = 7) =>
  Array.from({ length: count }, (_, i) => dayOf(addDays(today, i - count + 1)));

export interface Average {
  key: string;
  label: string;
  color: string;
  /** The mean over the days that logged it, or `undefined` when none did. */
  value?: number;
  /** Days that logged it. */
  count: number;
  /** What the value is out of, and the share of that it reaches. */
  scale: number;
  share: number;
  unit: string;
}

/**
 * Sleep, focus, energy, mood and social over some days. Only a value above 0 counts: the
 * template leaves them at 0 until filled in. Sleep is out of 8 hours; the rest out of their scale.
 */
export function averages(days: DayEntry[], scales: Record<string, number>): Average[] {
  const metric = (key: string) => METRICS.find((m) => m.key === key);
  const rows = [
    { key: 'sleep', label: 'Sleep', color: '#6fa5e6', scale: 8, unit: 'h' },
    ...(['focus', 'energy', 'mood', 'soc'] as const).map((key) => ({
      key,
      label: metric(key)?.label ?? key,
      color: metric(key)?.color ?? 'var(--accent)',
      scale: scales[key] ?? 5,
      unit: '',
    })),
  ];
  return rows.map((row) => {
    const values = days.map((entry) => entry.day?.numbers[row.key]).filter((value): value is number => value !== undefined && value > 0);
    const value = values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : undefined;
    return { ...row, value, count: values.length, share: value === undefined ? 0 : clamp(value / row.scale) };
  });
}

/** Minutes logged on each of the days, with their categories, and the total and mean per day. */
export function focusWeek(days: DayEntry[]) {
  const rows = days.map((entry) => ({ date: entry.date, minutes: entry.day?.totals.logged ?? 0, byCategory: entry.day?.byCategory ?? [] }));
  const total = rows.reduce((sum, row) => sum + row.minutes, 0);
  return { days: rows, total, average: rows.length ? total / rows.length : 0, most: Math.max(0, ...rows.map((row) => row.minutes)) };
}

/**
 * A task's XP split across its spheres by their weights, in whole XP that add up to it: each
 * sphere gets its share rounded down, and what's left goes to the largest remainders first.
 */
export function splitXp(xp: number, spheres: Category['spheres']): [Sphere, number][] {
  const weights = Object.entries(spheres) as [Sphere, number][];
  const exact = weights.map(([sphere, weight]) => [sphere, (xp * weight) / 100] as const);
  const parts = exact.map(([sphere, share]): [Sphere, number] => [sphere, Math.floor(share)]);
  let left = xp - parts.reduce((sum, [, part]) => sum + part, 0);
  const order = exact.map(([, share], i) => [share - Math.floor(share), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (left <= 0) break;
    const part = parts[i];
    if (part) part[1] += 1;
    left -= 1;
  }
  return parts;
}

export interface SphereState extends Progress {
  name: Sphere;
  color: string;
}

/** XP per life sphere from every daily task, each on the same level curve as the character. */
export function sphereXp(days: DayEntry[]): SphereState[] {
  const xp = new Map<Sphere, number>(SPHERES.map((sphere) => [sphere.name, 0]));
  for (const { day } of days) {
    for (const task of day?.tasks ?? []) {
      const minutes = task.minutes ?? 0;
      if (!minutes) continue;
      // The same XP as the day's own total: a task without a category counts as `other`.
      const meta = task.category ?? category('other');
      for (const [sphere, part] of splitXp(Math.round(minutes * meta.multiplier), meta.spheres)) xp.set(sphere, (xp.get(sphere) ?? 0) + part);
    }
  }
  return SPHERES.map(({ name, color }) => ({ name, color, ...progress(xp.get(name) ?? 0) }));
}

/** The sphere with the most XP, the first of them on a tie; none while no sphere has any. */
export const leadSphere = (spheres: SphereState[]) =>
  spheres.reduce<SphereState | undefined>((lead, sphere) => (sphere.xp > (lead?.xp ?? 0) ? sphere : lead), undefined);

/** Minutes logged in one category over some days. */
export const categoryMinutes = (days: DayEntry[], name: string) =>
  days.reduce(
    (sum, { day }) =>
      sum + (day?.tasks ?? []).reduce((total, task) => total + (task.category?.name.toLowerCase() === name ? (task.minutes ?? 0) : 0), 0),
    0,
  );

/** This week's days, Monday to Sunday. */
export const weekDays = (dayOf: (date: Date) => DayEntry, today: Date) => Array.from({ length: 7 }, (_, i) => dayOf(addDays(startOfWeek(today), i)));

/** How much of the week's sport is done: the floor is 150 minutes, as health guidelines put it. */
export const SPORT_FLOOR = 150;

/** How old the memento mori counts to. */
export const TARGET_AGE = 30;
/** The weeks grid: a row per year of life up to the target age, 52 to a row. */
export const WEEK_COLUMNS = 52;

export interface Span {
  label: string;
  /** How much of it has passed, 0 to 1. */
  share: number;
  daysLeft: number;
}

function span(label: string, start: Date, end: Date, today: Date): Span {
  const total = daysBetween(start, end);
  const elapsed = Math.min(Math.max(daysBetween(start, today), 0), total);
  return { label, share: total > 0 ? elapsed / total : 0, daysLeft: Math.max(0, daysBetween(today, end)) };
}

/**
 * How much of the year, the month and (with a birth date) life up to 30 has passed. The weeks
 * are a personal year's 52 parts, birthday to birthday, so a cell is about 7.02 days, not exactly 7.
 */
export function memento(today: Date, birth?: Date) {
  const year = span('Year', day(today.getFullYear(), 0, 1), day(today.getFullYear() + 1, 0, 1), today);
  const month = span('Month', startOfMonth(today), day(today.getFullYear(), today.getMonth() + 1, 1), today);
  if (!birth) return { spans: [year, month] };
  const target = day(birth.getFullYear() + TARGET_AGE, birth.getMonth(), birth.getDate());
  const life = span(`Till ${TARGET_AGE}`, birth, target, today);
  const cells = WEEK_COLUMNS * TARGET_AGE;
  const total = target.getTime() - birth.getTime();
  const elapsed = Math.min(Math.max(today.getTime() - birth.getTime(), 0), total);
  // Cells fully lived; the one after them is the week being lived now.
  const lived = Math.floor((elapsed / total) * cells);
  return { spans: [year, month, life], life, weeks: { cells, lived, current: Math.min(lived, cells - 1) } };
}

/** A birth date as Settings keeps it, `YYYY-MM-DD`, or `undefined` when it isn't one. */
export const parseBirthDate = (value: unknown) => (typeof value === 'string' ? parseDate(value.trim(), 'YYYY-MM-DD') : undefined);

/** How many of a shelf's items were listened to or watched this year, up to today. */
export function thisYear(items: MediaItem[], today: Date): number {
  return items.filter((item) => {
    const [, year, month, date] = /^(\d{4})-(\d{2})-(\d{2})/.exec(item.date ?? '') ?? [];
    if (!year) return false;
    const when = day(Number(year), Number(month) - 1, Number(date));
    return when.getFullYear() === today.getFullYear() && when <= today;
  }).length;
}
