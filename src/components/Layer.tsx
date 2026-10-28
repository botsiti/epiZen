import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Draws a menu or a dialog over the window, in the document's body. Inside a page, `position:
 * fixed` would measure from the page's frame (its `container-type` makes it the containing
 * block), and a menu meant for the pointer would open somewhere else, or off screen. Give the
 * layer's root `periodic-layer` for the pages' tokens.
 */
export function Layer({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}
