// Dates in Obsidian's format strings (moment.js tokens), for periodic note names and templates.
// Dates here are local calendar days: a Date at local midnight.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const day = (year: number, month: number, date: number) => new Date(year, month, date);
export const addDays = (date: Date, days: number) => day(date.getFullYear(), date.getMonth(), date.getDate() + days);
export const addMonths = (date: Date, months: number) => day(date.getFullYear(), date.getMonth() + months, 1);
export const sameDay = (a: Date, b: Date) => a.getTime() === b.getTime();
export const today = () => {
  const now = new Date();
  return day(now.getFullYear(), now.getMonth(), now.getDate());
};

/** Monday of the ISO week the date falls in. */
export const startOfWeek = (date: Date) => addDays(date, -((date.getDay() + 6) % 7));
export const startOfMonth = (date: Date) => day(date.getFullYear(), date.getMonth(), 1);

/** ISO 8601: weeks start on Monday, and week 1 holds the year's first Thursday. */
export function isoWeek(date: Date): { year: number; week: number } {
  const thursday = addDays(startOfWeek(date), 3);
  const year = thursday.getFullYear();
  const week = Math.floor(Math.round((thursday.getTime() - day(year, 0, 1).getTime()) / 86_400_000) / 7) + 1;
  return { year, week };
}

/** Moment's default locale weeks: they start on Sunday, and week 1 holds January 1st. */
function localeWeek(date: Date): { year: number; week: number } {
  const saturday = addDays(date, 6 - date.getDay());
  const year = saturday.getFullYear();
  const week = Math.floor(Math.round((saturday.getTime() - day(year, 0, 1).getTime()) / 86_400_000) / 7) + 1;
  return { year, week };
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

// Longest first, so `MMMM` wins over `MM`. `[...]` is literal text.
const TOKENS = /\[[^\]]*\]|YYYY|GGGG|gggg|YY|GG|gg|MMMM|MMM|MM|Mo|M|DDDD|DD|Do|D|dddd|ddd|dd|d|WW|W|ww|w|HH|H|hh|h|mm|ss|A|a/g;

/** Formats a date with moment.js tokens, as Obsidian names daily notes. English names only. */
export function formatDate(date: Date, format: string): string {
  const iso = isoWeek(date);
  const local = localeWeek(date);
  const hours12 = date.getHours() % 12 || 12;
  return format.replace(TOKENS, (token) => {
    switch (token) {
      case 'YYYY': return String(date.getFullYear());
      case 'YY': return pad(date.getFullYear() % 100);
      case 'GGGG': return String(iso.year);
      case 'GG': return pad(iso.year % 100);
      case 'gggg': return String(local.year);
      case 'gg': return pad(local.year % 100);
      case 'MMMM': return MONTHS[date.getMonth()] ?? '';
      case 'MMM': return (MONTHS[date.getMonth()] ?? '').slice(0, 3);
      case 'MM': return pad(date.getMonth() + 1);
      case 'Mo': return ordinal(date.getMonth() + 1);
      case 'M': return String(date.getMonth() + 1);
      case 'DDDD': return pad(Math.round((date.getTime() - day(date.getFullYear(), 0, 1).getTime()) / 86_400_000) + 1, 3);
      case 'DD': return pad(date.getDate());
      case 'Do': return ordinal(date.getDate());
      case 'D': return String(date.getDate());
      case 'dddd': return WEEKDAYS[date.getDay()] ?? '';
      case 'ddd': return (WEEKDAYS[date.getDay()] ?? '').slice(0, 3);
      case 'dd': return (WEEKDAYS[date.getDay()] ?? '').slice(0, 2);
      case 'd': return String(date.getDay());
      case 'WW': return pad(iso.week);
      case 'W': return String(iso.week);
      case 'ww': return pad(local.week);
      case 'w': return String(local.week);
      case 'HH': return pad(date.getHours());
      case 'H': return String(date.getHours());
      case 'hh': return pad(hours12);
      case 'h': return String(hours12);
      case 'mm': return pad(date.getMinutes());
      case 'ss': return pad(date.getSeconds());
      case 'A': return date.getHours() < 12 ? 'AM' : 'PM';
      case 'a': return date.getHours() < 12 ? 'am' : 'pm';
      default: return token.slice(1, -1);
    }
  });
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Reads a note name back into the day it stands for, or `undefined`. A week name gives its
 * Monday and a month name its first day. A name only counts when formatting that day gives the
 * same name back, so `31.02.2026` or a stray `2026-W60` never pass.
 */
export function parseDate(text: string, format: string): Date | undefined {
  const fields: string[] = [];
  let pattern = '';
  let last = 0;
  for (const match of format.matchAll(TOKENS)) {
    const token = match[0];
    pattern += escape(format.slice(last, match.index));
    last = match.index + token.length;
    if (token.startsWith('[')) {
      pattern += escape(token.slice(1, -1));
      continue;
    }
    fields.push(token);
    if (/^(MMMM|MMM|dddd|ddd|dd)$/.test(token)) pattern += '([A-Za-z]+)';
    else if (/^(Mo|Do)$/.test(token)) pattern += '(\\d{1,2}(?:st|nd|rd|th))';
    else if (/^(A|a)$/.test(token)) pattern += '([AaPp][Mm])';
    else pattern += '(\\d+)';
  }
  pattern += escape(format.slice(last));
  const match = new RegExp(`^${pattern}$`).exec(text);
  if (!match) return undefined;

  const value = new Map<string, number>();
  fields.forEach((token, i) => {
    const raw = match[i + 1] ?? '';
    if (token === 'MMMM' || token === 'MMM') {
      value.set('M', MONTHS.findIndex((name) => name.toLowerCase().startsWith(raw.toLowerCase())) + 1);
    } else if (/^\d/.test(raw)) {
      value.set(token === 'MM' || token === 'Mo' ? 'M' : token === 'DD' || token === 'Do' ? 'D' : token, parseInt(raw, 10));
    }
  });
  const twoDigit = (long: string, short: string) => value.get(long) ?? (value.has(short) ? 2000 + (value.get(short) ?? 0) : undefined);
  const year = twoDigit('YYYY', 'YY');
  const month = value.get('M');
  const date = value.get('D');
  const isoYear = twoDigit('GGGG', 'GG');
  const week = value.get('WW') ?? value.get('W');
  const dayOfYear = value.get('DDDD');

  let result: Date | undefined;
  if (year !== undefined && month && date !== undefined) result = day(year, month - 1, date);
  else if (isoYear !== undefined && week !== undefined) result = addDays(startOfWeek(day(isoYear, 0, 4)), (week - 1) * 7);
  else if (year !== undefined && month) result = day(year, month - 1, 1);
  else if (year !== undefined && dayOfYear !== undefined) result = day(year, 0, dayOfYear);
  return result && formatDate(result, format) === text ? result : undefined;
}

/** Six weeks of days, Monday first, that show a month in a calendar. */
export function monthGrid(month: Date): Date[][] {
  const first = startOfWeek(startOfMonth(month));
  return Array.from({ length: 6 }, (_, week) => Array.from({ length: 7 }, (_, i) => addDays(first, week * 7 + i)));
}
