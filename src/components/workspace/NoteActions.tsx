import { useEffect, useRef, useState } from 'react';
import { noteFolder, noteTitle } from '../../lib/links';
import { noteNameProblem, textIdentity } from '../../lib/text';
import { Layer } from '../Layer';
import { useEscape } from '../calendar/useEscape';
import { LibraryDialog } from '../library/LibraryDialog';

export type NoteAction = 'rename' | 'move' | 'duplicate' | 'delete' | 'reveal';
export function NoteMenu({ path, x, y, onPick, onClose }: { path: string; x: number; y: number; onPick: (action: NoteAction) => void; onClose: () => void }) {
  const menu = useRef<HTMLDivElement>(null);
  useEscape(onClose);
  useEffect(() => { menu.current?.querySelector('button')?.focus(); }, []);
  return <Layer><div className="tab-menu-backdrop" onMouseDown={onClose} onContextMenu={(event) => event.preventDefault()}>
    <div ref={menu} className="tab-menu" role="menu" aria-label={noteTitle(path)} style={{ left: Math.max(8, Math.min(x, window.innerWidth - 200)), top: Math.max(8, Math.min(y, window.innerHeight - 215)) }} onMouseDown={(event) => event.stopPropagation()} data-testid="note-menu" onKeyDown={(event) => {
      const buttons = [...event.currentTarget.querySelectorAll('button')];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); buttons[(index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus(); }
      if (event.key === 'Tab') onClose();
    }}>
      {([['duplicate', 'Duplicate'], ['reveal', 'Reveal in Finder'], ['rename', 'Rename…'], ['move', 'Move to folder…'], ['delete', 'Delete…']] as const).map(([action, label]) => <button type="button" role="menuitem" key={action} onClick={() => onPick(action)}>{label}</button>)}
    </div>
  </div></Layer>;
}

export function NoteActionDialog({ path, action, folders, updateLinks, onClose, onRun }: { path: string; action: Exclude<NoteAction, 'reveal'>; folders: string[]; updateLinks: boolean; onClose: () => void; onRun: (action: Exclude<NoteAction, 'reveal'>, path: string, name: string) => Promise<void> }) {
  const title = noteTitle(path);
  const [name, setName] = useState(action === 'duplicate' ? `${title} copy` : title);
  const [query, setQuery] = useState('');
  const [destination, setDestination] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async () => {
    const problem = action === 'move' ? destination === undefined ? 'Choose a destination folder.' : undefined : action === 'delete' ? undefined : noteNameProblem(name);
    if (problem) { setError(problem); return; }
    setBusy(true); setError('');
    try { await onRun(action, path, action === 'move' ? destination! : name.trim()); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); setBusy(false); }
  };
  const close = () => { if (!busy) onClose(); };
  const verb = { rename: 'Rename', duplicate: 'Duplicate', delete: 'Delete', move: 'Move' }[action];
  const matching = ['', ...folders].filter((folder) => folder !== noteFolder(path) && textIdentity(folder || 'Top of the vault').includes(textIdentity(query)));
  return <LibraryDialog title={`${verb} “${title}”`} onClose={close}>
    <form className="add-body" onSubmit={(event) => { event.preventDefault(); void run(); }}>
      {action === 'move' ? <>
        <label className="note-action-label">Find a folder<input type="search" autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setDestination(undefined); }} /></label>
        <div className="move-folder-list" aria-label="Destination folders">
          {matching.map((folder) => <button type="button" className="quiet-button" key={folder} aria-pressed={destination === folder} onClick={() => setDestination(folder)}>{folder || 'Top of the vault'}</button>)}
          {!matching.length && <p role="status" className="muted">No matching folders.</p>}
        </div>
      </> : action === 'delete' ? <p className="muted">The note will move to this vault’s .trash folder, where it can be restored.</p> : <label className="note-action-label">Filename<input autoFocus value={name} onChange={(event) => setName(event.target.value)} aria-label="Filename" data-testid="note-action-name" /></label>}
      {(action === 'rename' || action === 'move') && updateLinks && <p className="muted">Links to this note will update automatically.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="add-actions"><button type="button" className="nav-chip" disabled={busy} onClick={close}>Cancel</button><button type="submit" className="primary-button" disabled={busy || (action === 'move' && destination === undefined)} data-testid="note-action-confirm">{busy ? 'Working…' : action === 'delete' ? 'Move to trash' : verb}</button></div>
    </form>
  </LibraryDialog>;
}
