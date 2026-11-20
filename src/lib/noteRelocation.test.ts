import { expect, it } from 'vitest';
import { relocatedNoteSettings, taskPathResolver } from './noteRelocation';
import { DEFAULT_PERIODIC, DEFAULT_RECOGNITION } from './periodic';
import { vaultPreferences } from './vaultSetup';

it('preserves a filename-based calendar date and follows task links through successive moves', () => {
  const from = 'Journal/2026-10-30.md', moved = 'Archive/2026-10-30.md', final = '2026-10-30.md';
  const periodic = { ...DEFAULT_PERIODIC, day: { ...DEFAULT_PERIODIC.day, folder: 'Journal' } };
  const settings = { periodic, legacyPeriodicVault: '/vault' };
  const source = '- [ ] Read <!-- focus-id: 20261030-01 -->';
  const first = { ...settings, ...relocatedNoteSettings(settings, '/vault', from, moved, source, periodic, DEFAULT_RECOGNITION) };
  const prefs = vaultPreferences(first, '/vault');
  expect(prefs.periodic.day.folder).toBe('Journal');
  expect(prefs.recognition.dates[moved]).toEqual({ period: 'day', date: '2026-10-30' });
  const second = { ...first, ...relocatedNoteSettings(first, '/vault', moved, final, source, periodic, prefs.recognition) };
  const resolve = taskPathResolver(second, '/vault');
  expect(resolve(from, '20261030-01')).toBe(final);
  expect(resolve(from, 'another-id')).toBe(from);
  expect(taskPathResolver(second, '/other')(from, '20261030-01')).toBe(from);
});
