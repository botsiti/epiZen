import { useEffect, useRef } from 'react';
import { onMenu } from '../../lib/api';

export interface ShortcutActions {
  newTab: () => void;
  closeTab: () => void;
  toggleRightSidebar: () => void;
  back: () => void;
  forward: () => void;
  /** The next tab (1) or the one before (-1). */
  cycle: (step: 1 | -1) => void;
  /** The tab at this place, from 0; past the end, the last one. */
  showTab: (place: number) => void;
}

/**
 * The letter or sign a key press means for a shortcut. Under a layout that types something else
 * there (Cyrillic, say), the key's place on a US keyboard, as macOS's own menus do.
 */
function keyOf(event: KeyboardEvent): string {
  if (event.key.length === 1 && event.key.charCodeAt(0) < 128) return event.key.toLowerCase();
  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3).toLowerCase();
  if (/^Digit\d$/.test(event.code)) return event.code.slice(5);
  return { BracketLeft: '[', BracketRight: ']' }[event.code] ?? event.key;
}

/** Typing in a field: ⌘[ and ⌘] belong to it there (the editor indents with them). */
const inField = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || target.matches('input, textarea, select'));

/**
 * The workspace's keys: ⌘T a new tab, ⌘W closes the tab in front, ⌥⌘B the right sidebar, ⌘[ and
 * ⌘] back and forward, ⌃Tab (⇧ for back) or ⇧⌘] and ⇧⌘[ the next and previous tab, ⌘1–⌘9 a tab
 * by its place. The menu bar's items for them (src-tauri/src/menu.rs) land here too. ⌘W is always
 * taken, so it never closes the window; while a dialog is open, it and ⌘T do nothing.
 */
export function useShortcuts(actions: ShortcutActions) {
  const latest = useRef(actions);
  useEffect(() => {
    latest.current = actions;
  }, [actions]);

  useEffect(() => {
    const dialogOpen = () => document.querySelector('[aria-modal="true"]') !== null;
    const press = (event: KeyboardEvent) => {
      const act = latest.current;
      const key = keyOf(event);
      if (event.ctrlKey && !event.metaKey && !event.altKey && event.key === 'Tab') {
        event.preventDefault();
        act.cycle(event.shiftKey ? -1 : 1);
        return;
      }
      if (!event.metaKey || event.ctrlKey) return;
      const run = (action: () => void) => {
        event.preventDefault();
        action();
      };
      if (event.altKey) {
        if (key === 'b' && !event.shiftKey) run(act.toggleRightSidebar);
        return;
      }
      if (event.shiftKey) {
        if (key === '[' || key === '{') run(() => act.cycle(-1));
        else if (key === ']' || key === '}') run(() => act.cycle(1));
        return;
      }
      if (key === 'w') run(() => !dialogOpen() && act.closeTab());
      else if (key === 't') run(() => !dialogOpen() && act.newTab());
      else if ((key === '[' || key === ']') && !inField(event.target)) run(key === '[' ? act.back : act.forward);
      else if (/^[1-9]$/.test(key)) run(() => act.showTab(key === '9' ? Infinity : Number(key) - 1));
    };
    window.addEventListener('keydown', press);
    let stopMenu: (() => void) | undefined;
    let gone = false;
    onMenu((item) => {
      const act = latest.current;
      if (item === 'right-sidebar') act.toggleRightSidebar();
      else if (dialogOpen()) return;
      else if (item === 'new-tab') act.newTab();
      else act.closeTab();
    })
      .then((stop) => (gone ? stop() : (stopMenu = stop)))
      .catch(() => undefined);
    return () => {
      gone = true;
      window.removeEventListener('keydown', press);
      stopMenu?.();
    };
  }, []);
}
