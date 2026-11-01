import { expect, it } from 'vitest';
import { day } from './dates';
import { DEFAULT_PERIODIC, DEFAULT_RECOGNITION, periodOf, periodicPath } from './periodic';
import { STARTER_PERIODIC, starterNotes, vaultPreferences, vaultPreferencesPatch } from './vaultSetup';

it('isolates vault preferences and binds legacy global preferences to one vault', () => {
  const legacy = { legacyPeriodicVault: '/one', periodic: { ...DEFAULT_PERIODIC, day: { ...DEFAULT_PERIODIC.day, folder: 'My days', format: 'MM-DD-YYYY' } } };
  expect(vaultPreferences(legacy, '/one').periodic.day.folder).toBe('My days');
  expect(vaultPreferences(legacy, '/one').recognition.dateOrder).toBe('mdy');
  const stored = { ...legacy, ...vaultPreferencesPatch(legacy, '/one', STARTER_PERIODIC, DEFAULT_RECOGNITION) };
  expect(vaultPreferences(stored, '/one').complete).toBe(true);
  expect(vaultPreferences(stored, '/two')).toEqual({ complete: false, periodic: DEFAULT_PERIODIC, recognition: DEFAULT_RECOGNITION });
  const both = { ...stored, ...vaultPreferencesPatch(stored, '/two', DEFAULT_PERIODIC, { ...DEFAULT_RECOGNITION, dateOrder: 'mdy' }) };
  expect(vaultPreferences(both, '/one').periodic).toEqual(STARTER_PERIODIC);
  expect(vaultPreferences(both, '/two').recognition.dateOrder).toBe('mdy');
});

it('starts each new year in its calendar folder with readable metadata and five library shelves', () => {
  const date = day(2027, 0, 1);
  const notes = starterNotes(date);
  expect(notes.filter((note) => note.path.startsWith('Rating/'))).toHaveLength(5);
  expect(notes.find((note) => note.path === 'Calendar/2027/days/2027-01-01.md')?.text).toContain('date: 2027-01-01');
  expect(notes.find((note) => note.path === 'Calendar/2026/weeks/2026-W53.md')?.text).toContain('date: 2026-12-28');
  for (const period of ['day', 'week', 'month'] as const) {
    const path = periodicPath(period, date, STARTER_PERIODIC);
    expect(periodOf(path, STARTER_PERIODIC, notes.find((note) => note.path === path)?.text)?.period).toBe(period);
  }
});
