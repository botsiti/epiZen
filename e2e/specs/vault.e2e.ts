import { $, $$, browser, expect } from '@wdio/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { diffSnapshots, snapshotVault } from '../../scripts/vault-snapshot.mjs';
import { DEMO_VAULT, vaultCopy } from '../paths';
import { followLink, openFolders, openNote, prepareWindow, screenshot, typeInEditor } from '../support';

const DAYS = 'Calendar/2026/days 2026';
const title = () => $('[data-testid="note-title"]');

describe('the demo vault', () => {
  before(async () => {
    await prepareWindow();
    await $('[data-testid="sidebar-vault"]').click();
    await $('[data-testid="home"]').waitForDisplayed();
  });

  it('opens on the home screen', async () => {
    await expect($('[data-testid="vault-name"]')).toHaveText('demo-vault');
    await expect($('[data-testid="home"]')).toHaveText(expect.stringContaining('103 notes · 9 folders · 27 images'));
    await screenshot('03-home');
  });

  it('opens a daily note from the sidebar', async () => {
    await openFolders('Calendar', 'Calendar/2026', DAYS);
    await openNote(`${DAYS}/14.08.2026.md`);
    await expect(title()).toHaveText('14.08.2026');
    await expect($('[data-testid="properties"]')).toHaveText(expect.stringContaining('mood'));
    await screenshot('04-daily-note');
  });

  it('shows tasks that cannot be ticked from the app', async () => {
    const boxes = await $$('[data-testid="note"] input[type="checkbox"]').getElements();
    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) await expect(box).toBeDisabled();
  });

  it('follows a wikilink to the week', async () => {
    await followLink('2026-W33 - 10.08.26');
    await expect(title()).toHaveText('2026-W33 - 10.08.26');
    await screenshot('05-weekly-note');
  });

  it('follows a wikilink to the month', async () => {
    await followLink('08.26 RPG');
    await expect(title()).toHaveText('08.26 RPG');
    await expect($('[data-testid="note"] table')).toBeDisplayed();
    await screenshot('06-monthly-note');
  });

  it('shows an album with its cover', async () => {
    await followLink('Glasshouse Weather');
    await expect(title()).toHaveText('Glasshouse Weather');
    const cover = $('[data-testid="vault-image"]');
    await cover.waitForDisplayed();
    await browser.waitUntil(async () => Number(await cover.getProperty('naturalWidth')) > 0, {
      timeoutMsg: 'the cover never loaded',
    });
    await screenshot('07-album');
  });

  it('shows a film and a YouTube video', async () => {
    await openFolders('Rating', 'Rating/kino', 'Rating/youtube');
    await openNote('Rating/kino/The Lighthouse Accountant.md');
    await $('[data-testid="vault-image"]').waitForDisplayed();
    await screenshot('08-film');

    await openNote('Rating/youtube/How I Plan a Week in Plain Text.md');
    await $('[data-testid="vault-image"]').waitForDisplayed();
    await screenshot('09-youtube');
  });

  it('explains a link to a note that does not exist, and creates nothing', async () => {
    await openNote(`${DAYS}/01.08.2026.md`);
    await followLink('31.07.2026');
    await expect($('[data-testid="missing-note"]')).toHaveText(expect.stringContaining('31.07.2026'));
    await screenshot('10-missing-note');
  });

  it('opens a note in the editor and leaves it as it was when nothing is typed', async () => {
    await openNote(`${DAYS}/14.08.2026.md`);
    await $('[data-testid="edit-note"]').click();
    // Waiting on the editor's text would scroll it into view, past the title.
    await $('[data-testid="note-editor"]').waitForDisplayed();
    await expect($('[data-testid="preview"]')).toHaveText(expect.stringContaining('Busy but calm.'));
    await screenshot('11-editor');
    await $('[data-testid="edit-done"]').click();
    await $('[data-testid="note"]').waitForDisplayed();
  });

  it('creates a new note and saves what is typed into it', async () => {
    // From the home screen a new note goes to the top of the vault.
    await $('[data-testid="sidebar-vault"]').click();
    await $('[data-testid="new-note-button"]').click();
    await $('[data-testid="new-note-name"]').setValue('Inbox idea');
    await expect($('[data-testid="new-note-folder"]')).toHaveValue('');
    await screenshot('12-new-note');
    await $('[data-testid="new-note-create"]').click();
    await $('[data-testid="editor"] .cm-content').waitForDisplayed();
    await typeInEditor('# Hello from Epizen');
    await expect($('[data-testid="save-state"]')).toHaveText('Saved', { wait: 5000 });
    await expect($('[data-testid="preview"] h1')).toHaveText('Hello from Epizen');
    expect(readFileSync(join(vaultCopy(), 'Inbox idea.md'), 'utf8')).toBe('# Hello from Epizen');
    await screenshot('13-new-note-editor');
    await expect($('[data-testid="tree-note"][data-path="Inbox idea.md"]')).toBeDisplayed();
  });

  it('changed nothing in the vault copy but the new note', () => {
    expect(diffSnapshots(snapshotVault(DEMO_VAULT), snapshotVault(vaultCopy()))).toEqual(['added: Inbox idea.md']);
  });
});
