import { useState } from 'react';
import { SHORTCUT_REFERENCE } from './shortcuts';
import './shortcuts.css';

export function ShortcutReference() {
  const [filter, setFilter] = useState('');
  const query = filter.trim().toLocaleLowerCase();
  const matches = SHORTCUT_REFERENCE.filter(({ label, keys, group }) => `${label} ${keys} ${group}`.toLocaleLowerCase().includes(query));
  return <section className="workspace-shortcuts" aria-label="Keyboard shortcuts" data-testid="keyboard-shortcuts">
    <div className="shortcuts-tools"><label>Filter shortcuts<input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Find a command or key…" /></label>
      <p>⌘ Command · ⌃ Control · ⌥ Option · ⇧ Shift</p></div>
    <div className="shortcut-groups">{['Workspace', 'Navigation', 'Spike', 'Tabs', 'Markdown'].map((group) => {
      const commands = matches.filter((item) => item.group === group);
      return commands.length > 0 && <section key={group}><h3>{group}</h3><dl>
        {commands.map(({ label, keys }) => <div className="workspace-shortcut" key={label}><dt>{label}</dt><dd><kbd>{keys}</kbd></dd></div>)}
      </dl></section>;
    })}</div>
    {matches.length === 0 && <p role="status">No shortcuts match “{filter}”.</p>}
    <p>Today opens your daily note, creating it if needed. Workspace shortcuts pause while a dialog is open.</p>
  </section>;
}
