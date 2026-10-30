import { describe, expect, it } from 'vitest';
import {
  activate,
  activeTab,
  back,
  canGoBack,
  canGoForward,
  close,
  closeActive,
  currentView,
  cycle,
  forward,
  fromStored,
  HOME,
  MAX_STORED_TABS,
  newWorkspace,
  open,
  openTab,
  opensInNewTab,
  parseRightSidebar,
  parseView,
  replaceView,
  setPinned,
  showIn,
  tabTitle,
  toStored,
  renameNoteViews,
  type View,
  type Workspace,
} from './tabs';

const DAY = 'Calendar/2026/days 2026/14.08.2026.md';
const ALBUM = 'Rating/music/Glasshouse Weather.md';
const INBOX = 'Inbox idea.md';
const note = (path: string): View => ({ kind: 'note', path });

/** Each tab as what it shows, `*` before the one in front and `^` before pinned ones. */
function shown(ws: Workspace): string[] {
  return ws.tabs.map((tab) => {
    const view = currentView(tab);
    const name = view.kind === 'note' ? tabTitle(view) : view.kind;
    return `${tab.id === ws.active ? '*' : ''}${tab.pinned ? '^' : ''}${name}`;
  });
}

describe('opening', () => {
  it('starts with one tab on the home screen', () => {
    const ws = newWorkspace();
    expect(shown(ws)).toEqual(['*home']);
    expect(canGoBack(activeTab(ws))).toBe(false);
  });

  it('replaces what the tab in front shows on a plain click, and can go back and forward again', () => {
    let ws = open(newWorkspace(), note(DAY));
    ws = open(ws, note(ALBUM));
    expect(shown(ws)).toEqual(['*Glasshouse Weather']);
    ws = back(ws);
    expect(shown(ws)).toEqual(['*14.08.2026']);
    expect(canGoForward(activeTab(ws))).toBe(true);
    ws = forward(ws);
    expect(shown(ws)).toEqual(['*Glasshouse Weather']);
    expect(canGoForward(activeTab(ws))).toBe(false);
    // Opening from an earlier screen drops what was forward of it.
    ws = open(back(back(ws)), { kind: 'graph' });
    expect(activeTab(ws).history.map((v) => v.kind)).toEqual(['home', 'graph']);
    expect(canGoForward(activeTab(ws))).toBe(false);
  });

  it('opens nothing for the screen the tab already shows', () => {
    const ws = open(newWorkspace(), note(DAY));
    expect(open(ws, note(DAY))).toBe(ws);
    expect(open(ws, { kind: 'home' })).not.toBe(ws);
  });

  it('opens a new tab on ⌘-click, right of the one in front, and brings it forward', () => {
    let ws = open(newWorkspace(), note(DAY));
    ws = open(ws, note(ALBUM), { newTab: true });
    ws = activate(ws, 1);
    ws = open(ws, note(INBOX), { newTab: true });
    expect(shown(ws)).toEqual(['14.08.2026', '*Inbox idea', 'Glasshouse Weather']);
    // Each tab has its own history: the new one starts with nowhere to go back to.
    expect(canGoBack(activeTab(ws))).toBe(false);
    expect(activeTab(activate(ws, 1)).history).toHaveLength(2);
  });

  it('tells a ⌘-click or a middle click from a plain one', () => {
    expect(opensInNewTab({ metaKey: true, button: 0 })).toBe(true);
    expect(opensInNewTab({ metaKey: false, button: 1 })).toBe(true);
    expect(opensInNewTab({ metaKey: false, button: 0 })).toBe(false);
  });

  it('changes a screen in place without a step in the history', () => {
    let ws = open(newWorkspace(), note(DAY));
    ws = replaceView(ws, (view) => (view.kind === 'note' ? { ...view, editing: true } : view));
    expect(currentView(activeTab(ws))).toEqual({ kind: 'note', path: DAY, editing: true });
    expect(activeTab(ws).history).toHaveLength(2);
    expect(replaceView(ws, (view) => view)).toBe(ws);
  });
});

describe('closing', () => {
  const three = () => openTab(openTab(open(newWorkspace(), note(DAY)), note(ALBUM)), note(INBOX));

  it('brings the tab to the right forward, or the one to the left at the end', () => {
    let ws = activate(three(), 2);
    expect(shown(ws)).toEqual(['14.08.2026', '*Glasshouse Weather', 'Inbox idea']);
    ws = close(ws, 2);
    expect(shown(ws)).toEqual(['14.08.2026', '*Inbox idea']);
    ws = close(ws, ws.active);
    expect(shown(ws)).toEqual(['*14.08.2026']);
  });

  it('keeps the tab in front when another one closes', () => {
    const ws = close(activate(three(), 1), 3);
    expect(shown(ws)).toEqual(['*14.08.2026', 'Glasshouse Weather']);
  });

  it('leaves a home tab when the last one closes', () => {
    const ws = close(open(newWorkspace(), note(DAY)), 1);
    expect(shown(ws)).toEqual(['*home']);
    expect(ws.active).not.toBe(1);
  });

  it('cycles through the tabs round the ends', () => {
    const ws = three();
    expect(shown(cycle(ws, 1))[0]).toBe('*14.08.2026');
    expect(shown(cycle(ws, -1))[1]).toBe('*Glasshouse Weather');
  });
});

