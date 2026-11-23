import { $, $$, browser, expect } from '@wdio/globals';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { snapshotVault, diffSnapshots } from '../../scripts/vault-snapshot.mjs';
import { vaultCopy } from '../paths';
import { prepareWindow, pressCommand, screenshot, scrollIntoView } from '../support';

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

async function saveColorTheme(name: string) {
  const radio = 'input[name="color-theme"][aria-label="' + name + '"]';
  const label = '.theme-choices label:has(> ' + radio + ')';
  await scrollIntoView(label);
  await $(label).click();
  await expect($(radio)).toBeSelected();
  await $('button=Save appearance').click();
  await expect($('.appearance-form .preferences-local-action [role="status"]')).toHaveText('Appearance saved for the whole app.');
  await expect($('html')).toHaveAttribute('data-color-theme', name);
}

describe('focused preferences and file creation', () => {
  before(prepareWindow);
  it('connects existing daily notes and persists library sources without changing Markdown', async () => {
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
    await screenshot('162-settings-home');
    await section('library');
    await select('[data-testid="settings-source-book"]', 'wikipedia-book');
    await select('[data-testid="settings-source-podcast"]', 'wikipedia-podcast');
    await select('[data-testid="settings-source-album"]', 'wikipedia-album');
    await save();
    await browser.execute(() => document.querySelector('.main')?.scrollTo(0, 0));
    await screenshot('162-settings-library');
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
    await section('library');
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
  it('applies a color theme across the workspace and restores it after reopening', async () => {
    await $('[data-testid="open-settings"]').click();
    await section('appearance');
    await saveColorTheme('Gruvbox');
    await browser.refresh(); await prepareWindow();
    await expect($('html')).toHaveAttribute('data-color-theme', 'Gruvbox');
    await $('[data-testid="open-settings"]').click(); await section('appearance');
    await expect($('input[name="color-theme"][aria-label="Gruvbox"]')).toBeSelected();
    await scrollIntoView('.theme-library');
    await screenshot('178-settings-color-themes');
    await saveColorTheme('Epizen');
  });
  it('uses daily categories for rewards and shows newly saved life spheres on Home', async () => {
    const before = snapshotVault(root);
    await $('[data-testid="open-settings"]').click(); await section('quests');
    await $('[aria-label="Add sphere"]').click();
    await $('[aria-label="Sphere name · new sphere"]').setValue('Music');
    await screenshot('174-settings-life-spheres');
    await $('button*=Manage categories').click();
    await $('[aria-label="Add category"]').click();
    await $('[aria-label="Category name · new category"]').setValue('piano');
    await screenshot('175-settings-daily-categories');
    await section('quests');
    await $('.reward-category-list').$('button=piano').click();
    await $('[aria-label="XP per minute"]').setValue('7');
    const musicId = await $('[aria-label="Reward sphere 1"]').$('option=Music').getValue();
    await select('[aria-label="Reward sphere 1"]', musicId);
    await save();
    await $('[data-testid="sidebar-vault"]').click();
    await expect($('[data-testid="spheres"] [data-sphere="Music"] .sphere-xp')).toHaveText('0 XP');
    await $('[aria-label="Edit life spheres"]').click();
    await expect($('[data-testid="life-sphere-list"]')).toBeDisplayed();
    await browser.refresh(); await prepareWindow();
    await $('[data-testid="open-settings"]').click(); await section('quests');
    await $('.reward-category-list').$('button=piano').click();
    await expect($('[aria-label="XP per minute"]')).toHaveValue('7');
    await expect($('[aria-label="Reward sphere 1"] option:checked')).toHaveText('Music');
    await scrollIntoView('.reward-workbench');
    await screenshot('174-settings-quest-rewards');
    expect(diffSnapshots(before, snapshotVault(root))).toEqual([]);
  });
  it('navigates all settings sections in a compact pane and saves a draft from the shared toolbar', async () => {
    await browser.setWindowSize(720, 700);
    try {
      await $('[data-testid="open-settings"]').click();
      await $('[aria-label="Browse settings sections"]').click();
      await expect($('[aria-label="Browse settings sections"]')).toHaveAttribute('aria-expanded', 'true');
      await screenshot('176-settings-section-browser');
      await section('home');
      await $('[data-testid="settings-lifetime-years"]').setValue('95');
      await $('[aria-label="Search settings"]').setValue('music');
      await section('library');
      await save();
      await $('[aria-label="Search settings"]').setValue('lifetime');
      await section('home');
      await expect($('[data-testid="settings-lifetime-years"]')).toHaveValue('95');
      await screenshot('177-settings-home-compact');
    } finally {
      await browser.setWindowSize(1280, 820);
    }
  });
  it('creates a visible folder, uses the saved note location, and refuses collisions', async () => {
    const before = snapshotVault(root);
    await $('[data-testid="new-folder-button"]').click();
    await $('[data-testid="new-folder-name"]').setValue('Fresh ideas');
    await screenshot('166-new-folder');
    // The embedded driver synthesizes key events without WebKit's native form submission.
    await $('[data-testid="new-folder-create"]').click();
    await expect($('[data-testid="new-folder-name"]')).not.toBeExisting();
    expect(existsSync(join(root, 'Fresh ideas'))).toBe(true);
    await expect($('[data-testid="tree-folder"][data-path="Fresh ideas"]')).toBeDisplayed();
    expect(diffSnapshots(before, snapshotVault(root))).toEqual([]);
    await $('[data-testid="open-settings"]').click(); await section('files');
    await select('[aria-label="Location for new notes"]', 'folder');
    await $('label=Notes folder').$('input').setValue('Fresh ideas');
    await select('[aria-label="New link paths"]', 'relative');
    await $('[aria-label="Use wikilinks"]').click();
    await save();
    await screenshot('167-settings-files');
    expect(diffSnapshots(before, snapshotVault(root))).toEqual([]);
    await browser.refresh(); await prepareWindow();
    expect(diffSnapshots(before, snapshotVault(root))).toEqual([]);
    await $('[data-testid="open-settings"]').click(); await section('files');
    await expect($('[aria-label="New link paths"]')).toHaveValue('relative');
    await expect($('[aria-label="Use wikilinks"]')).not.toBeSelected();
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

  it('moves an open note by dropping it on the explorer and keeps editor shortcuts scoped', async () => {
    const before = snapshotVault(root);
    const folder = $('[data-testid="tree-folder"][data-path="Fresh ideas"]');
    if (await folder.getAttribute('data-open') !== 'true') await folder.click();
    const source = '[data-testid="tree-note"][data-path="Fresh ideas/First thought.md"]';
    await $(source).click();
    await pressCommand('e');
    const target = '[data-testid="editor"] .cm-content';
    await $(target).waitForDisplayed();
    await pressCommand('b', { target });
    await browser.keys('A thought');
    await pressCommand('s', { target });
    await expect($('[data-testid="save-state"]')).toHaveText('Saved');
    await pressCommand('e', { target });
    await $(source).click({ button: 'right' });
    await $('[role="menuitem"]=Move to folder…').click();
    await $('[role="dialog"] input[type="search"]').setValue('vault');
    await expect($('[role="dialog"] button=Top of the vault')).toBeDisplayed();
    await screenshot('175-move-note');
    await browser.keys('Escape');
    await browser.execute((selector) => {
      const note = document.querySelector(selector), rootDrop = document.querySelector('[data-testid="tree-root-drop"]');
      if (!note || !rootDrop) throw new Error('The note or drop target is missing');
      const dataTransfer = new DataTransfer();
      const event = (type: string) => new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer });
      note.dispatchEvent(event('dragstart'));
      rootDrop.dispatchEvent(event('dragover'));
      rootDrop.dispatchEvent(event('drop'));
    }, source);
    await expect($('[data-testid="tree-note"][data-path="First thought.md"]')).toBeExisting();
    expect(readFileSync(join(root, 'First thought.md'), 'utf8')).toBe('**A thought**');
    expect(diffSnapshots(before, snapshotVault(root)).sort()).toEqual(['added: First thought.md', 'removed: Fresh ideas/First thought.md']);
    await expect($('[role="tab"][data-active="true"]')).toHaveAttribute('data-title', 'First thought');
    await pressCommand('t'); await pressCommand('t');
    await pressCommand('o', { control: true, shift: true });
    expect(await $$('[role="tab"][data-pinned="false"]').length).toBe(1);
  });
});
