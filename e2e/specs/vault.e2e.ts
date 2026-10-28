import { $, $$, browser, expect } from '@wdio/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { diffSnapshots, snapshotVault } from '../../scripts/vault-snapshot.mjs';
import { DEMO_VAULT, FIXTURES, vaultCopy } from '../paths';
import {
  clickAs,
  clickCanvas,
  closeOtherTabs,
  foldersOf,
  followLink,
  frontTab,
  nextFrame,
  openFolders,
  openNote,
  openPanel,
  pinTab,
  pointAtNode,
  prepareWindow,
  pressCommand,
  screenshot,
  setRightSidebar,
  showMonth,
  showTab,
  tabTitles,
  typeInEditor,
  waitForNote,
  workspaceTabs,
} from '../support';

const DAYS = 'Calendar/2026/days 2026';
// Today's daily note, as the demo vault names them.
const TODAY = (() => {
  const now = new Date();
  return `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
})();
const title = () => $('[data-testid="note-title"]');
const ALBUM = 'Rating/music/Glasshouse Weather.md';
const FILM = 'Rating/kino/The Lighthouse Accountant.md';
const INBOX = 'Inbox idea.md';
const DAY = `${DAYS}/14.08.2026.md`;
// The Lex Fridman Podcast's episode #494, from the recorded iTunes answers (test/fixtures/lookup/).
const EPISODE = 'Rating/podcasts/Jensen Huang - NVIDIA – The $4 Trillion Company & the AI Revolution.md';
const EPISODE_COVER = 'Rating/podcasts/_attachments/jensen-huang-nvidia-the-4-trillion-company-and-the-ai-revolution.png';
const EPISODE_NOTE =
  '---\nAuthor: Lex Fridman Podcast\nRating: 77\nYear: 2026\nGenre:\n  - technology\nListened: 2026-09-21\n---\n[[00. Podcast 2026]]\n\n![[jensen-huang-nvidia-the-4-trillion-company-and-the-ai-revolution.png|240]]\n';

/**
 * The tabs a step starts from, whatever the steps before it left: these notes, nothing pinned, the
 * first in the tab in front and each next one opened with ⌘-click, so they stand in this order.
 */
async function startWithTabs(paths: string[], front = 0) {
  await closeOtherTabs();
  for (const [i, path] of paths.entries()) {
    await openFolders(...foldersOf(path));
    if (i === 0) await openNote(path);
    else await clickAs(`[data-testid="tree-note"][data-path="${path}"]`, 'meta');
    await waitForNote(path);
  }
  expect(await tabTitles()).toEqual(paths.map((path) => path.replace(/^.*\//, '').replace(/\.md$/, '')));
  await workspaceTabs()[front]?.click();
  await waitForNote(paths[front] ?? '');
}

describe('the demo vault', () => {
  before(async () => {
    await prepareWindow();
    await $('[data-testid="sidebar-vault"]').click();
    await $('[data-testid="home"]').waitForDisplayed();
  });

  it('opens on the home screen', async () => {
    await expect($('[data-testid="vault-name"]')).toHaveText('demo-vault');
    await expect($('[data-testid="home"]')).toHaveText(expect.stringContaining('119 notes · 12 folders · 46 images'));
    await expect($('[data-testid="today-create"]')).toBeDisplayed();
    // Albums, films, books and podcasts, never videos: books and podcasts write `Rating`, and count too.
    expect(await $$('[data-testid="shelf"]').length).toBe(4);
    await expect($('[data-testid="shelf"][data-folder="Rating/youtube"]')).not.toBeExisting();
    expect(await $$('[data-testid="cover-card"]').length).toBe(34);
    await expect($('[data-testid="shelf"][data-folder="Rating/music"]')).toHaveText(expect.stringContaining('88'));
    await browser.waitUntil(async () => (await $$('.cover-image[data-testid="vault-image"]').length) === 34, {
      timeoutMsg: 'the covers never loaded',
    });
    // Life XP is the demo's 60 days (12,296 XP) plus its quests, less what open quests have lost
    // by today's date, so it moves with the clock; src/lib/home.test.ts and quests.test.ts pin the sums.
    await expect($('[data-testid="hero-title"]')).toHaveText(expect.stringMatching(/^Level \d+$/));
    await expect($('[data-testid="hero-stats"]')).toHaveText(expect.stringContaining('Life XP'));
    await expect($('[data-testid="memento"]')).toHaveText(expect.stringContaining('Add your birth date in Settings'));
    await screenshot('03-home');
    await $('[data-testid="spheres"]').scrollIntoView();
    await expect($('[data-testid="lead-sphere"]')).toHaveText(expect.stringContaining('Personal Growth'));
    await screenshot('34-home-spheres');
    await $('[data-testid="shelf"][data-folder="Rating/music"]').scrollIntoView();
    await screenshot('36-home-shelves');
    await browser.execute(() => document.querySelector('.main')?.scrollTo(0, 0));
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

  it('opens the library on All: every album, film, book and podcast together, narrowed by kind', async () => {
    await $('[data-testid="open-library"]').click();
    const library = $('[data-testid="library"]');
    await library.waitForDisplayed();
    await expect(library).toHaveAttribute('data-tab', 'all');
    await expect($('[data-testid="hero-title"]')).toHaveText('Library');
    // 20 albums, 4 films, 6 books and 4 podcasts; videos are read as pages, not shelved.
    expect(await browser.execute(() => [...document.querySelectorAll('[data-testid="library"] [role="tab"]')].map((tab) => tab.textContent))).toEqual(['All', 'Albums', 'Films', 'Books', 'Podcasts']);
    await expect($('[data-testid="library-total"]')).toHaveText('34');
    expect(await $$('[data-testid="library-card"]').length).toBe(34);
    expect(await $$('[data-testid="library-card-kind"]').length).toBe(34);
    // An Add for every kind, on every tab.
    expect(await browser.execute(() => [...document.querySelectorAll('[data-testid="library-add"]')].map((button) => button.getAttribute('data-kind')))).toEqual(['album', 'film', 'book', 'podcast']);
    // Covers load as they come near the screen: the first row's, at least.
    await $('[data-testid="library-card"]').scrollIntoView({ block: 'center' });
    await browser.waitUntil(async () => (await $$('.library-cover-image[data-testid="vault-image"]').length) >= 6, { timeoutMsg: 'the covers never loaded' });
    await browser.execute(() => document.querySelector('.main')?.scrollTo(0, 0));
    await screenshot('80-library-all');

    await $('[data-testid="kind-chip"][data-kind="film"]').click();
    await $('[data-testid="kind-chip"][data-kind="book"]').click();
    expect(await $$('[data-testid="library-card"]').length).toBe(10);
    expect(new Set(await browser.execute(() => [...document.querySelectorAll('[data-testid="library-card"]')].map((card) => card.getAttribute('data-kind'))))).toEqual(new Set(['film', 'book']));
    await browser.waitUntil(async () => (await $$('.library-cover-image[data-testid="vault-image"]').length) === 10, { timeoutMsg: 'the film and book covers never loaded' });
    await screenshot('81-library-all-kinds');
    await $('[data-testid="kind-chip"][data-kind="film"]').click();
    await $('[data-testid="kind-chip"][data-kind="book"]').click();
    expect(await $$('[data-testid="library-card"]').length).toBe(34);
  });

  it('shows the library: a tab per kind with its counts, its covers, its genres and a calendar of covers', async () => {
    const library = $('[data-testid="library"]');
    await showTab('Albums');
    await expect(library).toHaveAttribute('data-tab', 'album');
    expect(await $$('[data-testid="tab"]').length).toBe(5);
    expect(await $$('[data-testid="library-card"]').length).toBe(20);
    await expect($('[data-testid="library-total"]')).toHaveText('20');
    await expect($('[data-testid="library-average"]')).toHaveText('77');
    await browser.waitUntil(async () => (await $$('.library-cover-image[data-testid="vault-image"]').length) >= 12, { timeoutMsg: 'the covers never loaded' });
    await screenshot('48-library-albums');

    await $('[data-testid="genre-chip"][data-genre="ambient"]').click();
    expect(await $$('[data-testid="library-card"]').length).toBe(5);
    await $('[data-testid="genre-chip"][data-genre=""]').click();
    await $('[data-testid="sort"][data-sort="rating"]').click();
    await expect($('[data-testid="library-card"]')).toHaveAttribute('data-path', 'Rating/music/Seven Bells for Nobody.md');
    await $('[data-testid="sort"][data-sort="recent"]').click();
    await expect($('[data-testid="library-card"]')).toHaveAttribute('data-path', 'Rating/music/Monastery Wi-Fi.md');

    // The calendar opens on the latest month with something in it.
    await $('[data-testid="cover-calendar"]').scrollIntoView();
    await expect($('[data-testid="cover-calendar-month"]')).toHaveText('September 2026');
    expect(await $$('[data-testid="cover-day"] .cover-day-cover').length).toBe(9);
    await screenshot('48-library-calendar');
    await browser.execute(() => document.querySelector('.main')?.scrollTo(0, 0));

    await showTab('Films');
    await expect(library).toHaveAttribute('data-tab', 'film');
    expect(await $$('[data-testid="library-card"]').length).toBe(4);
    await browser.waitUntil(async () => (await $$('.library-cover-image[data-testid="vault-image"]').length) === 4, { timeoutMsg: 'the posters never loaded' });
    await screenshot('49-library-films');
    await showTab('Books');
    expect(await $$('[data-testid="library-card"]').length).toBe(6);
    await browser.waitUntil(async () => (await $$('.library-cover-image[data-testid="vault-image"]').length) === 6, { timeoutMsg: 'the book covers never loaded' });
    await screenshot('50-library-books');
    await showTab('Podcasts');
    expect(await $$('[data-testid="library-card"]').length).toBe(4);
    // Videos open as pages, but the library is what is rated and added: no tab for them.
    expect(await browser.execute(() => [...document.querySelectorAll('[data-testid="library"] [role="tab"]')].map((tab) => tab.textContent))).toEqual(['All', 'Albums', 'Films', 'Books', 'Podcasts']);
    await showTab('Albums');
  });

  it("opens an album as its page, and setting its rating writes that one line", async () => {
    const path = 'Rating/music/Glasshouse Weather.md';
    await $(`[data-testid="library-card"][data-path="${path}"]`).click();
    await $(`[data-testid="media-page"][data-path="${path}"]`).waitForDisplayed();
    await expect(title()).toHaveText('Glasshouse Weather');
    await expect($('[data-testid="rating-ring"]')).toHaveAttribute('data-value', '88');
    await expect($('[data-testid="media-tracks"]')).toHaveText(expect.stringContaining('Greenhouse Effect'));
    const cover = $('[data-testid="media-page"] [data-testid="vault-image"]');
    await browser.waitUntil(async () => Number(await cover.getProperty('naturalWidth')) > 0, { timeoutMsg: 'the cover never loaded' });
    await screenshot('51-media-page');

    const file = join(vaultCopy(), path);
    const before = readFileSync(file, 'utf8');
    await $('[data-testid="rating-field"]').setValue('91');
    // Leaving the field sets it, as a click elsewhere would.
    await browser.execute(() => (document.activeElement as HTMLElement | null)?.blur());
    const rated = before.replace('\nrating: 88\n', '\nrating: 91\n');
    expect(rated).not.toBe(before);
    await browser.waitUntil(() => readFileSync(file, 'utf8') === rated, { timeout: 5000, timeoutMsg: 'the rating never reached the note' });
    await expect($('[data-testid="rating-ring"]')).toHaveAttribute('data-value', '91');
  });

  it('adds an album found by a lookup: its note in the vault\'s format, and its cover beside it', async () => {
    // The e2e build answers lookups from test/fixtures/lookup/, so nothing here goes on the network.
    await $('[data-testid="media-library"]').click();
    await expect($('[data-testid="library"]')).toHaveAttribute('data-tab', 'album');
    await $('[data-testid="library-add"][data-kind="album"]').click();
    await $('[data-testid="add-search"]').setValue('dog man star');
    await browser.waitUntil(async () => (await $$('[data-testid="add-result"]').length) === 6, { timeoutMsg: 'no results came' });
    await browser.waitUntil(async () => (await $$('[data-testid="lookup-cover"]').length) === 6, { timeoutMsg: 'the result covers never loaded' });
    await expect($('[data-testid="add-result"]')).toHaveText(expect.stringContaining('Suede'));
    await screenshot('52-media-add');

    await $('[data-testid="add-result"][data-id="da15737e-3eb3-31e4-97f0-fe46299f75fb"]').click();
    await $('[data-testid="add-form"]').waitForDisplayed();
    await expect($('[data-testid="add-title"]')).toHaveValue('Dog Man Star');
    await expect($('[data-testid="add-maker"]')).toHaveValue('Suede');
    await expect($('[data-testid="add-year"]')).toHaveValue('1994');
    // Typed, not picked: the field still takes a date. Pressing the rating closes its calendar.
    await $('[data-testid="add-date"]').click();
    await $('[data-testid="add-date"]').setValue('2026-10-07');
    await $('[data-testid="add-rating"]').click();
    await expect($('[data-testid="date-picker"]')).not.toBeExisting();
    await $('[data-testid="add-rating"]').setValue('86');
    await $('[data-testid="add-form"] [data-testid="lookup-cover"]').waitForDisplayed();
    await screenshot('53-media-add-form');
    await $('[data-testid="add-save"]').click();

    const path = 'Rating/music/Dog Man Star.md';
    await $(`[data-testid="media-page"][data-path="${path}"]`).waitForDisplayed();
    expect(readFileSync(join(vaultCopy(), path), 'utf8')).toBe(
      '---\nArtist: Suede\nYear: 1994\nlistened: 2026-10-07\ngenre:\n  - britpop\n  - glam rock\n  - art rock\nrating: 86\nfavorite tracks:\n---\n[[00. Music 2026 MOC|music 2026]]\n\n![[dog-man-star.png|240]]\n',
    );
    // The recorded cover is a PNG, so it was saved as .png though asked for as .jpg.
    const saved = readFileSync(join(vaultCopy(), 'Rating/music/_attachments/dog-man-star.png'));
    expect(['cover-1.png', 'cover-2.png', 'cover-3.png'].some((name) => readFileSync(join(FIXTURES, name)).equals(saved))).toBe(true);
    await expect($('[data-testid="rating-ring"]')).toHaveAttribute('data-value', '86');
  });

  it("adds a podcast episode: the show, its episodes narrowed by typing, the day picked in the calendar, the note in the vault's format", async () => {
    // From the albums' tab: every tab has an Add for every kind.
    await $('[data-testid="media-library"]').click();
    await expect($('[data-testid="library"]')).toHaveAttribute('data-tab', 'album');
    await $('[data-testid="library-add"][data-kind="podcast"]').click();
    await $('[data-testid="add-search"]').setValue('lex fridman');
    await browser.waitUntil(async () => (await $$('[data-testid="add-result"]').length) === 4, { timeoutMsg: 'no shows came' });
    await $('[data-testid="add-result"][data-id="1434243584"]').click();
    await browser.waitUntil(async () => (await $$('[data-testid="add-episode"]').length) === 16, { timeoutMsg: 'no episodes came' });
    await expect($('[data-testid="add-show-title"]')).toHaveText('Lex Fridman Podcast');
    await expect($('[data-testid="add-episode"]')).toHaveText(expect.stringContaining('26 October 2026 · 3 h 43 min'));
    await screenshot('82-podcast-episodes');

    await $('[data-testid="episode-filter"]').setValue('jensen');
    await browser.waitUntil(async () => (await $$('[data-testid="add-episode"]').length) === 1, { timeoutMsg: 'typing never narrowed the episodes' });
    await $('[data-testid="add-episode"][data-id="1000756806357"]').click();
    await $('[data-testid="add-form"]').waitForDisplayed();
    await expect($('[data-testid="add-title"]')).toHaveValue('Jensen Huang: NVIDIA – The $4 Trillion Company & the AI Revolution');
    await expect($('[data-testid="add-maker"]')).toHaveValue('Lex Fridman Podcast');
    await expect($('[data-testid="add-year"]')).toHaveValue('2026');
    await expect($('[data-testid="add-back"]')).toHaveText('← Episodes');

    // The date: typed, then a month back and a day with a click, then a day on with the keys.
    const picker = $('[data-testid="date-picker"]');
    await $('[data-testid="add-date"]').click();
    await picker.waitForDisplayed();
    await $('[data-testid="add-date"]').setValue('2026-10-07');
    await expect($('[data-testid="date-picker-month"]')).toHaveText('October 2026');
    await expect($('[data-testid="date-picker-day"][data-date="2026-10-07"]')).toHaveAttribute('aria-pressed', 'true');
    await $('[data-testid="date-picker-prev"]').click();
    await expect($('[data-testid="date-picker-month"]')).toHaveText('September 2026');
    await screenshot('83-date-picker');
    await $('[data-testid="date-picker-day"][data-date="2026-09-20"]').click();
    await expect(picker).not.toBeExisting();
    await expect($('[data-testid="add-date"]')).toHaveValue('2026-09-20');
    await $('[data-testid="add-date"]').click();
    await picker.waitForDisplayed();
    await browser.keys(['ArrowDown']);
    await browser.waitUntil(async () => (await browser.execute(() => document.activeElement?.getAttribute('data-date'))) === '2026-09-20', { timeoutMsg: 'the keys never reached the calendar' });
    await browser.keys(['ArrowRight']);
    await browser.keys(['Enter']);
    await expect(picker).not.toBeExisting();
    await expect($('[data-testid="add-date"]')).toHaveValue('2026-09-21');
    // Escape closes an open calendar, and only it: the form stays.
    await $('[data-testid="add-date"]').click();
    await picker.waitForDisplayed();
    await browser.keys(['Escape']);
    await expect(picker).not.toBeExisting();
    await expect($('[data-testid="add-form"]')).toBeDisplayed();

    await $('[data-testid="add-rating"]').setValue('77');
    await $('[data-testid="add-form"] [data-testid="lookup-cover"]').waitForDisplayed();
    await $('[data-testid="add-save"]').click();
    await $(`[data-testid="media-page"][data-path="${EPISODE}"]`).waitForDisplayed();
    const file = join(vaultCopy(), EPISODE);
    expect(readFileSync(file, 'utf8')).toBe(EPISODE_NOTE);
    const saved = readFileSync(join(vaultCopy(), EPISODE_COVER));
    expect(['cover-1.png', 'cover-2.png', 'cover-3.png'].some((name) => readFileSync(join(FIXTURES, name)).equals(saved))).toBe(true);

    // On its page the date opens the same calendar, and a day picked there is written at once.
    await $('[data-testid="media-date"]').click();
    await picker.waitForDisplayed();
    await expect($('[data-testid="date-picker-month"]')).toHaveText('September 2026');
    await screenshot('84-podcast-episode');
    await $('[data-testid="date-picker-day"][data-date="2026-09-22"]').click();
    const moved = EPISODE_NOTE.replace('Listened: 2026-09-21', 'Listened: 2026-09-22');
    await browser.waitUntil(() => readFileSync(file, 'utf8') === moved, { timeout: 5000, timeoutMsg: 'the picked day never reached the note' });
    await expect($('[data-testid="media-date"]')).toHaveValue('2026-09-22');
    await $('[data-testid="media-date"]').click();
    await picker.waitForDisplayed();
    await $('[data-testid="date-picker-day"][data-date="2026-09-21"]').click();
    await browser.waitUntil(() => readFileSync(file, 'utf8') === EPISODE_NOTE, { timeout: 5000, timeoutMsg: 'the day picked back never reached the note' });
  });

  it("shows everything listened to, watched and finished in All's calendar, several covers on a day, narrowed by kind", async () => {
    await $('[data-testid="open-library"]').click();
    await expect($('[data-testid="library"]')).toHaveAttribute('data-tab', 'all');
    await $('[data-testid="cover-calendar"]').scrollIntoView();
    // September, from the year's strip: the 21st has an album, the new episode and a film.
    await $$('[data-testid="year-month"]')[8]?.click();
    await expect($('[data-testid="cover-calendar-month"]')).toHaveText('September 2026');
    const day21 = $('[data-testid="cover-day"][data-day="21"]');
    await expect(day21).toHaveAttribute('data-count', '3');
    expect(await day21.$$('[data-testid="cover-day-cover"]').length).toBe(3);
    await expect($('[data-testid="cover-day"][data-day="3"]')).toHaveAttribute('data-count', '2');
    await browser.waitUntil(async () => (await $$('.cover-day-image[data-testid="vault-image"]').length) >= 17, { timeoutMsg: 'the calendar covers never loaded' });
    await screenshot('85-library-all-calendar');

    await $('[data-testid="kind-chip"][data-kind="podcast"]').click();
    await expect(day21).toHaveAttribute('data-count', '1');
    expect(await $$('[data-testid="cover-day"][data-count]').length).toBe(3);
    await $('[data-testid="kind-chip"][data-kind="podcast"]').click();
    await browser.execute(() => document.querySelector('.main')?.scrollTo(0, 0));
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

  it('lists the notes that link to a note in the right sidebar, not under the note', async () => {
    await followLink('Glasshouse Weather');
    await expect(title()).toHaveText('Glasshouse Weather');
    await expect($('main [data-testid="backlinks"]')).not.toBeExisting();
    await expect($('[data-testid="right-sidebar"]')).not.toBeExisting();
    await $('[data-testid="right-sidebar-toggle"]').click();
    const sidebar = $('[data-testid="right-sidebar"]');
    await expect(sidebar).toHaveAttribute('data-note', ALBUM);
    const backlinks = sidebar.$('[data-testid="backlinks"]');
    await expect(backlinks).toHaveText(expect.stringContaining('Inbox idea'));
    await expect(backlinks).toHaveText(expect.stringContaining('08.26 RPG'));
    await expect($('[data-testid="right-sidebar-toggle"]')).toHaveAttribute('aria-pressed', 'true');
    await screenshot('18-backlinks');
    // ⌥⌘B closes it again.
    await pressCommand('b', { alt: true });
    await expect(sidebar).not.toBeExisting();
  });

  it('opens a note in a new tab with ⌘-click or a middle click, each tab with its own history', async () => {
    await startWithTabs([ALBUM]);
    await clickAs(`[data-testid="tree-note"][data-path="${INBOX}"]`, 'meta');
    await expect(title()).toHaveText('Inbox idea');
    expect(await tabTitles()).toEqual(['Glasshouse Weather', 'Inbox idea']);
    await expect(frontTab()).toHaveAttribute('data-title', 'Inbox idea');
    // A new tab starts its own history.
    await expect($('[data-testid="tab-back"]')).toBeDisabled();
    // A day of the sidebar's calendar, and a note with the middle button, each right of the tab in front.
    await showMonth('August 2026');
    await clickAs('[data-testid="calendar-day"][data-date="2026-08-14"]', 'meta');
    await expect(title()).toHaveText('14.08.2026');
    await workspaceTabs()[1]?.click();
    await expect(title()).toHaveText('Inbox idea');
    await openFolders(...foldersOf(FILM));
    await clickAs(`[data-testid="tree-note"][data-path="${FILM}"]`, 'middle');
    await waitForNote(FILM);
    expect(await tabTitles()).toEqual(['Glasshouse Weather', 'Inbox idea', 'The Lighthouse Accountant', '14.08.2026']);
    await screenshot('70-tabs-second-tab');
    // The first tab still shows what it showed.
    await workspaceTabs()[0]?.click();
    await expect(title()).toHaveText('Glasshouse Weather');
    // A plain click opens in the tab in front, which can go back to what it showed, and forward again.
    await workspaceTabs()[1]?.click();
    await openFolders(...foldersOf(ALBUM));
    await openNote(ALBUM);
    await expect(frontTab()).toHaveAttribute('data-title', 'Glasshouse Weather');
    await $('[data-testid="tab-back"]').click();
    await expect(title()).toHaveText('Inbox idea');
    await expect($('[data-testid="tab-back"]')).toBeDisabled();
    await $('[data-testid="tab-forward"]').click();
    await expect(title()).toHaveText('Glasshouse Weather');
    await expect($('[data-testid="tab-forward"]')).toBeDisabled();
    expect(await tabTitles()).toEqual(['Glasshouse Weather', 'Glasshouse Weather', 'The Lighthouse Accountant', '14.08.2026']);
  });

  it('pins a tab: it moves left with a pin, ⌘W leaves it, and a plain link click in it opens a new tab', async () => {
    await startWithTabs([ALBUM, FILM, INBOX], 2);
    await clickAs('[data-testid="workspace-tab"][data-title="Inbox idea"]', 'right');
    await $('[data-testid="tab-menu"]').waitForDisplayed();
    await expect($('[data-testid="tab-menu-pin"]')).toHaveText('Pin');
    await $('[data-testid="tab-menu-pin"]').click();
    await expect($('[data-testid="tab-menu"]')).not.toBeExisting();
    expect(await tabTitles()).toEqual(['Inbox idea', 'Glasshouse Weather', 'The Lighthouse Accountant']);
    const pinned = workspaceTabs()[0];
    await expect(pinned).toHaveAttribute('data-pinned', 'true');
    await expect(pinned?.$('[data-testid="tab-pin"]')).toBeDisplayed();
    await expect(pinned?.$('[data-testid="tab-close"]')).not.toBeExisting();
    await expect(frontTab()).toHaveAttribute('data-title', 'Inbox idea');

    await pressCommand('w');
    expect(await tabTitles()).toHaveLength(3);
    await expect(title()).toHaveText('Inbox idea');

    await followLink('Someday maybe');
    await $('[data-testid="missing-note"]').waitForDisplayed();
    expect(await tabTitles()).toEqual(['Inbox idea', 'Someday maybe', 'Glasshouse Weather', 'The Lighthouse Accountant']);
    await expect(frontTab()).toHaveAttribute('data-pinned', 'false');
    await workspaceTabs()[0]?.click();
    await expect(title()).toHaveText('Inbox idea');
    await screenshot('71-tabs-pinned');
  });

  it('closes tabs with ⌘W, the ×, a middle click and the menu, and unpins one', async () => {
    await startWithTabs([INBOX, ALBUM, FILM, DAY], 1);
    await pinTab('Inbox idea');
    await expect(frontTab()).toHaveAttribute('data-title', 'Glasshouse Weather');
    await pressCommand('w');
    // The tab to the right of the one closed comes forward.
    expect(await tabTitles()).toEqual(['Inbox idea', 'The Lighthouse Accountant', '14.08.2026']);
    await expect(frontTab()).toHaveAttribute('data-title', 'The Lighthouse Accountant');
    await frontTab().$('[data-testid="tab-close"]').click();
    await expect(frontTab()).toHaveAttribute('data-title', '14.08.2026');
    await expect(title()).toHaveText('14.08.2026');
    // ⌘T opens a new tab on the home screen.
    await pressCommand('t');
    await $('[data-testid="home"]').waitForDisplayed();
    expect(await tabTitles()).toEqual(['Inbox idea', '14.08.2026', 'Home']);
    await clickAs('[data-testid="workspace-tab"][data-title="14.08.2026"]', 'middle');
    expect(await tabTitles()).toEqual(['Inbox idea', 'Home']);
    await expect(frontTab()).toHaveAttribute('data-title', 'Home');
    await screenshot('72-tabs-closed');

    await workspaceTabs()[0]?.$('[data-testid="tab-pin"]').click();
    await expect(workspaceTabs()[0]).toHaveAttribute('data-pinned', 'false');
    await clickAs('[data-testid="workspace-tab"][data-title="Inbox idea"]', 'right');
    await expect($('[data-testid="tab-menu-pin"]')).toHaveText('Pin');
    await $('[data-testid="tab-menu-close"]').click();
    expect(await tabTitles()).toEqual(['Home']);
    // Closing the last tab leaves a new one on the home screen.
    const last = (await frontTab().getAttribute('data-tab-id')) ?? '';
    await pressCommand('w');
    expect(await tabTitles()).toEqual(['Home']);
    await expect(frontTab()).not.toHaveAttribute('data-tab-id', last);
    await $('[data-testid="home"]').waitForDisplayed();
  });

  it('shows the backlinks of the note in front in the right sidebar, and opens one in a new tab', async () => {
    await startWithTabs([ALBUM]);
    await setRightSidebar(true);
    await openPanel('backlinks');
    const sidebar = $('[data-testid="right-sidebar"]');
    await expect(sidebar).toHaveAttribute('data-note', ALBUM);
    const inbox = sidebar.$(`[data-testid="backlink"][data-path="${INBOX}"]`);
    await expect(inbox).toHaveText(expect.stringContaining('Glasshouse Weather'));
    await screenshot('73-right-sidebar-backlinks');

    // ⌘-click opens it in a new tab, and the sidebar follows the note in front.
    await clickAs(`[data-testid="backlink"][data-path="${INBOX}"]`, 'meta');
    await expect(title()).toHaveText('Inbox idea');
    expect(await tabTitles()).toEqual(['Glasshouse Weather', 'Inbox idea']);
    await expect(sidebar).toHaveAttribute('data-note', INBOX);
    await expect(sidebar.$('[data-testid="backlinks"]')).toHaveAttribute('data-count', '0');
    await expect(sidebar.$('[data-testid="backlinks"]')).toHaveText('No links to this note yet.');

    // A panel folds away and opens again.
    const toggle = sidebar.$('[data-testid="panel-toggle"][data-panel="backlinks"]');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(sidebar.$('[data-testid="backlinks"]')).not.toBeExisting();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    // A tab that isn't a note says so quietly.
    await pressCommand('t');
    await expect(sidebar).toHaveAttribute('data-note', '');
    await expect(sidebar).toHaveText(expect.stringContaining('Open a note to see what links to it.'));
    await pressCommand('w');
    await workspaceTabs()[0]?.click();
    await expect(sidebar).toHaveAttribute('data-note', ALBUM);
  });

  it('draws the local graph of the note in front, and opens a neighbour from it in a new tab', async () => {
    await startWithTabs([ALBUM]);
    await setRightSidebar(true);
    await openPanel('graph');
    const local = '[data-testid="right-sidebar"] [data-testid="local-graph"]';
    await browser.waitUntil(async () => (await $(local).getAttribute('data-settled')) === 'true', {
      timeout: 20_000,
      timeoutMsg: 'the local graph never settled',
    });
    await expect($(local)).toHaveAttribute('data-center', ALBUM);
    expect(Number(await $(local).getAttribute('data-nodes'))).toBeGreaterThanOrEqual(3);
    const neighbour = await pointAtNode(local, (path) => path !== ALBUM);
    await nextFrame();
    await screenshot('74-right-sidebar-local-graph');

    await clickCanvas(local, neighbour, { meta: true });
    await expect(title()).toHaveText(neighbour.path.replace(/^.*\//, '').replace(/\.md$/, ''));
    expect(await tabTitles()).toHaveLength(2);
    await expect($('[data-testid="right-sidebar"]')).toHaveAttribute('data-note', neighbour.path);

    // Back to one tab and no sidebar, as the steps after this expect.
    await pressCommand('w');
    expect(await tabTitles()).toEqual(['Glasshouse Weather']);
    await setRightSidebar(false);
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
    // Plan done is the share of ticked tasks: 3 of 5.
    await expect($('[data-testid="tile-plan"]')).toHaveText(expect.stringContaining('60%'));
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
    // The tick, and the plan done it makes (4 of 5), in one write.
    const ticked = before.replace(task, task.replace('[ ]', '[x]')).replace('\ndone: 60\n', '\ndone: 80\n');
    await browser.waitUntil(() => read() === ticked, { timeout: 5000, timeoutMsg: 'the tick never reached the note' });
    await expect($('[data-testid="tile-plan"]')).toHaveText(expect.stringContaining('80%'));

    // Mood is out of 5, as in the vault; the third segment sets 3.
    await $('[data-testid="check-in"] [data-metric="mood"] [data-value="3"]').click();
    const mood = ticked.replace('\nmood: 5\n', '\nmood: 3\n');
    await browser.waitUntil(() => read() === mood, { timeout: 5000, timeoutMsg: 'the mood never reached the note' });

    // The summary is written in place, into the summary callout.
    await $('[data-testid="summary"]').click();
    await $('[data-testid="summary-field"]').waitForDisplayed();
    // Typed over the old words as macOS sends typing: the driver's clear doesn't reach React.
    await browser.execute((value) => {
      const field = document.querySelector<HTMLTextAreaElement>('[data-testid="summary-field"]');
      field?.focus();
      field?.select();
      document.execCommand('insertText', false, value);
      field?.blur();
    }, 'Busy, calm, and the page shipped.');
    const summarised = mood.replace('> Busy but calm.\n', '> Busy, calm, and the page shipped.\n');
    await browser.waitUntil(() => read() === summarised, { timeout: 5000, timeoutMsg: 'the summary never reached the note' });

    await showTab('Tasks');
    await $('[data-testid="composer-category"][data-category="sport"]').click();
    await $('[data-testid="composer-text"]').setValue('evening run');
    await $('[data-testid="composer-add"]').click();
    // A new task has no minutes; they are set on its card once it is on the list.
    const listed = summarised
      .replace('    - 16:37–17:09\n', '    - 16:37–17:09\n- [ ] #daily/sport — evening run\n')
      .replace('\ndone: 80\n', '\ndone: 67\n');
    await browser.waitUntil(() => read() === listed, { timeout: 5000, timeoutMsg: 'the new task never reached the note' });
    const card = $(`[data-testid="task-card"][data-line="${listed.split('\n').indexOf('- [ ] #daily/sport — evening run')}"]`);
    await card.$('[data-testid="task-minutes"]').click();
    await card.$('[data-testid="task-minutes-field"]').setValue('30');
    await browser.keys('Enter');
    // A sixth task, still open: plan done goes to 4 of 6.
    const added = summarised
      .replace('    - 16:37–17:09\n', '    - 16:37–17:09\n- [ ] #daily/sport — evening run [minutes::30]\n')
      .replace('\ndone: 80\n', '\ndone: 67\n');
    await browser.waitUntil(() => read() === added, { timeout: 5000, timeoutMsg: 'the minutes never reached the note' });
    expect(await $$('[data-testid="task-card"]').length).toBe(6);
    await screenshot('25-day-tasks');

    // A right-click edits a task in place: new words, the same category and minutes.
    const evening = `[data-testid="task-card"][data-line="${added.split('\n').indexOf('- [ ] #daily/sport — evening run [minutes::30]')}"]`;
    // Right-clicks where the card is on screen, and says where.
    const rightClick = (selector: string) =>
      browser.execute((css) => {
        const box = document.querySelector(css)?.getBoundingClientRect();
        const at = { x: (box?.left ?? 0) + 24, y: (box?.top ?? 0) + 24 };
        document.querySelector(css)?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y }));
        return at;
      }, selector);
    const clicked = await rightClick(evening);
    // The menu opens at the pointer, not where the page's frame would put a fixed menu.
    const menu = await browser.execute(() => document.querySelector('[data-testid="focus-menu"]')?.getBoundingClientRect().toJSON() as { left: number; top: number } | undefined);
    expect(Math.abs((menu?.left ?? -999) - clicked.x)).toBeLessThan(2);
    expect(Math.abs((menu?.top ?? -999) - clicked.y)).toBeLessThan(2);
    await $('[data-testid="focus-menu-edit"]').click();
    await $('[data-testid="edit-task-text"]').waitForDisplayed();
    await browser.execute((value) => {
      const field = document.querySelector<HTMLInputElement>('[data-testid="edit-task-text"]');
      field?.focus();
      field?.select();
      document.execCommand('insertText', false, value);
    }, 'evening run by the river');
    await screenshot('54-edit-task');
    await $('[data-testid="edit-task-save"]').click();
    const edited = added.replace('evening run [minutes::30]', 'evening run by the river [minutes::30]');
    await browser.waitUntil(() => read() === edited, { timeout: 5000, timeoutMsg: 'the edit never reached the note' });

    // And deletes it, with its minutes: plan done goes back to 4 of 5.
    await rightClick(evening);
    await $('[data-testid="focus-menu-delete-task"]').click();
    await $('[data-testid="delete-task"]').waitForDisplayed();
    await screenshot('55-delete-task');
    await $('[data-testid="delete-task-confirm"]').click();
    await browser.waitUntil(() => read() === summarised, { timeout: 5000, timeoutMsg: 'the deletion never reached the note' });
    expect(await $$('[data-testid="task-card"]').length).toBe(5);

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
    await screenshot('40-thought-wizard');
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
    await browser.waitUntil(() => read().startsWith(summarised.replace(/\n$/, '')) && row.test(read().slice(summarised.length - 1)), {
      timeout: 5000,
      timeoutMsg: 'the thought record never reached the note',
    });
    expect(await $$('[data-testid="record"]').length).toBe(1);
    await screenshot('41-thought-records');
    await showTab('Overview');
  });

  it('sums a week from its seven days, and a month from its days and weeks', async () => {
    await $('[data-testid="calendar-week"][data-week="33"]').click();
    await showTab('Overview');
    await expect($('[data-testid="periodic"][data-period="week"]')).toBeDisplayed();
    expect(await $$('[data-testid="day-card"]').length).toBe(7);
    await expect($('[data-testid="reflections"]')).toBeDisplayed();
    await screenshot('23-weekly-dashboard');
    await showTab('Habits');
    await expect($('[data-testid="habit-grid"]')).toBeDisplayed();
    await screenshot('30-week-habits');
    await showTab('Stats');
    await screenshot('31-week-stats');

    // Ticking a weekly quest writes its box, its done date and today's XP stamp into the weekly note.
    await showTab('Quests');
    expect(await $$('[data-testid="quest-card"]').length).toBeGreaterThan(2);
    await screenshot('42-week-quests');
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
    await screenshot('43-month-quests');
    await showTab('Overview');
  });

  it("writes the running week's Plus, Minus and Next, adds a quest to it, and a chapter to that quest's log", async () => {
    await showMonth('September 2026');
    await $('[data-testid="calendar-week"][data-week="40"]').click();
    await expect(title()).toHaveText('2026-W40 - 28.09.26');
    const file = join(vaultCopy(), 'Calendar/2026/weeks/2026-W40 - 28.09.26.md');
    const read = () => readFileSync(file, 'utf8');
    const before = read();
    // The week as the vault's weekly template leaves it: a second Plus, "Goals", and a dash under each heading.
    expect(before).toContain('\n#### Plus\nGoals\n\n#### Plus\n-\n\n#### Minus\n-\n\n#### Next\n-\n\n\n#### Statistics\n');

    // Each card writes its own section, in place, as the Obsidian weekly dashboard's Save does.
    await showTab('Overview');
    await $('[data-testid="reflections"]').scrollIntoView();
    const card = (heading: string) => `[data-testid="reflection"][data-heading="${heading}"]`;
    await $(`${card('Plus')} [data-testid="reflection-field"]`).setValue('Two deep mornings');
    await $(`${card('Plus')} [data-testid="reflection-save"]`).click();
    const plus = before.replace('\n#### Plus\nGoals\n\n', '\n#### Plus\nTwo deep mornings\n');
    await browser.waitUntil(() => read() === plus, { timeout: 5000, timeoutMsg: 'Plus never reached the note' });
    await $(`${card('Minus')} [data-testid="reflection-field"]`).setValue('Phone at night');
    await $(`${card('Minus')} [data-testid="reflection-save"]`).click();
    const minus = plus.replace('\n#### Minus\n-\n\n', '\n#### Minus\nPhone at night\n');
    await browser.waitUntil(() => read() === minus, { timeout: 5000, timeoutMsg: 'Minus never reached the note' });
    await $(`${card('Next')} [data-testid="reflection-field"]`).setValue('A long run on Saturday');
    await $(`${card('Next')} [data-testid="reflection-save"]`).click();
    const reflected = minus.replace('\n#### Next\n-\n\n\n', '\n#### Next\nA long run on Saturday\n');
    await browser.waitUntil(() => read() === reflected, { timeout: 5000, timeoutMsg: 'Next never reached the note' });
    await expect($(card('Next'))).toHaveText(expect.stringContaining('Saved'));
    await screenshot('60-week-reflections');

    // A new quest: the first sphere is the main one, the second a bonus at 30%; Epic sets 1000 XP.
    await showTab('Quests');
    await $('[data-testid="quest-new"]').click();
    await $('[data-testid="quest-title"]').setValue('Read 100 pages');
    await $('[data-testid="quest-sphere"][data-sphere="Personal Growth"]').click();
    await $('[data-testid="quest-sphere"][data-sphere="Spiritual"]').click();
    await $('[data-testid="quest-tier"][data-tier="epic"]').click();
    // Set as typing sets it: the driver's clear doesn't reach React.
    await browser.execute((value) => {
      const field = document.querySelector<HTMLInputElement>('[data-testid="quest-target"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, value);
      field?.dispatchEvent(new Event('input', { bubbles: true }));
    }, '100');
    await expect($('[data-testid="quest-total"]')).toHaveText('Personal Growth 1000 · bonus +300 · 1300 XP in all once done');
    await screenshot('61-quest-composer');
    await $('[data-testid="quest-add"]').click();
    const quest = '- [ ] #quest/weekly - Read 100 pages [xp::1000] [spheres::Personal Growth, Spiritual:30] [tier::epic] [target::100] [current::0]';
    // After the week's last quest, before the template's hint, as the dashboard's composer puts it.
    const added = reflected.replace('\nAdd real weekly quests', `\n${quest}\nAdd real weekly quests`);
    await browser.waitUntil(() => read() === added, { timeout: 5000, timeoutMsg: 'the quest never reached the weekly note' });
    await expect($('[data-testid="quest-status"]')).toHaveText('Saved');
    await $('button[aria-label="Details of Read 100 pages"]').scrollIntoView();
    await screenshot('62-quest-added');

    // Its detail, and a chapter for its adventure log, added with ⌘ + Enter.
    await $('button[aria-label="Details of Read 100 pages"]').click();
    await $('[data-testid="quest-detail"]').waitForDisplayed();
    await expect($('[data-testid="quest-detail-title"]')).toHaveText('Read 100 pages');
    await expect($('[data-testid="quest-detail-earned"]')).toHaveText('+0 XP');
    await screenshot('63-quest-detail');
    await $('[data-testid="chapter-field"]').setValue('Forty pages on the train.');
    await browser.execute(() =>
      document.querySelector('[data-testid="chapter-field"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true, cancelable: true })),
    );
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const chaptered = added.replace(`${quest}\n`, `${quest}\n    - ${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} :: Forty pages on the train.\n`);
    await browser.waitUntil(() => read() === chaptered, { timeout: 5000, timeoutMsg: 'the chapter never reached the weekly note' });
    expect(await $$('[data-testid="chapter"]').length).toBe(1);
    await expect($('[data-testid="chapter-field"]')).toHaveValue('');
    await screenshot('64-quest-chapter');
    await $('[data-testid="quest-detail-close"]').click();
    await expect($('[data-testid="quest-detail"]')).not.toBeExisting();

    // A quest whose log holds two chapters alike, each on its own line.
    await $('button[aria-label="Details of Three deep-work mornings"]').click();
    await $('[data-testid="quest-detail"]').waitForDisplayed();
    expect(await $$('[data-testid="chapter"]').length).toBe(2);
    await screenshot('65-quest-log');
    await $('[data-testid="quest-detail-close"]').click();
    expect(read()).toBe(chaptered);
    await showTab('Overview');
  });

  it('shows a week and a day of Apple Calendar in the calendar', async () => {
    await $('[data-testid="open-calendar"]').click();
    const calendar = $('[data-testid="cal-view"]');
    await calendar.waitForDisplayed();
    // The calendar opens on this week; the demo's days are in August.
    for (let i = 0; i < 60 && (await calendar.getAttribute('data-start')) !== '2026-08-10'; i += 1) {
      const shown = (await calendar.getAttribute('data-start')) ?? '';
      await $(`[data-testid="cal-${shown > '2026-08-10' ? 'prev' : 'next'}"]`).click();
    }
    await expect(calendar).toHaveAttribute('data-start', '2026-08-10');
    await expect($('[data-testid="cal-title"]')).toHaveText('10 – 16 August');
    expect(await $$('[data-testid="cal-col"]').length).toBe(7);
    // The e2e build's Apple Calendar is in memory: an appointment on the 14th, and a holiday all that day.
    expect(await $$('[data-testid="cal-plan"]').length).toBe(1);
    await expect($('[data-testid="cal-col"][data-date="2026-08-14"] [data-testid="cal-plan"]')).toHaveText(expect.stringContaining('Dentist'));
    await expect($('[data-testid="cal-col"][data-date="2026-08-14"] [data-testid="cal-plan"]')).toHaveText(expect.stringContaining('check-up'));
    await expect($('[data-testid="cal-allday"]')).toHaveText(expect.stringContaining('Summer holiday'));
    // The time logged is the notes' minutes; the time blocks under their tasks aren't drawn.
    await expect($('[data-testid="cal-col"][data-date="2026-08-14"]')).not.toHaveText(expect.stringContaining('refactor the settings screen'));
    await expect($('[data-testid="cal-planned"]')).toHaveText(expect.stringContaining('2 events in Calendar'));
    await browser.execute(() => document.querySelector('.main')?.scrollTo(0, 0));
    await screenshot('44-calendar-week');

    await $('[data-testid="cal-day-head"][data-date="2026-08-14"]').click();
    await expect(calendar).toHaveAttribute('data-mode', 'day');
    await expect($('[data-testid="cal-title"]')).toHaveText('14 August');
    // The day's five tasks: the one the day page added, it deleted again.
    expect(await $$('[data-testid="cal-day-task"]').length).toBe(5);
    await browser.execute(() => document.querySelector('.main')?.scrollTo(0, 0));
    await screenshot('45-calendar-day');
    await $('[data-testid="cal-mode-week"]').click();
    await expect(calendar).toHaveAttribute('data-mode', 'week');
  });

  it('plans a new task on a day: an event in Calendar, and only the task, with no minutes, in its note', async () => {
    const file = join(vaultCopy(), `${DAYS}/12.08.2026.md`);
    const before = readFileSync(file, 'utf8');
    // Press at 19:02 and drag to 20:00 on Wednesday, as a person would with the mouse.
    await browser.execute((date) => {
      const column = document.querySelector(`[data-testid="cal-col"][data-date="${date}"]`);
      if (!column) throw new Error(`no column for ${date}`);
      const top = column.getBoundingClientRect().top;
      const at = (minutes: number) => ({ bubbles: true, cancelable: true, button: 0, pointerId: 1, isPrimary: true, clientY: top + ((minutes - 7 * 60) / 60) * 44 });
      column.dispatchEvent(new PointerEvent('pointerdown', at(19 * 60 + 2)));
      window.dispatchEvent(new PointerEvent('pointermove', at(19 * 60 + 30)));
      window.dispatchEvent(new PointerEvent('pointermove', at(20 * 60)));
      window.dispatchEvent(new PointerEvent('pointerup', at(20 * 60)));
    }, '2026-08-12');
    const popover = $('[data-testid="block-popover"]');
    await popover.waitForDisplayed();
    await expect(popover).toHaveText(expect.stringContaining('19:00–20:00'));
    await $('[data-testid="block-popover"] [data-testid="pick-new"]').setValue('evening run');
    await $('[data-testid="block-popover"] [data-testid="pick-category"][data-category="sport"]').click();
    // No calendar is called sport, so the plan goes to the default one.
    await expect($('[data-testid="plan-calendar"]')).toHaveValue('home');
    await browser.execute(() => document.querySelector('[data-testid="block-popover"]')?.scrollIntoView({ block: 'center' }));
    await screenshot('46-calendar-new-block');
    await $('[data-testid="block-save"]').click();
    // A seventh task, still open: plan done goes from 5 of 6 to 5 of 7, in the same write.
    const added = before
      .replace('    - 14:41–15:13\n', '    - 14:41–15:13\n- [ ] #daily/sport — evening run <!-- focus-id: 20260812-01 -->\n')
      .replace('\ndone: 83\n', '\ndone: 71\n');
    expect(added).not.toBe(before);
    await browser.waitUntil(() => readFileSync(file, 'utf8') === added, { timeout: 5000, timeoutMsg: 'the planned task never reached the note' });
    // In Calendar as Senioro writes it: the category as its title, the task's words in its notes.
    const plan = $('[data-testid="cal-col"][data-date="2026-08-12"] [data-testid="cal-plan"]');
    await expect(plan).toHaveText(expect.stringContaining('sport'));
    await expect(plan).toHaveText(expect.stringContaining('evening run'));
    await expect(plan).toHaveAttribute('data-start', String(19 * 60));
    await expect($('[data-testid="cal-planned"]')).toHaveText(expect.stringContaining('3 events in Calendar'));
    await browser.execute(() => document.querySelector('[data-testid="cal-col"][data-date="2026-08-12"] [data-testid="cal-plan"]')?.scrollIntoView({ block: 'center' }));
    await screenshot('56-calendar-plans');
  });

  it('keeps the periodic notes setup in Settings', async () => {
    await $('[data-testid="open-settings"]').click();
    await expect($('[data-testid="settings-day-format"]')).toHaveValue('DD.MM.YYYY');
    await expect($('[data-testid="settings-day"]')).toHaveText(expect.stringContaining('This day:'));
    await screenshot('16-settings');
  });

  it('counts the weeks till 30 on the home screen from the birth date in Settings', async () => {
    // Settings live next to the vault copy, never in it: this changes no note.
    await $('[data-testid="settings-birth-date"]').setValue('1998-03-21');
    await $('[data-testid="settings-save"]').click();
    await $('[data-testid="settings"] .save-state').waitForDisplayed();
    await $('[data-testid="settings-home"]').scrollIntoView();
    await screenshot('37-settings-birth-date');
    await $('[data-testid="sidebar-vault"]').click();
    await expect($('[data-testid="memento"]')).toHaveText(expect.stringContaining('Till 30'));
    await $('[data-testid="weeks-toggle"]').click();
    const grid = $('[data-testid="weeks-grid"]');
    await grid.waitForDisplayed();
    expect(await browser.execute(() => document.querySelectorAll('[data-testid="weeks-grid"] rect').length)).toBe(1560);
    await grid.scrollIntoView();
    await screenshot('35-home-weeks');
  });

  it("creates today's note from the home screen", async () => {
    await $('[data-testid="sidebar-vault"]').click();
    await $('[data-testid="today-create"]').click();
    await expect(title()).toHaveText(TODAY);
    await expect($('[data-testid="periodic"][data-period="day"]')).toBeDisplayed();
    await $('[data-testid="sidebar-vault"]').click();
    await expect($('[data-testid="today-open"]')).toHaveAttribute('title', `Open ${TODAY}`);
  });

  it("times a new task of today's with the stopwatch, shown on the timer's card and in the sidebar", async () => {
    await $('[data-testid="open-calendar"]').click();
    const back = $('[data-testid="cal-today"]');
    if (await back.isExisting()) await back.click();
    await $('[data-testid="timer-start"]').click();
    await $('[data-testid="timer-setup"] [data-testid="timer-mode-stopwatch"]').click();
    await $('[data-testid="timer-setup"] [data-testid="pick-new"]').setValue('e2e focus');
    await $('[data-testid="timer-setup"] [data-testid="pick-category"][data-category="code"]').click();
    await $('[data-testid="timer-go"]').click();
    await expect($('[data-testid="timer"]')).toHaveAttribute('data-state', 'running');
    await expect($('[data-testid="timer-pill"]')).toHaveText(expect.stringContaining('e2e focus'));
    const today = join(vaultCopy(), `${DAYS}/${TODAY}.md`);
    expect(readFileSync(today, 'utf8')).toContain('\n- [ ] #daily/code — e2e focus [minutes::0]\n');
    await browser.execute(() => {
      document.querySelector('.main')?.scrollTo(0, 0);
      document.querySelector('.sidebar')?.scrollTo(0, 0);
    });
    await screenshot('47-calendar-timer');
    // Stopped within a minute: nothing to write.
    await $('[data-testid="timer-stop"]').click();
    await expect($('[data-testid="timer"]')).toHaveAttribute('data-state', 'idle');
    await expect($('[data-testid="timer-pill"]')).not.toBeExisting();
    expect(readFileSync(today, 'utf8')).not.toMatch(/e2e focus[^\n]*\n {4}- \d\d:\d\d/);
  });

  it('changed nothing in the vault copy but the new notes, the added album and episode and their covers, the rating set, the days changed from their pages and drawn on, and the weeks written from theirs', () => {
    expect(diffSnapshots(snapshotVault(DEMO_VAULT), snapshotVault(vaultCopy()))).toEqual(
      [
        `added: ${DAYS}/30.07.2026.md`,
        `added: ${DAYS}/31.07.2026.md`,
        `added: ${DAYS}/${TODAY}.md`,
        'added: Inbox idea.md',
        'added: Rating/music/Dog Man Star.md',
        'added: Rating/music/_attachments/dog-man-star.png',
        `added: ${EPISODE}`,
        `added: ${EPISODE_COVER}`,
        'changed: Rating/music/Glasshouse Weather.md',
        `changed: ${DAYS}/12.08.2026.md`,
        `changed: ${DAYS}/14.08.2026.md`,
        'changed: Calendar/2026/weeks/2026-W33 - 10.08.26.md',
        'changed: Calendar/2026/weeks/2026-W40 - 28.09.26.md',
      ].sort(),
    );
  });
});
