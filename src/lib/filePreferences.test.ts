import { expect, it } from 'vitest';
import { creationFolder, DEFAULT_FILE_PREFERENCES, filePreferences, folderProblem } from './filePreferences';
import { DEFAULT_PERIODIC, DEFAULT_RECOGNITION } from './periodic';
import { vaultPreferences, vaultPreferencesPatch } from './vaultSetup';

it('uses the current note, root or chosen folder and falls back without a note', () => {
  expect(creationFolder(DEFAULT_FILE_PREFERENCES, 'note', 'Ideas/One.md')).toBe('Ideas');
  expect(creationFolder(DEFAULT_FILE_PREFERENCES, 'note')).toBe('');
  expect(creationFolder(DEFAULT_FILE_PREFERENCES, 'folder', 'Ideas/One.md')).toBe('');
  expect(creationFolder({ ...DEFAULT_FILE_PREFERENCES, notes: 'folder', noteFolder: 'Inbox' }, 'note', 'Ideas/One.md')).toBe('Inbox');
});
it('validates persisted locations and keeps creation settings scoped to their vault', () => {
  expect(filePreferences({ notes: 'elsewhere', noteFolder: '../secret', folders: 'folder', folderParent: 'Projects' })).toEqual({ ...DEFAULT_FILE_PREFERENCES, folders: 'folder', folderParent: 'Projects' });
  for (const path of ['/tmp', '.hidden', 'Notes/../x', 'Notes//x']) expect(folderProblem(path)).toBeTruthy();
  const prefs = { ...DEFAULT_FILE_PREFERENCES, notes: 'folder' as const, noteFolder: 'Inbox' };
  const patch = vaultPreferencesPatch({}, '/one', DEFAULT_PERIODIC, DEFAULT_RECOGNITION, prefs);
  expect(vaultPreferences(patch, '/one').fileDefaults).toEqual(prefs);
  expect(vaultPreferences(patch, '/two').fileDefaults).toEqual(DEFAULT_FILE_PREFERENCES);
  const next = vaultPreferencesPatch(patch, '/one', DEFAULT_PERIODIC, DEFAULT_RECOGNITION);
  expect(vaultPreferences(next, '/one').fileDefaults).toEqual(prefs);
});
