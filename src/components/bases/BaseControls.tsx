import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { BaseDefinition, BaseSort, BaseView, Filter } from '../../lib/bases/bases';
import { SUMMARY_NAMES } from '../../lib/bases/bases';
import type { BasePatch, ViewPatch } from '../../lib/bases/document';
import { canonicalProperty, FILE_PROPERTIES, PROPERTY_LABELS, type BaseRow } from '../../lib/bases/rows';
import { BaseIcon } from './BaseIcon';
import { FilterEditor, type PropertyOption } from './FilterEditor';

function baseProperties(rows: BaseRow[], definition: BaseDefinition): PropertyOption[] {
  return [...new Set([...FILE_PROPERTIES, ...rows.flatMap((row) => Object.keys(row.properties).map((key) => `note.${key}`)), ...Object.keys(definition.formulas).map((key) => `formula.${key}`), ...definition.views.flatMap((view) => view.columns.map((column) => canonicalProperty(column.property)))])].map((property) => ({ property, label: PROPERTY_LABELS[property] ?? property.replace(/^(note|formula)\./, '') }));
}
interface Props { definition: BaseDefinition; selected: number; rows: BaseRow[]; disabled: boolean; apply: (patch: BasePatch) => boolean; onSelected: (index: number) => void }
type Menu = 'Views' | 'Sort' | 'Filter' | 'Properties' | 'Group';
export function BaseControls({ definition, selected, rows, disabled, apply, onSelected }: Props) {
  const [menu, setMenu] = useState<Menu>();
  const host = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement | null>(null);
  const close = () => { setMenu(undefined); trigger.current?.focus(); };
  useLayoutEffect(() => {
    if (!menu) return;
    const panel = host.current?.querySelector<HTMLElement>('.base-popover');
    if (!panel) return;
    panel.style.transform = '';
    panel.style.width = '';
    const pane = host.current?.closest('.main')?.getBoundingClientRect();
    const left = Math.max(8, (pane?.left ?? 0) + 8), right = Math.min(window.innerWidth - 8, (pane?.right ?? window.innerWidth) - 8);
    const top = Math.max(8, (pane?.top ?? 0) + 8), bottom = Math.min(window.innerHeight - 8, (pane?.bottom ?? window.innerHeight) - 8);
    panel.style.width = `${Math.min(panel.getBoundingClientRect().width, Math.max(200, right - left))}px`;
    const body = panel.querySelector<HTMLElement>('.base-popover-body');
    if (body) body.style.maxHeight = `${Math.max(80, bottom - top - 100)}px`;
    const rect = panel.getBoundingClientRect();
    const dx = Math.max(left - rect.left, Math.min(0, right - rect.right));
    const dy = Math.max(top - rect.top, Math.min(0, bottom - rect.bottom));
    panel.style.transform = `translate(${dx}px, ${dy}px)`;
  }, [menu]);
  useEffect(() => {
    if (!menu) return;
    const outside = (event: MouseEvent) => { if (!host.current?.contains(event.target as Node)) setMenu(undefined); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setMenu(undefined); trigger.current?.focus(); } };
    document.addEventListener('mousedown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape); };
  }, [menu]);
  const view = definition.views[selected] ?? definition.views[0]!;
  const properties = baseProperties(rows, definition);
  const commit = (patch: BasePatch) => { if (apply(patch)) close(); };
  return <div className="base-controls" ref={host}>
    {(['Views', 'Sort', 'Group', 'Filter', 'Properties'] as const).map((name) => <button type="button" className={`base-tool${menu === name ? ' is-active' : ''}`} key={name} aria-expanded={menu === name} disabled={disabled} onClick={(event) => { trigger.current = event.currentTarget; setMenu(menu === name ? undefined : name); }}><BaseIcon name={name} />{name}{name === 'Sort' && view.sort.length > 0 && <small>{view.sort.length}</small>}</button>)}
    {menu && <div className={`base-popover base-popover-${menu.toLowerCase()}`} role="dialog" aria-label={`${menu} settings`}><header><strong>{menu === 'Views' ? 'Views & layout' : menu}</strong><button type="button" className="base-icon-action" aria-label="Close settings" onClick={close}>×</button></header>
      {menu === 'Views' && <Views view={view} index={selected} definition={definition} properties={properties} onSelected={(index) => { onSelected(index); close(); }} apply={commit} />}
      {menu === 'Sort' && <Sorts sort={view.sort} properties={properties} apply={(sort) => commit({ view: selected, changes: { sort } })} />}
      {menu === 'Group' && <Group view={view} properties={properties} apply={(groupBy) => commit({ view: selected, changes: { groupBy } })} />}
      {menu === 'Filter' && <Filters definition={definition} view={view} properties={properties} apply={(allFilters, filters) => commit({ view: selected, allFilters: allFilters ?? null, changes: { filters: filters ?? null } })} />}
      {menu === 'Properties' && <Properties definition={definition} view={view} properties={properties} apply={(patch) => commit({ view: selected, ...patch })} />}
    </div>}
  </div>;
}
function Footer({ children, onApply }: { children?: ReactNode; onApply: () => void }) { return <footer className="base-popover-footer">{children}<button type="button" className="base-primary" onClick={onApply}>Apply</button></footer>; }
function PropertySelect({ value, label, options, onChange, empty }: { value: string; label: string; options: PropertyOption[]; onChange: (property: string) => void; empty?: string }) {
  return <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>{empty !== undefined && <option value="">{empty}</option>}{value && !options.some((option) => option.property === value) && <option value={value}>{PROPERTY_LABELS[value] ?? value.replace(/^(note|formula)\./, '')}</option>}{options.map(({ property, label }) => <option value={property} key={property}>{label}</option>)}</select>;
}
function Sorts({ sort, properties, apply }: { sort: BaseSort[]; properties: PropertyOption[]; apply: (next: BaseSort[]) => void }) {
  const [draft, setDraft] = useState(sort);
  return <><div className="base-popover-body"><p className="base-helper">Earlier rules take priority.</p>{draft.map((rule, index) => <div className="base-sort-rule" key={index}><PropertySelect value={rule.property} label={`Sort ${index + 1} property`} options={properties} onChange={(property) => setDraft(draft.map((item, i) => i === index ? { ...item, property } : item))} /><select aria-label={`Sort ${index + 1} direction`} value={rule.direction} onChange={(event) => setDraft(draft.map((item, i) => i === index ? { ...item, direction: event.target.value as BaseSort['direction'] } : item))}><option value="ASC">Ascending</option><option value="DESC">Descending</option></select><button type="button" className="base-icon-action" aria-label={`Move sort ${index + 1} up`} disabled={!index} onClick={() => { const next = [...draft]; [next[index - 1], next[index]] = [next[index]!, next[index - 1]!]; setDraft(next); }}>↑</button><button type="button" className="base-icon-action" aria-label={`Remove sort ${index + 1}`} onClick={() => setDraft(draft.filter((_, i) => i !== index))}>×</button></div>)}<button type="button" className="base-text-action" onClick={() => setDraft([...draft, { property: 'file.name', direction: 'ASC' }])}>+ Add sort</button></div><Footer onApply={() => apply(draft)} /></>;
}
function Filters({ definition, view, properties, apply }: { definition: BaseDefinition; view: BaseView; properties: PropertyOption[]; apply: (all: Filter | undefined, local: Filter | undefined) => void }) {
  const [all, setAll] = useState(definition.filters), [local, setLocal] = useState(view.filters), [scope, setScope] = useState<'view' | 'all'>('view');
  return <><div className="base-popover-body"><div className="base-panel-tabs" role="group" aria-label="Filter scope"><button type="button" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>All views</button><button type="button" aria-pressed={scope === 'view'} onClick={() => setScope('view')}>This view</button></div><FilterEditor value={scope === 'all' ? all : local} onChange={scope === 'all' ? setAll : setLocal} properties={properties} /></div><Footer onApply={() => apply(all, local)} /></>;
}
function Group({ view, properties, apply }: { view: BaseView; properties: PropertyOption[]; apply: (group: BaseSort | null) => void }) {
  const [property, setProperty] = useState(view.groupBy?.property ?? ''), [direction, setDirection] = useState<BaseSort['direction']>(view.groupBy?.direction ?? 'ASC');
  return <><div className="base-popover-body"><label>Group by<PropertySelect label="Group property" value={property} options={properties} onChange={setProperty} empty="No grouping" /></label><label>Group order<select value={direction} onChange={(event) => setDirection(event.target.value as BaseSort['direction'])}><option value="ASC">Ascending</option><option value="DESC">Descending</option></select></label></div><Footer onApply={() => apply(property ? { property, direction } : null)} /></>;
}
function Properties({ definition, view, properties, apply }: { definition: BaseDefinition; view: BaseView; properties: PropertyOption[]; apply: (patch: Omit<BasePatch, 'view'>) => void }) {
  const [order, setOrder] = useState(view.columns.map((column) => canonicalProperty(column.property))), [query, setQuery] = useState('');
  const [formula, setFormula] = useState<{ name: string; expression: string }>();
  const [renaming, setRenaming] = useState<{ property: string; label: string }>();
  const [summaries, setSummaries] = useState(view.summaries);
  const merged = [...new Set([...order, ...properties.map((property) => property.property)])].filter((property) => (properties.find((item) => item.property === property)?.label ?? property).toLowerCase().includes(query.toLowerCase()));
  const move = (property: string, by: number) => { const from = order.indexOf(property), to = from + by; if (from < 0 || to < 0 || to >= order.length) return; const next = [...order]; [next[from], next[to]] = [next[to]!, next[from]!]; setOrder(next); };
  return <><div className="base-popover-body"><input type="search" autoFocus aria-label="Find a property" placeholder="Find a property…" value={query} onChange={(event) => setQuery(event.target.value)} /><div className="base-property-list">{merged.map((property) => <div className="base-property-option" key={property} onKeyDown={(event) => { if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); move(property, event.key === 'ArrowUp' ? -1 : 1); } }}><label><input type="checkbox" aria-label={`Show ${properties.find((item) => item.property === property)?.label ?? property}`} checked={order.includes(property)} onChange={(event) => setOrder(event.target.checked ? [...order, property] : order.filter((key) => key !== property))} /><span>{view.columns.find((column) => canonicalProperty(column.property) === property)?.label ?? properties.find((item) => item.property === property)?.label ?? property}</span><small>{property.startsWith('formula.') ? 'ƒ' : property.startsWith('file.') ? 'File' : 'Note'}</small></label>{order.includes(property) && <><button type="button" className="base-icon-action" aria-label={`Move ${property} up`} disabled={order.indexOf(property) === 0} onClick={() => move(property, -1)}>↑</button><button type="button" className="base-icon-action" aria-label={`Move ${property} down`} disabled={order.indexOf(property) === order.length - 1} onClick={() => move(property, 1)}>↓</button></>}<button type="button" className="base-icon-action" aria-label={`Configure property ${property}`} onClick={() => setRenaming({ property, label: view.columns.find((column) => canonicalProperty(column.property) === property)?.label ?? property.replace(/^(note|formula)\./, '') })}>›</button></div>)}</div>
    {renaming && <div className="base-property-detail"><label>Column label<input aria-label="Column label" value={renaming.label} onChange={(event) => setRenaming({ ...renaming, label: event.target.value })} /></label><label>Summary<select aria-label="Column summary" value={summaries[renaming.property] ?? ''} onChange={(event) => { const next = { ...summaries }; if (event.target.value) next[renaming.property] = event.target.value; else delete next[renaming.property]; setSummaries(next); }}><option value="">None</option>{[...SUMMARY_NAMES, ...Object.keys(view.summaryDefinitions)].map((name) => <option key={name}>{name}</option>)}</select></label>{renaming.property.startsWith('formula.') && <button type="button" className="base-text-action" onClick={() => setFormula({ name: renaming.property.slice(8), expression: definition.formulas[renaming.property.slice(8)] ?? '' })}>Edit formula</button>}</div>}
    <button type="button" className="base-text-action" onClick={() => setFormula({ name: '', expression: '' })}>+ Add formula</button>{formula && <div className="base-property-detail"><label>Formula name<input aria-label="Formula name" value={formula.name} onChange={(event) => setFormula({ ...formula, name: event.target.value })} /></label><label>Expression<textarea aria-label="Formula expression" value={formula.expression} onChange={(event) => setFormula({ ...formula, expression: event.target.value })} placeholder="rating / 20" /></label></div>}
    </div><Footer onApply={() => apply({ changes: { order: formula?.name && !order.includes(`formula.${formula.name}`) ? [...order, `formula.${formula.name}`] : order }, ...(formula ? { formula } : {}), ...(renaming ? { renameProperty: renaming } : {}), summaries })}><button type="button" className="base-text-action" onClick={() => setOrder([])}>Hide all</button></Footer></>;
}
function Views({ view, index, definition, properties, onSelected, apply }: { view: BaseView; index: number; definition: BaseDefinition; properties: PropertyOption[]; onSelected: (index: number) => void; apply: (patch: BasePatch) => void }) {
  const [draft, setDraft] = useState<ViewPatch>({ name: view.name, type: view.type, image: view.image ?? '', cardSize: view.cardSize, imageFit: view.imageFit, imageAspectRatio: view.imageAspectRatio, listMarker: view.listMarker, indent: view.indent, listSeparator: view.listSeparator });
  const [adding, setAdding] = useState(false), [name, setName] = useState(''), [type, setType] = useState<'table' | 'cards' | 'list'>('table');
  return <><div className="base-popover-body"><div className="base-view-list">{definition.views.map((item, i) => <button type="button" key={i} aria-pressed={i === index} onClick={() => onSelected(i)}><span>{item.name}</span><small>{item.type}</small></button>)}</div><label>View name<input aria-label="View name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label>Layout<select aria-label="View layout" value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as BaseView['type'] })}><option value="table">Table</option><option value="cards">Cards</option><option value="list">List</option></select></label>
    {draft.type === 'cards' && <><label>Cover image<PropertySelect label="Image property" value={draft.image ?? ''} options={properties} onChange={(image) => setDraft({ ...draft, image })} empty="No image" /></label><label>Card width<input aria-label="Card width" type="range" min="120" max="400" step="20" value={draft.cardSize} onChange={(event) => setDraft({ ...draft, cardSize: Number(event.target.value) })} /></label><label>Image fit<select aria-label="Image fit" value={draft.imageFit} onChange={(event) => setDraft({ ...draft, imageFit: event.target.value })}><option value="cover">Cover</option><option value="contain">Contain</option></select></label><label>Image aspect ratio<input aria-label="Image aspect ratio" type="number" min="0.25" max="4" step="0.25" value={draft.imageAspectRatio} onChange={(event) => setDraft({ ...draft, imageAspectRatio: Number(event.target.value) })} /></label></>}
    {draft.type === 'list' && <><label>Markers<select aria-label="List markers" value={draft.listMarker} onChange={(event) => setDraft({ ...draft, listMarker: event.target.value })}><option value="bullet">Bullets</option><option value="number">Numbers</option><option value="none">None</option></select></label><label className="base-checkbox-label"><input type="checkbox" checked={draft.indent} onChange={(event) => setDraft({ ...draft, indent: event.target.checked })} />Indent properties</label><label>Separator<input aria-label="List separator" value={draft.listSeparator} onChange={(event) => setDraft({ ...draft, listSeparator: event.target.value })} /></label></>}
    <button type="button" className="base-text-action" onClick={() => setAdding(!adding)}>+ Add view</button>{adding && <div className="base-property-detail"><label>New view name<input aria-label="New view name" value={name} onChange={(event) => setName(event.target.value)} /></label><select aria-label="New view layout" value={type} onChange={(event) => setType(event.target.value as typeof type)}><option value="table">Table</option><option value="cards">Cards</option><option value="list">List</option></select><button type="button" className="base-primary" disabled={!name.trim()} onClick={() => apply({ view: index, addView: { name, type } })}>Create view</button></div>}
    </div><Footer onApply={() => apply({ view: index, changes: draft })}>{definition.views.length > 1 && <button type="button" className="base-text-action" onClick={() => apply({ view: index, deleteView: true })}>Remove this view</button>}</Footer></>;
}
