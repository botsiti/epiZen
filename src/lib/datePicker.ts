import { addDays, day, formatDate, monthGrid, startOfMonth, startOfWeek } from './dates';

// The calendar a date field opens: which month it shows, the days it draws, and where the keys
// move. Dates are local calendar days, written YYYY-MM-DD as the vault writes them.

/** A day as a date field writes it: YYYY-MM-DD. */
export const dayValue = (date: Date) => formatDate(date, 'YYYY-MM-DD');

/** A field's text as a day, when it is a real one written YYYY-MM-DD; `undefined` while it isn't. */
export function readDay(value: string | undefined): Date | undefined {
  const match = /^\s*(\d{4})-(\d{2})-(\d{2})\s*$/.exec(value ?? '');
  if (!match) return undefined;
  const [year, month, date] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const read = day(year, month, date);
  return read.getFullYear() === year && read.getMonth() === month && read.getDate() === date ? read : undefined;
}

/** The month the calendar opens on: the chosen day's, or else today's. */
export const openingMonth = (chosen: Date | undefined, today: Date) => startOfMonth(chosen ?? today);

/** Six weeks, Monday first, so the calendar keeps its height from month to month. */
export const pickerWeeks = (month: Date): Date[][] => monthGrid(month);

/** The same day of the month some months on, or the month's last day when it is shorter (31 March, back one: 28 February). */
export function shiftMonths(date: Date, months: number): Date {
  const first = day(date.getFullYear(), date.getMonth() + months, 1);
  const last = day(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return day(first.getFullYear(), first.getMonth(), Math.min(date.getDate(), last));
}

/**
 * Where the keyboard moves from a day: the arrows by a day or a week, Page Up and Down by a month
 * (with Shift, a year), Home and End to Monday and Sunday. `undefined` for any other key.
 */
export function moveDay(from: Date, key: string, shift = false): Date | undefined {
  switch (key) {
    case 'ArrowLeft':
      return addDays(from, -1);
    case 'ArrowRight':
      return addDays(from, 1);
    case 'ArrowUp':
      return addDays(from, -7);
    case 'ArrowDown':
      return addDays(from, 7);
    case 'PageUp':
      return shiftMonths(from, shift ? -12 : -1);
    case 'PageDown':
      return shiftMonths(from, shift ? 12 : 1);
    case 'Home':
      return startOfWeek(from);
    case 'End':
      return addDays(startOfWeek(from), 6);
    default:
      return undefined;
  }
}
