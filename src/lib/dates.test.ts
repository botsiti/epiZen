import { describe, expect, it } from 'vitest';
import { day, formatDate, isoWeek, monthGrid, parseDate } from './dates';

// The formats the demo vault (and Bat's vault) use, with real names from demo-vault/.
const DAILY = 'DD.MM.YYYY';
const WEEKLY = 'GGGG-[W]WW - DD.MM.YY';
const MONTHLY = 'MM.YY [RPG]';

describe('formatDate', () => {
  it('names daily, weekly and monthly notes as the demo vault does', () => {
    expect(formatDate(day(2026, 7, 14), DAILY)).toBe('14.08.2026');
    expect(formatDate(day(2026, 7, 10), WEEKLY)).toBe('2026-W33 - 10.08.26');
    expect(formatDate(day(2026, 7, 1), MONTHLY)).toBe('08.26 RPG');
  });

  it('knows Obsidian defaults and long names', () => {
    expect(formatDate(day(2026, 9, 24), 'YYYY-MM-DD')).toBe('2026-10-24');
    expect(formatDate(day(2026, 7, 14), 'dddd, MMMM Do, YYYY')).toBe('Friday, August 14th, 2026');
    expect(formatDate(day(2026, 10, 3), 'ddd D MMM')).toBe('Tue 3 Nov');
  });

  it('uses ISO weeks for GGGG and WW, across the turn of a year', () => {
    expect(isoWeek(day(2026, 0, 1))).toEqual({ year: 2026, week: 1 });
    expect(isoWeek(day(2027, 0, 1))).toEqual({ year: 2026, week: 53 });
    expect(formatDate(day(2025, 11, 29), 'GGGG-[W]WW')).toBe('2026-W01');
  });
});

describe('parseDate', () => {
  it('reads note names back into days', () => {
    expect(parseDate('24.10.2026', DAILY)).toEqual(day(2026, 9, 24));
    expect(parseDate('2026-W33 - 10.08.26', WEEKLY)).toEqual(day(2026, 7, 10));
    expect(parseDate('08.26 RPG', MONTHLY)).toEqual(day(2026, 7, 1));
    expect(parseDate('2026-W43', 'GGGG-[W]WW')).toEqual(day(2026, 9, 19));
    expect(parseDate('2026-10', 'YYYY-MM')).toEqual(day(2026, 9, 1));
  });

  it('refuses names that are not that format, or no such day', () => {
    for (const name of ['31.02.2026', '1.10.2026', '24-10-2026', '24.10.2026 notes', 'Glasshouse Weather']) {
      expect(parseDate(name, DAILY)).toBeUndefined();
    }
    // The week number must agree with the date.
    expect(parseDate('2026-W34 - 10.08.26', WEEKLY)).toBeUndefined();
    expect(parseDate('08x26 RPG', MONTHLY)).toBeUndefined();
  });
});

describe('monthGrid', () => {
  it('shows six Monday-first weeks around the month', () => {
    const grid = monthGrid(day(2026, 7, 14));
    expect(grid).toHaveLength(6);
    expect(grid[0]?.[0]).toEqual(day(2026, 6, 27));
    expect(grid[0]?.[5]).toEqual(day(2026, 7, 1));
  });
});