describe('pinning', () => {
  it('moves a pinned tab to the left, and an unpinned one back after the pinned', () => {
    let ws = openTab(openTab(open(newWorkspace(), note(DAY)), note(ALBUM)), note(INBOX));
    ws = setPinned(ws, 3, true);
    expect(shown(ws)).toEqual(['*^Inbox idea', '14.08.2026', 'Glasshouse Weather']);
    ws = setPinned(ws, 2, true);
    expect(shown(ws)).toEqual(['*^Inbox idea', '^Glasshouse Weather', '14.08.2026']);
    ws = setPinned(ws, 3, false);
    expect(shown(ws)).toEqual(['^Glasshouse Weather', '*Inbox idea', '14.08.2026']);
    expect(setPinned(ws, 2, true)).toBe(ws);
  });

  it('is not closed by ⌘W', () => {
    const ws = setPinned(open(newWorkspace(), note(DAY)), 1, true);
    expect(closeActive(ws)).toBe(ws);
    expect(shown(closeActive(setPinned(ws, 1, false)))).toEqual(['*home']);
  });

  it('opens a plain link click in a new tab, after the pinned tabs', () => {
    let ws = setPinned(openTab(open(newWorkspace(), note(DAY)), { kind: 'graph' }), 1, true);
    ws = activate(ws, 1);
    ws = open(ws, note(ALBUM));
    expect(shown(ws)).toEqual(['^14.08.2026', '*Glasshouse Weather', 'graph']);
    // The pinned tab still shows its note, and only that.
    expect(activate(ws, 1).tabs[0]?.history).toEqual([HOME, note(DAY)]);
    // Its own screen changes in place, like the editor opening.
    const editing = replaceView(activate(ws, 1), (view) => (view.kind === 'note' ? { ...view, editing: true } : view));
    expect(shown(editing)).toEqual(['*^14.08.2026', 'Glasshouse Weather', 'graph']);
  });
});

describe('text an editor could not save', () => {
  const unsaved: View = { kind: 'unsaved', path: DAY, text: 'typed', message: 'the note changed on disk' };

  it('is shown in its own tab, brought to the front', () => {
    const ws = showIn(openTab(open(newWorkspace(), note(DAY)), note(ALBUM)), 1, unsaved);
    expect(shown(ws)).toEqual(['*unsaved', 'Glasshouse Weather']);
    expect(currentView(activeTab(back(ws)))).toEqual(note(DAY));
  });

  it('is shown in a pinned tab too, in place', () => {
    const ws = showIn(setPinned(open(newWorkspace(), note(DAY)), 1, true), 1, unsaved);
    expect(shown(ws)).toEqual(['*^unsaved']);
  });

  it('gets a new tab when its tab was closed', () => {
    const ws = showIn(close(openTab(open(newWorkspace(), note(DAY)), note(ALBUM)), 1), 1, unsaved);
    expect(shown(ws)).toEqual(['Glasshouse Weather', '*unsaved']);
  });
});

describe('renaming an open note', () => {
  it('updates every tab and its history without disturbing other views or editing state', () => {
    let ws = open(newWorkspace(), { kind: 'note', path: DAY, editing: true });
    ws = open(ws, note(ALBUM));
    ws = openTab(ws, note(DAY));
    const renamed = renameNoteViews(ws, DAY, 'renamed.md');
    expect(renamed.tabs[0]?.history).toContainEqual({ kind: 'note', path: 'renamed.md', editing: true });
    expect(renamed.tabs[0]?.history).toContainEqual(note(ALBUM));
    expect(currentView(renamed.tabs[1]!)).toEqual(note('renamed.md'));
  });
});

