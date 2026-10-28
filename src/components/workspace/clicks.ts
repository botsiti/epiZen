import type { MouseEvent } from 'react';
import { opensInNewTab } from '../../lib/tabs';

/**
 * The click handlers of anything that opens a note or a view: a plain click opens it in the tab in
 * front, a ⌘-click or a middle click in a new tab. A right click is left for the menu.
 */
export function openClicks(open: (newTab: boolean) => void) {
  return {
    onClick: (event: MouseEvent) => {
      event.preventDefault();
      open(opensInNewTab(event));
    },
    onAuxClick: (event: MouseEvent) => {
      if (event.button !== 1) return;
      event.preventDefault();
      open(true);
    },
  };
}
