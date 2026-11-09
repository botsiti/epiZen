import { useState, type ReactNode } from 'react';
import { parse, stringify } from 'yaml';
import { summarize, type BaseRow, type BaseView, type BaseSort } from '../../lib/bases/bases';
import { kind, ownValue, textValue, type Value } from '../../lib/bases/values';
import { findWikilinks, noteTitle, resolveLink } from '../../lib/links';
import { parseNote } from '../../lib/frontmatter';
import { openClicks } from '../workspace/clicks';
import { VaultImage } from '../VaultImage';
import { useBases } from './context';

type Open = (target: string, from: string, newTab?: boolean) => void;
export function BaseRows({ rows, path, summaryRows = rows, view, sort, onSort, onOpen }: { rows: BaseRow[]; path: string; summaryRows?: BaseRow[]; view: BaseView; sort: BaseSort[]; onSort: (sort: BaseSort[]) => void; onOpen: Open }) {
  const data = useBases();
  const [editing, setEditing] = useState<{ row: BaseRow; property: string; before: unknown }>();
  const open = (target: string, from: string) => openClicks((newTab) => onOpen(target, from, newTab));
  const cell = (row: BaseRow, property: string): ReactNode => {
    try {
      if (['file.name', 'file.path', 'file.file'].includes(property)) return <a href="#" className="wikilink" title={row.path} {...open(row.path, path)}>{property === 'file.path' ? row.path : noteTitle(row.path)}</a>;
      return <BaseCell value={view.value(row, property)} from={row.path} onOpen={onOpen} />;
    } catch (error) { return <span className="base-value-error" title={String(error)}>Formula error</span>; }
  };
  const begin = (row: BaseRow, property: string) => {
    if (!data?.onEditProperty || row.file.kind !== 'note' || /^(file|formula)\./.test(property)) return;
    const props = parseNote(data.texts.get(row.path) ?? '').properties, key = property.replace(/^note\./, '');
    const actual = Object.hasOwn(props, key) ? key : Object.keys(props).find((name) => name.toLowerCase() === key.toLowerCase()) ?? key;
    setEditing({ row, property: actual, before: props[actual] ?? null });
  };
  if (view.type === 'cards') return <div className="base-card-grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${view.cardSize}px), 1fr))` }}>{rows.map((row) => <article className="base-card" key={row.path} data-path={row.path}>
    {view.image && <Cover row={row} view={view} />}
    <div className="base-card-content">{view.columns.map((column, index) => <div className={index ? 'base-card-property' : 'base-card-title'} key={column.property}>{index > 0 && <span>{column.label}</span>}{cell(row, column.property)}</div>)}{!view.columns.length && <a href="#" {...open(row.path, row.path)}>{noteTitle(row.path)}</a>}</div>
  </article>)}</div>;
  if (view.type === 'list') return <ol className={`base-list base-list-${view.listMarker}`}>{rows.map((row) => <li key={row.path} data-path={row.path}>{view.columns.map((column, index) => <span className={view.indent && index > 0 ? 'base-list-detail' : undefined} key={column.property}>{index > 0 && !view.indent && <span className="base-list-separator">{view.listSeparator}</span>}{cell(row, column.property)}</span>)}</li>)}</ol>;
  return <div className="base-scroll" tabIndex={0} role="region" aria-label={`${view.name} rows`}><table><thead><tr>{view.columns.map((column) => <th key={column.property} scope="col" style={column.width ? { minWidth: column.width, width: column.width } : undefined} aria-sort={sort[0]?.property === column.property ? sort[0].direction === 'ASC' ? 'ascending' : 'descending' : 'none'}><button type="button" onClick={() => onSort([{ property: column.property, direction: sort[0]?.property === column.property && sort[0].direction === 'ASC' ? 'DESC' : 'ASC' }])}>{column.label}<span aria-hidden="true">{sort[0]?.property === column.property ? sort[0].direction === 'ASC' ? ' ↑' : ' ↓' : ''}</span></button></th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.path} data-path={row.path}>{view.columns.map((column) => {
    const editable = Boolean(data?.onEditProperty) && row.file.kind === 'note' && !/^(file|formula)\./.test(column.property);
    const current = editing?.row.path === row.path && editing.property.toLowerCase() === column.property.replace(/^note\./, '').toLowerCase();
    return <td key={column.property} onDoubleClick={() => begin(row, column.property)}>{current && editing ? <PropertyEditor initial={editing.before} label={column.label} onCancel={() => setEditing(undefined)} onSave={async (value) => { await data!.onEditProperty!(row.path, editing.property, editing.before, value); setEditing(undefined); }} /> : <><span>{cell(row, column.property)}</span>{editable && <button type="button" className="base-edit-property" aria-label={`Edit ${column.label} in ${noteTitle(row.path)}`} title="Edit property" onClick={() => begin(row, column.property)}>✎</button>}</>}</td>;
  })}</tr>)}</tbody>{Object.keys(view.summaries).length > 0 && <tfoot><tr>{view.columns.map((column) => {
    const name = view.summaries[column.property]; let value: Value = null;
    try { if (name) value = summarize(summaryRows.map((row) => view.value(row, column.property)), name, view.summaryDefinitions); } catch { value = 'Summary error'; }
    return <td key={column.property}>{name && <><small>{name}</small><BaseCell value={value} from="" onOpen={onOpen} /></>}</td>;
  })}</tr></tfoot>}</table>{!view.columns.length && <p className="base-message">Choose columns in Properties.</p>}</div>;
}

