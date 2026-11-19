import { useId, useState, type CSSProperties } from 'react';
import { PreferenceIcon } from './icons';

interface Item { id: string; name: string; color: string; archived: boolean; discardable?: boolean }
interface Props {
  title: string;
  noun: 'sphere' | 'category';
  description?: string;
  items: Item[];
  onAdd: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onArchive: (id: string, archived: boolean) => void;
  onDiscard: (id: string) => void;
}

/** Names are editable where they appear. The colour stays anchored while the field is focused. */
export function SettingsNameList({ title, noun, description, items, onAdd, onRename, onArchive, onDiscard }: Props) {
  const heading = useId();
  const [added, setAdded] = useState<string>();
  const archived = items.filter((item) => item.archived);
  function row(item: Item) {
    const label = item.name || `new ${noun}`;
    const emptyAddition = item.discardable && !item.name.trim();
    const action = emptyAddition ? 'Discard' : item.archived ? 'Restore' : 'Archive';
    return <li key={item.id} className="catalog-row" style={{ '--item-color': item.color } as CSSProperties}>
      <label className="catalog-name">
        <span className="settings-color-dot" aria-hidden="true" />
        <input aria-label={`${noun === 'sphere' ? 'Sphere' : 'Category'} name · ${label}`} placeholder={`New ${noun}`} maxLength={80}
          autoFocus={added === item.id} value={item.name} onChange={(event) => onRename(item.id, event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Escape' && emptyAddition) { event.preventDefault(); onDiscard(item.id); }
            if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} />
        <PreferenceIcon name="edit" />
      </label>
      <button type="button" className="catalog-action" aria-label={`${action} ${noun} ${label}`} title={action === 'Archive' ? `Archive ${noun} and keep its earned XP` : `${action} ${noun}`} onClick={() => emptyAddition ? onDiscard(item.id) : onArchive(item.id, !item.archived)}>
        <PreferenceIcon name={emptyAddition ? 'remove' : item.archived ? 'restore' : 'archive'} />
      </button>
    </li>;
  }
  return <section className="settings-catalog" aria-labelledby={heading} data-testid={noun === 'sphere' ? 'life-sphere-list' : 'task-category-list'}>
    <header className="rules-heading"><h3 id={heading}>{title}</h3>
      <button type="button" className="catalog-add" aria-label={`Add ${noun}`} title={`Add ${noun}`} onClick={() => {
        const id = crypto.randomUUID(); setAdded(id); onAdd(id);
      }}><PreferenceIcon name="plus" /></button>
    </header>
    {description && <p className="rules-note">{description}</p>}
    <ul className="catalog-grid">{items.filter((item) => !item.archived).map(row)}</ul>
    {archived.length > 0 && <details className="catalog-archived"><summary>Archived {noun === 'sphere' ? 'spheres' : 'categories'} ({archived.length})</summary>
      <ul className="catalog-grid">{archived.map(row)}</ul></details>}
  </section>;
}
