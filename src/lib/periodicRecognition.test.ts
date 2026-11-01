import { describe, expect, it } from 'vitest';
import { day } from './dates';
import { dateInName } from './periodicNames';
import { DEFAULT_PERIODIC, DEFAULT_RECOGNITION, assertPeriodicNote, builtInPeriodicText, hasPeriodicDashboard, periodKey, periodOf, periodicCatalog, periodicNamingError, periodicPath, recognitionSettings, rememberPeriodic } from './periodic';
import { STARTER_PERIODIC } from './vaultSetup';

describe('mixed historical periodic names', () => {
  it.each([
    ['2026-10-30', 'day', day(2026, 9, 30)], ['30.10.2026', 'day', day(2026, 9, 30)],
    ['Journal 20261030 Friday', 'day', day(2026, 9, 30)], ['2026/10/30', 'day', day(2026, 9, 30)],
    ['October 30th, 2026', 'day', day(2026, 9, 30)], ['30 октября 2026', 'day', day(2026, 9, 30)],
    ['30 окт. 2026', 'day', day(2026, 9, 30)], ['2026-W44 - 26.10.26', 'week', day(2026, 9, 26)],
    ['10.26 RPG', 'month', day(2026, 9, 1)], ['October 2026', 'month', day(2026, 9, 1)],
    ['2026-10', 'month', day(2026, 9, 1)], ['Октябрь 2026', 'month', day(2026, 9, 1)],
  ])('recognizes %s without a naming configuration', (name, period, date) => {
    expect(dateInName(name, 'dmy')).toEqual({ period, date });
  });
  it.each(['31.02.2026', '2026-02-29', '2026-W54', '2026-13', '2026-10-29 and 2026-10-30', 'My thoughts', 'track 03'])('does not invent a date for %s', (name) => {
    expect(dateInName(name, 'dmy')).toBeUndefined();
  });
  it('uses a separate date order, unaffected by the future naming pattern', () => {
    const settings = { ...DEFAULT_PERIODIC, day: { folder: 'Journal', format: 'YYYY-MM-DD', template: '' } };
    const changed = rememberPeriodic(settings, { ...settings, day: { ...settings.day, format: 'MM-DD-YYYY' } });
    expect(periodOf('Journal/03-04-2026.md', changed)?.date).toEqual(day(2026, 3, 3));
    expect(periodOf('Journal/03-04-2026.md', changed, '', { ...DEFAULT_RECOGNITION, dateOrder: 'mdy' })?.date).toEqual(day(2026, 2, 4));
    expect(dateInName('10-30-2026', 'dmy')?.date).toEqual(day(2026, 9, 30));
  });
  it('uses frontmatter or a leading date heading for otherwise arbitrary names in the chosen folder', () => {
    const settings = { ...DEFAULT_PERIODIC, day: { ...DEFAULT_PERIODIC.day, folder: 'Journal' }, week: { ...DEFAULT_PERIODIC.week, folder: 'Weeks' }, month: { ...DEFAULT_PERIODIC.month, folder: 'Months' } };
    expect(periodOf('Journal/A very good day.md', settings, '---\ndate: 2026-10-30T23:30:00Z\n---\nMy writing')).toEqual({ period: 'day', date: day(2026, 9, 30) });
    expect(periodOf('Journal/From a different locale.md', settings, '---\ndate: 30.10.2026\n---\nMy writing')?.date).toEqual(day(2026, 9, 30));
    expect(periodOf('Journal/From another app.md', settings, '# 30 October 2026\n\nMy writing')?.date).toEqual(day(2026, 9, 30));
    expect(periodOf('Journal/Undated.md', settings, 'I met someone on 2026-10-30.')).toBeUndefined();
    expect(periodOf('Books/A book.md', settings, '---\ndate: 2026-10-30\n---')).toBeUndefined();
    expect(periodOf('Weeks/A week.md', settings, builtInPeriodicText('week', day(2026, 9, 30)))).toEqual({ period: 'week', date: day(2026, 9, 26) });
  });
  it('retains unusual old names and locations after changing future names', () => {
    const before = { ...DEFAULT_PERIODIC, day: { folder: 'Old journal', format: '[entry-]YYYY-DDDD', template: '' } };
    const after = rememberPeriodic(before, STARTER_PERIODIC);
    const date = day(2026, 9, 30);
    expect(periodOf(periodicPath('day', date, before), after)?.date).toEqual(date);
    expect(periodicPath('day', date, after)).toBe('Calendar/2026/days/2026-10-30.md');
    expect(periodOf('Calendar/2026/months/2026-10.md', after)?.period).toBe('month');
    expect(periodOf('Calendar/2025/days/An unusual name.md', STARTER_PERIODIC, '---\ndate: 2025-05-23\n---\nMy words')).toEqual({ period: 'day', date: day(2025, 4, 23) });
  });
  it('lets the user link or exclude a note without changing Markdown', () => {
    const path = 'Archive/Anything.md';
    const recognition = recognitionSettings({ dates: { [path]: { period: 'day', date: '2026-10-30' } } });
    expect(periodOf(path, DEFAULT_PERIODIC, 'Original words', recognition)?.date).toEqual(day(2026, 9, 30));
    expect(periodOf('2026-10-30.md', DEFAULT_PERIODIC, '', { ...recognition, dates: { '2026-10-30.md': null } })).toBeUndefined();
    expect(recognitionSettings({ dates: { bad: { period: 'year', date: 'yesterday' } }, preferred: { nope: 3 } })).toEqual(DEFAULT_RECOGNITION);
  });
  it('keeps duplicate dates unresolved, then indexes only the chosen note', () => {
    const files = ['2026-10-30.md', '30.10.2026.md', '2026-10-31.md'].map((path) => ({ path, kind: 'note' as const }));
    const key = periodKey('day', day(2026, 9, 30));
    const catalog = periodicCatalog(files, DEFAULT_PERIODIC);
    expect(catalog.matches.get(key)).toHaveLength(2);
    expect(catalog.index.has(key)).toBe(false);
    expect(catalog.index.size).toBe(1);
    const chosen = periodicCatalog(files, DEFAULT_PERIODIC, new Map(), { ...DEFAULT_RECOGNITION, preferred: { [key]: '30.10.2026.md' } });
    expect(chosen.index.get(key)).toBe('30.10.2026.md');
  });
});