describe('remembering the tabs', () => {
  const VAULT = '/Users/me/Kaizen';
  const notes = new Set([DAY, ALBUM, INBOX]);
  const context = { vault: VAULT, notes };

  it('keeps each tab’s screen, not its history, and comes back the same', () => {
    let ws = open(open(newWorkspace(), note(DAY)), note(ALBUM));
    ws = openTab(ws, { kind: 'library', tab: 'film' });
    ws = setPinned(ws, 2, true);
    const stored = toStored(ws, VAULT);
    expect(stored).toEqual({
      vault: VAULT,
      tabs: [
        { view: { kind: 'library', tab: 'film' }, pinned: true },
        { view: note(ALBUM), pinned: false },
      ],
      active: 0,
    });
    const back = fromStored(JSON.parse(JSON.stringify(stored)), context);
    expect(shown(back)).toEqual(['*^library', 'Glasshouse Weather']);
    expect(activeTab(back).history).toHaveLength(1);
    expect(toStored(back, VAULT)).toEqual(stored);
  });

  it('reopens an editor for reading, and keeps the screen before a message or a form', () => {
    let ws = open(newWorkspace(), { kind: 'note', path: DAY, editing: true });
    ws = open(ws, { kind: 'missing', target: 'Someday maybe' });
    ws = openTab(ws, { kind: 'new', folder: '' });
    ws = openTab(ws, { kind: 'problem', title: 'Oops', message: 'no' });
    expect(toStored(ws, VAULT).tabs.map((tab) => tab.view)).toEqual([note(DAY), HOME, HOME]);
  });

  it('starts afresh for another vault, or for anything that isn’t a stored workspace', () => {
    const stored = toStored(open(newWorkspace(), note(DAY)), VAULT);
    expect(shown(fromStored(stored, { vault: '/Users/me/Other', notes }))).toEqual(['*home']);
    for (const value of [undefined, null, 'tabs', 42, [], { vault: VAULT }, { vault: VAULT, tabs: 'no' }, { vault: VAULT, tabs: [] }]) {
      expect(shown(fromStored(value, context))).toEqual(['*home']);
    }
  });

  it('leaves out tabs that don’t hold up, and finds the tab in front among the rest', () => {
    const value = {
      vault: VAULT,
      tabs: [
        { view: note(DAY), pinned: 'yes' },
        { view: note('Gone.md') },
        { view: { kind: 'library', tab: 'games' } },
        { view: { kind: 'unsaved', path: DAY, text: 'x', message: 'y' } },
        { view: { kind: 'calendar' }, pinned: true },
        'not a tab',
        { view: note(INBOX) },
      ],
      active: 3,
    };
    const ws = fromStored(value, context);
    // The note that is gone was in front; the nearest tab left of it comes forward.
    expect(shown(ws)).toEqual(['^calendar', '*14.08.2026', 'Inbox idea']);
    expect(shown(fromStored({ ...value, active: 99 }, context))[2]).toBe('*Inbox idea');
    expect(shown(fromStored({ ...value, active: 'x' }, context))[1]).toBe('*14.08.2026');
    // Ids are fresh and the next one is free.
    expect(new Set(ws.tabs.map((tab) => tab.id)).size).toBe(3);
    expect(ws.tabs.every((tab) => tab.id < ws.next)).toBe(true);
  });

  it('brings back at most a fixed number of tabs', () => {
    const value = { vault: VAULT, tabs: Array.from({ length: MAX_STORED_TABS + 10 }, () => ({ view: { kind: 'graph' } })), active: 0 };
    expect(fromStored(value, context).tabs).toHaveLength(MAX_STORED_TABS);
  });

  it('reads only the screens it can show', () => {
    expect(parseView({ kind: 'note', path: DAY, editing: true }, notes)).toEqual(note(DAY));
    expect(parseView({ kind: 'note', path: 7 }, notes)).toBeUndefined();
    expect(parseView({ kind: 'library', tab: 'album' }, notes)).toEqual({ kind: 'library', tab: 'album' });
    expect(parseView({ kind: 'library', tab: 'all' }, notes)).toEqual({ kind: 'library', tab: 'all' });
    expect(parseView({ kind: 'library', tab: 'toString' }, notes)).toBeUndefined();
    expect(parseView({ kind: 'settings', extra: 1 }, notes)).toEqual({ kind: 'settings' });
    expect(parseView({ kind: 'new', folder: '' }, notes)).toBeUndefined();
    expect(parseView({ kind: 'toString' }, notes)).toBeUndefined();
    expect(parseView(['home'], notes)).toBeUndefined();
  });
});

describe('tab titles', () => {
  it('names a note by its title and every other screen by what it is', () => {
    expect(tabTitle(note(DAY))).toBe('14.08.2026');
    expect(tabTitle(HOME)).toBe('Home');
    expect(tabTitle({ kind: 'library', tab: 'book' })).toBe('Library');
    expect(tabTitle({ kind: 'missing', target: 'Someday maybe' })).toBe('Someday maybe');
  });
});

describe('the right sidebar', () => {
  it('is closed with every panel open until the settings say otherwise', () => {
    expect(parseRightSidebar(undefined)).toEqual({ open: false, closed: [] });
    expect(parseRightSidebar({ open: true, closed: ['graph'] })).toEqual({ open: true, closed: ['graph'] });
  });

  it('keeps only what holds up', () => {
    expect(parseRightSidebar({ open: 'yes', closed: ['graph', 'outline', 3, 'graph'] })).toEqual({ open: false, closed: ['graph'] });
    expect(parseRightSidebar({ open: true, closed: 'backlinks' })).toEqual({ open: true, closed: [] });
    expect(parseRightSidebar([true])).toEqual({ open: false, closed: [] });
  });
});
