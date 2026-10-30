import { $, $$, browser, expect } from '@wdio/globals';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { diffSnapshots, snapshotVault } from '../../scripts/vault-snapshot.mjs';
import { DEMO_VAULT, FIXTURES, vaultCopy } from '../paths';
import {
  clickAs,
  clickInPage,
  clickCanvas,
  closeOtherTabs,
  closeTool,
  filterBy,
  foldersOf,
  followLink,
  frontTab,
  nextFrame,
  openFolders,
  openNote,
  openPanel,
  openTool,
  pinTab,
  pointAtNode,
  prepareWindow,
  pressCommand,
  screenshot,
  scrollIntoView,
  setRightSidebar,
  showLibraryAs,
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
let deletedLibraryNote: string | undefined;
let deletedFileActionNote: string | undefined;
const INBOX = 'Inbox idea.md';
const DAY = `${DAYS}/14.08.2026.md`;
// The Lex Fridman Podcast's episode #494, from the recorded iTunes answers (test/fixtures/lookup/).
const EPISODE = 'Rating/podcasts/Jensen Huang - NVIDIA – The $4 Trillion Company & the AI Revolution.md';
const EPISODE_COVER = 'Rating/podcasts/_attachments/jensen-huang-nvidia-the-4-trillion-company-and-the-ai-revolution.png';
const EPISODE_NOTE =
  '---\nAuthor: Lex Fridman Podcast\nRating: 77\nYear: 2026\nGenre:\n  - technology\nListened: 2026-09-21\n---\n[[00. Podcast 2026]]\n\n![[jensen-huang-nvidia-the-4-trillion-company-and-the-ai-revolution.png|240]]\n';

// Notes entered by hand without a cover, as the vault's own are, for finding their covers.
const ANTICS = 'Rating/music/Antics.md';
const ANTICS_NOTE = '---\nArtist: Interpol\nYear:\nlistened: 2026-10-07\ngenre:\nrating: 77\nfavorite tracks:\n---\n[[00. Music 2026 MOC|music 2026]]\n';
const IKIRU = 'Rating/kino/Ikiru.md';
const IKIRU_NOTE = '---\nDirector:\nYear: 1952\nWatched: 2026-10-07\nGenre:\nRating: 90\n---\n[[00. Kino 2026]]\n';

/** Adds an album or a film from the library with "Enter it yourself", watched or listened to on 7 October 2026, and waits for its page. */
async function addByHand(kind: 'album' | 'film', fields: { title: string; maker?: string; year?: string; rating: string }) {
  await $('[data-testid="open-library"]').click();
  await $(`[data-testid="library-add"][data-kind="${kind}"]`).click();
  await $('[data-testid="add-manual"]').click();
  await $('[data-testid="add-form"]').waitForDisplayed();
  await $('[data-testid="add-title"]').setValue(fields.title);
  if (fields.maker) await $('[data-testid="add-maker"]').setValue(fields.maker);
  if (fields.year) await $('[data-testid="add-year"]').setValue(fields.year);
  await $('[data-testid="add-date"]').click();
  await $('[data-testid="add-date"]').setValue('2026-10-07');
  await $('[data-testid="add-rating"]').click();
  await expect($('[data-testid="date-picker"]')).not.toBeExisting();
  await $('[data-testid="add-rating"]').setValue(fields.rating);
  await $('[data-testid="add-save"]').click();
  await $(`[data-testid="media-page"][data-path="Rating/${kind === 'album' ? 'music' : 'kino'}/${fields.title}.md"]`).waitForDisplayed();
}

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
    await expect($('[data-testid="recent-library"]')).toBeDisplayed();
    expect(await $$('[data-testid="recent-library"] [data-testid="media-kind-badge"]').length).toBe(10);
    expect(await $$('[data-testid="recent-library"] [data-testid="cover-card"]').length).toBeLessThanOrEqual(10);
    // Life XP is the demo's 60 days (12,296 XP) plus its quests, less what open quests have lost
    // by today's date, so it moves with the clock; src/lib/home.test.ts and quests.test.ts pin the sums.
    await expect($('[data-testid="hero-title"]')).toHaveText(expect.stringMatching(/^Level \d+$/));
    await expect($('[data-testid="hero-stats"]')).toHaveText(expect.stringContaining('Life XP'));
    await expect($('[data-testid="memento"]')).toHaveText(expect.stringContaining('Add your birth date in Settings'));
    await screenshot('03-home');
    await scrollIntoView('[data-testid="spheres"]');
    await expect($('[data-testid="lead-sphere"]')).toHaveText(expect.stringContaining('Personal Growth'));
    await screenshot('34-home-spheres');
    await scrollIntoView('[data-testid="recent-library"]');
    await screenshot('36-home-shelves');
    await browser.execute(() => document.querySelector('.main')?.scrollTo(0, 0));
  });

  it('opens an album from its cover on the home screen', async () => {
    const cover = $('[data-testid="recent-library"] [data-testid="cover-card"]');
    const name = await cover.$('.cover-title').getText();
    await cover.click();
    await expect(title()).toHaveText(name);
  });

  it('opens quests and statistics with period navigation', async () => {
    await $('[data-testid="open-quests"]').click();
    await expect($('[data-testid="quests-page"]')).toBeDisplayed();
    await $('[aria-label="Previous month"]').click();
    await screenshot('100-quests');
    await $('[data-testid="open-statistics"]').click();
    await expect($('[data-testid="statistics-page"]')).toBeDisplayed();
    await $('[data-testid="activity-detail"]').waitForDisplayed();
    await screenshot('101-statistics');
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

  it('opens the library on All: the latest of every album, film, book and podcast together as covers, narrowed by kind', async () => {
    await $('[data-testid="open-library"]').click();
    const library = $('[data-testid="library"]');
    await library.waitForDisplayed();
    await expect(library).toHaveAttribute('data-tab', 'all');
    await expect(library).toHaveAttribute('data-layout', 'covers');
    await expect($('[data-testid="hero-title"]')).toHaveText('Library');
    // 20 albums, 4 films, 6 books and 4 podcasts; videos are read as pages, not shelved.
    expect(await browser.execute(() => [...document.querySelectorAll('[data-testid="library"] [role="tab"]')].map((tab) => tab.textContent))).toEqual(['All', 'Albums', 'Films', 'Books', 'Podcasts']);
    await expect($('[data-testid="library-total"]')).toHaveText('34');
    // The covers are the latest 15, the latest first; the list has them all.
    expect(await $$('[data-testid="library-card"]').length).toBe(15);
    expect(await $$('[data-testid="library-card-kind"]').length).toBe(15);
    expect(await browser.execute(() => [...document.querySelectorAll('[data-testid="library-card"]')].every((card) => card.querySelector('[data-testid="media-kind-badge"]')?.getAttribute('data-kind') === card.getAttribute('data-kind')))).toBe(true);
    await expect($('[data-testid="library-card"]')).toHaveAttribute('data-path', 'Rating/music/Monastery Wi-Fi.md');
    await expect($('[data-testid="library-count"]')).toHaveText('The latest 15 of 34');
    await expect($('[data-testid="library-see-all"]')).toHaveText('See all 34 in the list');
    // An Add for every kind, on every tab.
    expect(await browser.execute(() => [...document.querySelectorAll('[data-testid="library-add"]')].map((button) => button.getAttribute('data-kind')))).toEqual(['album', 'film', 'book', 'podcast']);
    // Covers load as they come near the screen: the first row's, at least.
    // The driver's action-based scroll can wait indefinitely for an inactive window's frames.
    await browser.execute(() => document.querySelector('[data-testid="library-card"]')?.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await browser.waitUntil(async () => (await $$('.library-cover-image[data-testid="vault-image"]').length) >= 6, { timeoutMsg: 'the covers never loaded' });
    await browser.execute(() => document.querySelector('.main')?.scrollTo(0, 0));
    await screenshot('80-library-all');

    await filterBy('[data-testid="kind-chip"][data-kind="film"]');
    await filterBy('[data-testid="kind-chip"][data-kind="book"]');
    await closeTool('library-filter');
    expect(await $$('[data-testid="library-card"]').length).toBe(10);
    expect(new Set(await browser.execute(() => [...document.querySelectorAll('[data-testid="library-card"]')].map((card) => card.getAttribute('data-kind'))))).toEqual(new Set(['film', 'book']));
    await expect($('[data-testid="library-filters"]')).toHaveText('Films · Books');
    await expect($('[data-testid="library-count"]')).toHaveText('10 results');
    await browser.waitUntil(async () => (await $$('.library-cover-image[data-testid="vault-image"]').length) === 10, { timeoutMsg: 'the film and book covers never loaded' });
    await screenshot('81-library-all-kinds');
    await filterBy('[data-testid="filter-clear"]');
    await closeTool('library-filter');
    expect(await $$('[data-testid="library-card"]').length).toBe(15);
  });

  it('shows the library: a tab per kind with its counts, its covers, its genres and a calendar of covers', async () => {
    const library = $('[data-testid="library"]');
    await showTab('Albums');
    await expect(library).toHaveAttribute('data-tab', 'album');
    expect(await $$('[data-testid="tab"]').length).toBe(5);
    // The latest 15 of the 20.
    expect(await $$('[data-testid="library-card"]').length).toBe(15);
    await expect($('[data-testid="library-total"]')).toHaveText('20');
    await expect($('[data-testid="library-average"]')).toHaveText('77');
    await browser.waitUntil(async () => (await $$('.library-cover-image[data-testid="vault-image"]').length) >= 12, { timeoutMsg: 'the covers never loaded' });
    await screenshot('48-library-albums');

    await filterBy('[data-testid="genre-chip"][data-genre="ambient"]');
    expect(await $$('[data-testid="library-card"]').length).toBe(5);
    await filterBy('[data-testid="genre-chip"][data-genre=""]');
    await closeTool('library-filter');
    expect(await $$('[data-testid="library-card"]').length).toBe(15);
    await expect($('[data-testid="library-card"]')).toHaveAttribute('data-path', 'Rating/music/Monastery Wi-Fi.md');

    // The calendar opens on the latest month with something in it.
    await $('[data-testid="library-calendar-open"]').click();
    await expect($('[data-testid="cover-calendar-month"]')).toHaveText('September 2026');
    expect(await $$('[data-testid="cover-day"] .cover-day-cover').length).toBe(9);
    await screenshot('48-library-calendar');
    await browser.keys(['Escape']);
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

  it("shows the library as a list from Covers or List, after a base's table: sorted, filtered, searched, its columns picked, kept in the settings", async () => {
    const heads = () => browser.execute(() => [...document.querySelectorAll('[data-testid="list-head"]')].map((head) => head.getAttribute('aria-label') ?? head.textContent));
    const kinds = () => browser.execute(() => [...new Set([...document.querySelectorAll('[data-testid="library-row"]')].map((row) => row.getAttribute('data-kind')))]);
    const firstRow = () => $('[data-testid="library-row"]');
    const settings = join(dirname(vaultCopy()), 'config', 'settings.json');
    const kept = (key: string) => (JSON.parse(readFileSync(settings, 'utf8')) as Record<string, unknown>)[key];
    await showTab('All');
    await openTool('library-view-menu');
    await expect($('[data-testid="library-view"][data-view="covers"]')).toHaveAttribute('aria-checked', 'true');
    await screenshot('97-library-view-menu');
    await $('[data-testid="library-view"][data-view="list"]').click();
    await $('[data-testid="library-list"]').waitForDisplayed();
    await expect($('[data-testid="library"]')).toHaveAttribute('data-layout', 'list');
    await expect($('[data-testid="library-view-menu-menu"]')).not.toBeExisting();
    expect(await $$('[data-testid="library-card"]').length).toBe(0);
    expect(await $$('[data-testid="library-row"]').length).toBe(10);
    await expect($('[data-testid="library-count"]')).toHaveText('Showing 10 of 34');
    expect(await heads()).toEqual(['Cover', 'Title', 'By', 'Year', 'Kind', 'Genres', 'Rating', 'Date']);
    // Kept in the app's settings, beside the vault copy, never in the vault.
    await browser.waitUntil(() => kept('libraryLayout') === 'list', { timeout: 5000, timeoutMsg: 'the list was never kept in the settings' });
    // Its covers small, loading as they come near the screen.
    await browser.waitUntil(async () => (await $$('[data-testid="library-row"] [data-testid="vault-image"]').length) >= 8, { timeoutMsg: "the rows' covers never loaded" });
    await expect(firstRow()).toHaveAttribute('data-path', 'Rating/music/Monastery Wi-Fi.md');
    await screenshot('98-library-list');

    // Sort, and the headers with it.
    await openTool('library-sort');
    await $('[data-testid="sort"][data-sort="rating"]').click();
    await closeTool('library-sort');
    await expect($('[data-testid="list-head"][data-column="rating"]')).toHaveAttribute('aria-sort', 'descending');
    await expect(firstRow()).toHaveAttribute('data-path', 'Rating/music/Seven Bells for Nobody.md');
    await $('[data-testid="list-sort"][data-sort="title"]').click();
    await expect($('[data-testid="list-head"][data-column="title"]')).toHaveAttribute('aria-sort', 'ascending');
    await $('[data-testid="list-sort"][data-sort="recent"]').click();
    await expect($('[data-testid="list-head"][data-column="date"]')).toHaveAttribute('aria-sort', 'descending');

    // Filter: the kinds and the genres, as for the covers.
    await filterBy('[data-testid="kind-chip"][data-kind="book"]');
    await closeTool('library-filter');
    expect(await kinds()).toEqual(['book']);
    expect(await $$('[data-testid="library-row"]').length).toBe(6);
    await filterBy('[data-testid="filter-clear"]');
    await closeTool('library-filter');
    expect(await $$('[data-testid="library-row"]').length).toBe(10);

    // Search: titles, makers and genres.
    await $('[data-testid="library-search-open"]').click();
    await $('[data-testid="library-search"]').setValue('tbilisi');
    await browser.waitUntil(async () => (await $$('[data-testid="library-row"]').length) === 2, { timeoutMsg: 'the search never narrowed the list' });
    expect(new Set(await kinds())).toEqual(new Set(['album', 'book']));
    await expect($('[data-testid="library-count"]')).toHaveText('2 results');
    await $('[data-testid="library-search-clear"]').click();
    await browser.waitUntil(async () => (await $$('[data-testid="library-row"]').length) === 10, { timeoutMsg: 'the search was never cleared' });

    // Properties: the columns, kept in the settings.
    await openTool('library-columns');
    await $('[data-testid="column"][data-column="genres"]').click();
    expect(await heads()).toEqual(['Cover', 'Title', 'By', 'Year', 'Kind', 'Rating', 'Date']);
    await browser.waitUntil(() => JSON.stringify(kept('libraryHidden')) === '["genres"]', { timeout: 5000, timeoutMsg: 'the hidden column was never kept in the settings' });
    await $('[data-testid="column"][data-column="genres"]').click();
    expect(await heads()).toEqual(['Cover', 'Title', 'By', 'Year', 'Kind', 'Genres', 'Rating', 'Date']);
    await closeTool('library-columns');

    // A kind's tab names its own columns, and the list stays the list there.
    await showTab('Films');
    expect(await $$('[data-testid="library-row"]').length).toBe(4);
    expect(await heads()).toEqual(['Cover', 'Title', 'Director', 'Year', 'Genres', 'Rating', 'Watched']);
    await browser.waitUntil(async () => (await $$('[data-testid="library-row"] [data-testid="vault-image"]').length) === 4, { timeoutMsg: 'the posters never loaded' });
    await openTool('library-columns');
    await screenshot('99-library-list-films');
    await closeTool('library-columns');

    // A row opens the note's page.
    const film = (await firstRow().getAttribute('data-path')) ?? '';
    await firstRow().$('[data-testid="row-open"]').click();
    await $(`[data-testid="media-page"][data-path="${film}"]`).waitForDisplayed();
    await $('[data-testid="tab-back"]').click();
    await $('[data-testid="library-list"]').waitForDisplayed();
    await expect($('[data-testid="library"]')).toHaveAttribute('data-tab', 'film');

    // Back to the covers, from the same menu.
    await showLibraryAs('covers');
    await $('[data-testid="library-grid"]').waitForDisplayed();
    await browser.waitUntil(() => kept('libraryLayout') === 'covers', { timeout: 5000, timeoutMsg: 'the covers were never kept in the settings' });
    await showTab('Albums');
  });

  it("opens an album as its page, and setting its rating writes that one line", async () => {
    const path = 'Rating/music/Glasshouse Weather.md';
    // Older than the latest 15 the covers show: it is in the list.
    await expect($(`[data-testid="library-card"][data-path="${path}"]`)).not.toBeExisting();
    await showLibraryAs('list');
    while (!(await $(`[data-testid="library-row"][data-path="${path}"]`).isExisting()) && await $('[data-testid="library-show-more"]').isExisting()) await $('[data-testid="library-show-more"]').click();
    await $(`[data-testid="library-row"][data-path="${path}"]`).click();
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

  it('writes what was thought of the album right on its page, under its link and cover', async () => {
    const path = 'Rating/music/Glasshouse Weather.md';
    const file = join(vaultCopy(), path);
    const before = readFileSync(file, 'utf8');
    // The text starts after the cover's paragraph; the lines above it stay as they are.
    const head = before.slice(0, before.indexOf('\n\n', before.indexOf('![[')) + 2);
    const typed = 'Better on headphones. The second side is the one, see [[Quiet Machinery]].';
    await $('[data-testid="thoughts-write"]').click();
    await $('[data-testid="media-text"] [data-testid="editor"] .cm-content').waitForDisplayed();
    await browser.execute((value) => {
      document.querySelector<HTMLElement>('[data-testid="media-text"] .cm-content')?.focus();
      document.execCommand('selectAll');
      document.execCommand('insertText', false, value);
    }, typed);
    await browser.waitUntil(() => readFileSync(file, 'utf8') === head + typed, { timeout: 5000, timeoutMsg: 'what was written never reached the note' });
    await expect($('[data-testid="thoughts-state"]')).toHaveText('Saved');
    await screenshot('95-media-thoughts-writing');
    await $('[data-testid="thoughts-done"]').click();
    await expect($('[data-testid="thoughts-text"]')).toHaveText(expect.stringContaining('Better on headphones.'));
    await expect($('[data-testid="media-text"] [data-testid="editor"]')).not.toBeExisting();
    await screenshot('96-media-thoughts');
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
    await $('[data-testid="add-genre"]').setValue('ambie');
    const suggestedAmbient = $('[aria-label="Suggested genres"]').$('button=ambient');
    await suggestedAmbient.waitForDisplayed();
    await suggestedAmbient.click();
    await $('[title="Remove ambient"]').click();
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
    await $('[aria-label="Edit genres"]').click();
    await $('input[placeholder="Type a value and press Enter"]').setValue('ambie');
    await $('[aria-label="Suggested genres"]').$('button=ambient').waitForDisplayed();
    await $('[aria-label="Suggested genres"]').$('button=ambient').click();
    await $('[aria-label="Remove ambient"]').waitForDisplayed();
    await $('button=Cancel').click();
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
    // The calendar is removed and recreated after each pick; don't retain its old WebDriver element.
    const picker = () => $('[data-testid="date-picker"]');
    await $('[data-testid="add-date"]').click();
    await picker().waitForDisplayed();
    await $('[data-testid="add-date"]').setValue('2026-10-07');
    await expect($('[data-testid="date-picker-month"]')).toHaveText('October 2026');
    await expect($('[data-testid="date-picker-day"][data-date="2026-10-07"]')).toHaveAttribute('aria-pressed', 'true');
    await $('[data-testid="date-picker-prev"]').click();
    await expect($('[data-testid="date-picker-month"]')).toHaveText('September 2026');
    await screenshot('83-date-picker');
    await $('[data-testid="date-picker-day"][data-date="2026-09-20"]').click();
    await expect(picker()).not.toBeExisting();
    await expect($('[data-testid="add-date"]')).toHaveValue('2026-09-20');
    await $('[data-testid="add-date"]').click();
    await picker().waitForDisplayed();
    await browser.keys(['ArrowDown']);
    await browser.waitUntil(async () => (await browser.execute(() => document.activeElement?.getAttribute('data-date'))) === '2026-09-20', { timeoutMsg: 'the keys never reached the calendar' });
    await browser.keys(['ArrowRight']);
    await browser.waitUntil(async () => (await browser.execute(() => document.activeElement?.getAttribute('data-date'))) === '2026-09-21', { timeoutMsg: 'the focus never moved to the next day' });
    await browser.keys(['Enter']);
    await expect(picker()).not.toBeExisting();
    await expect($('[data-testid="add-date"]')).toHaveValue('2026-09-21');
    // Escape closes an open calendar, and only it: the form stays.
    await $('[data-testid="add-date"]').click();
    await picker().waitForDisplayed();
    await browser.keys(['Escape']);
    await expect(picker()).not.toBeExisting();
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
    await picker().waitForDisplayed();
    await expect($('[data-testid="date-picker-month"]')).toHaveText('September 2026');
    await screenshot('84-podcast-episode');
    await $('[data-testid="date-picker-day"][data-date="2026-09-22"]').click();
    const moved = EPISODE_NOTE.replace('Listened: 2026-09-21', 'Listened: 2026-09-22');
    await browser.waitUntil(() => readFileSync(file, 'utf8') === moved, { timeout: 5000, timeoutMsg: 'the picked day never reached the note' });
    await expect($('[data-testid="media-date"]')).toHaveValue('2026-09-22');
    await $('[data-testid="media-date"]').click();
    await picker().waitForDisplayed();
    await $('[data-testid="date-picker-day"][data-date="2026-09-21"]').click();
    await browser.waitUntil(() => readFileSync(file, 'utf8') === EPISODE_NOTE, { timeout: 5000, timeoutMsg: 'the day picked back never reached the note' });
  });

  it('adds a film found on Wikipedia: its director, year and genre from Wikidata, its poster as the cover', async () => {
    // The e2e build answers Wikipedia and Wikidata from test/fixtures/lookup/ too.
    await $('[data-testid="open-library"]').click();
    await expect($('[data-testid="library"]')).toHaveAttribute('data-tab', 'all');
    await $('[data-testid="library-add"][data-kind="film"]').click();
    await $('[data-testid="add-search"]').setValue('american fiction');
    // Wikipedia's answer also has a genre, a soundtrack, a list and a disambiguation page: only the films show.
    await browser.waitUntil(async () => (await $$('[data-testid="add-result"]').length) === 3, { timeoutMsg: 'no films came' });
    await browser.waitUntil(async () => (await $$('[data-testid="lookup-cover"]').length) === 3, { timeoutMsg: 'the posters never loaded' });
    await expect($('[data-testid="add-result"]')).toHaveText(expect.stringContaining('2023 film by Cord Jefferson'));
    await expect($('[data-testid="add-hint"]')).toHaveText('3 found on Wikipedia.');
    await screenshot('86-film-search');

    await $('[data-testid="add-result"][data-id="wikipedia:72713326"]').click();
    await $('[data-testid="add-form"]').waitForDisplayed();
    await expect($('[data-testid="add-title"]')).toHaveValue('American Fiction');
    await expect($('[data-testid="add-maker"]')).toHaveValue('Cord Jefferson');
    await expect($('[data-testid="add-year"]')).toHaveValue('2023');
    await expect($('[data-testid="add-form"]')).toHaveText(expect.stringContaining('drama'));
    await $('[data-testid="add-date"]').click();
    await $('[data-testid="add-date"]').setValue('2026-10-07');
    await $('[data-testid="add-rating"]').click();
    await expect($('[data-testid="date-picker"]')).not.toBeExisting();
    await $('[data-testid="add-rating"]').setValue('80');
    await $('[data-testid="add-form"] [data-testid="lookup-cover"]').waitForDisplayed();
    await screenshot('87-film-form');
    await $('[data-testid="add-save"]').click();

    const path = 'Rating/kino/American Fiction.md';
    await $(`[data-testid="media-page"][data-path="${path}"]`).waitForDisplayed();
    expect(readFileSync(join(vaultCopy(), path), 'utf8')).toBe(
      '---\nDirector: Cord Jefferson\nYear: 2023\nWatched: 2026-10-07\nGenre:\n  - drama\nRating: 80\n---\n[[00. Kino 2026]]\n\n![[american-fiction.png|200]]\n',
    );
    const saved = readFileSync(join(vaultCopy(), 'Rating/kino/_attachments/american-fiction.png'));
    expect(['cover-1.png', 'cover-2.png', 'cover-3.png'].some((name) => readFileSync(join(FIXTURES, name)).equals(saved))).toBe(true);
  });

  it('finds a book on Wikipedia and Open Library together, each card saying where it is from, a book both have once', async () => {
    await $('[data-testid="open-library"]').click();
    await $('[data-testid="library-add"][data-kind="book"]').click();
    await $('[data-testid="add-search"]').setValue('life 3.0');
    await browser.waitUntil(async () => (await $$('[data-testid="add-result"]').length) === 5, { timeoutMsg: 'the books never came' });
    expect(await browser.execute(() => [...document.querySelectorAll('[data-testid="add-result-from"]')].map((tag) => tag.textContent))).toEqual([
      'Wikipedia',
      'Open Library',
      'Open Library',
      'Open Library',
      'Open Library',
    ]);
    await expect($('[data-testid="add-result"]')).toHaveText(expect.stringContaining('2017 book by Max Tegmark on artificial intelligence'));
    await expect($('[data-testid="add-hint"]')).toHaveText('5 found on Wikipedia and Open Library.');
    await $('[data-testid="add-result"] [data-testid="lookup-cover"]').waitForDisplayed();
    await screenshot('88-book-search');
    await browser.keys(['Escape']);
    await expect($('[data-testid="media-add"]')).not.toBeExisting();
  });

  it("shows everything listened to, watched and finished in All's calendar, several covers on a day, narrowed by kind", async () => {
    await $('[data-testid="open-library"]').click();
    await expect($('[data-testid="library"]')).toHaveAttribute('data-tab', 'all');
    // The calendar is under the covers; the album was opened from the list.
    await showLibraryAs('covers');
    await $('[data-testid="library-calendar-open"]').click();
    // September, from the year's strip: the 21st has an album, the new episode and a film.
    await $$('[data-testid="year-month"]')[8]?.click();
    await expect($('[data-testid="cover-calendar-month"]')).toHaveText('September 2026');
    const day21 = $('[data-testid="cover-day"][data-day="21"]');
    await expect(day21).toHaveAttribute('data-count', '3');
    expect(await day21.$$('[data-testid="cover-day-cover"]').length).toBe(3);
    await expect($('[data-testid="cover-day"][data-day="3"]')).toHaveAttribute('data-count', '2');
    await browser.waitUntil(async () => (await $$('.cover-day-image[data-testid="vault-image"]').length) >= 17, { timeoutMsg: 'the calendar covers never loaded' });
    await screenshot('85-library-all-calendar');
    await browser.keys(['Escape']);

    await filterBy('[data-testid="kind-chip"][data-kind="podcast"]');
    await closeTool('library-filter');
    await $('[data-testid="library-calendar-open"]').click();
    await expect(day21).toHaveAttribute('data-count', '1');
    expect(await $$('[data-testid="cover-day"][data-count]').length).toBe(3);
    await browser.keys(['Escape']);
    await filterBy('[data-testid="kind-chip"][data-kind="podcast"]');
    await closeTool('library-filter');
    await browser.execute(() => document.querySelector('.main')?.scrollTo(0, 0));
  });

  it('finds covers for the notes without one, from the library: the sure ones ticked, each saved with what its note leaves empty', async () => {
    // Two notes as the vault's own are, without a cover: an album and a film, entered by hand.
    await addByHand('album', { title: 'Antics', maker: 'Interpol', rating: '77' });
    expect(readFileSync(join(vaultCopy(), ANTICS), 'utf8')).toBe(ANTICS_NOTE);
    await expect($('[data-testid="find-cover-open"]')).toHaveText('Find cover');
    await addByHand('film', { title: 'Ikiru', year: '1952', rating: '90' });
    expect(readFileSync(join(vaultCopy(), IKIRU), 'utf8')).toBe(IKIRU_NOTE);

    await $('[data-testid="open-library"]').click();
    await expect($('[data-testid="library"]')).toHaveAttribute('data-tab', 'all');
    await expect($('[data-testid="library-missing"]')).toHaveText('2 without a cover · Find covers');
    await $('[data-testid="find-covers-open"]').click();
    await $('[data-testid="find-covers"]').waitForDisplayed();
    // The e2e build answers from test/fixtures/covers/: Wikipedia for the album, Wikipedia and Wikidata for the film.
    await browser.waitUntil(async () => (await $$('[data-testid="covers-row"][data-status="found"]').length) === 2, { timeoutMsg: 'the covers were never found' });
    await browser.waitUntil(async () => (await $$('[data-testid="covers-row"] [data-testid="lookup-cover"]').length) === 2, { timeoutMsg: 'the found covers never loaded' });
    const rows = () =>
      browser.execute(
        (): Record<string, (string | null | undefined)[]> =>
          Object.fromEntries(
            [...document.querySelectorAll('[data-testid="covers-row"]')].map((row) => [
              row.getAttribute('data-path') ?? '',
              [row.getAttribute('data-ticked'), row.querySelector('[data-testid="covers-found"]')?.textContent, row.querySelector('.covers-why')?.textContent],
            ]),
          ),
      );
    expect(await rows()).toEqual({
      [ANTICS]: ['true', 'Antics · Interpol · 2004', 'Sure · Wikipedia · fills Year'],
      [IKIRU]: ['true', 'Ikiru · Akira Kurosawa · 1952', 'Sure · fills Director, Genre'],
    });
    await expect($('[data-testid="covers-hint"]')).toHaveText('Searched all 2 · 2 found, 2 sure. Review the ticked covers before saving.');
    await screenshot('89-find-covers');

    // The film's is left for its page: unticked, it isn't saved.
    await $(`[data-testid="covers-row"][data-path="${IKIRU}"] [data-testid="covers-tick"]`).click();
    await expect($('[data-testid="covers-save"]')).toHaveText('Save 1 cover');
    await $('[data-testid="covers-save"]').click();
    await expect($('[data-testid="covers-hint"]')).toHaveText('Saved 1 cover.');
    await expect($(`[data-testid="covers-row"][data-path="${ANTICS}"]`)).toHaveAttribute('data-status', 'saved');
    await screenshot('90-find-covers-saved');
    expect(readFileSync(join(vaultCopy(), ANTICS), 'utf8')).toBe(
      '---\nArtist: Interpol\nYear: 2004\nlistened: 2026-10-07\ngenre:\nrating: 77\nfavorite tracks:\n---\n[[00. Music 2026 MOC|music 2026]]\n\n![[antics.png|240]]\n',
    );
    const saved = readFileSync(join(vaultCopy(), 'Rating/music/_attachments/antics.png'));
    expect(['cover-1.png', 'cover-2.png', 'cover-3.png'].some((name) => readFileSync(join(FIXTURES, name)).equals(saved))).toBe(true);
    expect(readFileSync(join(vaultCopy(), IKIRU), 'utf8')).toBe(IKIRU_NOTE);
    await $('[data-testid="covers-done"]').click();
    await expect($('[data-testid="find-covers"]')).not.toBeExisting();
    await expect($('[data-testid="library-missing"]')).toHaveText('1 without a cover · Find covers');
  });

  it('finds a cover for one note on its page, then changes it: a new image beside the old one, the embed pointed at it', async () => {
    await $(`[data-testid="library-card"][data-path="${IKIRU}"]`).click();
    await $(`[data-testid="media-page"][data-path="${IKIRU}"]`).waitForDisplayed();
    await $('[data-testid="find-cover-open"]').click();
    await $('[data-testid="find-cover"]').waitForDisplayed();
    await browser.waitUntil(async () => (await $$('[data-testid="cover-choice"] [data-testid="lookup-cover"]').length) === 1, { timeoutMsg: 'no cover was offered' });
    await expect($('[data-testid="cover-choice"]')).toHaveAttribute('aria-pressed', 'true');
    await expect($('[data-testid="cover-choice"]')).toHaveText(expect.stringContaining('Best match'));
    await expect($('[data-testid="cover-where"]')).toHaveText('Saves the cover in Rating/kino/_attachments and fills Director, Genre.');
    await screenshot('91-find-cover');
    await $('[data-testid="cover-save"]').click();
    await expect($('[data-testid="find-cover"]')).not.toBeExisting();
    const file = join(vaultCopy(), IKIRU);
    const found = IKIRU_NOTE.replace('Director:\n', 'Director: Akira Kurosawa\n').replace('Genre:\n', 'Genre:\n  - drama\n').replace(/\n$/, '\n\n![[ikiru.png|200]]\n');
    await browser.waitUntil(() => readFileSync(file, 'utf8') === found, { timeout: 5000, timeoutMsg: 'the cover never reached the note' });
    const cover = $('[data-testid="media-page"] [data-testid="vault-image"]');
    await browser.waitUntil(async () => Number(await cover.getProperty('naturalWidth')) > 0, { timeoutMsg: 'the cover never showed' });
    await screenshot('92-media-page-found-cover');

    // "Change cover" shows over a cover when it is pointed at.
    await $('.media-cover-slot').moveTo();
    await expect($('[data-testid="find-cover-open"]')).toHaveText('Change cover');
    await $('[data-testid="find-cover-open"]').click();
    await expect($('[role="dialog"][aria-label="Change the cover"]')).toBeDisplayed();
    await browser.waitUntil(async () => (await $$('[data-testid="cover-choice"] [data-testid="lookup-cover"]').length) === 1, { timeoutMsg: 'no cover was offered' });
    await screenshot('93-change-cover');
    await $('[data-testid="cover-save"]').click();
    await expect($('[data-testid="find-cover"]')).not.toBeExisting();
    await browser.waitUntil(() => readFileSync(file, 'utf8') === found.replace('![[ikiru.png|200]]', '![[ikiru-2.png|200]]'), { timeout: 5000, timeoutMsg: 'the change never reached the note' });
    // The old image stays.
    expect(readFileSync(join(vaultCopy(), 'Rating/kino/_attachments/ikiru.png')).length).toBeGreaterThan(0);
  });

  it('creates the missing day before with built-in text', async () => {
    await openNote(`${DAYS}/01.08.2026.md`);
    await $('[data-testid="nav-prev"]').click();
    await expect(title()).toHaveText('31.07.2026');
    expect(readFileSync(join(vaultCopy(), `${DAYS}/31.07.2026.md`), 'utf8')).toContain('### Tasks');
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
    // Highlights appear as soon as their closing markup is typed.
    const highlights = '==A quiet thought== and <mark style="background: #FFF3A3A6;">a warm highlight</mark> and <font color="#00b050">green words</font>\n\n';
    await typeInEditor(highlights + 'Hello from Epizen, see [[Someday maybe]] and [[Glass');
    const preview = $('[data-testid="preview"]');
    await expect(preview.$$('mark')[0]).toHaveText('A quiet thought');
    await expect(preview.$$('mark')[1]).toHaveText('a warm highlight');
    await expect(preview.$('.note-colored-text')).toHaveText('green words');
    await screenshot('13a-live-highlights');
    const suggestion = $('.cm-tooltip-autocomplete li');
    await suggestion.waitForDisplayed();
    await expect(suggestion).toHaveText(expect.stringContaining('Glasshouse Weather'));
    await screenshot('13-link-autocomplete');
    // CodeMirror picks a suggestion on mousedown, which this driver's click doesn't send.
    await browser.execute(() => {
      document.querySelector('.cm-tooltip-autocomplete li')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    const typed = highlights + 'Hello from Epizen, see [[Someday maybe]] and [[Glasshouse Weather]]';
    const saved = () => readFileSync(join(vaultCopy(), 'Inbox idea.md'), 'utf8');
    await browser.waitUntil(() => saved() === typed, { timeout: 5000, timeoutMsg: 'the link was never completed and saved' });
    await expect($('[data-testid="save-state"]')).toHaveText('Saved');
    await expect($('[data-testid="preview"]')).toHaveText(expect.stringContaining('Hello from Epizen'));
    await expect($('[data-testid="tree-note"][data-path="Inbox idea.md"]')).toBeDisplayed();
    await $('[data-testid="edit-done"]').click();
    await expect($('[data-testid="note"] .note-body mark')).toHaveText('A quiet thought');
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
    await showMonth('September 2026');
    // Library styles must not push the sidebar's month controls outside its hit area.
    const controlsVisible = await browser.execute(() => {
      const calendar = document.querySelector('[data-testid="calendar"]');
      if (!calendar) return false;
      const bounds = calendar.getBoundingClientRect();
      return [...calendar.querySelectorAll('.calendar-head .icon-button')].every((button) => {
        const box = button.getBoundingClientRect();
        return box.left >= bounds.left && box.right <= bounds.right &&
          document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.closest('button') === button;
      });
    });
    expect(controlsVisible).toBe(true);
    await $('[data-testid="calendar-next"]').click();
    await expect($('[data-testid="calendar-month"]')).toHaveText('October 2026');
    await $('[data-testid="calendar-prev"]').click();
    await expect($('[data-testid="calendar-month"]')).toHaveText('September 2026');
    await screenshot('14-calendar-month-controls');
    await showMonth('August 2026');
    await $('[data-testid="calendar-day"][data-date="2026-08-14"]').click();
    await expect(title()).toHaveText('14.08.2026');
    await screenshot('14-calendar');
    await $('[data-testid="calendar-week"][data-week="33"]').click();
    await expect(title()).toHaveText('2026-W33 - 10.08.26');
    await $('[data-testid="calendar-month"]').click();
    await expect(title()).toHaveText('08.26 RPG');
  });

  it('creates a missing day with built-in text, in its folder', async () => {
    const before = snapshotVault(vaultCopy());
    await showMonth('July 2026');
    await $('[data-testid="calendar-day"][data-date="2026-07-30"]').click();
    await expect(title()).toHaveText('30.07.2026');
    const text = readFileSync(join(vaultCopy(), `${DAYS}/30.07.2026.md`), 'utf8');
    expect(text).toMatch(/^---\ndate: 2026-07-30\n/);
    expect(text).toContain('### Tasks');
    expect(diffSnapshots(before, snapshotVault(vaultCopy()))).toEqual([`added: ${DAYS}/30.07.2026.md`]);
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
    expect(await $$('[data-testid="composer-category"][aria-checked="true"]').length).toBe(1);
    await clickInPage('[data-testid="composer-category"][data-category="sport"]');
    await expect($('[data-testid="composer-category"][data-category="sport"]')).toHaveAttribute('aria-checked', 'true');
    await expect($('[data-testid="composer-text"]')).toBeFocused();
    await screenshot('25-day-task-composer');
    await browser.keys('evening run');
    await clickInPage('[data-testid="composer-add"]');
    await expect($('[data-testid="composer-text"]')).toBeFocused();
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
    await scrollIntoView('[data-testid="reflections"]');
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
    await scrollIntoView('button[aria-label="Details of Read 100 pages"]');
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
    await clickInPage('[data-testid="block-popover"] [data-testid="pick-category"][data-category="sport"]');
    await expect($('[data-testid="block-popover"] [data-testid="pick-new"]')).toBeFocused();
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

  it('keeps optional periodic features in settings without changing notes', async () => {
    const before = snapshotVault(vaultCopy());
    const habits = () => $('[data-testid="settings-feature-habits"]');
    const records = () => $('[data-testid="settings-feature-thoughtRecords"]');
    await habits().click();
    await records().click();
    await $('[data-testid="settings-save"]').click();
    await $('[data-testid="settings"] .save-state').waitForDisplayed();
    await openNote(DAY);
    await showTab('Overview');
    await expect($('[data-testid="hero-record"]')).not.toBeExisting();
    await expect($('[data-testid="tile-habits"]')).not.toBeExisting();
    await $('[data-testid="open-settings"]').click();
    expect(await habits().isSelected()).toBe(false);
    expect(await records().isSelected()).toBe(false);
    await habits().click();
    await records().click();
    await $('[data-testid="settings-save"]').click();
    await $('[data-testid="settings"] .save-state').waitForDisplayed();
    expect(diffSnapshots(before, snapshotVault(vaultCopy()))).toEqual([]);
  });

  it('keeps the podcast artwork preference in app settings without changing existing notes', async () => {
    const before = snapshotVault(vaultCopy());
    const settings = join(dirname(vaultCopy()), 'config', 'settings.json');
    const kept = () => (JSON.parse(readFileSync(settings, 'utf8')) as { podcasts?: { artwork?: string } }).podcasts?.artwork;
    const artwork = () => $('[data-testid="settings-podcast-artwork"]');
    // The WebDriver's native option click does nothing in a non-focused macOS window.
    // Dispatch the select's normal events; the assertions below still verify the UI and persisted setting.
    const selectArtwork = async (value: 'show' | 'episode') => {
      await browser.execute((next) => {
        const select = document.querySelector<HTMLSelectElement>('[data-testid="settings-podcast-artwork"]');
        if (!select) throw new Error('The podcast artwork control is missing');
        select.value = next;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }, value);
      await expect(artwork()).toHaveValue(value);
    };
    await scrollIntoView('[data-testid="settings-podcasts"]');
    await expect(artwork()).toHaveValue('show');
    await selectArtwork('episode');
    await $('[data-testid="settings-save"]').click();
    await browser.waitUntil(() => kept() === 'episode', { timeoutMsg: 'the podcast preference was not saved' });
    await $('[data-testid="sidebar-vault"]').click();
    await $('[data-testid="open-settings"]').click();
    await expect(artwork()).toHaveValue('episode');
    await selectArtwork('show');
    await $('[data-testid="settings-save"]').click();
    await browser.waitUntil(() => kept() === 'show', { timeoutMsg: 'show thumbnails were not saved as the preference' });
    await scrollIntoView('[data-testid="settings-podcasts"]');
    await screenshot('85-settings-podcasts');
    expect(diffSnapshots(before, snapshotVault(vaultCopy()))).toEqual([]);
  });

  it('counts the weeks till 30 on the home screen from the birth date in Settings', async () => {
    // Settings live next to the vault copy, never in it: this changes no note.
    await $('[data-testid="settings-birth-date"]').setValue('1998-03-21');
    await $('[data-testid="settings-save"]').click();
    await $('[data-testid="settings"] .save-state').waitForDisplayed();
    await scrollIntoView('[data-testid="settings-home"]');
    await screenshot('37-settings-birth-date');
    await $('[data-testid="sidebar-vault"]').click();
    await expect($('[data-testid="memento"]')).toHaveText(expect.stringContaining('Till 30'));
    await $('[data-testid="weeks-toggle"]').click();
    const grid = $('[data-testid="weeks-grid"]');
    await grid.waitForDisplayed();
    expect(await browser.execute(() => document.querySelectorAll('[data-testid="weeks-grid"] rect').length)).toBe(1560);
    await scrollIntoView('[data-testid="weeks-grid"]');
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

  it('library controls: edits tags and Wikipedia favorites, opens new tabs and deletes the Markdown file', async () => {
    const before = snapshotVault(vaultCopy());
    const path = 'Rating/music/Library controls test.md';
    await addByHand('album', { title: 'Library controls test', maker: 'Suede', rating: '80' });
    await $('[aria-label="Edit genres"]').click();
    await $('.library-dialog input').setValue('art rock');
    await $('.library-dialog .primary-button').click();
    await browser.waitUntil(() => readFileSync(join(vaultCopy(), path), 'utf8').includes('art rock'));
    await $('[aria-label="Edit tags"]').click();
    await $('.library-dialog input').setValue('relisten');
    await $('.library-dialog .primary-button').click();
    await browser.waitUntil(() => readFileSync(join(vaultCopy(), path), 'utf8').includes('relisten'));
    await $('[data-testid="find-tracks"]').click();
    await $('.track-search button').click();
    await $('.track-picker .add-result').waitForDisplayed();
    await $('.track-picker .add-result').click();
    await $('.track-picker [aria-label="Favorite We Are the Pigs"]').click();
    await screenshot('110-library-track-picker');
    await $('.track-picker .primary-button').click();
    await browser.waitUntil(() => readFileSync(join(vaultCopy(), path), 'utf8').includes('favorite tracks: ["We Are the Pigs"]'));
    await expect($('[data-testid="media-tracks"] [aria-label="Favorite We Are the Pigs"]')).toHaveAttribute('aria-pressed', 'true');
    await screenshot('111-library-properties');
    await $('[data-testid="media-library"]').click();
    await showLibraryAs('covers');
    const tabs = await workspaceTabs().length;
    await clickAs(`[data-testid="library-card"][data-path="${path}"]`, 'meta');
    await waitForNote(path);
    expect(await workspaceTabs().length).toBe(tabs + 1);
    await $('[data-testid="media-library"]').click();
    await clickAs(`[data-testid="library-card"][data-path="${path}"]`, 'right');
    await screenshot('112-library-context');
    await $('[data-testid="library-delete"]').click();
    await $('[data-testid="library-delete-confirm"]').click();
    await browser.waitUntil(() => !existsSync(join(vaultCopy(), path)), { timeoutMsg: 'the Markdown file was not removed' });
    await expect($(`[data-testid="library-card"][data-path="${path}"]`)).not.toBeExisting();
    const after = snapshotVault(vaultCopy());
    const added = [...after.keys()].filter((key) => !before.has(key));
    expect(added).toHaveLength(1);
    deletedLibraryNote = added[0];
    expect(deletedLibraryNote).toMatch(/^\.trash\/epizen-[^/]+\/Library controls test\.md$/);
    expect(readFileSync(join(vaultCopy(), deletedLibraryNote!), 'utf8')).toContain('favorite tracks: ["We Are the Pigs"]');
    after.delete(deletedLibraryNote!);
    expect(diffSnapshots(before, after)).toEqual([]);
  });

  it('library controls: pages the list, reverses dates, filters by listened year and opens a calendar overlay', async () => {
    await $('[data-testid="sidebar-vault"]').click();
    await $('[data-testid="open-library"]').click();
    await showTab('Albums');
    await showLibraryAs('list');
    expect(await $$('[data-testid="library-row"]').length).toBe(10);
    await $('[data-testid="library-show-more"]').click();
    expect(await $$('[data-testid="library-row"]').length).toBe(20);
    await $('[data-testid="list-sort"][data-sort="recent"]').click();
    await expect($('[data-testid="list-head"][data-column="date"]')).toHaveAttribute('aria-sort', 'ascending');
    await filterBy('[data-testid="year-filter"][data-year="2026"]');
    await closeTool('library-filter');
    expect(await browser.execute(() => [...document.querySelectorAll('[data-testid="row-date"]')].every((cell) => cell.textContent?.includes('2026')))).toBe(true);
    await openTool('library-sort');
    await screenshot('113-library-sort');
    await closeTool('library-sort');
    await $('[data-testid="library-calendar-open"]').click();
    await expect($('[role="dialog"][aria-label="Library calendar"]')).toBeDisplayed();
    await screenshot('114-library-calendar-overlay');
    await browser.keys(['Escape']);
    await expect($('[role="dialog"][aria-label="Library calendar"]')).not.toBeExisting();
  });

  it('library controls: retains the sidebar arrows and immediate task typing from PR 31', async () => {
    await showMonth('September 2026');
    const visible = await browser.execute(() => {
      const calendar = document.querySelector('[data-testid="calendar"]');
      if (!calendar) return false;
      const bounds = calendar.getBoundingClientRect();
      return [...calendar.querySelectorAll('.calendar-head .icon-button')].every((button) => {
        const box = button.getBoundingClientRect();
        return box.left >= bounds.left && box.right <= bounds.right && document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.closest('button') === button;
      });
    });
    expect(visible).toBe(true);
    await $('[data-testid="calendar-next"]').click();
    await expect($('[data-testid="calendar-month"]')).toHaveText('October 2026');
    await showMonth('August 2026');
    await $('[data-testid="calendar-day"][data-date="2026-08-14"]').click();
    await showTab('Tasks');
    await clickInPage('[data-testid="composer-category"][data-category="sport"]');
    await expect($('[data-testid="composer-text"]')).toBeFocused();
    await browser.keys('combined install check');
    await clickInPage('[data-testid="composer-add"]');
    await expect($('[data-testid="composer-text"]')).toBeFocused();
    await expect($('[data-testid="composer-text"]')).toHaveValue('');
    await browser.waitUntil(() => readFileSync(join(vaultCopy(), DAY), 'utf8').includes('- [ ] #daily/sport — combined install check'));
    await screenshot('115-combined-task-entry');
  });

  it('renames a linked note and updates backlinks while another note is being edited', async () => {
    const before = snapshotVault(vaultCopy());
    const index = 'Rating/music/00. Music 2026 MOC.md';
    const references = [index, `${DAYS}/10.08.2026.md`, 'Calendar/2026/months 2026/08.26 RPG.md'];
    const originals = references.map((path) => readFileSync(join(vaultCopy(), path), 'utf8'));
    await openFolders(...foldersOf(index));
    await openNote(index);
    await $('[data-testid="edit-note"]').click();
    await $('[data-testid="editor"] .cm-content').waitForDisplayed();
    await browser.execute((path) => {
      const row = [...document.querySelectorAll<HTMLElement>('[data-testid="tree-note"]')].find((item) => item.dataset.path === path);
      row?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 300 }));
    }, ALBUM);
    await $('[role="menuitem"]=Rename…').click();
    await $('[data-testid="note-action-name"]').setValue('Backlink rename check');
    await $('[data-testid="note-action-confirm"]').click();
    // CodeMirror renders only visible lines. The live preview reflects the editor's full draft.
    await $('[data-testid="preview"] [data-wikilink="Backlink rename check"]').waitForExist();
    await expect($('[data-testid="preview"] [data-wikilink="Backlink rename check"]')).not.toHaveElementClass('is-missing');
    for (const [i, path] of references.entries()) {
      expect(readFileSync(join(vaultCopy(), path), 'utf8')).toBe(originals[i]!.replaceAll('[[Glasshouse Weather', '[[Backlink rename check'));
    }
    await $('[data-testid="edit-done"]').click();
    await expect($('[data-testid="note"] [data-wikilink="Backlink rename check"]')).not.toHaveElementClass('is-missing');
    // The background macOS window can suspend WebDriver's animated-scroll wait.
    await browser.execute(() => document.querySelector('[data-testid="note"] [data-wikilink="Backlink rename check"]')?.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await screenshot('117-backlinks-renamed');
    await clickInPage('[data-testid="note"] [data-wikilink="Backlink rename check"]');
    await waitForNote('Rating/music/Backlink rename check.md');
    await $('[aria-label="Rename Backlink rename check"]').click();
    await $('[data-testid="note-action-name"]').setValue('Glasshouse Weather');
    await $('[data-testid="note-action-confirm"]').click();
    await waitForNote(ALBUM);
    expect(diffSnapshots(before, snapshotVault(vaultCopy()))).toEqual([]);
  });

  it('duplicates, renames and trashes a note safely from filename actions', async () => {
    await openFolders(...foldersOf(ALBUM));
    await openNote(ALBUM);
    const before = snapshotVault(vaultCopy());
    const original = readFileSync(join(vaultCopy(), ALBUM), 'utf8');
    const context = async (path: string) => {
      await browser.execute((notePath) => {
        const row = [...document.querySelectorAll<HTMLElement>('[data-testid="tree-note"]')].find((item) => item.dataset.path === notePath);
        if (!row) throw new Error('Missing note row');
        row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 300 }));
      }, path);
      await $('[data-testid="note-menu"]').waitForDisplayed();
    };
    await context(ALBUM);
    await screenshot('116-file-actions');
    await $('[role="menuitem"]=Duplicate').click();
    await $('[data-testid="note-action-name"]').setValue('Filename action copy');
    await $('[data-testid="note-action-confirm"]').click();
    const duplicate = 'Rating/music/Filename action copy.md';
    await waitForNote(duplicate);
    expect(readFileSync(join(vaultCopy(), duplicate), 'utf8')).toBe(original);
    await $('[data-testid="edit-note"]').click();
    await $('[data-testid="editor"] .cm-content').waitForDisplayed();
    const edited = original + '\nFilename action draft survives rename.\n';
    await browser.execute((text) => {
      document.querySelector<HTMLElement>('[data-testid="editor"] .cm-content')?.focus();
      document.execCommand('selectAll');
      document.execCommand('insertText', false, text);
    }, edited);
    await $('[aria-label="Rename Filename action copy"]').click();
    await $('[data-testid="note-action-name"]').setValue('Glasshouse Weather');
    await $('[data-testid="note-action-confirm"]').click();
    await expect($('[role="dialog"] [role="alert"]')).toHaveText(expect.stringContaining('already exists'));
    expect(readFileSync(join(vaultCopy(), ALBUM), 'utf8')).toBe(original);
    await $('[data-testid="note-action-name"]').setValue('Filename action renamed');
    await $('[data-testid="note-action-confirm"]').click();
    const renamed = 'Rating/music/Filename action renamed.md';
    await $('[data-testid="note-editor"][data-path="Rating/music/Filename action renamed.md"]').waitForDisplayed();
    expect(existsSync(join(vaultCopy(), duplicate))).toBe(false);
    expect(readFileSync(join(vaultCopy(), renamed), 'utf8')).toBe(edited);
    await expect(frontTab()).toHaveText(expect.stringContaining('Filename action renamed'));
    await context(renamed);
    await $('[role="menuitem"]=Delete…').click();
    await $('[data-testid="note-action-confirm"]').click();
    await browser.waitUntil(() => !existsSync(join(vaultCopy(), renamed)));
    const after = snapshotVault(vaultCopy());
    const added = [...after.keys()].filter((path) => !before.has(path));
    expect(added).toHaveLength(1);
    deletedFileActionNote = added[0];
    expect(deletedFileActionNote).toMatch(/^\.trash\/epizen-[^/]+\/Filename action renamed\.md$/);
    expect(readFileSync(join(vaultCopy(), deletedFileActionNote!), 'utf8')).toBe(edited);
    after.delete(deletedFileActionNote!);
    expect(diffSnapshots(before, after)).toEqual([]);
  });

  it('changed nothing in the vault copy but the new notes, the added album, episode and film and their covers, the album and film entered by hand and the covers found for them, the rating set, the days changed from their pages and drawn on, and the weeks written from theirs', () => {
    expect(diffSnapshots(snapshotVault(DEMO_VAULT), snapshotVault(vaultCopy()))).toEqual(
      [
        `added: ${DAYS}/30.07.2026.md`,
        `added: ${DAYS}/31.07.2026.md`,
        `added: ${DAYS}/${TODAY}.md`,
        ...(deletedLibraryNote ? [`added: ${deletedLibraryNote}`] : []),
        ...(deletedFileActionNote ? [`added: ${deletedFileActionNote}`] : []),
        'added: Inbox idea.md',
        'added: Rating/music/Dog Man Star.md',
        'added: Rating/music/_attachments/dog-man-star.png',
        `added: ${EPISODE}`,
        `added: ${EPISODE_COVER}`,
        'added: Rating/kino/American Fiction.md',
        'added: Rating/kino/_attachments/american-fiction.png',
        `added: ${ANTICS}`,
        'added: Rating/music/_attachments/antics.png',
        `added: ${IKIRU}`,
        'added: Rating/kino/_attachments/ikiru.png',
        'added: Rating/kino/_attachments/ikiru-2.png',
        'changed: Rating/music/Glasshouse Weather.md',
        `changed: ${DAYS}/12.08.2026.md`,
        `changed: ${DAYS}/14.08.2026.md`,
        'changed: Calendar/2026/weeks/2026-W33 - 10.08.26.md',
        'changed: Calendar/2026/weeks/2026-W40 - 28.09.26.md',
      ].sort(),
    );
  });
});
