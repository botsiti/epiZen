import { $, browser } from '@wdio/globals';
import { join } from 'node:path';
import { EVIDENCE } from './paths';

/**
 * Same size on every machine, and no transitions: macOS pauses them in a window that
 * isn't in front, so a screenshot could catch a chevron or highlight halfway.
 */
export async function prepareWindow() {
  await browser.setWindowSize(1280, 820);
  await browser.execute(() => {
    const style = document.createElement('style');
    style.textContent = '*, *::before, *::after { transition: none !important; }';
    document.head.append(style);
  });
}

/** Saves what the window shows to evidence/<name>.png. */
export async function screenshot(name: string) {
  await browser.saveScreenshot(join(EVIDENCE, `${name}.png`));
}

/** Opens each folder in the sidebar unless it is open already. */
export async function openFolders(...paths: string[]) {
  for (const path of paths) {
    const folder = $(`[data-testid="tree-folder"][data-path="${path}"]`);
    if ((await folder.getAttribute('data-open')) !== 'true') await folder.click();
  }
}

export async function openNote(path: string) {
  await $(`[data-testid="tree-note"][data-path="${path}"]`).click();
  await $(`[data-testid="note"][data-path="${path}"]`).waitForDisplayed();
}

/**
 * Types into the note editor. This driver's key presses don't reach a contenteditable, so it
 * sends what macOS sends when a person types: an `insertText` edit at the cursor.
 */
export async function typeInEditor(text: string) {
  await $('[data-testid="editor"] .cm-content').click();
  await browser.execute((value) => {
    document.querySelector<HTMLElement>('[data-testid="editor"] .cm-content')?.focus();
    document.execCommand('insertText', false, value);
  }, text);
}

export async function followLink(target: string) {
  await $(`[data-testid="note"] a[data-wikilink="${target}"]`).click();
}
