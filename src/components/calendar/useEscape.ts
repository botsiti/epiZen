import { useEffect, useRef } from 'react';

/** Calls `onEscape` when Escape is pressed anywhere, while the component is shown. */
export function useEscape(onEscape: () => void) {
  const handler = useRef(onEscape);
  useEffect(() => {
    handler.current = onEscape;
  }, [onEscape]);
  useEffect(() => {
    const listen = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handler.current();
    };
    window.addEventListener('keydown', listen);
    return () => window.removeEventListener('keydown', listen);
  }, []);
}
