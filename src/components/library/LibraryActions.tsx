import { useEffect, useRef, useState } from 'react';
import type { MediaEntry } from '../../lib/library';
import { Layer } from '../Layer';
import { useEscape } from '../calendar/useEscape';
import { LibraryDialog } from './LibraryDialog';

export interface LibrarySelection { entry: MediaEntry; x: number; y: number }

export function LibraryActions({ selection, onClose, onOpen, onDelete }: { selection: LibrarySelection; onClose: () => void; onOpen: (path: string, newTab?: boolean) => void; onDelete?: (path: string) => Promise<string> }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const menu = useRef<HTMLDivElement>(null);
  useEscape(() => { if (!busy && !confirm) onClose(); });
  useEffect(() => { menu.current?.querySelector('button')?.focus(); }, []);
  const remove = async () => {
    if (!onDelete) return;
    setBusy(true); setError('');
    try { await onDelete(selection.entry.path); onClose(); }
    catch (err) { setError(String(err)); setBusy(false); }
  };
  if (confirm) return <LibraryDialog title={`Delete “${selection.entry.title}”?`} onClose={() => { if (!busy) onClose(); }}>
    <div className="add-body"><p className="muted">The Markdown file will move to this vault’s .trash folder. You can restore it from there.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="add-actions"><button type="button" className="nav-chip" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="primary-button" disabled={busy} onClick={() => void remove()} data-testid="library-delete-confirm">{busy ? 'Moving…' : 'Move to trash'}</button></div>
    </div>
  </LibraryDialog>;
  return <Layer><div className="library-menu-backdrop periodic-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()} onContextMenu={(event) => { event.preventDefault(); onClose(); }}>
    <div ref={menu} role="menu" aria-label={selection.entry.title} className="tool-menu library-context-menu" style={{ left: Math.max(8, Math.min(selection.x, window.innerWidth - 240)), top: Math.max(8, Math.min(selection.y, window.innerHeight - 180)) }} onKeyDown={(event) => {
      const buttons = [...event.currentTarget.querySelectorAll('button')];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); buttons[(index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus(); }
      if (event.key === 'Tab') onClose();
    }}>
      <p className="tool-label">{selection.entry.title}</p>
      <button type="button" role="menuitem" className="tool-item" onClick={() => { onOpen(selection.entry.path, true); onClose(); }}>Open in new tab <span className="tool-item-hint">⌘↵</span></button>
      {onDelete && <button type="button" role="menuitem" className="tool-item" onClick={() => setConfirm(true)} data-testid="library-delete">Delete note…</button>}
    </div>
  </div></Layer>;
}
