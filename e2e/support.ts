import { $, browser, expect } from '@wdio/globals';
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

/** Waits until the page has drawn its next frame, for a canvas that redraws on the next one. */
export async function nextFrame() {
  await browser.execute(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
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

/** Steps the sidebar calendar to a month, such as "August 2026". */
export async function showMonth(label: string) {
  const title = $('[data-testid="calendar-month"]');
  const [name, year] = label.split(' ');
  for (let i = 0; i < 120 && (await title.getText()) !== label; i += 1) {
    const [shownName, shownYear] = (await title.getText()).split(' ');
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const shown = Number(shownYear) * 12 + months.indexOf(shownName ?? '');
    const wanted = Number(year) * 12 + months.indexOf(name ?? '');
    await $(`[data-testid="calendar-${wanted < shown ? 'prev' : 'next'}"]`).click();
  }
  await expect(title).toHaveText(label);
}

export async function followLink(target: string) {
  await $(`[data-testid="note"] a[data-wikilink="${target}"]`).click();
}
