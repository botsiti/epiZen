import type { Settings, VaultFile } from './api';
import { addDays, addMonths, day, formatDate, parseDate, startOfMonth, startOfWeek } from './dates';
import { noteFolder, noteTitle } from './links';
import { parseNote } from './frontmatter';
import { dateInName, type DateOrder, type PeriodDate } from './periodicNames';

export type Period = 'day' | 'week' | 'month';
export const PERIODS: Period[] = ['day', 'week', 'month'];

export interface PeriodSettings {
  /** Vault folder the notes go in; `''` is the top of the vault. */
  folder: string;
  /** moment.js format of the note name, as in Obsidian's daily notes settings. */
  format: string;
  /** Legacy setting, retained for compatibility; new notes use built-in text. */
  template: string;
  /** Previous locations/names remain readable after changing how future notes are created. */
  history?: { folder: string; format: string }[];
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
    const text = (key: 'folder' | 'format' | 'template') => (typeof value[key] === 'string' ? value[key] : DEFAULT_PERIODIC[period][key]);
    const history = Array.isArray(value.history) ? value.history.filter((entry): entry is { folder: string; format: string } => typeof record(entry).folder === 'string' && typeof record(entry).format === 'string') : [];
    return { folder: text('folder'), format: text('format') || DEFAULT_PERIODIC[period].format, template: text('template'), ...(history.length ? { history } : {}) };
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

export interface PeriodicRecognition {
  dateOrder: DateOrder;
  /** Explicit links, stored only in app settings. null leaves a note out of the calendar. */
  dates: Record<string, { period: Period; date: string } | null>;
  /** One chosen note per date when an import contains duplicates. */
  preferred: Record<string, string>;
}
export const DEFAULT_RECOGNITION: PeriodicRecognition = { dateOrder: 'dmy', dates: {}, preferred: {} };
export function recognitionSettings(value: unknown): PeriodicRecognition {
  const stored = record(value);
  const dates: PeriodicRecognition['dates'] = {};
  for (const [path, entry] of Object.entries(record(stored.dates))) {
    const item = record(entry);
    if (entry === null) dates[path] = null;
    else if (PERIODS.includes(item.period as Period) && typeof item.date === 'string' && parseDate(item.date, 'YYYY-MM-DD')) dates[path] = { period: item.period as Period, date: item.date };
  }
  return { dateOrder: stored.dateOrder === 'mdy' ? 'mdy' : 'dmy', dates, preferred: Object.fromEntries(Object.entries(record(stored.preferred)).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) };
}

/** Recognizes old notes without changing their contents or requiring the future naming pattern. */
export function periodOf(path: string, settings: PeriodicSettings, text = '', recognition = DEFAULT_RECOGNITION): PeriodDate | undefined {
  if (!/\.md$/i.test(path)) return undefined;
  if (Object.hasOwn(recognition.dates, path)) {
    const linked = recognition.dates[path];
    const date = linked && parseDate(linked.date, 'YYYY-MM-DD');
    return linked && date ? { period: linked.period, date: startOfPeriod(linked.period, date) } : undefined;
  }
  const { properties, body } = parseNote(text);
  const declared = PERIODS.find((period) => properties.period === period || properties.type === ({ day: 'daily', week: 'weekly', month: 'monthly' }[period]));
  const dateProperty = typeof properties.date === 'string' ? properties.date.replace(/T.*$/, '') : '';
  const metadata = parseDate(dateProperty, 'YYYY-MM-DD') ?? dateInName(dateProperty, recognition.dateOrder)?.date;
  if (declared && metadata) return { period: declared, date: startOfPeriod(declared, metadata) };
  const locations = PERIODS.flatMap((period) => [...(settings[period].history ?? []), settings[period]].map((location) => ({ period, ...location })))
    .filter(({ folder }) => !cleanFolder(folder) || path.startsWith(`${cleanFolder(folder)}/`))
    .sort((a, b) => b.folder.length - a.folder.length);
  if (!locations.length) return undefined;
  // Metadata gives arbitrarily named notes a date, but a generic library's `date` isn't a daily note.
  const specific = locations.filter(({ folder }) => cleanFolder(folder).length === cleanFolder(locations[0]?.folder ?? '').length);
  const kinds = [...new Set(specific.map(({ period }) => period))];
  const hinted = dateInName(noteTitle(path), recognition.dateOrder);
  const metadataFolders = metadata ? [...new Set(locations.filter(({ folder, format }) => {
    const parent = noteFolder(`${cleanFolder(folder) ? `${cleanFolder(folder)}/` : ''}${formatDate(metadata, format)}.md`);
    return parent && path.startsWith(`${parent}/`);
  }).map(({ period }) => period))] : [];
  if (metadata && (kinds.length === 1 || metadataFolders.length === 1 || hinted || !path.includes('/'))) {
    const period = declared ?? (kinds.length === 1 ? kinds[0] : metadataFolders.length === 1 ? metadataFolders[0] : hinted?.period ?? 'day');
    if (period) return { period, date: startOfPeriod(period, metadata) };
  }
  for (const { period, folder, format } of locations) {
    const prefix = cleanFolder(folder) ? `${cleanFolder(folder)}/` : '';
    const below = path.slice(prefix.length).replace(/\.md$/i, '');
    const date = parseDate(noteTitle(path), format) ?? parseDate(below, format);
    if (date) return hinted?.period === 'day' && period === 'day' ? hinted : { period, date: startOfPeriod(period, date) };
  }
  for (const { period, folder } of locations) {
    const below = path.slice(cleanFolder(folder) ? cleanFolder(folder).length + 1 : 0).replace(/\.md$/i, '');
    const found = hinted ?? dateInName(below, recognition.dateOrder);
    if (found?.period === period) return found;
    // Only a leading date heading counts, never a date mentioned somewhere in prose.
    const heading = /^#{1,2} ([^\r\n]+)(?:\r?\n|$)/.exec(body.trimStart())?.[1];
    const fromHeading = heading ? dateInName(heading, recognition.dateOrder) : undefined;
    if (fromHeading?.period === period && cleanFolder(folder)) return fromHeading;
  }
  return undefined;
}

/** Keep exact historical patterns for unusual names, automatically, when preferences change. */
export function rememberPeriodic(previous: PeriodicSettings, next: PeriodicSettings): PeriodicSettings {
  const result = { ...next };
  for (const period of PERIODS) {
    const old = previous[period], current = next[period];
    if (old.folder === current.folder && old.format === current.format) continue;
    const history = [...(old.history ?? []), { folder: old.folder, format: old.format }];
    result[period] = { ...current, history: history.filter((item, index) => history.findIndex((other) => other.folder === item.folder && other.format === item.format) === index) };
  }
  return result;
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

/** A create collision may belong to a different or explicitly excluded note. Never adopt it blindly. */
export function assertPeriodicNote(path: string, text: string, period: Period, date: Date, settings: PeriodicSettings, recognition: PeriodicRecognition): void {
  const found = periodOf(path, settings, text, recognition);
  if (!found || periodKey(found.period, found.date) !== periodKey(period, date)) {
    throw new Error(`The name ${path} is already used by another note. Link it to this date in Settings or choose a different future name.`);
  }
}

/** One calendar entry per date. Duplicates stay unresolved until the user chooses a file. */
export function periodicCatalog(files: VaultFile[], settings: PeriodicSettings, texts: ReadonlyMap<string, string> = new Map(), recognition = DEFAULT_RECOGNITION) {
  const index = new Map<string, string>();
  const byPath = new Map<string, PeriodDate>();
  const matches = new Map<string, string[]>();
  for (const file of files) {
    if (file.kind !== 'note') continue;
    const found = periodOf(file.path, settings, texts.get(file.path), recognition);
    if (!found) continue;
    const key = periodKey(found.period, found.date);
    byPath.set(file.path, found);
    matches.set(key, [...(matches.get(key) ?? []), file.path]);
  }
  for (const [key, paths] of matches) {
    const preferred = recognition.preferred[key];
    const path = paths.length === 1 ? paths[0] : preferred && paths.includes(preferred) ? preferred : undefined;
    if (path) index.set(key, path);
  }
  return { index, byPath, matches };
}

export const periodicIndex = (files: VaultFile[], settings: PeriodicSettings, texts?: ReadonlyMap<string, string>, recognition?: PeriodicRecognition) => periodicCatalog(files, settings, texts, recognition).index;

/** Old prose stays readable; only compatible dashboards replace the reading view. */
export function hasPeriodicDashboard(text: string, period: Period): boolean {
  const { properties, error } = parseNote(text);
  if (error) return false;
  const classes = Array.isArray(properties.cssclasses) ? properties.cssclasses : typeof properties.cssclasses === 'string' ? properties.cssclasses.split(/\s+/) : [];
  if (classes.includes(`rpg-${period}`)) return true;
  return period === 'day' && ['done', 'sleep', 'focus', 'energy', 'mood'].filter((key) => Object.hasOwn(properties, key)).length >= 3;
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
  date = startOfPeriod(period, date);
  if (period === 'day') return `---
period: day
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
  const metadata = `---\nperiod: ${period}\ndate: ${formatDate(date, 'YYYY-MM-DD')}\ncssclasses:\n  - rpg-${period}\n---\n\n`;
  return metadata + (period === 'week' ? '#### Plus\n\n#### Minus\n\n#### Next\n' : '## Month Summary\n');
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

/** Naming only needs to produce safe, distinct paths; recognition no longer depends on it. */
export function periodicNamingError(settings: PeriodicSettings): string | undefined {
  for (const period of PERIODS) {
    const paths = new Set<string>();
    const count = period === 'day' ? 400 : period === 'week' ? 60 : 25;
    for (let i = 0; i < count; i++) {
      const date = new Date(2026, period === 'month' ? i : 0, period === 'month' ? 1 : 1 + i * (period === 'week' ? 7 : 1));
      const path = periodicPath(period, date, settings);
      if (!settings[period].format.trim() || path.split('/').some((part) => !part.trim() || part === '.' || part === '..' || part.startsWith('.')) || (path.includes('\\') || [...path].some((character) => character.charCodeAt(0) < 32))) return `Choose a valid folder and future name for ${({ day: 'daily notes', week: 'weekly notes', month: 'monthly notes' }[period])}.`;
      if (paths.has(path.toLowerCase())) return `Future ${({ day: 'daily notes', week: 'weekly notes', month: 'monthly notes' }[period])} need distinct names, including a year and the ${period}.`;
      paths.add(path.toLowerCase());
    }
  }
  return undefined;
}
