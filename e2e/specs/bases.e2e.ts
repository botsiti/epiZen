import { $, $$, browser, expect } from '@wdio/globals';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { diffSnapshots, snapshotVault } from '../../scripts/vault-snapshot.mjs';
import { vaultCopy } from '../paths';
import { CINEMA_MOC, MUSIC_MOC, MUSIC_TEXT } from '../bases-fixture';
import { openFolders, openNote, prepareWindow, screenshot, scrollIntoView } from '../support';

const root = join(dirname(vaultCopy()), 'bases-vault');
async function select(selector: string, value: string) {
  await browser.execute((css, next) => {
    const input = document.querySelector<HTMLSelectElement>(css);
    if (!input) throw new Error(`Missing ${css}`);
    input.value = next; input.dispatchEvent(new Event('change', { bubbles: true }));
  }, selector, value);
}

describe('vault-backed music tables', () => {
  before(prepareWindow);
  it('renders the reported cinema note at both widths and disables epiBase without changing vault files', async () => {
    const before = snapshotVault(root);
    await openFolders('Rating', 'Rating/kino'); await openNote(CINEMA_MOC);
    await expect($('.base-count')).toHaveText('4 notes');
    await expect($$('.base-block tbody tr')).toBeElementsArrayOfSize(4);
    await expect($('.base-block tbody tr')).toHaveAttribute('data-path', 'Rating/kino/Static Bloom.md');
    await expect($('.base-block th')).toHaveText('Movie name');
    await expect($('.base-block tbody tr td:nth-child(3) > span')).toHaveText('2024');
    await expect($('.base-block [role="alert"]')).not.toBeExisting();
    await screenshot('185-cinema-base');
    await select('[aria-label="Table view"]', '1');
    await expect($('.base-count')).toHaveText('0 notes');
    await select('[aria-label="Table view"]', '0');
    await browser.setWindowSize(880, 760);
    await screenshot('186-cinema-base-narrow');
    expect(await browser.execute(() => {
      const pane = document.querySelector('.main')!, scroll = document.querySelector('.base-scroll')!;
      return pane.scrollWidth <= pane.clientWidth && scroll.scrollWidth > scroll.clientWidth;
    })).toBe(true);
    await browser.setWindowSize(1280, 820);
    await $('[data-testid="open-settings"]').click();
    await $('[data-testid="settings-nav-plugins"]').click();
    await $('[aria-label="Enable epiBase"]').click();
    await scrollIntoView('[data-testid="settings-save"]'); await $('[data-testid="settings-save"]').click();
    await $('[data-testid="settings"] .save-state').waitForDisplayed();
    expect(diffSnapshots(before, snapshotVault(root))).toEqual([]);
  });
  it('remembers disabled epiBase after restarting and opens its enable switch from the note', async () => {
    const before = snapshotVault(root);
    await browser.refresh(); await prepareWindow();
    await openFolders('Rating', 'Rating/kino'); await openNote(CINEMA_MOC);
    await expect($('.base-message')).toHaveText(expect.stringContaining('epiBase is disabled.'));
    await expect($('.base-block table')).not.toBeExisting();
    await expect($('.base-source')).not.toHaveAttribute('open');
    await expect($('[data-testid="add-table"]')).not.toBeExisting();
    await screenshot('187-epibase-disabled');
    await $('button=Open plugin settings').click();
    await expect($('[aria-label="Enable epiBase"]')).not.toBeSelected();
    await $('[aria-label="Enable epiBase"]').click();
    await scrollIntoView('[data-testid="settings-save"]'); await $('[data-testid="settings-save"]').click();
    await $('[data-testid="settings"] .save-state').waitForDisplayed();
    expect(diffSnapshots(before, snapshotVault(root))).toEqual([]);
  });
  it('remembers enabled epiBase after restarting and restores the cinema table without writing', async () => {
    const before = snapshotVault(root);
    await browser.refresh(); await prepareWindow();
    await openFolders('Rating', 'Rating/kino'); await openNote(CINEMA_MOC);
    await expect($('.base-count')).toHaveText('4 notes');
    expect(diffSnapshots(before, snapshotVault(root))).toEqual([]);
  });
  it('renders existing Bases and Dataview MOCs, sorts, searches and opens albums without writing', async () => {
    const before = snapshotVault(root);
    await openFolders('Rating', 'Rating/music'); await openNote(MUSIC_MOC);
    await expect($$('.base-block table')).toBeElementsArrayOfSize(3);
    await expect($('.base-block .base-count')).toHaveText('20 notes');
    await screenshot('180-music-base');
    await select('.base-block [aria-label="Table view"]', '1');
    await expect($('.base-block tbody tr')).toHaveAttribute('data-path', 'Rating/music/Seven Bells for Nobody.md');
    await $('.base-block [aria-label="Search table"]').setValue('Glasshouse');
    await expect($('.base-block .base-count')).toHaveText('1 note');
    await screenshot('181-music-filtered');
    await $('.base-block tbody a').click();
    await expect($('[data-testid="media-page"]')).toHaveAttribute('data-path', 'Rating/music/Glasshouse Weather.md');
    expect(diffSnapshots(before, snapshotVault(root))).toEqual([]);
  });
  it('creates a table in a note, preserves its previous bytes, and reloads the same result', async () => {
    const before = snapshotVault(root);
    await openFolders('Rating', 'Rating/music'); await openNote(MUSIC_MOC);
    await $('[data-testid="add-table"]').click();
    await $('[data-testid="table-builder"] input').setValue('Favorites');
    await $('label=rating').$('input').click();
    await $('button=Add filter').click();
    await select('[aria-label="Filter 1 property"]', 'note.rating');
    await select('[aria-label="Filter 1 comparison"]', '>=');
    await $('[aria-label="Filter 1 value"]').setValue('80');
    await scrollIntoView('.base-builder-actions');
    await screenshot('182-table-builder');
    await $('button=Add to note').click();
    await $('[data-testid="table-builder"]').waitForExist({ reverse: true });
    const saved = readFileSync(join(root, MUSIC_MOC), 'utf8');
    expect(saved.startsWith(MUSIC_TEXT)).toBe(true);
    expect(saved).toContain('name: Favorites');
    expect(diffSnapshots(before, snapshotVault(root))).toEqual([`changed: ${MUSIC_MOC}`]);
    await browser.refresh(); await prepareWindow();
    await openFolders('Rating', 'Rating/music'); await openNote(MUSIC_MOC);
    await expect($$('.base-block table')).toBeElementsArrayOfSize(4);
    const favorites = $$('.base-block')[3];
    await expect(favorites).toHaveText(expect.stringContaining('Favorites'));
    await browser.setWindowSize(880, 760);
    await browser.execute(() => document.querySelector('.base-block')?.scrollIntoView({ block: 'start' }));
    await screenshot('183-music-narrow');
    expect(await browser.execute(() => document.querySelector('.main')!.scrollWidth > document.querySelector('.main')!.clientWidth)).toBe(false);
    await browser.setWindowSize(1280, 820);
  });
  it('refreshes external property edits and contains an unsupported table', async () => {
    const album = 'Rating/music/Glasshouse Weather.md';
    const text = readFileSync(join(root, album), 'utf8');
    const updated = text.replace(/^listened:.*$/m, 'listened: 2023-01-01');
    expect(updated).not.toBe(text);
    // Change only this disposable fixture, simulating an edit made by Obsidian.
    writeFileSync(join(root, album), updated);
    await browser.execute(() => document.querySelector('.main')?.scrollTo(0, 0));
    await $('.base-block').$('button=Refresh').click();
    await expect($('.base-block .base-count')).toHaveText('19 notes');
    await openNote('Unsupported table.md');
    await expect($('.base-block [role="alert"]')).toHaveText(expect.stringContaining('This view type is unavailable'));
    await expect($('.base-source textarea')).toHaveValue('views: [{type: map}]');
    await screenshot('184-table-unsupported');
    await $('a[data-wikilink="Glasshouse Weather"]').click();
    await expect($('[data-testid="media-page"]')).toBeDisplayed();
  });
});
