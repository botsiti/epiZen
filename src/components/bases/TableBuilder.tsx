import { useMemo, useState, type FormEvent } from 'react';
import { tableSource, type TableDraft } from '../../lib/bases/bases';
import { noteFolder } from '../../lib/links';
import { BaseBlock } from './BaseBlock';
import { useBases } from './context';

interface Props { path: string; onSave: (source: string) => Promise<void>; onCancel: () => void; onOpenLink: (target: string, from: string, newTab?: boolean) => void }
export function TableBuilder({ path, onSave, onCancel, onOpenLink }: Props) {
  const data = useBases();
  const [draft, setDraft] = useState<TableDraft>({ name: 'Table', folder: noteFolder(path), columns: ['file.name'], filters: [], sort: { property: 'file.name', direction: 'ASC' } });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const folders = useMemo(() => [...new Set([noteFolder(path), ...(data?.rows.map((row) => noteFolder(row.path)) ?? [])])].filter(Boolean).sort(), [data, path]);
  const properties = useMemo(() => ['file.name', 'file.folder', 'file.ctime', 'file.mtime', ...[...new Set((data?.rows ?? []).filter((row) => !draft.folder || noteFolder(row.path) === draft.folder || row.path.startsWith(`${draft.folder}/`)).flatMap((row) => Object.keys(row.properties).map((name) => `note.${name}`)))].sort()], [data, draft.folder]);
  const preview = useMemo(() => {
    try { return { source: tableSource(draft) }; } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
  }, [draft]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !preview.source) return;
    setBusy(true); setError(undefined);
    try { await onSave(preview.source); }
    catch (error) { setError(String(error)); }
    finally { setBusy(false); }
  };
  const labels: Record<string, string> = { 'file.name': 'Name', 'file.folder': 'Folder', 'file.ctime': 'Created', 'file.mtime': 'Modified' };
  const label = (name: string) => labels[name] ?? name.replace(/^note\./, '');
  return <section className="base-builder" aria-label="Add a vault table" data-testid="table-builder">
    <h2>Add a table</h2><p>Choose notes and properties from your vault. The table stays up to date as you edit them.</p>
    <form onSubmit={(event) => void submit(event)}>
      <fieldset disabled={busy} className="base-builder-fields">
        <div className="base-builder-pair"><label>View name<input autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label>Notes from<select value={draft.folder} onChange={(event) => setDraft({ ...draft, folder: event.target.value })}><option value="">Whole vault</option>{folders.map((folder) => <option key={folder}>{folder}</option>)}</select></label></div>
        <fieldset className="base-columns"><legend>Columns</legend>{[...new Set([...properties, ...draft.columns])].map((property) => <label key={property}><input type="checkbox" checked={draft.columns.includes(property)} onChange={(event) => setDraft({ ...draft, columns: event.target.checked ? [...draft.columns, property] : draft.columns.filter((item) => item !== property) })} />{label(property)}</label>)}</fieldset>
        <fieldset className="base-filters"><legend>Match all filters</legend>{draft.filters.map((filter, index) => <div className="base-filter" key={index}>
          <select aria-label={`Filter ${index + 1} property`} value={filter.property} onChange={(event) => setDraft({ ...draft, filters: draft.filters.map((item, i) => i === index ? { ...item, property: event.target.value } : item) })}><option value="">Choose property…</option>{properties.map((property) => <option key={property} value={property}>{label(property)}</option>)}</select>
          <select aria-label={`Filter ${index + 1} comparison`} value={filter.operator} onChange={(event) => setDraft({ ...draft, filters: draft.filters.map((item, i) => i === index ? { ...item, operator: event.target.value } : item) })}>{[['==', 'is'], ['!=', 'is not'], ['contains', 'contains'], ['>=', 'at least / on or after'], ['<=', 'at most / on or before'], ['>', 'greater than / after'], ['<', 'less than / before']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <input aria-label={`Filter ${index + 1} value`} value={filter.value} placeholder="Value or YYYY-MM-DD" onChange={(event) => setDraft({ ...draft, filters: draft.filters.map((item, i) => i === index ? { ...item, value: event.target.value } : item) })} />
          <button type="button" className="quiet-button" aria-label={`Remove filter ${index + 1}`} onClick={() => setDraft({ ...draft, filters: draft.filters.filter((_, i) => i !== index) })}>×</button>
        </div>)}<button type="button" className="quiet-button" onClick={() => setDraft({ ...draft, filters: [...draft.filters, { property: '', operator: '==', value: '' }] })}>Add filter</button></fieldset>
        <div className="base-builder-pair"><label>Sort by<select value={draft.sort.property} onChange={(event) => setDraft({ ...draft, sort: { ...draft.sort, property: event.target.value } })}>{properties.map((property) => <option key={property} value={property}>{label(property)}</option>)}</select></label><label>Direction<select value={draft.sort.direction} onChange={(event) => setDraft({ ...draft, sort: { ...draft.sort, direction: event.target.value === 'DESC' ? 'DESC' : 'ASC' } })}><option value="ASC">Ascending</option><option value="DESC">Descending</option></select></label></div>
      </fieldset>
      {preview.error && <p className="base-message" role="status">{preview.error}</p>}
      {error && <p className="base-message" role="alert">Couldn’t add the table. Your choices are still here. {error}</p>}
      <div className="base-builder-actions"><button type="button" className="quiet-button" disabled={busy} onClick={onCancel}>Cancel</button><button type="submit" className="quiet-button" disabled={busy || !preview.source}>{busy ? 'Adding…' : 'Add to note'}</button></div>
    </form>
    {preview.source && <div className="base-preview"><p>Preview</p><BaseBlock source={preview.source} path={path} onOpenLink={onOpenLink} /></div>}
  </section>;
}
