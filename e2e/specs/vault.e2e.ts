import { $, $$, browser, expect } from '@wdio/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { diffSnapshots, snapshotVault } from '../../scripts/vault-snapshot.mjs';
import { DEMO_VAULT, vaultCopy } from '../paths';
import { followLink, nextFrame, openFolders, openNote, prepareWindow, screenshot, showMonth, typeInEditor } from '../support';

const DAYS = 'Calendar/2026/days 2026';
// Today's daily note, as the demo vault names them.
const TODAY = (() => {
  const now = new Date();
  return `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
})();
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
    await expect($('[data-testid="today-create"]')).toBeDisplayed();
    expect(await $$('[data-testid="shelf"]').length).toBe(3);
    expect(await $$('[data-testid="cover-card"]').length).toBe(27);
    await expect($('[data-testid="shelf"][data-folder="Rating/music"]')).toHaveText(expect.stringContaining('88'));
    await browser.waitUntil(async () => (await $$('.cover-image[data-testid="vault-image"]').length) === 27, {
      timeoutMsg: 'the covers never loaded',
    });
    await screenshot('03-home');
  });

  it('opens an album from its cover on the home screen', async () => {
    await $('[data-testid="cover-card"][data-path="Rating/music/Glasshouse Weather.md"]').click();
    await expect(title()).toHaveText('Glasshouse Weather');
  });

  it('opens a daily note from the sidebar', async () => {
    await openFolders('Calendar', 'Calendar/2026', DAYS);
    await openNote(`${DAYS}/14.08.2026.md`);
    await expect(title()).toHaveText('14.08.2026');
    await expect($('[data-testid="properties"]')).toHaveText(expect.stringContaining('mood'));
    await screenshot('04-daily-note');
  });

  it("shows tasks in the note's text that cannot be ticked there", async () => {
    const boxes = await $$('[data-testid="note"] .note-body input[type="checkbox"]').getElements();
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

  it('draws every note and link in the graph, and lights a note and its neighbours up', async () => {
    await $('[data-testid="open-graph"]').click();
    const graph = $('[data-testid="graph"]');
    await browser.waitUntil(async () => (await graph.getAttribute('data-settled')) === 'true', {
      timeout: 20_000,
      timeoutMsg: 'the layout never settled',
    });
    await screenshot('19-graph');
    await $('[data-testid="graph-search"]').setValue('Glasshouse');
    await expect(graph).toHaveAttribute('data-focus', 'Rating/music/Glasshouse Weather.md');
    await nextFrame();
    await screenshot('20-graph-focus');
    await $('[data-testid="graph-open"]').click();
    await expect(title()).toHaveText('Glasshouse Weather');
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

  it('shows a day as a dashboard, and ticking a task there writes only that box back', async () => {
    await showMonth('August 2026');
    await $('[data-testid="calendar-day"][data-date="2026-08-14"]').click();
    const dashboard = $('[data-testid="dashboard"][data-period="day"]');
    await expect(dashboard).toHaveText(expect.stringContaining('Tasks · 3 of 5 done'));
    await expect($('[data-testid="dash-minutes"]')).toHaveText(expect.stringContaining('25m of 1h 16m'));
    await expect($('[data-testid="dash-meters"]')).toHaveText(expect.stringContaining('mood9'));
    await screenshot('22-daily-dashboard');

    const file = join(vaultCopy(), `${DAYS}/14.08.2026.md`);
    const before = readFileSync(file, 'utf8');
    const task = '- [ ] #daily/code — refactor the settings screen [minutes::58]';
    const line = before.split('\n').indexOf(task);
    expect(line).toBeGreaterThan(0);
    await $(`[data-testid="dash-task"][data-line="${line}"]`).click();
    const ticked = before.replace(task, task.replace('[ ]', '[x]'));
    await browser.waitUntil(() => readFileSync(file, 'utf8') === ticked, { timeout: 5000, timeoutMsg: 'the tick never reached the note' });
    await expect(dashboard).toHaveText(expect.stringContaining('Tasks · 4 of 5 done'));
  });

  it('sums a week from its seven days, and a month from its weeks', async () => {
    await $('[data-testid="calendar-week"][data-week="33"]').click();
    const week = $('[data-testid="dashboard"][data-period="week"]');
    await expect(week).toHaveText(expect.stringMatching(/Days · \d+ of \d+ done/));
    expect(await $$('[data-testid="dashboard"] [data-testid="dash-row"]').length).toBe(7);
    await screenshot('23-weekly-dashboard');

    await $('[data-testid="calendar-month"]').click();
    const month = $('[data-testid="dashboard"][data-period="month"]');
    await expect(month).toHaveText(expect.stringMatching(/Weeks · \d+ of \d+ done/));
    expect(await $$('[data-testid="dashboard"] [data-testid="dash-row"]').length).toBe(6);
    await screenshot('24-monthly-dashboard');
  });

  it('keeps the periodic notes setup in Settings', async () => {
    await $('[data-testid="open-settings"]').click();
    await expect($('[data-testid="settings-day-format"]')).toHaveValue('DD.MM.YYYY');
    await expect($('[data-testid="settings-day"]')).toHaveText(expect.stringContaining('This day:'));
    await screenshot('16-settings');
  });

  it("creates today's note from the home screen", async () => {
    await $('[data-testid="sidebar-vault"]').click();
    await $('[data-testid="today-create"]').click();
    await expect(title()).toHaveText(TODAY);
    await expect($('[data-testid="dashboard"][data-period="day"]')).toBeDisplayed();
    await $('[data-testid="sidebar-vault"]').click();
    await expect($('[data-testid="today-open"]')).toHaveText(`Open ${TODAY}`);
  });

  it('changed nothing in the vault copy but the four new notes and the ticked day', () => {
    expect(diffSnapshots(snapshotVault(DEMO_VAULT), snapshotVault(vaultCopy()))).toEqual(
      [
        `added: ${DAYS}/30.07.2026.md`,
        `added: ${DAYS}/31.07.2026.md`,
        `added: ${DAYS}/${TODAY}.md`,
        'added: Inbox idea.md',
        `changed: ${DAYS}/14.08.2026.md`,
      ].sort(),
    );
  });
});
