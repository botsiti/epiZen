import { useEffect, useRef, type ReactNode } from 'react';
import { Layer } from '../Layer';
import { useEscape } from '../calendar/useEscape';

export function LibraryDialog({ title, onClose, children, footer, className = '' }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; className?: string }) {
  const panel = useRef<HTMLDivElement>(null);
  useEscape(onClose);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  return <Layer><div className="add-backdrop periodic-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <div ref={panel} className={`add-sheet library-dialog ${className}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onKeyDown={(event) => {
      if (event.key !== 'Tab') return;
      const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]')];
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first?.focus(); }
    }}>
      <div className="add-top"><h2 className="add-title">{title}</h2><button type="button" className="wizard-round is-small" onClick={onClose} aria-label="Close">×</button></div>
      {children}
      {footer && <div className="library-dialog-foot">{footer}</div>}
    </div>
  </div></Layer>;
}
