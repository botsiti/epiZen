import { $, $$, browser, expect } from '@wdio/globals';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { snapshotVault, diffSnapshots } from '../../scripts/vault-snapshot.mjs';
import { vaultCopy } from '../paths';
import { prepareWindow, screenshot, scrollIntoView } from '../support';

const root = join(dirname(vaultCopy()), 'preferences-vault');
async function select(css: string, value: string) {
  await browser.execute((selector, next) => {
    const control = document.querySelector<HTMLSelectElement>(selector);
    if (!control) throw new Error(`Missing ${selector}`);
    control.value = next;
    control.dispatchEvent(new Event('change', { bubbles: true }));
  }, css, value);
  await expect($(css)).toHaveValue(value);
}
async function section(name: string) { await $(`[data-testid="settings-nav-${name}"]`).click(); }
async function save() { await scrollIntoView('[data-testid="settings-save"]'); await $('[data-testid="settings-save"]').click(); await $('[data-testid="settings"] .save-state').waitForDisplayed(); }

describe('focused preferences and file creation', () => {
  before(prepareWindow);
  it('connects existing daily notes and persists homepage sources without changing Markdown', async () => {
    const before = snapshotVault(root);
    await $('[data-testid="open-settings"]').click();
    await section('periodic');
    await screenshot('160-settings-daily');
    await $('[data-testid="daily-import"] summary').click();
    await $('button=Find daily notes').click();
    await expect($('.daily-import-preview')).toHaveText(expect.stringContaining('daily notes found'));
    await screenshot('161-settings-connect-notes');
    await $('.daily-import-preview').$('button*=Connect').click();
    await save();
    await expect($('[data-testid="settings-nav-periodic"]')).toBeDisplayed();
    await expect($('[data-testid="settings-nav-day"]')).not.toBeExisting();
    await $('[data-testid="settings-period-week"]').click();
    await expect($('[data-testid="settings-week-format"]')).toHaveValue('GGGG-[W]WW - DD.MM.YY');
    await screenshot('170-settings-weekly');
    await $('[data-testid="settings-period-month"]').click();
    await expect($('[data-testid="settings-month-format"]')).toHaveValue('MM.YY [RPG]');
    await screenshot('171-settings-monthly');
    await section('home');
    await $('[data-testid="settings-birth-date"]').setValue('1995-01-02');
    await select('[data-testid="settings-source-book"]', 'wikipedia-book');
    await select('[data-testid="settings-source-podcast"]', 'wikipedia-podcast');
    await select('[data-testid="settings-source-album"]', 'wikipedia-album');
    await save();
    await browser.execute(() => document.querySelector('.main')?.scrollTo(0, 0));
    await screenshot('162-settings-home');
    await section('hotkeys');
    await $('[aria-label="Search settings"]').setValue('keyboard');
    await expect($('[data-testid="settings-nav-hotkeys"]')).toBeDisplayed();
    await expect($('[data-testid="settings-nav-home"]')).not.toBeExisting();
    await $('[aria-label="Search settings"]').setValue('');
    await $('[data-testid="keyboard-shortcuts"] input').setValue('sidebar');
    await expect($('[data-testid="keyboard-shortcuts"]')).toHaveText(expect.stringContaining('⌘7'));
    await screenshot('163-settings-hotkeys');
    await browser.refresh(); await prepareWindow();
    await $('[data-testid="open-settings"]').click(); await section('home');
    await expect($('[data-testid="settings-birth-date"]')).toHaveValue('1995-01-02');
    await expect($('[data-testid="settings-source-book"]')).toHaveValue('wikipedia-book');
    expect(diffSnapshots(before, snapshotVault(root))).toEqual([]);
    await browser.setWindowSize(880, 760);
    await screenshot('164-settings-narrow');
    const overflow = await browser.execute(() => document.querySelector('.main')!.scrollWidth > document.querySelector('.main')!.clientWidth);
    expect(overflow).toBe(false);
    await browser.setWindowSize(720, 700);
    await screenshot('173-settings-minimum-window');
    expect(await browser.execute(() => document.querySelector('.main')!.scrollWidth > document.querySelector('.main')!.clientWidth)).toBe(false);
    await browser.setWindowSize(1280, 820);
    await $('[data-testid="open-library"]').click();
    await $('[data-testid="library-add"][data-kind="book"]').click();
    await $('[data-testid="add-search"]').setValue('life 3.0');
    await browser.waitUntil(() => browser.execute(() => document.querySelectorAll('[data-testid="add-result"]').length > 0));
    await expect($('[data-testid="add-hint"]')).toHaveText(expect.stringContaining('on Wikipedia.'));
    expect(await $$('[data-testid="add-result"][data-from="openlibrary"]').length).toBe(0);
    await screenshot('165-selected-source');
    await browser.keys(['Escape']);
  });
  it('creates a visible folder, uses the saved note location, and refuses collisions', async () => {
    const before = snapshotVault(root);
    await $('[data-testid="new-folder-button"]').click();
    await $('[data-testid="new-folder-name"]').setValue('Fresh ideas');
    await screenshot('166-new-folder');
    await $('[data-testid="new-folder-create"]').click();
    await expect($('.creation-complete')).toHaveText(expect.stringContaining('Folder created.'));
    expect(existsSync(join(root, 'Fresh ideas'))).toBe(true);
    await expect($('[data-testid="tree-folder"][data-path="Fresh ideas"]')).toBeDisplayed();
    expect(diffSnapshots(before, snapshotVault(root))).toEqual([]);
    await $('[data-testid="open-settings"]').click(); await section('files');
    await select('[aria-label="Location for new notes"]', 'folder');
    await $('[aria-label="Notes folder"]').setValue('Fresh ideas');
    await save();
    await screenshot('167-settings-files');
    expect(diffSnapshots(before, snapshotVault(root))).toEqual([]);
    await browser.refresh(); await prepareWindow();
    expect(diffSnapshots(before, snapshotVault(root))).toEqual([]);
    await $('[data-testid="new-note-button"]').click();
    expect(diffSnapshots(before, snapshotVault(root))).toEqual([]);
    await expect($('[data-testid="new-note-folder"]')).toHaveValue('Fresh ideas');
    await $('[data-testid="new-note-name"]').setValue('First thought');
    await screenshot('168-new-note');
    await $('[data-testid="new-note-create"]').click();
    await $('[data-testid="editor"]').waitForDisplayed();
    expect(readFileSync(join(root, 'Fresh ideas/First thought.md'), 'utf8')).toBe('');
    await $('[data-testid="new-note-button"]').click();
    await $('[data-testid="new-note-name"]').setValue('First thought');
    await $('[data-testid="new-note-create"]').click();
    await expect($('[data-testid="new-note-error"]')).toHaveText(expect.stringContaining('already exists'));
    await expect($('[data-testid="new-note-name"]')).toHaveValue('First thought');
    await screenshot('169-note-collision');
    expect(diffSnapshots(before, snapshotVault(root))).toEqual(['added: Fresh ideas/First thought.md']);
    // An unaffected consumer remains available after the rejected create.
    await $('[data-testid="open-library"]').click();
    await expect($('[data-testid="library"]')).toBeDisplayed();
  });
});
