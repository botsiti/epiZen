import { useEffect, useRef } from 'react';
import { onMenu } from '../../lib/api';
import { SHORTCUTS, type ShortcutAction } from './shortcuts';

export interface ShortcutActions extends Record<ShortcutAction, () => void> {
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
  return { BracketLeft: '[', BracketRight: ']', Comma: ',' }[event.code] ?? event.key;
}

/** Typing in a field: ⌘[ and ⌘] belong to it there (the editor indents with them). */
const inField = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [contenteditable="true"]') !== null);

/**
 * Workspace commands and tab navigation. Text fields keep their editing shortcuts. Modal
 * dialogs pause workspace actions; recognized keys are still consumed to avoid native fallback.
 */
export function useShortcuts(actions: ShortcutActions, enabled = true) {
  const latest = useRef(actions);
  useEffect(() => {
    latest.current = actions;
  }, [actions]);

  useEffect(() => {
    const dialogOpen = () => document.querySelector('[aria-modal="true"]') !== null;
    const press = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const act = latest.current;
      const key = keyOf(event);
      const run = (action: () => void) => {
        event.preventDefault();
        if (enabled && !dialogOpen() && !event.repeat) action();
      };
      const shortcut = SHORTCUTS.find((binding) => {
        const control = 'control' in binding && binding.control;
        return key === binding.key && event.ctrlKey === Boolean(control) && event.metaKey === !control
          && event.altKey === Boolean('alt' in binding && binding.alt) && event.shiftKey === Boolean('shift' in binding && binding.shift);
      });
      if (shortcut) {
        run(act[shortcut.action]);
        return;
      }
      if (event.ctrlKey && !event.metaKey && !event.altKey && event.key === 'Tab') {
        run(() => act.cycle(event.shiftKey ? -1 : 1));
        return;
      }
      if (!event.metaKey || event.ctrlKey) return;
      if (event.altKey) {
        if (!event.shiftKey && /^[1-9]$/.test(key)) run(() => act.showTab(key === '9' ? Infinity : Number(key) - 1));
        return;
      }
      if (event.shiftKey) {
        if (key === '[' || key === '{') run(() => act.cycle(-1));
        else if (key === ']' || key === '}') run(() => act.cycle(1));
        return;
      }
      if ((key === '[' || key === ']') && !inField(event.target)) run(key === '[' ? act.back : act.forward);
      else if (/^[1-68]$/.test(key)) run(() => act.showTab(Number(key) - 1));
    };
    window.addEventListener('keydown', press);
    let stopMenu: (() => void) | undefined;
    let gone = false;
    onMenu((item) => {
      const act = latest.current;
      if (gone || !enabled || dialogOpen()) return;
      const action = {
        'new-tab': act.newTab,
        'close-tab': act.closeTab,
        'left-sidebar': act.toggleLeftSidebar,
        'right-sidebar': act.toggleRightSidebar,
        'collapse-folders': act.collapseFolders,
        'new-note': act.newNote,
        settings: act.settings,
        home: act.home,
        library: act.library,
        today: act.today,
      }[item];
      action?.();
    })
      .then((stop) => (gone ? stop() : (stopMenu = stop)))
      .catch(() => undefined);
    return () => {
      gone = true;
      window.removeEventListener('keydown', press);
      stopMenu?.();
    };
  }, [enabled]);
}
