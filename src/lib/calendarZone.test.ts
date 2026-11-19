// @vitest-environment node
import { expect, it } from 'vitest';
import { calendarDay, calendarDayStart, calendarInstant, calendarQueryRange, calendarZonePreference } from './calendarZone';
import { day, formatDate } from './dates';
import { allDayOn, at, plansOn, planTimes } from './plans';
import type { CalendarEvent } from './api';

const zone = 'America/Los_Angeles';
function event(start: string, end: string): CalendarEvent {
  return { id: 'one', calendar: 'work', title: 'Study', allDay: false, writable: true, start: Date.parse(start), end: Date.parse(end) };
}

it('validates persisted zone preferences and supports fractional offsets and seasonal shifts', () => {
  for (const value of [null, '', 42, 'Mars/Olympus', '+15:00']) expect(calendarZonePreference(value)).toBeUndefined();
  expect(calendarZonePreference(zone)).toBe(zone);
  expect(calendarInstant(day(2026, 10, 18), 9 * 60, 'Asia/Kathmandu')).toBe(Date.parse('2026-11-18T03:15:00Z'));
  expect(calendarInstant(day(2026, 6, 1), 9 * 60, zone)).toBe(Date.parse('2026-07-01T16:00:00Z'));
  expect(calendarInstant(day(2026, 0, 1), 9 * 60, zone)).toBe(Date.parse('2026-01-01T17:00:00Z'));
});

it('fetches and clips events across the week boundary in the display zone while preserving all-day dates', () => {
  const monday = day(2026, 7, 17), sunday = day(2026, 7, 16), tokyo = 'Asia/Tokyo';
  const night = event('2026-08-16T14:30:00Z', '2026-08-16T16:15:00Z');
  expect(formatDate(calendarDay(night.end, tokyo), 'YYYY-MM-DD')).toBe('2026-08-17');
  expect(plansOn([night], sunday, tokyo)[0]).toMatchObject({ start: 1410, end: 1440, cut: true });
  expect(plansOn([night], monday, tokyo)[0]).toMatchObject({ start: 0, end: 75, cut: true });
  expect(plansOn([night], monday, zone)).toHaveLength(0);
  expect(plansOn([night], sunday, zone)[0]).toMatchObject({ start: 450, end: 555, cut: false });
  const fetch = calendarQueryRange(monday, 7, tokyo);
  expect(fetch.from).toBeLessThanOrEqual(Date.parse('2026-08-16T15:00:00Z'));
  expect(fetch.to).toBeGreaterThanOrEqual(Date.parse('2026-08-23T15:00:00Z'));
  const holiday = { ...night, allDay: true, start: at(monday, 0), end: at(monday, 1440) };
  expect(fetch.from).toBeLessThanOrEqual(holiday.start);
  expect(allDayOn([holiday], monday)).toEqual([holiday]);
  expect(allDayOn([holiday], sunday)).toEqual([]);
});

it('uses real DST day lengths, rejects skipped times, and preserves elapsed time when moving a block', () => {
  const spring = day(2026, 2, 8), fall = day(2026, 10, 1);
  expect(calendarDayStart(day(2026, 2, 9), zone) - calendarDayStart(spring, zone)).toBe(23 * 3600000);
  expect(calendarDayStart(day(2026, 10, 2), zone) - calendarDayStart(fall, zone)).toBe(25 * 3600000);
  expect(() => planTimes(spring, 150, 195, zone)).toThrow('does not exist');
  const crosses = event('2026-03-08T09:30:00Z', '2026-03-08T10:30:00Z');
  const moved = planTimes(spring, 240, 360, zone, { event: crosses, edge: 'move' });
  expect(moved).toEqual({ start: Date.parse('2026-03-08T11:00:00Z'), end: Date.parse('2026-03-08T12:00:00Z') });
});

it('shows both pieces across a repeated hour and retains the occurrence offset when resizing', () => {
  const fall = day(2026, 10, 1);
  const repeated = event('2026-11-01T08:45:00Z', '2026-11-01T09:15:00Z');
  const blocks = plansOn([repeated], fall, zone);
  expect(blocks.map((part) => [part.start, part.end])).toEqual([[60, 75], [105, 120]]);
  expect(new Set(blocks.map((part) => part.key)).size).toBe(2);
  const second = event('2026-11-01T09:15:00Z', '2026-11-01T09:30:00Z');
  expect(planTimes(fall, 75, 105, zone, { event: second, edge: 'bottom' })).toEqual({ start: second.start, end: Date.parse('2026-11-01T09:45:00Z') });
  expect(planTimes(fall, 75, 90, zone).start).toBe(Date.parse('2026-11-01T08:15:00Z'));
});
