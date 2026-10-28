import { $, $$, browser, expect } from '@wdio/globals';
import { join } from 'node:path';
import { EVIDENCE } from './paths';

/**
 * Same size on every machine, and no transitions or animations: macOS pauses them in a window
 * that isn't in front, so a screenshot could catch a chevron, a count or a card halfway.
 * `data-motion="off"` tells the periodic pages to show every move's end state at once.
 */
export async function prepareWindow() {
  await browser.setWindowSize(1280, 820);
  await browser.execute(() => {
    document.documentElement.dataset.motion = 'off';
    const style = document.createElement('style');
    style.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
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

/** Opens a note from the sidebar and waits for it: its text, or the page of a daily, weekly or monthly note, or a rated note's media page. */
export async function openNote(path: string) {
  await $(`[data-testid="tree-note"][data-path="${path}"]`).click();
  await waitForNote(path);
}

/** Waits until the main pane shows a note: its text, its periodic page or its media page. */
export async function waitForNote(path: string) {
  await $(`[data-testid="note"][data-path="${path}"], [data-testid="periodic"][data-path="${path}"], [data-testid="media-page"][data-path="${path}"]`).waitForDisplayed();
}

/**
 * The sidebar folders a note sits in, outermost first, for `openFolders`. Open them just before
 * clicking the note: a folder open only because the selected note is in it closes when another is.
 */
export const foldersOf = (path: string) => path.split('/').slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join('/'));

/** Shows a tab of the open daily, weekly or monthly page, such as "Note". */
export async function showTab(name: string) {
  await $(`[data-testid="tab"][data-tab="${name}"]`).click();
  await expect($(`[data-testid="tab"][data-tab="${name}"]`)).toHaveAttribute('aria-selected', 'true');
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
  await $(`[data-testid="note"] a[data-wikilink="${target}"], [data-testid="media-text"] a[data-wikilink="${target}"]`).click();
}

/** The tabs across the top of the main pane, left to right. */
export const workspaceTabs = () => $$('[data-testid="workspace-tab"]');
export const frontTab = () => $('[data-testid="workspace-tab"][data-active="true"]');
export async function tabTitles(): Promise<string[]> {
  return browser.execute(() => [...document.querySelectorAll('[data-testid="workspace-tab"]')].map((tab) => tab.getAttribute('data-title') ?? ''));
}

/**
 * Clicks with ⌘ held, with the middle button, or with the right one. This driver can't hold a key
 * through a click, so the page gets the event macOS would send it, as the right-click steps do.
 */
export async function clickAs(selector: string, how: 'meta' | 'middle' | 'right') {
  await browser.execute(
    (css, kind) => {
      const element = document.querySelector(css);
      if (!element) throw new Error(`nothing matches ${css}`);
      const box = element.getBoundingClientRect();
      const at = { bubbles: true, cancelable: true, clientX: box.left + Math.min(12, box.width / 2), clientY: box.top + box.height / 2 };
      if (kind === 'meta') element.dispatchEvent(new MouseEvent('click', { ...at, button: 0, metaKey: true }));
      else if (kind === 'middle') element.dispatchEvent(new MouseEvent('auxclick', { ...at, button: 1 }));
      else element.dispatchEvent(new MouseEvent('contextmenu', { ...at, button: 2 }));
    },
    selector,
    how,
  );
}

/** Presses ⌘ and a key (⌥ too with `alt`), as the page sees it. */
export async function pressCommand(key: string, options: { alt?: boolean } = {}) {
  await browser.execute(
    (letter, alt) => {
      const code = `Key${letter.toUpperCase()}`;
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: alt ? '∫' : letter, code, metaKey: true, altKey: alt, bubbles: true, cancelable: true }));
    },
    key,
    Boolean(options.alt),
  );
}

/**
 * A point over a dot of a graph's canvas whose note `accept`s, found the way a person finds one:
 * moving the pointer across until it turns into a hand, then pointing at each such dot in turn.
 */
