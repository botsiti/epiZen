import { isLibraryTab, type LibraryTab } from './library';
import { noteTitle } from './links';

/** What a tab shows: one screen of the main pane. */
export type View =
  | { kind: 'home' }
  | { kind: 'note'; path: string; editing?: boolean }
  | { kind: 'missing'; target: string }
  | { kind: 'new'; folder: string }
  | { kind: 'unsaved'; path: string; text: string; message: string }
  | { kind: 'settings' }
  | { kind: 'graph' }
  | { kind: 'calendar' }
  | { kind: 'library'; tab: LibraryTab }
  | { kind: 'problem'; title: string; message: string };

export const HOME: View = { kind: 'home' };

export interface Tab {
  readonly id: number;
  /** Every screen the tab has shown, oldest first; `index` is the one it shows now, and what lies past it is forward. */
  readonly history: readonly View[];
  readonly index: number;
  /** A pinned tab sits at the left, isn't closed by ⌘W, and opens a plain link click in a new tab. */
  readonly pinned: boolean;
}

/** The open tabs, pinned ones first, and the one in front. Never empty. */
export interface Workspace {
  readonly tabs: readonly Tab[];
  /** The id of the tab in front. */
  readonly active: number;
  /** The id the next tab gets. */
  readonly next: number;
}

export function newWorkspace(view: View = HOME): Workspace {
  return { tabs: [{ id: 1, history: [view], index: 0, pinned: false }], active: 1, next: 2 };
}

export function activeTab(ws: Workspace): Tab {
  return ws.tabs.find((tab) => tab.id === ws.active) ?? (ws.tabs[0] as Tab);
}

export function currentView(tab: Tab): View {
  return tab.history[tab.index] ?? HOME;
}

export const canGoBack = (tab: Tab) => tab.index > 0;
export const canGoForward = (tab: Tab) => tab.index < tab.history.length - 1;

/** The note a view shows, if it shows one. */
export const notePath = (view: View) => (view.kind === 'note' ? view.path : undefined);

/** Whether two views are the same screen. Screens that carry a message are never the same, and neither are two new-note forms. */
export function sameView(a: View, b: View): boolean {
  switch (a.kind) {
    case 'note':
      return b.kind === 'note' && a.path === b.path && Boolean(a.editing) === Boolean(b.editing);
    case 'missing':
      return b.kind === 'missing' && a.target === b.target;
    case 'library':
      return b.kind === 'library' && a.tab === b.tab;
    case 'home':
    case 'settings':
    case 'graph':
    case 'calendar':
      return a.kind === b.kind;
    default:
      return false;
  }
}

/** Pinned tabs first, each group in its own order. */
function ordered(tabs: readonly Tab[]): Tab[] {
  return [...tabs.filter((tab) => tab.pinned), ...tabs.filter((tab) => !tab.pinned)];
}

function updateTab(ws: Workspace, id: number, update: (tab: Tab) => Tab): Workspace {
  let changed = false;
  const tabs = ws.tabs.map((tab) => {
    if (tab.id !== id) return tab;
    const next = update(tab);
    changed ||= next !== tab;
    return next;
  });
  return changed ? { ...ws, tabs } : ws;
}

/** The tab's history with `view` after the screen it shows now; whatever was forward of it is gone. */
function push(tab: Tab, view: View): Tab {
  return { ...tab, history: [...tab.history.slice(0, tab.index + 1), view], index: tab.index + 1 };
}

/** A new tab showing `view`, just right of the one in front (after the pinned ones), and brought to the front. */
export function openTab(ws: Workspace, view: View): Workspace {
  const tab: Tab = { id: ws.next, history: [view], index: 0, pinned: false };
  const at = ws.tabs.findIndex((t) => t.id === ws.active);
  const tabs = [...ws.tabs];
  tabs.splice(at < 0 ? tabs.length : at + 1, 0, tab);
  return { tabs: ordered(tabs), active: tab.id, next: ws.next + 1 };
}

/**
 * Opens a view as a link click does: in the tab in front, which can go back to what it showed,
 * or in a new tab when asked (⌘-click) or when the tab in front is pinned. The screen the tab
 * already shows opens nothing.
 */
