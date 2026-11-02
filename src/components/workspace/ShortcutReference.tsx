import { useId, useState } from 'react';
import { SHORTCUT_REFERENCE } from './shortcuts';
import './shortcuts.css';

export function ShortcutReference() {
  const heading = useId();
  const [filter, setFilter] = useState('');
  const query = filter.trim().toLocaleLowerCase();
  const matches = SHORTCUT_REFERENCE.filter(({ label, keys }) => `${label} ${keys}`.toLocaleLowerCase().includes(query));
  return (
    <section className="workspace-shortcuts" aria-labelledby={heading} data-testid="keyboard-shortcuts">
      <h2 id={heading}>Keyboard shortcuts</h2>
      <p>⌘ Command · ⌃ Control · ⌥ Option · ⇧ Shift</p>
      <label className="field">
        <span>Filter shortcuts</span>
        <input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Find a command…" />
      </label>
      <dl>
        {matches.map(({ label, keys }) => <div className="workspace-shortcut" key={label}><dt>{label}</dt><dd><kbd>{keys}</kbd></dd></div>)}
      </dl>
      {matches.length === 0 && <p role="status">No shortcuts match “{filter}”.</p>}
      <p>Today opens your daily note, creating it if needed. Workspace shortcuts pause while a dialog is open.</p>
    </section>
  );
}