export async function pointAtNode(selector: string, accept: (path: string) => boolean): Promise<{ x: number; y: number; path: string }> {
  const spots = await browser.execute((css) => {
    const canvas = document.querySelector<HTMLCanvasElement>(`${css} canvas`);
    if (!canvas) throw new Error(`no canvas in ${css}`);
    const box = canvas.getBoundingClientRect();
    const found: { x: number; y: number }[] = [];
    for (let y = box.top + 2; y < box.bottom; y += 4) {
      for (let x = box.left + 2; x < box.right; x += 4) {
        canvas.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }));
        if (canvas.style.cursor === 'pointer' && !found.some((p) => Math.hypot(p.x - x, p.y - y) < 16)) found.push({ x, y });
      }
    }
    return found;
  }, selector);
  for (const spot of spots) {
    await browser.execute(
      (css, x, y) => document.querySelector(`${css} canvas`)?.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y })),
      selector,
      spot.x,
      spot.y,
    );
    await nextFrame();
    const path = (await $(selector).getAttribute('data-focus')) ?? '';
    if (path && accept(path)) return { ...spot, path };
  }
  throw new Error(`no dot in ${selector} for such a note, of ${spots.length} found`);
}

/** Clicks a graph's canvas at a point: a press there and a release, with ⌘ held when asked. */
export async function clickCanvas(selector: string, at: { x: number; y: number }, options: { meta?: boolean } = {}) {
  await browser.execute(
    (css, x, y, meta) => {
      const canvas = document.querySelector(`${css} canvas`);
      if (!canvas) throw new Error(`no canvas in ${css}`);
      const event = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, metaKey: meta };
      canvas.dispatchEvent(new MouseEvent('mousedown', event));
      window.dispatchEvent(new MouseEvent('mouseup', event));
    },
    selector,
    at.x,
    at.y,
    Boolean(options.meta),
  );
}

/** Unpins and closes every tab but the one in front, and unpins that one too, as a person would. */
export async function closeOtherTabs() {
  for (let i = 0; i < 50; i += 1) {
    const other = await browser.execute(() => {
      const tab = [...document.querySelectorAll('[data-testid="workspace-tab"]')].find((t) => t.getAttribute('data-active') !== 'true');
      return tab ? { id: tab.getAttribute('data-tab-id') ?? '', pinned: tab.getAttribute('data-pinned') === 'true' } : null;
    });
    if (!other) break;
    const selector = `[data-testid="workspace-tab"][data-tab-id="${other.id}"]`;
    if (other.pinned) await $(`${selector} [data-testid="tab-pin"]`).click();
    await clickAs(selector, 'middle');
    await $(selector).waitForExist({ reverse: true });
  }
  if ((await frontTab().getAttribute('data-pinned')) === 'true') await frontTab().$('[data-testid="tab-pin"]').click();
  expect(await workspaceTabs().length).toBe(1);
}

/** Pins a tab by its title, from its menu. */
export async function pinTab(title: string) {
  const tab = `[data-testid="workspace-tab"][data-title="${title}"]`;
  await clickAs(tab, 'right');
  await expect($('[data-testid="tab-menu-pin"]')).toHaveText('Pin');
  await $('[data-testid="tab-menu-pin"]').click();
  await expect($(tab)).toHaveAttribute('data-pinned', 'true');
}

/** Opens or closes the right sidebar with its switch, unless it is that way already. */
export async function setRightSidebar(open: boolean) {
  const toggle = $('[data-testid="right-sidebar-toggle"]');
  if ((await toggle.getAttribute('aria-pressed')) !== String(open)) await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', String(open));
  if (open) await $('[data-testid="right-sidebar"]').waitForDisplayed();
  else await $('[data-testid="right-sidebar"]').waitForExist({ reverse: true });
}

/** Unfolds a panel of the right sidebar unless it is open already. */
export async function openPanel(panel: string) {
  const toggle = $(`[data-testid="panel-toggle"][data-panel="${panel}"]`);
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}