export function open(ws: Workspace, view: View, options: { newTab?: boolean } = {}): Workspace {
  const tab = activeTab(ws);
  if (options.newTab) return openTab(ws, view);
  if (sameView(currentView(tab), view)) return ws;
  if (tab.pinned) return openTab(ws, view);
  return updateTab(ws, tab.id, (t) => push(t, view));
}

/** Changes the screen a tab shows in place, without a step in its history: the editor opening, the library's tab. */
export function replaceView(ws: Workspace, update: (view: View) => View, id = ws.active): Workspace {
  return updateTab(ws, id, (tab) => {
    const view = currentView(tab);
    const next = update(view);
    if (next === view) return tab;
    return { ...tab, history: tab.history.map((v, i) => (i === tab.index ? next : v)) };
  });
}

/**
 * Shows a view in a given tab and brings that tab to the front, even a pinned one, or in a new tab
 * if it has been closed. For what must be seen where it belongs: text an editor couldn't save.
 */
export function showIn(ws: Workspace, id: number, view: View): Workspace {
  if (!ws.tabs.some((tab) => tab.id === id)) return openTab(ws, view);
  return { ...updateTab(ws, id, (tab) => push(tab, view)), active: id };
}

export function back(ws: Workspace, id = ws.active): Workspace {
  return updateTab(ws, id, (tab) => (canGoBack(tab) ? { ...tab, index: tab.index - 1 } : tab));
}

export function forward(ws: Workspace, id = ws.active): Workspace {
  return updateTab(ws, id, (tab) => (canGoForward(tab) ? { ...tab, index: tab.index + 1 } : tab));
}

export function activate(ws: Workspace, id: number): Workspace {
  return ws.active === id || !ws.tabs.some((tab) => tab.id === id) ? ws : { ...ws, active: id };
}

/** Brings the next tab to the front (`step` 1) or the one before (-1), round the ends. */
export function cycle(ws: Workspace, step: 1 | -1): Workspace {
  const at = ws.tabs.findIndex((tab) => tab.id === ws.active);
  const next = ws.tabs[(at + step + ws.tabs.length) % ws.tabs.length];
  return next ? activate(ws, next.id) : ws;
}

/**
 * Closes a tab, pinned or not. If it was in front, the tab to its right comes forward, or the one
 * to its left. Closing the last tab leaves a new one on the home screen.
 */
export function close(ws: Workspace, id: number): Workspace {
  const at = ws.tabs.findIndex((tab) => tab.id === id);
  if (at < 0) return ws;
  const tabs = ws.tabs.filter((tab) => tab.id !== id);
  if (!tabs.length) return { tabs: [{ id: ws.next, history: [HOME], index: 0, pinned: false }], active: ws.next, next: ws.next + 1 };
  const active = ws.active === id ? (tabs[Math.min(at, tabs.length - 1)] as Tab).id : ws.active;
  return { ...ws, tabs, active };
}

/** ⌘W: closes the tab in front, unless it is pinned. */
export function closeActive(ws: Workspace): Workspace {
  return activeTab(ws).pinned ? ws : close(ws, ws.active);
}

/** Pins or unpins a tab; pinned tabs move to the left, in the order they were in. */
export function setPinned(ws: Workspace, id: number, pinned: boolean): Workspace {
  const next = updateTab(ws, id, (tab) => (tab.pinned === pinned ? tab : { ...tab, pinned }));
  return next === ws ? ws : { ...next, tabs: ordered(next.tabs) };
}

/** A tab's name in the tab bar. */
export function tabTitle(view: View): string {
  switch (view.kind) {
    case 'home':
      return 'Home';
    case 'note':
      return noteTitle(view.path);
    case 'missing':
      return view.target;
    case 'new':
      return 'New note';
    case 'unsaved':
      return 'Not saved';
    case 'settings':
      return 'Settings';
    case 'graph':
      return 'Graph';
    case 'calendar':
      return 'Calendar';
    case 'library':
      return 'Library';
    case 'problem':
      return view.title;
  }
}

/** ⌘-click or a middle click: open in a new tab. */
export const opensInNewTab = (event: { metaKey: boolean; button: number }) => event.metaKey || event.button === 1;

