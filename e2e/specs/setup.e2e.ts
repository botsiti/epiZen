import { $, browser, expect } from '@wdio/globals';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { snapshotVault, diffSnapshots } from '../../scripts/vault-snapshot.mjs';
import { starterNotes } from '../../src/lib/vaultSetup';
import { today } from '../../src/lib/dates';
import { vaultCopy } from '../paths';
import { openFolders, openNote, prepareWindow, screenshot, scrollIntoView, showMonth } from '../support';

const root = join(dirname(vaultCopy()), 'starter-vault');

describe('vault setup and notes from other apps', () => {
  before(prepareWindow);

  it('creates the reviewed starter vault with the real guarded filesystem commands', async () => {
    await expect($('[data-testid="vault-setup"]')).toBeDisplayed();
    await screenshot('110-connect-vault');
    await $('label*=Yes, connect my notes').click();
    await screenshot('172-existing-vault-preferences');
    await $('button=Create a starter vault here').click();
    await screenshot('111-starter-preview');
    await $('[data-testid="setup-save"]').click();
    await $('[data-testid="home"]').waitForDisplayed();
    for (const note of starterNotes(today())) expect(readFileSync(join(root, note.path), 'utf8')).toBe(note.text);
    await screenshot('112-starter-home');
  });

  it('reuses mixed old names, preserves prose and uses the new pattern only for new notes', async () => {
    const folder = 'Calendar/2025/days';
    mkdirSync(join(root, folder), { recursive: true });
    const imported = [
      { path: `${folder}/22.05.2025.md`, text: '# A day from another app\n\nKeep every one of these words.\n' },
      { path: `${folder}/May 23, 2025.md`, text: '---\ndate: 2025-05-23\n---\nMy earlier journal.\n' },
      { path: `${folder}/A special Saturday.md`, text: '---\nperiod: day\ndate: 2025-05-24\n---\n### Tasks\n' },
    ];
    for (const note of imported) writeFileSync(join(root, note.path), note.text, { flag: 'wx' });
    const before = snapshotVault(root);
    await browser.refresh();
    await prepareWindow();
    await $('[data-testid="open-settings"]').click();
    await $('[data-testid="settings-day-format"]').setValue('YYYY/[days]/[Day ]DD.MM.YYYY');
    await scrollIntoView('[data-testid="settings-day"]');
    await screenshot('115-future-name-preferences');
    await scrollIntoView('[data-testid="settings-save"]');
    await $('[data-testid="settings-save"]').click();
    await $('[data-testid="settings"] .save-state').waitForDisplayed();
    await showMonth('May 2025');
    await $('[data-testid="calendar-day"][data-date="2025-05-22"]').click();
    await expect($('[data-testid="note"]')).toHaveAttribute('data-path', imported[0]!.path);
    await expect($('[data-testid="note"]')).toHaveText(expect.stringContaining('Keep every one of these words.'));
    await screenshot('113-imported-prose');
    await $('[data-testid="calendar-day"][data-date="2025-05-23"]').click();
    await expect($('[data-testid="note"]')).toHaveAttribute('data-path', imported[1]!.path);
    await $('[data-testid="calendar-day"][data-date="2025-05-24"]').click();
    await expect($('[data-testid="note"]')).toHaveAttribute('data-path', imported[2]!.path);
    expect(diffSnapshots(before, snapshotVault(root))).toEqual([]);
    await $('[data-testid="calendar-day"][data-date="2025-05-25"]').click();
    const created = `${folder}/Day 25.05.2025.md`;
    await expect($('[data-testid="periodic"]')).toHaveAttribute('data-path', created);
    expect(diffSnapshots(before, snapshotVault(root))).toEqual([`added: ${created}`]);
    await screenshot('114-future-note-dashboard');
    // Library navigation still works after recognizing imported notes.
    await $('[data-testid="open-library"]').click();
    await expect($('[data-testid="library"]')).toBeDisplayed();
    await openFolders('Calendar', 'Calendar/2025', folder);
    await openNote(imported[0]!.path);
    expect(readFileSync(join(root, imported[0]!.path), 'utf8')).toBe(imported[0]!.text);
  });

  it('offers a choice for duplicate dates and links a note whose name has no date', async () => {
    const duplicate = 'Calendar/2025/days/2025-05-22.md';
    const undated = 'Calendar/2025/days/An older entry.md';
    writeFileSync(join(root, duplicate), '# Another version\n', { flag: 'wx' });
    writeFileSync(join(root, undated), '# An older entry\n\nMy original words.\n', { flag: 'wx' });
    const before = snapshotVault(root);
    await browser.refresh();
    await prepareWindow();
    await showMonth('May 2025');
    await $('[data-testid="calendar-day"][data-date="2025-05-22"]').click();
    await $('[data-testid="settings"]').waitForDisplayed();
    await $('summary*=Review existing notes').click();
    await scrollIntoView('[data-testid="periodic-recognition"]');
    await screenshot('116-duplicate-date-choice');
    // Native option clicks do not reach an unfocused macOS test window (as in the podcast journey).
    await browser.execute((path) => {
      const select = document.querySelector<HTMLSelectElement>('[aria-label="Calendar note for day:2025-05-22"]');
      if (!select) throw new Error('The duplicate-date choice is missing');
      select.value = path;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }, duplicate);
    await expect($('[aria-label="Calendar note for day:2025-05-22"]')).toHaveValue(duplicate);
    await $('summary=Link an older note or correct its date').click();
    await $('[data-testid="periodic-recognition"] input[list]').setValue(undated);
    await $('[data-testid="periodic-link-date"]').setValue('2025-05-21');
    await $('[data-testid="periodic-recognition"] summary').click();
    await $('[data-testid="periodic-recognition"] summary').click();
    await $('button=Apply link').click();
    await scrollIntoView('[data-testid="settings-save"]');
    await $('[data-testid="settings-save"]').click();
    await $('[data-testid="settings"] .save-state').waitForDisplayed();
    await $('[data-testid="calendar-day"][data-date="2025-05-22"]').click();
    await expect($('[data-testid="note"]')).toHaveAttribute('data-path', duplicate);
    await $('[data-testid="calendar-day"][data-date="2025-05-21"]').click();
    await expect($('[data-testid="note"]')).toHaveAttribute('data-path', undated);
    await expect($('[data-testid="note"]')).toHaveText(expect.stringContaining('My original words.'));
    expect(diffSnapshots(before, snapshotVault(root))).toEqual([]);
  });
});
