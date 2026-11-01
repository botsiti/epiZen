import { addDays, day, isoWeek, startOfWeek } from './dates';
import type { Period } from './periodic';

export type DateOrder = 'dmy' | 'mdy';
export interface PeriodDate { period: Period; date: Date }

function calendarDate(year: number, month: number, date = 1): Date | undefined {
  const result = day(year, month - 1, date);
  return year >= 1000 && result.getFullYear() === year && result.getMonth() === month - 1 && result.getDate() === date ? result : undefined;
}

// Names are evidence, not JavaScript Date strings: no rollover, timezone conversion or locale guessing.
// Text around a date is fine; two different dates in one name need the user's help.
export function dateInName(name: string, order: DateOrder): PeriodDate | undefined {
  const input = name.normalize('NFC');
  const unique = (period: Period, dates: (Date | undefined)[]): PeriodDate | undefined => {
    if (dates.some((date) => !date)) return undefined;
    const found = [...new Set(dates.map((date) => date?.getTime()))];
    return found.length === 1 && found[0] !== undefined ? { period, date: new Date(found[0]) } : undefined;
  };
  const weeks = [...input.matchAll(/(?<!\d)(\d{4})[- ._/]*W(\d{1,2})(?!\d)/gi)];
  if (weeks.length) return unique('week', weeks.map((match) => {
    const year = Number(match[1]), week = Number(match[2]);
    const date = addDays(startOfWeek(day(year, 0, 4)), (week - 1) * 7);
    const iso = isoWeek(date);
    return iso.year === year && iso.week === week ? date : undefined;
  }));
  const ymd = [...input.matchAll(/(?<!\d)(\d{4})[-._/ ](\d{1,2})[-._/ ](\d{1,2})(?!\d)/g)];
  const compact = [...input.matchAll(/(?<!\d)(\d{4})(\d{2})(\d{2})(?!\d)/g)];
  if (ymd.length || compact.length) return unique('day', [...ymd, ...compact].map((match) => calendarDate(Number(match[1]), Number(match[2]), Number(match[3]))));
  const local = [...input.matchAll(/(?<!\d)(\d{1,2})[-._/ ](\d{1,2})[-._/ ](\d{4}|\d{2})(?!\d)/g)];
  if (local.length) return unique('day', local.map((match) => {
    const a = Number(match[1]), b = Number(match[2]), y = Number(match[3]);
    const dmy = a > 12 || (b <= 12 && order === 'dmy');
    return calendarDate(y < 100 ? y + 2000 : y, dmy ? b : a, dmy ? a : b);
  }));

  const words = [...input.matchAll(/(?<![\p{L}\d])(\d{1,2})(?:st|nd|rd|th)?[ ._/-]+([\p{L}]+)[ ._,/-]+(\d{4})(?!\d)|(?<![\p{L}\d])([\p{L}]+)[ ._/-]+(\d{1,2})(?:st|nd|rd|th)?[ ._,/-]+(\d{4})(?!\d)/gu)];
  const namedDays = words.filter((m) => monthNumber(m[2] ?? m[4] ?? '') !== undefined);
  if (namedDays.length) return unique('day', namedDays.map((m) => calendarDate(Number(m[3] ?? m[6]), monthNumber(m[2] ?? m[4] ?? '') ?? 0, Number(m[1] ?? m[5]))));

  const months = [...input.matchAll(/(?<!\d)(\d{4})[-._/ ](\d{1,2})(?!\d)|(?<!\d)(\d{1,2})[._/ -](\d{4}|\d{2})(?!\d)/g)];
  if (months.length) return unique('month', months.map((m) => {
    const year = Number(m[1] ?? m[4]);
    return calendarDate(year < 100 ? 2000 + year : year, Number(m[2] ?? m[3]));
  }));
  const namedMonths = [...input.matchAll(/(?<!\p{L})([\p{L}]+)[ ._,/-]+(\d{4})(?!\d)|(?<!\d)(\d{4})[ ._,/-]+([\p{L}]+)/gu)]
    .filter((m) => monthNumber(m[1] ?? m[4] ?? '') !== undefined);
  return unique('month', namedMonths.map((m) => calendarDate(Number(m[2] ?? m[3]), monthNumber(m[1] ?? m[4] ?? '') ?? 0)));
}

const MONTH_NAMES = new Map<string, number>();
for (const locale of ['en', 'ru']) {
  for (let month = 0; month < 12; month++) {
    for (const width of ['long', 'short'] as const) {
      for (const withDay of [false, true]) {
        const parts = new Intl.DateTimeFormat(locale, { month: width, ...(withDay ? { day: 'numeric' as const } : {}) }).formatToParts(day(2026, month, 1));
        const name = parts.find((part) => part.type === 'month')?.value.toLowerCase().replace(/\.$/, '');
        if (name) MONTH_NAMES.set(name, month + 1);
      }
    }
  }
}
const monthNumber = (name: string) => MONTH_NAMES.get(name.toLowerCase());
