import { useCallback, useLayoutEffect, useRef, type RefObject, type UIEvent } from 'react';

/**
 * Each tab keeps its own scroll position in the main pane. A new screen in a tab starts at the
 * top, as before; coming back to a tab scrolls to where it was, once its screen has loaded (for a
 * second at most, and only until the user scrolls). Returns the pane's `onScroll`.
 */
export function useScrollMemory(main: RefObject<HTMLElement | null>, tab: number, place: string) {
  const positions = useRef(new Map<number, number>());
  const shown = useRef({ tab, place });
  const restoring = useRef(false);

  const onScroll = useCallback((event: UIEvent<HTMLElement>) => {
    if (!restoring.current) positions.current.set(shown.current.tab, event.currentTarget.scrollTop);
  }, []);

  useLayoutEffect(() => {
    const element = main.current;
    const before = shown.current;
    shown.current = { tab, place };
    if (!element) return;
    if (before.tab === tab) {
      if (before.place !== place) {
        element.scrollTo(0, 0);
        positions.current.set(tab, 0);
      }
      return;
    }
    const target = positions.current.get(tab) ?? 0;
    let frame = 0;
    let tries = 0;
    const stop = () => {
      cancelAnimationFrame(frame);
      restoring.current = false;
      element.removeEventListener('wheel', stop);
      element.removeEventListener('pointerdown', stop);
      window.removeEventListener('keydown', stop);
    };
    const attempt = () => {
      element.scrollTop = target;
      tries += 1;
      if (Math.abs(element.scrollTop - target) < 1 || tries > 60) stop();
      else frame = requestAnimationFrame(attempt);
    };
    restoring.current = true;
    element.addEventListener('wheel', stop, { passive: true });
    element.addEventListener('pointerdown', stop);
    window.addEventListener('keydown', stop);
    attempt();
    return stop;
  }, [main, tab, place]);

  return onScroll;
}
