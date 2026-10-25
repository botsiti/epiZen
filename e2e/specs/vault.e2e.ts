import { $, $$, browser, expect } from '@wdio/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { diffSnapshots, snapshotVault } from '../../scripts/vault-snapshot.mjs';
import { DEMO_VAULT, vaultCopy } from '../paths';
import { followLink, openFolders, openNote, prepareWindow, screenshot, showMonth, typeInEditor } from '../support';

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
    await expect($('[data-testid="home"]')).toHaveText(expect.stringContaining('106 notes · 10 folders · 27 images'));
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

  it('creates a missing day from a link to it, from its template', async () => {
    await openNote(`${DAYS}/01.08.2026.md`);
    await followLink('31.07.2026');
    await expect(title()).toHaveText('31.07.2026');
    expect(readFileSync(join(vaultCopy(), `${DAYS}/31.07.2026.md`), 'utf8')).toContain('[[01.08.2026|Tomorrow →]]');
    await screenshot('10-day-from-link');
  });

  it('opens a note in the editor and leaves it as it was when nothing is typed', async () => {
    await openNote(`${DAYS}/14.08.2026.md`);
    await $('[data-testid="edit-note"]').click();
    // Waiting on the editor's text would scroll it into view, past the title.
    await $('[data-testid="note-editor"]').waitForDisplayed();
    await expect($('[data-testid="preview"]')).toHaveText(expect.stringContaining('Busy but calm.'));
    // Reading the preview's text scrolls it into view; show the editor as it opens.
    await browser.execute(() => document.querySelector('.main')?.scrollTo(0, 0));
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
    await typeInEditor('Hello from Epizen, see [[Someday maybe]] and [[Glass');
    const suggestion = $('.cm-tooltip-autocomplete li');
    await suggestion.waitForDisplayed();
    await expect(suggestion).toHaveText(expect.stringContaining('Glasshouse Weather'));
    await screenshot('13-link-autocomplete');
    // CodeMirror picks a suggestion on mousedown, which this driver's click doesn't send.
    await browser.execute(() => {
      document.querySelector('.cm-tooltip-autocomplete li')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    const typed = 'Hello from Epizen, see [[Someday maybe]] and [[Glasshouse Weather]]';
    const saved = () => readFileSync(join(vaultCopy(), 'Inbox idea.md'), 'utf8');
    await browser.waitUntil(() => saved() === typed, { timeout: 5000, timeoutMsg: 'the link was never completed and saved' });
    await expect($('[data-testid="save-state"]')).toHaveText('Saved');
    await expect($('[data-testid="preview"]')).toHaveText(expect.stringContaining('Hello from Epizen'));
    await expect($('[data-testid="tree-note"][data-path="Inbox idea.md"]')).toBeDisplayed();
    await $('[data-testid="edit-done"]').click();
  });

  it('explains a link to a note that does not exist, and creates nothing', async () => {
    await followLink('Someday maybe');
    await expect($('[data-testid="missing-note"]')).toHaveText(expect.stringContaining('Nothing was created'));
    await screenshot('17-missing-note');
    await $('[data-testid="missing-note"] button').click();
  });

  it('lists the notes that link to a note', async () => {
    await followLink('Glasshouse Weather');
    await expect(title()).toHaveText('Glasshouse Weather');
    const backlinks = $('[data-testid="backlinks"]');
    await expect(backlinks).toHaveText(expect.stringContaining('Inbox idea'));
    await expect(backlinks).toHaveText(expect.stringContaining('08.26 RPG'));
    await backlinks.scrollIntoView();
    await screenshot('18-backlinks');
  });

  it('opens the day, week and month notes from the calendar', async () => {
    await showMonth('August 2026');
    await $('[data-testid="calendar-day"][data-date="2026-08-14"]').click();
    await expect(title()).toHaveText('14.08.2026');
    await screenshot('14-calendar');
    await $('[data-testid="calendar-week"][data-week="33"]').click();
    await expect(title()).toHaveText('2026-W33 - 10.08.26');
    await $('[data-testid="calendar-month"]').click();
    await expect(title()).toHaveText('08.26 RPG');
  });

  it('creates a missing day from its template, in its folder', async () => {
    await showMonth('July 2026');
    await $('[data-testid="calendar-day"][data-date="2026-07-30"]').click();
    await expect(title()).toHaveText('30.07.2026');
    await expect($('[data-testid="properties"]')).toHaveText(expect.stringContaining('Daily'));
    const text = readFileSync(join(vaultCopy(), `${DAYS}/30.07.2026.md`), 'utf8');
    expect(text).toMatch(/^---\ndate: 2026-07-30T\d\d:\d\d\n/);
    expect(text).toContain('[[29.07.2026|← Yesterday]] | [[31.07.2026|Tomorrow →]] | [[2026-W31 - 27.07.26|Week]]');
    await screenshot('15-new-day');
  });

  it('keeps the periodic notes setup in Settings', async () => {
    await $('[data-testid="open-settings"]').click();
    await expect($('[data-testid="settings-day-format"]')).toHaveValue('DD.MM.YYYY');
    await expect($('[data-testid="settings-day"]')).toHaveText(expect.stringContaining('This day:'));
    await screenshot('16-settings');
  });

  it('changed nothing in the vault copy but the three new notes', () => {
    expect(diffSnapshots(snapshotVault(DEMO_VAULT), snapshotVault(vaultCopy()))).toEqual([
      `added: ${DAYS}/30.07.2026.md`,
      `added: ${DAYS}/31.07.2026.md`,
      'added: Inbox idea.md',
    ]);
  });
});
