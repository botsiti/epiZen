import { Temporal } from '@js-temporal/polyfill';
import { addDays, day } from './dates';

/** An absent preference follows the Mac, including after travel. */
export const systemCalendarZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
export function calendarZonePreference(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value || value.length > 100 || !/^[A-Za-z][\w/+.-]*$/.test(value)) return undefined;
  try { return new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions().timeZone; }
  catch { return undefined; }
}

export const calendarMoment = (instant: number, zone: string) => Temporal.Instant.fromEpochMilliseconds(instant).toZonedDateTimeISO(zone);
const civilDate = (date: Date) => new Temporal.PlainDate(date.getFullYear(), date.getMonth() + 1, date.getDate());

/** Date-only key for the existing note and navigation APIs. Never use this key as an event instant. */
export function calendarDay(instant: number, zone: string): Date {
  const { year, month, day: date } = calendarMoment(instant, zone);
  return day(year, month - 1, date);
}

export function calendarDayStart(date: Date, zone: string): number {
  return civilDate(date).toZonedDateTime(zone).epochMilliseconds;
}

/** EventKit also supplies floating all-day dates using the Mac's day boundaries. Fetch both
 * intervals, then clip timed events in the display zone and all-day events by their original dates. */
export function calendarQueryRange(first: Date, days: number, zone: string, local = systemCalendarZone()) {
  const after = addDays(first, days);
  return { from: Math.min(calendarDayStart(first, zone), calendarDayStart(first, local)),
    to: Math.max(calendarDayStart(after, zone), calendarDayStart(after, local)) };
}

/** New plans use the first occurrence of a repeated hour. Edits prefer the original offset.
 * Reject missing times before writing either the linked note or the calendar event. */
export function calendarInstant(date: Date, minute: number, zone: string, original?: number): number {
  const wall = civilDate(date).toPlainDateTime().add({ minutes: minute });
  const offset = original === undefined ? undefined : calendarMoment(original, zone).offset;
  const resolved = Temporal.ZonedDateTime.from({
    timeZone: zone, year: wall.year, month: wall.month, day: wall.day,
    hour: wall.hour, minute: wall.minute, second: wall.second, offset,
  }, { offset: 'prefer', disambiguation: 'compatible' });
  if (!resolved.toPlainDateTime().equals(wall)) throw new Error(`That time does not exist in ${zone} because the clocks change. Choose another time.`);
  return resolved.epochMilliseconds;
}