it('keeps old prose as Markdown and enables compatible and future dashboards', () => {
  expect(hasPeriodicDashboard('---\ndate: 2026-10-30\n---\n# A long story\nEverything stays here.', 'day')).toBe(false);
  expect(hasPeriodicDashboard('---\nperiod: day\ndate: 2026-10-30\n---\n# A long story', 'day')).toBe(false);
  for (const period of ['day', 'week', 'month'] as const) expect(hasPeriodicDashboard(builtInPeriodicText(period, day(2026, 9, 30)), period)).toBe(true);
  expect(hasPeriodicDashboard('---\ncssclasses: [rpg-week]\n---', 'week')).toBe(true);
  expect(hasPeriodicDashboard('---\nmood: 2\nsleep: 7\nenergy: 4\n---', 'day')).toBe(true);
});

it('validates safe, distinct future paths without requiring a recognition format', () => {
  expect(periodicNamingError(STARTER_PERIODIC)).toBeUndefined();
  expect(periodicNamingError({ ...DEFAULT_PERIODIC, day: { ...DEFAULT_PERIODIC.day, format: '[My day]' } })).toMatch(/distinct/);
  expect(periodicNamingError({ ...DEFAULT_PERIODIC, day: { ...DEFAULT_PERIODIC.day, folder: '../outside' } })).toMatch(/valid folder/);
});

it('never adopts an excluded or differently dated file after a creation collision', () => {
  const path = '2026-10-30.md', date = day(2026, 9, 30);
  expect(() => assertPeriodicNote(path, builtInPeriodicText('day', date), 'day', date, DEFAULT_PERIODIC, DEFAULT_RECOGNITION)).not.toThrow();
  expect(() => assertPeriodicNote(path, builtInPeriodicText('day', date), 'day', date, DEFAULT_PERIODIC, { ...DEFAULT_RECOGNITION, dates: { [path]: null } })).toThrow('another note');
  expect(() => assertPeriodicNote(path, '---\nperiod: day\ndate: 2026-10-29\n---\nKeep me', 'day', date, DEFAULT_PERIODIC, DEFAULT_RECOGNITION)).toThrow('another note');
});
