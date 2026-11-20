import { expect, it } from 'vitest';
import { attachmentLocation, creationFolder, DEFAULT_FILE_PREFERENCES, filePreferences, folderProblem } from './filePreferences';
import { noteLinkTargets } from './fileLinks';
import { DEFAULT_PERIODIC, DEFAULT_RECOGNITION } from './periodic';
import { vaultPreferences, vaultPreferencesPatch } from './vaultSetup';

it('uses the current note, root or chosen folder and falls back without a note', () => {
  expect(creationFolder(DEFAULT_FILE_PREFERENCES, 'note', 'Ideas/One.md')).toBe('Ideas');
  expect(creationFolder(DEFAULT_FILE_PREFERENCES, 'note')).toBe('');
  expect(creationFolder(DEFAULT_FILE_PREFERENCES, 'folder', 'Ideas/One.md')).toBe('');
  expect(creationFolder({ ...DEFAULT_FILE_PREFERENCES, notes: 'folder', noteFolder: 'Inbox' }, 'note', 'Ideas/One.md')).toBe('Inbox');
});

it('uses a vault-specific path for manual attachments and supports both generated link syntaxes', () => {
  const prefs = filePreferences({ attachments: 'folder', attachmentFolder: 'Media', updateLinks: false, linkFormat: 'relative', wikilinks: false });
  expect(attachmentLocation(prefs, 'Journal/Day.md')).toBe('Media');
  expect(prefs.updateLinks).toBe(false);
  expect(attachmentLocation(DEFAULT_FILE_PREFERENCES, 'Journal/Day.md')).toBeUndefined();
  expect(noteLinkTargets(['Planning/Some plan'], 'Journal/Day.md', prefs, [])).toEqual([
    { label: 'Some plan', detail: 'Planning', markdown: '[Some plan](../Planning/Some%20plan.md)' },
  ]);
  expect(noteLinkTargets(['Root', 'Location/Root'], 'Journal/Day.md', DEFAULT_FILE_PREFERENCES, []).map((target) => target.insert)).toEqual(['/Root', 'Location/Root']);
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
