import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** A short, contained schedule edit that leaves the routine's scroll position in place. */
export function HabitDialog({ children, title, busy, onCancel }: { children: ReactNode; title: string; busy: boolean; onCancel: () => void }) {
  const node = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    node.current?.querySelector<HTMLElement>('input, button')?.focus();
    return () => previous?.focus();
  }, []);
  return createPortal(<div className="periodic-layer habits-dialog"><div ref={node} role="dialog" aria-modal="true" aria-label={title} onKeyDown={(event) => {
    if (event.key === 'Escape' && !busy) { event.preventDefault();event.stopPropagation();onCancel(); }
    if (event.key !== 'Tab') return;
    const fields = [...(node.current?.querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]') ?? [])];
    const first = fields[0];const last = fields.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault();last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault();first?.focus(); }
  }}>{children}</div></div>, document.body);
}