function Cover({ row, view }: { row: BaseRow; view: BaseView }) {
  const data = useBases(); let value: Value;
  try { value = view.value(row, view.image!); } catch { value = null; }
  const raw = kind(value, 'image') || kind(value, 'link') ? textValue(ownValue(value, 'path')) : textValue(value);
  const target = findWikilinks(raw)[0]?.target ?? raw;
  const file = resolveLink(target, data?.files ?? [], row.path);
  return <div className={`base-card-cover is-${view.imageFit}`} style={{ aspectRatio: view.imageAspectRatio, ...(/^#[0-9a-f]{6}$/i.test(raw) ? { backgroundColor: raw } : {}) }}>{file?.kind === 'image' ? <VaultImage lazy path={file.path} alt={`${noteTitle(row.path)} cover`} className="base-cover-image" /> : /^https?:/.test(raw) ? <span title={raw}>External image</span> : <span className="base-cover-placeholder" aria-hidden="true">▤</span>}</div>;
}
export function BaseCell({ value, from, onOpen }: { value: Value; from: string; onOpen: Open }): ReactNode {
  if (value === null || value === '' || Array.isArray(value) && !value.length) return <span className="base-empty">—</span>;
  if (Array.isArray(value)) return <span className="base-values">{value.map((item, index) => <span key={index}><BaseCell value={item} from={from} onOpen={onOpen} /></span>)}</span>;
  if (kind(value, 'link') || kind(value, 'file')) { const path = textValue(ownValue(value, 'path')); return <a href="#" className="wikilink" {...openClicks((newTab) => onOpen(path, from, newTab))}>{textValue(ownValue(value, 'label')) || noteTitle(path)}</a>; }
  if (kind(value, 'date')) { const iso = textValue(ownValue(value, 'iso')); return <time className="base-date" dateTime={iso} title={iso}>{iso.slice(0, 10)}</time>; }
  if (typeof value === 'boolean') return <span aria-label={value ? 'Checked' : 'Unchecked'}>{value ? '☑' : '☐'}</span>;
  if (typeof value === 'number') return Number(value.toFixed(4)).toLocaleString('en-US', { maximumFractionDigits: 4, useGrouping: false });
  if (kind(value, 'image')) return <span>{textValue(ownValue(value, 'path'))}</span>;
  if (kind(value, 'icon')) return <span title={textValue(ownValue(value, 'name'))}>◇</span>;
  const text = textValue(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return <time className="base-date" dateTime={text}>{text}</time>;
  const links = findWikilinks(text); if (!links.length) return text;
  const parts: ReactNode[] = []; let last = 0;
  for (const link of links) { parts.push(text.slice(last, link.index), <a href="#" key={link.index} className="wikilink" {...openClicks((newTab) => onOpen(link.target, from, newTab))}>{link.alias ?? link.target}</a>); last = link.index + link.length; } parts.push(text.slice(last)); return parts;
}
function PropertyEditor({ initial, label, onSave, onCancel }: { initial: unknown; label: string; onSave: (value: unknown) => Promise<void>; onCancel: () => void }) {
  const [type, setType] = useState(initial === null ? 'text' : typeof initial === 'boolean' ? 'checkbox' : typeof initial === 'number' ? 'number' : typeof initial === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(initial) ? 'date' : typeof initial === 'object' ? 'yaml' : 'text');
  const [text, setText] = useState(initial == null ? '' : typeof initial === 'object' ? stringify(initial).trimEnd() : typeof initial === 'string' ? initial : typeof initial === 'boolean' || typeof initial === 'number' ? String(initial) : '');
  const [busy, setBusy] = useState(false), [error, setError] = useState<string>();
  const submit = async () => { setBusy(true); setError(undefined); try { const value: unknown = text === '' ? null : type === 'number' ? Number(text) : type === 'checkbox' ? text === 'true' : type === 'yaml' ? parse(text, { maxAliasCount: 50 }) as unknown : text; if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Enter a number.'); await onSave(value); } catch (error) { setError(String(error)); } finally { setBusy(false); } };
  return <div className="base-cell-editor" onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onCancel(); } }}><select aria-label={`${label} type`} value={type} disabled={busy} onChange={(event) => setType(event.target.value)}><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="checkbox">Checkbox</option><option value="yaml">List / YAML</option></select>{type === 'checkbox' ? <select aria-label={label} value={text} onChange={(event) => setText(event.target.value)}><option value="true">Checked</option><option value="false">Unchecked</option></select> : <textarea autoFocus aria-label={label} value={text} disabled={busy} onChange={(event) => setText(event.target.value)} />}{error && <p role="alert">{error}</p>}<div><button type="button" className="base-primary" disabled={busy} onClick={() => void submit()}>Save</button><button type="button" className="base-text-action" disabled={busy} onClick={onCancel}>Cancel</button></div></div>;
}