// Remembering the tabs. The app's settings keep each open tab's screen (not its history) and
// whether it is pinned, and which tab was in front, for the vault they belong to.

export interface StoredTab {
  view: View;
  pinned: boolean;
}

export interface StoredWorkspace {
  /** The vault's folder: tabs only ever reopen in the vault they were open in. */
  vault: string;
  tabs: StoredTab[];
  /** Index into `tabs`. */
  active: number;
}

/** At most this many tabs come back. */
export const MAX_STORED_TABS = 50;

/** A screen worth reopening: a note, home, settings, the graph, the calendar or the library. Editing reopens as reading. */
function storable(view: View): View | undefined {
  switch (view.kind) {
    case 'note':
      return { kind: 'note', path: view.path };
    case 'library':
      return { kind: 'library', tab: view.tab };
    case 'home':
    case 'settings':
    case 'graph':
    case 'calendar':
      return { kind: view.kind };
    default:
      return undefined;
  }
}

/** What the settings keep of the tabs. A screen that isn't worth reopening (a message, a form) keeps the one before it, or home. */
export function toStored(ws: Workspace, vault: string): StoredWorkspace {
  const tabs = ws.tabs.map((tab): StoredTab => {
    let view: View | undefined;
    for (let i = tab.index; i >= 0 && !view; i -= 1) view = storable(tab.history[i] ?? HOME);
    return { view: view ?? HOME, pinned: tab.pinned };
  });
  return { vault, tabs, active: Math.max(0, ws.tabs.findIndex((tab) => tab.id === ws.active)) };
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A stored screen, if it is one this vault can still show: a note only while it exists. */
export function parseView(value: unknown, notes: ReadonlySet<string>): View | undefined {
  if (!isObject(value)) return undefined;
  switch (value.kind) {
    case 'home':
    case 'settings':
    case 'graph':
    case 'calendar':
      return { kind: value.kind };
    case 'note':
      return typeof value.path === 'string' && notes.has(value.path) ? { kind: 'note', path: value.path } : undefined;
    case 'library':
      return isLibraryTab(value.tab) ? { kind: 'library', tab: value.tab } : undefined;
    default:
      return undefined;
  }
}

/**
 * The tabs the settings remember for this vault. Anything that doesn't hold up is left out: tabs
 * from another vault, notes that are gone, values of the wrong shape. Nothing left is one home tab.
 */
export function fromStored(value: unknown, context: { vault: string; notes: ReadonlySet<string> }): Workspace {
  if (!isObject(value) || value.vault !== context.vault || !Array.isArray(value.tabs)) return newWorkspace();
  const wanted = typeof value.active === 'number' && Number.isInteger(value.active) ? value.active : 0;
  const kept: { tab: Tab; from: number }[] = [];
  value.tabs.slice(0, MAX_STORED_TABS).forEach((entry: unknown, from) => {
    const view = isObject(entry) ? parseView(entry.view, context.notes) : undefined;
    if (!view || !isObject(entry)) return;
    kept.push({ tab: { id: kept.length + 1, history: [view], index: 0, pinned: entry.pinned === true }, from });
  });
  if (!kept.length) return newWorkspace();
  // The tab that was in front, or the nearest one left of it that is still here.
  const front = [...kept].reverse().find((k) => k.from <= wanted) ?? kept[0];
  return { tabs: ordered(kept.map((k) => k.tab)), active: front?.tab.id ?? 1, next: kept.length + 1 };
}

// The right sidebar: open or not, and which of its panels are folded. Kept in the settings too.

export type PanelId = 'backlinks' | 'graph';
const PANELS: readonly PanelId[] = ['backlinks', 'graph'];

export interface RightSidebar {
  open: boolean;
  /** The panels folded shut. */
  closed: PanelId[];
}

/** The stored right sidebar, or a closed one with every panel open when there is none or it doesn't hold up. */
export function parseRightSidebar(value: unknown): RightSidebar {
  if (!isObject(value)) return { open: false, closed: [] };
  const closed = Array.isArray(value.closed) ? PANELS.filter((panel) => (value.closed as unknown[]).includes(panel)) : [];
  return { open: value.open === true, closed };
}
