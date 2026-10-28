import { describe, expect, it } from 'vitest';
import { day } from './dates';
import { dayValue, moveDay, openingMonth, pickerWeeks, readDay, shiftMonths } from './datePicker';

// Dates as the demo vault's notes write them: "Listened: 2026-08-21", "Finshed: 2026-09-19".

describe('the date picker', () => {
  it('reads a field\'s YYYY-MM-DD as a day, and nothing else', () => {
    expect(readDay('2026-08-21')).toEqual(day(2026, 7, 21));
    expect(readDay(' 2026-09-19 ')).toEqual(day(2026, 8, 19));
    for (const text of ['', '2026-09-31', '2026-02-29', '2026-9-1', '21.08.2026', '2026-08-21T10:00', undefined]) expect(readDay(text)).toBeUndefined();
    expect(readDay('2028-02-29')).toEqual(day(2028, 1, 29));
    expect(dayValue(day(2026, 0, 5))).toBe('2026-01-05');
  });

  it('opens on the chosen day\'s month, or today\'s', () => {
    expect(openingMonth(day(2026, 7, 21), day(2026, 9, 28))).toEqual(day(2026, 7, 1));
    expect(openingMonth(undefined, day(2026, 9, 28))).toEqual(day(2026, 9, 1));
  });

  it('draws six weeks from a Monday, the month inside them', () => {
    const weeks = pickerWeeks(day(2026, 8, 1));
    expect(weeks).toHaveLength(6);
    expect(weeks.every((week) => week.length === 7 && week[0]?.getDay() === 1)).toBe(true);
    // September 2026 starts on a Tuesday.
    expect(weeks[0]?.[0]).toEqual(day(2026, 7, 31));
    expect(weeks[0]?.[1]).toEqual(day(2026, 8, 1));
  });

  it('moves by a day, a week, a month or a year, and to the ends of the week', () => {
    const from = day(2026, 8, 21); // a Monday
    expect(moveDay(from, 'ArrowLeft')).toEqual(day(2026, 8, 20));
    expect(moveDay(from, 'ArrowRight')).toEqual(day(2026, 8, 22));
    expect(moveDay(from, 'ArrowUp')).toEqual(day(2026, 8, 14));
    expect(moveDay(from, 'ArrowDown')).toEqual(day(2026, 8, 28));
    expect(moveDay(from, 'PageUp')).toEqual(day(2026, 7, 21));
    expect(moveDay(from, 'PageDown', true)).toEqual(day(2027, 8, 21));
    expect(moveDay(day(2026, 8, 24), 'Home')).toEqual(day(2026, 8, 21));
    expect(moveDay(day(2026, 8, 24), 'End')).toEqual(day(2026, 8, 27));
    expect(moveDay(from, 'Enter')).toBeUndefined();
    // Across the turn of a month and a year.
    expect(moveDay(day(2026, 11, 31), 'ArrowRight')).toEqual(day(2027, 0, 1));
  });

  it('keeps the day of the month across months, or the last day of a shorter one', () => {
    expect(shiftMonths(day(2026, 2, 31), -1)).toEqual(day(2026, 1, 28));
    expect(shiftMonths(day(2026, 0, 31), 1)).toEqual(day(2026, 1, 28));
    expect(shiftMonths(day(2027, 11, 15), 1)).toEqual(day(2028, 0, 15));
    expect(shiftMonths(day(2028, 1, 29), -12)).toEqual(day(2027, 1, 28));
  });
});
