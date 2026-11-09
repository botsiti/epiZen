import { PluginAppearance } from '../workspace/PluginDisplay';
import { useEffect, useMemo, useRef, useState } from 'react';
import { groupRows, parseBase, queryBase, type BaseDefinition, type BaseSort } from '../../lib/bases/bases';
import { patchBase, type BasePatch } from '../../lib/bases/document';
import { parseDataview } from '../../lib/bases/dataview';
import { textValue } from '../../lib/bases/values';
import { ErrorBoundary } from '../ErrorBoundary';
import { BaseControls } from './BaseControls';
import { BaseRows } from './BaseRows';
import { useBases } from './context';
import { flushBeforeClose } from '../../lib/saving';
import { filterFolder } from '../../lib/bases/filterRules';
import { noteFolder } from '../../lib/links';
import './bases.css';
const EMPTY_SORT: BaseSort[] = [];

export interface BaseBlockProps {
  source: string; language?: 'base' | 'dataview'; path: string; defaultView?: string;
  onOpenLink: (target: string, from: string, newTab?: boolean) => void;
  onSaveSource?: (before: string, after: string) => Promise<void>;
  onRefreshSource?: () => Promise<void>;
  onRecover?: (draft: string, problem: string) => void;
}
/** The draft lives outside the rendering boundary; a broken view never discards unsaved YAML. */
export function BaseBlock({ source, language = 'base', path, defaultView, onOpenLink, onSaveSource, onRefreshSource, onRecover }: BaseBlockProps) {
  const data = useBases();
  const rows = data?.rows, enabled = data?.enabled;
  const [revision, setRevision] = useState({ expected: source, draft: source });
  const [seen, setSeen] = useState(source);
  if (seen !== source) {
    setSeen(source);
    if (revision.draft === revision.expected || revision.draft === source) setRevision({ expected: source, draft: source });
  }
  const [selected, setSelected] = useState(0), [search, setSearch] = useState(''), [page, setPage] = useState(0);
  const [sourceOpen, setSourceOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<string>();
  const [sortOverride, setSortOverride] = useState<BaseSort[]>();
  const [initialView, setInitialView] = useState(defaultView);
  const pending = useRef<Promise<void> | undefined>(undefined);
  const recovery = useRef({ revision, onRecover, error: 'These base changes were not saved.' });
  useEffect(() => { recovery.current = { revision, onRecover, error: error ?? 'These base changes were not saved.' }; }, [revision, onRecover, error]);
  const parsed = useMemo((): { definition?: BaseDefinition; error?: string } => {
    if (enabled === false) return {};
    try { return { definition: language === 'base' ? parseBase(revision.draft, { rows, path }) : parseDataview(revision.draft) }; }
    catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
  }, [revision.draft, language, rows, enabled, path]);
  const selectedIndex = initialView && parsed.definition ? Math.max(0, parsed.definition.views.findIndex((view) => view.name === initialView)) : Math.min(selected, (parsed.definition?.views.length ?? 1) - 1);
  const view = parsed.definition?.views[selectedIndex];
  const sort = sortOverride ?? view?.sort ?? EMPTY_SORT;
  const result = useMemo(() => {
    if (!view || !rows || view.unavailable) return { rows: [], groups: [] };
    try {
      const found = queryBase(rows, view, sort).filter((row) => !search.trim() || view.columns.some((column) => textValue(view.value(row, column.property)).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())));
      return { rows: found, groups: groupRows(found, view) };
    } catch (error) { return { rows: [], groups: [], error: String(error) }; }
  }, [rows, view, sort, search]);
  const dirty = revision.draft !== revision.expected;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(result.rows.length / 100) - 1));
  const writable = enabled !== false && language === 'base' && Boolean(onSaveSource);
  const save = async (draft = revision.draft) => {
    if (!onSaveSource || busy) return;
    setBusy(true); setError(undefined);
    const job = (async () => {
      try { parseBase(draft, { rows: data?.rows, path }); await onSaveSource(revision.expected, draft); recovery.current.revision = { expected: draft, draft }; setRevision({ expected: draft, draft }); }
      catch (error) { recovery.current.error = String(error); setError(String(error)); }
      finally { setBusy(false); }
    })();
    pending.current = job;
    await job;
  };
  useEffect(() => flushBeforeClose(async () => {
    if (pending.current) await pending.current;
    return recovery.current.revision.draft === recovery.current.revision.expected ? undefined : path;
  }), [path]);
  useEffect(() => () => {
    void Promise.resolve(pending.current).then(() => {
      const current = recovery.current;
      if (current.revision.draft !== current.revision.expected) current.onRecover?.(current.revision.draft, current.error);
    });
  }, []);
  const apply = (patch: BasePatch) => {
    try {
      const draft = patchBase(revision.draft, patch); parseBase(draft, { rows: data?.rows, path });
      setRevision({ ...revision, draft }); setSortOverride(undefined); setPage(0); setError(undefined);
      if (patch.addView) { setSelected(parsed.definition!.views.length); setInitialView(undefined); }
      if (patch.deleteView) setSelected(0);
      void save(draft);
      return true;
    } catch (error) { setError(String(error)); return false; }
  };
  const refresh = async () => {
    setBusy(true); setError(undefined);
    try { await data?.onRefresh(); await onRefreshSource?.(); } catch (error) { setError(`Couldn’t refresh. ${String(error)}`); } finally { setBusy(false); }
  };
  const changeView = (index: number) => { setSelected(index); setInitialView(undefined); setSortOverride(undefined); setPage(0); };
  const unavailable = data?.rows.filter((row) => row.error).length ?? 0;
  return <PluginAppearance id="bases"><section className="base-block" aria-label="Vault base" data-testid="base-block">
    {view && data && <div className="base-toolbar">
      <select aria-label="Table view" className="base-view-picker" value={selectedIndex} onChange={(event) => changeView(Number(event.target.value))}>{parsed.definition!.views.map((item, index) => <option key={index} value={index}>{item.name}</option>)}</select>
      <span className="base-count" role="status">{result.rows.length} {result.rows.length === 1 ? 'note' : 'notes'}</span>
      {language === 'base' && <BaseControls definition={parsed.definition!} selected={selectedIndex} rows={data.rows} disabled={busy || !writable} apply={apply} onSelected={changeView} />}
      <input type="search" aria-label="Search table" placeholder="Search…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} />
      <button type="button" className="base-tool" disabled={busy} onClick={() => void refresh()}>{busy ? 'Saving…' : 'Refresh'}</button>
      {data.onNewNote && <button type="button" className="base-tool" onClick={() => data.onNewNote?.(filterFolder(view.filters) ?? filterFolder(parsed.definition?.filters) ?? noteFolder(path))}>+ New</button>}
      <button type="button" className="base-tool" aria-pressed={sourceOpen} onClick={() => setSourceOpen(!sourceOpen)} aria-label="Base source">&lt;/&gt;</button>
    </div>}
    {error && <div className="base-message" role="alert">{error}{dirty && <p>Your changes are still here. Copy the source or save again after resolving the conflict.</p>}<button type="button" className="quiet-button" onClick={() => void (dirty ? save() : refresh())}>Try again</button></div>}
    {dirty && writable && <div className="base-unsaved"><span>Unsaved base changes</span><button type="button" className="quiet-button" disabled={busy || Boolean(parsed.error)} onClick={() => void save()}>Save changes</button><button type="button" className="quiet-button" disabled={busy} onClick={() => { setRevision({ expected: source, draft: source }); setError(undefined); }}>Discard changes</button></div>}
    {parsed.error ? <p className="base-message" role="alert">This base can’t be displayed. {parsed.error}</p> : data?.enabled === false ? <div className="base-message" role="status">epiBase is disabled. Enable it in Settings → Plugins to display this base.{data.onOpenSettings && <button type="button" className="quiet-button" onClick={data.onOpenSettings}>Open plugin settings</button>}</div> : !data ? <p className="base-message" role="status">Open a vault to see this base.</p> : view && <ErrorBoundary label="This base view">
      {unavailable > 0 && <p className="base-message">{unavailable} {unavailable === 1 ? 'note has' : 'notes have'} unreadable properties and could not be included.</p>}
      {view.unavailable || result.error ? <p className="base-message" role="alert">{view.unavailable ?? result.error}</p> : <>
        {result.groups.map((group, index) => {
          const start = result.groups.slice(0, index).reduce((count, previous) => count + previous.rows.length, 0);
          const visible = group.rows.slice(Math.max(0, currentPage * 100 - start), Math.max(0, (currentPage + 1) * 100 - start));
          if (!visible.length) return null;
          return <div className="base-result-group" key={index}>{view.groupBy && <div className="base-group-heading"><strong>{group.label}</strong><span>{group.rows.length}</span></div>}<BaseRows path={path} summaryRows={group.rows} rows={visible} view={view} sort={sort} onSort={(sort) => { setPage(0); if (writable) apply({ view: selectedIndex, changes: { sort } }); else setSortOverride(sort); }} onOpen={onOpenLink} /></div>;
        })}
        {!result.rows.length && <p className="base-message">{search ? 'No notes match your search.' : 'No notes match this view’s filters.'}</p>}
        <div className="base-footer">{sortOverride && <button type="button" className="quiet-button" onClick={() => setSortOverride(undefined)}>Restore saved sort</button>}{result.rows.length > 100 && <nav aria-label="Table pages"><button type="button" className="quiet-button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><span>{currentPage + 1} / {Math.ceil(result.rows.length / 100)}</span><button type="button" className="quiet-button" disabled={(currentPage + 1) * 100 >= result.rows.length} onClick={() => setPage(currentPage + 1)}>Next</button></nav>}</div>
      </>}
    </ErrorBoundary>}
    {(sourceOpen || parsed.error || view?.unavailable || !data || data.enabled === false) && <details className="base-source" open={data?.enabled !== false}><summary>Base source</summary>{writable ? <textarea aria-label="Base YAML source" spellCheck={false} disabled={busy} value={revision.draft} onChange={(event) => setRevision({ ...revision, draft: event.target.value })} /> : <pre><code>{revision.draft}</code></pre>}</details>}
  </section></PluginAppearance>;
}
