import type { Settings, VaultFile } from './api';
import { addDays, addMonths, day, formatDate, parseDate, startOfMonth, startOfWeek } from './dates';
import { noteTitle } from './links';

export type Period = 'day' | 'week' | 'month';
export const PERIODS: Period[] = ['day', 'week', 'month'];

export interface PeriodSettings {
  /** Vault folder the notes go in; `''` is the top of the vault. */
  folder: string;
  /** moment.js format of the note name, as in Obsidian's daily notes settings. */
  format: string;
  /** Legacy setting, retained for compatibility; new notes use built-in text. */
  template: string;
}
export type PeriodicSettings = Record<Period, PeriodSettings>;

/** Obsidian's own defaults (the daily notes and periodic notes plugins). */
export const DEFAULT_PERIODIC: PeriodicSettings = {
  day: { folder: '', format: 'YYYY-MM-DD', template: '' },
  week: { folder: '', format: 'gggg-[W]ww', template: '' },
  month: { folder: '', format: 'YYYY-MM', template: '' },
};

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** The periodic notes setup kept in the app's settings, with Obsidian's defaults for whatever is missing. */
export function periodicSettings(settings: Settings): PeriodicSettings {
  const stored = record(settings.periodic);
  const read = (period: Period): PeriodSettings => {
    const value = record(stored[period]);
    const text = (key: keyof PeriodSettings) => (typeof value[key] === 'string' ? value[key] : DEFAULT_PERIODIC[period][key]);
    return { folder: text('folder'), format: text('format') || DEFAULT_PERIODIC[period].format, template: text('template') };
  };
  return { day: read('day'), week: read('week'), month: read('month') };
}

export const startOfPeriod = (period: Period, date: Date) =>
  period === 'day' ? date : period === 'week' ? startOfWeek(date) : startOfMonth(date);

const cleanFolder = (folder: string) => folder.trim().replace(/^\/+|\/+$/g, '');

/** Where the note for that day, week or month belongs. A format may hold folders of its own (`YYYY/MM/DD`). */
export function periodicPath(period: Period, date: Date, settings: PeriodicSettings): string {
  const { folder, format } = settings[period];
  const name = `${formatDate(startOfPeriod(period, date), format)}.md`;
  return cleanFolder(folder) ? `${cleanFolder(folder)}/${name}` : name;
}

/**
 * Which day, week or month a note stands for: a note inside that period's folder whose name
 * (or path below the folder) reads back as a date in its format. Days are tried first.
 */
export function periodOf(path: string, settings: PeriodicSettings): { period: Period; date: Date } | undefined {
  for (const period of PERIODS) {
    const { folder, format } = settings[period];
    const prefix = cleanFolder(folder) ? `${cleanFolder(folder)}/` : '';
    if (!path.startsWith(prefix)) continue;
    const below = path.slice(prefix.length).replace(/\.md$/i, '');
    const date = parseDate(noteTitle(path), format) ?? parseDate(below, format);
    if (date) return { period, date: startOfPeriod(period, date) };
  }
  return undefined;
}

/** Which day, week or month a link's target names, wherever that note is or would be. */
export function periodOfName(name: string, settings: PeriodicSettings): { period: Period; date: Date } | undefined {
  for (const period of PERIODS) {
    const date = parseDate(name.trim(), settings[period].format);
    if (date) return { period, date: startOfPeriod(period, date) };
  }
  return undefined;
}

export const periodKey = (period: Period, date: Date) => `${period}:${formatDate(startOfPeriod(period, date), 'YYYY-MM-DD')}`;

/** Every periodic note in the vault, by `periodKey`. A note at the expected path wins over a namesake elsewhere in the folder. */
export function periodicIndex(files: VaultFile[], settings: PeriodicSettings): Map<string, string> {
  const index = new Map<string, string>();
  for (const file of files) {
    if (file.kind !== 'note') continue;
    const found = periodOf(file.path, settings);
    if (!found) continue;
    const key = periodKey(found.period, found.date);
    if (!index.has(key) || file.path === periodicPath(found.period, found.date, settings)) index.set(key, file.path);
  }
  return index;
}

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function shift(date: Date, amount: number, unit: string): Date {
  if (unit === 'd') return addDays(date, amount);
  if (unit === 'w') return addDays(date, amount * 7);
  // Months and years keep the day of the month, or the month's last day when it is shorter, as moment does.
  const target = addMonths(date, unit === 'M' ? amount : amount * 12);
  const lastDay = day(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return day(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), lastDay));
}

interface TemplateContext {
  /** The new note's name. */
  title: string;
  /** The day the note stands for: the day, the week's Monday or the month's first day. */
  date: Date;
  /** That period's name format, which a bare `{{date}}` uses. */
  format: string;
  /** For times: `{{time}}`, and `HH:mm` inside a date format. */
  now: Date;
}

/**
 * Fills the template variables Obsidian's daily and periodic notes fill: `{{title}}`, `{{date}}`,
 * `{{time}}`, `{{date:FORMAT}}`, `{{date+1d:FORMAT}}` (d, w, M, y), `{{yesterday}}`, `{{tomorrow}}`,
 * and `{{monday:FORMAT}}` … `{{sunday:FORMAT}}` for the days of the note's week. Anything else stays as written.
 */
export function fillTemplate(template: string, { title, date, format, now }: TemplateContext): string {
  const at = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), now.getHours(), now.getMinutes(), now.getSeconds());
  return template.replace(/{{\s*(\w+)\s*(?:([+-]\d+)([dwMy]))?\s*(?::([^}]*))?}}/g, (whole, name: string, amount?: string, unit?: string, custom?: string) => {
    const key = name.toLowerCase();
    if (key === 'title' && !amount && custom === undefined) return title;
    if (key === 'time' && !amount) return formatDate(now, custom?.trim() || 'HH:mm');
    if (key === 'yesterday' || key === 'tomorrow') return formatDate(addDays(date, key === 'yesterday' ? -1 : 1), custom?.trim() || format);
    const weekday = WEEKDAYS.indexOf(key);
    if (weekday >= 0 && !amount) return formatDate(at(addDays(startOfWeek(date), weekday)), custom?.trim() || format);
    if (key === 'date') {
      const shifted = amount && unit ? shift(date, Number(amount), unit) : date;
      return formatDate(at(shifted), custom?.trim() || format);
    }
    return whole;
  });
}

/** Built-in starting text for new notes. Existing vault notes are never rewritten. */
export function builtInPeriodicText(period: Period, date: Date): string {
  if (period === 'day') return `---
date: ${formatDate(date, 'YYYY-MM-DD')}
done:
sleep:
focus:
energy:
mood:
---

> [!tldr]+ Summary of the day
>

### Tasks

**Gratitude practice:**

### stream of consc
`;
  if (period === 'week') return '---\ncssclasses:\n  - rpg-week\n---\n\n#### Plus\n\n#### Minus\n\n#### Next\n';
  return '---\ncssclasses:\n  - rpg-month\n---\n\n## Month Summary\n';
}

export interface PeriodicFeatures { habits: boolean; thoughtRecords: boolean }
export const DEFAULT_PERIODIC_FEATURES: PeriodicFeatures = { habits: true, thoughtRecords: true };
export function periodicFeatures(value: unknown): PeriodicFeatures {
  const stored = record(value);
  return {
    habits: typeof stored.habits === 'boolean' ? stored.habits : true,
    thoughtRecords: typeof stored.thoughtRecords === 'boolean' ? stored.thoughtRecords : true,
  };
}
