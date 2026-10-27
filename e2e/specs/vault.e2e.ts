import { $, $$, browser, expect } from '@wdio/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { diffSnapshots, snapshotVault } from '../../scripts/vault-snapshot.mjs';
import { DEMO_VAULT, vaultCopy } from '../paths';
import { followLink, nextFrame, openFolders, openNote, prepareWindow, screenshot, showMonth, showTab, typeInEditor } from '../support';

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
    await expect($('[data-testid="home"]')).toHaveText(expect.stringContaining('107 notes · 10 folders · 36 images'));
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

  it('opens a daily note from the sidebar as its page', async () => {
    await openFolders('Calendar', 'Calendar/2026', DAYS);
    await openNote(`${DAYS}/14.08.2026.md`);
    await expect(title()).toHaveText('14.08.2026');
    await expect($('[data-testid="hero-title"]')).toHaveText('14 August');
    await expect($('[data-testid="periodic"][data-period="day"]')).toHaveText(expect.stringContaining('Busy but calm.'));
    await screenshot('04-daily-note');
  });

  it('goes up from the day to its week, and from the week to its month', async () => {
    await $('[data-testid="nav-week"]').click();
    await expect(title()).toHaveText('2026-W33 - 10.08.26');
    await showTab('Overview');
    await screenshot('05-weekly-note');
    await $('[data-testid="nav-month"]').click();
    await expect(title()).toHaveText('08.26 RPG');
    await showTab('Overview');
    await expect($('[data-testid="hero-title"]')).toHaveText('August 2026');
    await screenshot('06-monthly-note');
  });

  it('opens an album from the covers of what the month listened to', async () => {
    await $('[data-testid="mini-covers"] button[title="listened: Glasshouse Weather"]').click();
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

  it('creates the missing day before from its template', async () => {
    await openNote(`${DAYS}/01.08.2026.md`);
    await $('[data-testid="nav-prev"]').click();
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
    await $('[data-testid="periodic"]').waitForDisplayed();
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
    const text = readFileSync(join(vaultCopy(), `${DAYS}/30.07.2026.md`), 'utf8');
    expect(text).toMatch(/^---\ndate: 2026-07-30T\d\d:\d\d\n/);
    expect(text).toContain('[[29.07.2026|← Yesterday]] | [[31.07.2026|Tomorrow →]] | [[2026-W31 - 27.07.26|Week]]');
    await screenshot('15-new-day');
  });

  it('shows a day as a page, and writes back only what is ticked, set or added there', async () => {
    await showMonth('August 2026');
    await $('[data-testid="calendar-day"][data-date="2026-08-14"]').click();
    await showTab('Overview');
    await expect($('[data-testid="tile-tasks"]')).toHaveText(expect.stringContaining('3 / 5'));
    await expect($('[data-testid="tile-time"]')).toHaveText(expect.stringContaining('4h 19m'));
    await expect($('[data-testid="tile-xp"]')).toHaveText(expect.stringContaining('259'));
    await expect($('[data-testid="tile-habits"]')).toHaveText(expect.stringContaining('4 / 7'));
    await expect($('[data-testid="time-card"]')).toHaveText(expect.stringContaining('dog'));
    await screenshot('22-daily-dashboard');

    const file = join(vaultCopy(), `${DAYS}/14.08.2026.md`);
    const read = () => readFileSync(file, 'utf8');
    const before = read();
    const task = '- [ ] #daily/code — refactor the settings screen [minutes::58]';
    const line = before.split('\n').indexOf(task);
    expect(line).toBeGreaterThan(0);
    await $(`[data-testid="dash-task"][data-line="${line}"]`).click();
    const ticked = before.replace(task, task.replace('[ ]', '[x]'));
    await browser.waitUntil(() => read() === ticked, { timeout: 5000, timeoutMsg: 'the tick never reached the note' });
    await expect($('[data-testid="tile-tasks"]')).toHaveText(expect.stringContaining('4 / 5'));

    // Mood is out of 5, as in the vault; the third segment sets 3.
    await $('[data-testid="check-in"] [data-metric="mood"] [data-value="3"]').click();
    const mood = ticked.replace('\nmood: 5\n', '\nmood: 3\n');
    await browser.waitUntil(() => read() === mood, { timeout: 5000, timeoutMsg: 'the mood never reached the note' });

    await showTab('Tasks');
    await $('[data-testid="composer-category"][data-category="sport"]').click();
    await $('[data-testid="composer-text"]').setValue('evening run');
    await $('[data-testid="composer-minutes"]').setValue('30');
    await $('[data-testid="composer-add"]').click();
    const added = mood.replace('    - 16:37–17:09\n', '    - 16:37–17:09\n- [ ] #daily/sport — evening run [minutes::30]\n');
    await browser.waitUntil(() => read() === added, { timeout: 5000, timeoutMsg: 'the new task never reached the note' });
    expect(await $$('[data-testid="task-card"]').length).toBe(6);
    await screenshot('25-day-tasks');

    await showTab('Habits');
    expect(await $$('[data-testid="habit-pill"]').length).toBe(7);
    await screenshot('27-day-habits');
    await showTab('Stream');
    await screenshot('28-day-stream');

    // A thought record, walked through the wizard, lands as one row in a table under the stream.
    await $('[data-testid="hero-record"]').click();
    await $('[data-testid="wizard-situation"]').setValue('Reviewed the day and thought I am behind');
    await $('[data-testid="wizard-continue"]').click();
    await $('[data-testid="shade"][data-shade="Disappointed"]').click();
    await screenshot('36-thought-wizard');
    await $('[data-testid="wizard-continue"]').click();
    await $('[data-testid="trap"][data-trap="All-or-nothing"]').click();
    await $('[data-testid="wizard-continue"]').click();
    await $('[data-testid="wizard-balanced"]').setValue('Partial still counts.');
    await $('[data-testid="wizard-continue"]').click();
    await $('[data-testid="wheel-core"][data-emotion="Peaceful"]').click();
    await $('[data-testid="shade"][data-shade="Calm"]').click();
    await $('[data-testid="wizard-continue"]').click();
    await $('[data-testid="wizard-continue"]').click();
    const row = /\n\n\| \*\*situation\/self-criticism\*\*.*\n\| --- \| --- \| --- \| --- \| --- \|\n\| \[\d\d:\d\d\] Reviewed the day and thought I am behind \| Disappointed \| All-or-nothing \| Partial still counts\. \| Calm \|\n$/;
    await browser.waitUntil(() => read().startsWith(added.replace(/\n$/, '')) && row.test(read().slice(added.length - 1)), {
      timeout: 5000,
      timeoutMsg: 'the thought record never reached the note',
    });
    expect(await $$('[data-testid="record"]').length).toBe(1);
    await screenshot('37-thought-records');
    await showTab('Overview');
  });

  it('sums a week from its seven days, and a month from its days and weeks', async () => {
    await $('[data-testid="calendar-week"][data-week="33"]').click();
    await showTab('Overview');
    await expect($('[data-testid="periodic"][data-period="week"]')).toBeDisplayed();
    expect(await $$('[data-testid="day-card"]').length).toBe(7);
    await expect($('[data-testid="reflections"]')).toBeDisplayed();
    await screenshot('23-weekly-dashboard');
    await showTab('Timeline');
    expect(await $$('[data-testid="time-block"]').length).toBeGreaterThan(7);
    await screenshot('29-week-timeline');
    await showTab('Habits');
    await expect($('[data-testid="habit-grid"]')).toBeDisplayed();
    await screenshot('30-week-habits');
    await showTab('Stats');
    await screenshot('31-week-stats');

    // Ticking a weekly quest writes its box, its done date and today's XP stamp into the weekly note.
    await showTab('Quests');
    expect(await $$('[data-testid="quest-card"]').length).toBeGreaterThan(2);
    await screenshot('38-week-quests');
    const weekFile = join(vaultCopy(), 'Calendar/2026/weeks/2026-W33 - 10.08.26.md');
    const weekBefore = readFileSync(weekFile, 'utf8');
    const quest = '- [ ] #quest/weekly - Call an old friend [xp::150] [spheres::Social] [tier::common]';
    expect(weekBefore).toContain(`${quest}\n`);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const ticked = `${quest.replace('[ ]', '[x]')} [done::${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}]\n    - ${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} :: +150 XP`;
    await $('button[aria-label="Complete Call an old friend"]').click();
    await browser.waitUntil(() => readFileSync(weekFile, 'utf8') === weekBefore.replace(quest, ticked), {
      timeout: 5000,
      timeoutMsg: 'the quest never reached its weekly note',
    });
    await showTab('Overview');

    await $('[data-testid="calendar-month"]').click();
    await showTab('Overview');
    await expect($('[data-testid="periodic"][data-period="month"]')).toBeDisplayed();
    expect(await $$('[data-testid="heatmap-day"]').length).toBe(31);
    await screenshot('24-monthly-dashboard');
    await showTab('Weeks');
    expect(await $$('[data-testid="week-card"]').length).toBe(6);
    await screenshot('32-month-weeks');
    await showTab('Stats');
    await screenshot('33-month-stats');
    await showTab('Quests');
    await expect($('.mythic-shelf')).toBeDisplayed();
    await screenshot('39-month-quests');
    await showTab('Overview');
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
    await expect($('[data-testid="periodic"][data-period="day"]')).toBeDisplayed();
    await $('[data-testid="sidebar-vault"]').click();
    await expect($('[data-testid="today-open"]')).toHaveText(`Open ${TODAY}`);
  });

  it('changed nothing in the vault copy but the four new notes and the day changed from its page', () => {
    expect(diffSnapshots(snapshotVault(DEMO_VAULT), snapshotVault(vaultCopy()))).toEqual(
      [
        `added: ${DAYS}/30.07.2026.md`,
        `added: ${DAYS}/31.07.2026.md`,
        `added: ${DAYS}/${TODAY}.md`,
        'added: Inbox idea.md',
        `changed: ${DAYS}/14.08.2026.md`,
        'changed: Calendar/2026/weeks/2026-W33 - 10.08.26.md',
      ].sort(),
    );
  });
});
