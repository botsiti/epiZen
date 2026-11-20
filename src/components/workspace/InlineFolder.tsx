import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { noteNameProblem } from '../../lib/text';

export function InlineFolder({ parent, depth, onCreate, onClose }: {
  parent: string; depth: number; onCreate: (path: string) => Promise<void>; onClose: () => void;
}) {
  const [name, setName] = useState('Untitled folder');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    input.current?.focus();
    input.current?.select();
    input.current?.scrollIntoView?.({ block: 'nearest' });
  }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const problem = noteNameProblem(name);
    if (problem) { setError(problem.replaceAll('note', 'folder')); return; }
    const label = name.trim().normalize('NFC');
    setBusy(true);
    setError('');
    try {
      await onCreate(parent ? `${parent}/${label}` : label);
      onClose();
    } catch (err) {
      setError(String(err));
      setBusy(false);
    }
  };
  return <li role="none" className="tree-create" style={{ marginLeft: 12 + depth * 16 }}>
    <form onSubmit={(event) => void submit(event)} onKeyDown={(event) => {
      if (event.key === 'Escape' && !busy) { event.stopPropagation(); event.preventDefault(); onClose(); }
    }}>
      <div className="tree-create-line">
        <input ref={input} aria-label="Folder name" title={parent || 'Top of the vault'} value={name} onChange={(event) => setName(event.target.value)} disabled={busy} data-testid="new-folder-name" />
        <button type="submit" className="icon-button" title="Create folder" aria-label="Create folder" disabled={busy} data-testid="new-folder-create">✓</button>
        <button type="button" className="icon-button" title="Cancel" aria-label="Cancel folder creation" disabled={busy} onClick={onClose}>×</button>
      </div>
      {error && <p className="tree-action-error" role="alert">{error}</p>}
    </form>
  </li>;
}
