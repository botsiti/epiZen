import { expect, it } from 'vitest';
import { DEFAULT_FILE_PREFERENCES } from './filePreferences';
import { day } from './dates';
import { DEFAULT_PERIODIC, DEFAULT_RECOGNITION, periodOf, periodOfName, rememberPeriodic, periodicPath } from './periodic';
import { STARTER_PERIODIC, starterNotes, vaultPreferences, vaultPreferencesPatch } from './vaultSetup';

it('isolates vault preferences and binds legacy global preferences to one vault', () => {
  const legacy = { legacyPeriodicVault: '/one', periodic: { ...DEFAULT_PERIODIC, day: { ...DEFAULT_PERIODIC.day, folder: 'My days', format: 'MM-DD-YYYY' } } };
  expect(vaultPreferences(legacy, '/one').periodic.day.folder).toBe('My days');
  expect(vaultPreferences(legacy, '/one').recognition.dateOrder).toBe('mdy');
  const stored = { ...legacy, ...vaultPreferencesPatch(legacy, '/one', STARTER_PERIODIC, DEFAULT_RECOGNITION) };
  expect(vaultPreferences(stored, '/one').complete).toBe(true);
  expect(vaultPreferences(stored, '/two')).toEqual({ complete: false, periodic: DEFAULT_PERIODIC, recognition: DEFAULT_RECOGNITION, fileDefaults: DEFAULT_FILE_PREFERENCES });
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

it('uses the vault’s Daily Notes naming for an old root default across years and preserves mixed-date history', () => {
  const naming = { folder: 'Calendar', format: 'YYYY/[days ]YYYY/DD.MM.YYYY' };
  const settings = { vaults: { old: { complete: true, periodic: DEFAULT_PERIODIC } } };
  const { periodic } = vaultPreferences(settings, 'old', naming);
  const path = 'Calendar/2027/days 2027/01.01.2027.md';
  expect(periodicPath('day', day(2027, 0, 1), periodic)).toBe(path);
  for (const name of [path, '01.01.2027']) expect(periodOfName(name, periodic)).toEqual({ period: 'day', date: day(2027, 0, 1) });
  expect(periodOf('2026-11-26.md', periodic)).toEqual({ period: 'day', date: day(2026, 10, 26) });
  expect(periodOf('Calendar/2026/weeks/2026-W48 - 23.11.26.md', periodic, '---\ndate: 2026-11-23\n---')).toEqual({ period: 'week', date: day(2026, 10, 23) });
  const explicit = rememberPeriodic(periodic, DEFAULT_PERIODIC);
  expect(vaultPreferences({ ...vaultPreferencesPatch(settings, 'old', explicit, DEFAULT_RECOGNITION) }, 'old', naming).periodic).toEqual(explicit);
  const custom = { vaults: { old: { periodic: STARTER_PERIODIC } } };
  expect(vaultPreferences(custom, 'old', naming).periodic).toEqual(STARTER_PERIODIC);
  for (const unsafe of [{ ...naming, folder: '../outside' }, { ...naming, format: '../YYYY-MM-DD' }, { ...naming, format: '[constant]' }]) {
    expect(vaultPreferences(settings, 'old', unsafe).periodic).toEqual(DEFAULT_PERIODIC);
  }
});
