import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { kindSpec, LATEST, type KindSpec, type LibraryLayout, type ListColumn, type MediaKind, type SortOrder } from '../../lib/library';
import { KindMark, ToolMark } from './marks';

interface Props {
  layout: LibraryLayout;
  onLayout: (layout: LibraryLayout) => void;
  /** "533 results", or "The latest 15 of 533". */
  count: string;
  /** The filters on, said in a few words. */
  summary?: string;
  /** The tab's kind; none on All, where the kinds can be filtered too. */
  spec?: KindSpec;
  kinds: [MediaKind, number][];
  onKinds: ReadonlySet<MediaKind>;
  onToggleKind: (kind: MediaKind) => void;
  genres: [string, number][];
  genre?: string;
  onGenre: (genre?: string) => void;
  onClear: () => void;
  sort: SortOrder;
  onSort: (sort: SortOrder) => void;
  hidden: readonly ListColumn[];
  onHidden: (hidden: ListColumn[]) => void;
  search: string;
  onSearch: (search: string) => void;
}

/** The menu items in a panel, in order, for the arrow keys. */
const itemsIn = (panel: HTMLElement | null) => [...(panel?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)') ?? [])];

/**
 * A word in the toolbar that opens a small glass menu under it. The menu takes the focus (the
 * chosen item, or the first); ↑ ↓ Home End move in it, Escape closes it and goes back to the word,
 * and a click outside it closes it.
 */
function Tool({
  label,
  mark,
  testId,
  menuLabel,
  className = '',
  badge,
  closes = false,
  children,
}: {
  label: ReactNode;
  mark: Parameters<typeof ToolMark>[0]['name'];
  testId: string;
  menuLabel: string;
  className?: string;
  badge?: number;
  /** Picking one of its choices closes the menu (Covers or List, a sort); filters and columns stay open to pick more. */
  closes?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const items = itemsIn(panel.current);
    (items.find((item) => item.getAttribute('aria-checked') === 'true') ?? items[0])?.focus();
    const away = (event: Event) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  // The focus stays in the menu while it is open: an item that takes itself away (a filter's Clear)
  // hands it to the first item, so the menu's own keys (Escape, Tab) still reach it.
  useEffect(() => {
    if (open && panel.current && !panel.current.contains(document.activeElement)) itemsIn(panel.current)[0]?.focus();
  });
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = itemsIn(panel.current);
    const at = items.indexOf(document.activeElement as HTMLElement);
    const to = { ArrowDown: (at + 1) % items.length, ArrowUp: (at - 1 + items.length) % items.length, Home: 0, End: items.length - 1 }[event.key];
    if (to !== undefined) {
      event.preventDefault();
      items[to]?.focus();
    } else if (event.key === 'Escape') {
      // The menu's, not a sheet's or the window's behind it.
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };
  return (
    <div className="tool" ref={box}>
      <button ref={button} type="button" className={`tool-button ${className}${badge ? ' is-on' : ''}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} data-testid={testId}>
        <ToolMark name={mark} />
        {label}
        {Boolean(badge) && <span className="tool-badge">{badge}</span>}
      </button>
      {open && (
        <div
          ref={panel}
          className="tool-menu"
          role="menu"
          aria-label={menuLabel}
          onKeyDown={keys}
          onClick={(event) => closes && (event.target as Element).closest('[role="menuitemradio"]') && close()}
          data-testid={`${testId}-menu`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function Item({
  role = 'menuitemradio',
  checked,
  onSelect,
  disabled,
  testId,
  data,
  children,
}: {
  role?: 'menuitemradio' | 'menuitemcheckbox';
  checked: boolean;
  onSelect: () => void;
  disabled?: boolean;
  testId: string;
  data?: Record<string, string>;
  children: ReactNode;
}) {
  return (
    <button type="button" role={role} aria-checked={checked} className="tool-item" onClick={onSelect} disabled={disabled} tabIndex={-1} data-testid={testId} {...data}>
      <span className="tool-check">{checked && <ToolMark name="check" />}</span>
      {children}
    </button>
  );
}

const SORTS: { sort: SortOrder; name?: string; hint: string }[] = [
  { sort: 'recent', name: 'Recent', hint: 'latest first' },
  { sort: 'rating', name: 'Rating', hint: 'best first' },
  { sort: 'title', name: 'Title', hint: 'A to Z' },
  { sort: 'maker', hint: 'A to Z' },
  { sort: 'year', name: 'Year', hint: 'newest first' },
];

/**
 * Above the covers or the list, after the toolbar of Obsidian's bases, in Epizen's look: Covers or
 * List and how many there are on the left; on the right Sort, Filter (the kinds on All, and the
 * genres), Properties (the list's columns) and Search. Covers show the latest, so they only filter.
 */
export function LibraryToolbar(props: Props) {
  const { layout, onLayout, count, summary, spec, kinds, onKinds, onToggleKind, genres, genre, onGenre, onClear, sort, onSort, hidden, onHidden, search, onSearch } = props;
  const [searching, setSearching] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const list = layout === 'list';
  const filters = onKinds.size + (genre ? 1 : 0);
  const columns: { column: ListColumn; name: string }[] = [
    { column: 'cover', name: 'Cover' },
    { column: 'maker', name: spec?.makerLabel ?? 'By' },
    { column: 'year', name: 'Year' },
    ...(spec ? [] : [{ column: 'kind' as const, name: 'Kind' }]),
    { column: 'genres', name: 'Genres' },
    { column: 'rating', name: 'Rating' },
    { column: 'date', name: spec?.dateLabel ?? 'Date' },
  ];
  const names: Record<LibraryLayout, string> = { covers: 'Covers', list: 'List' };
  useEffect(() => {
    if (searching) field.current?.focus();
  }, [searching]);
  return (
    <div className="library-toolbar" data-testid="library-toolbar">
      <div className="toolbar-start">
        <Tool label={names[layout]} mark={layout} testId="library-view-menu" menuLabel="Show as" className="is-view" closes>
          {(['covers', 'list'] as const).map((name) => (
            <Item key={name} checked={layout === name} onSelect={() => onLayout(name)} testId="library-view" data={{ 'data-view': name }}>
              <ToolMark name={name} />
              <span className="tool-item-name">{names[name]}</span>
              <span className="tool-item-hint">{name === 'covers' ? `the latest ${LATEST}` : 'all of them, as a table'}</span>
            </Item>
          ))}
        </Tool>
        <span className="toolbar-count" data-testid="library-count">
          {count}
        </span>
        {summary && (
          <span className="toolbar-summary" data-testid="library-filters">
            {summary}
          </span>
        )}
      </div>
      <div className="toolbar-end">
        {list && (
          <Tool label="Sort" mark="sort" testId="library-sort" menuLabel="Sort" closes>
            {SORTS.map((option) => (
              <Item key={option.sort} checked={sort === option.sort} onSelect={() => onSort(option.sort)} testId="sort" data={{ 'data-sort': option.sort }}>
                <span className="tool-item-name">{option.name ?? spec?.makerLabel ?? 'By'}</span>
                <span className="tool-item-hint">{option.hint}</span>
              </Item>
            ))}
          </Tool>
        )}
        <Tool label="Filter" mark="filter" testId="library-filter" menuLabel="Filter" badge={filters}>
          <>
            {!spec && (
              <div role="group" aria-label="Kind" className="tool-group">
                <p className="tool-label">Kind</p>
                {kinds.map(([kind, n]) => (
                  <Item key={kind} role="menuitemcheckbox" checked={onKinds.has(kind)} onSelect={() => onToggleKind(kind)} disabled={!n} testId="kind-chip" data={{ 'data-kind': kind }}>
                    <KindMark kind={kind} />
                    <span className="tool-item-name">{kindSpec(kind).tab}</span>
                    <span className="tool-item-hint">{n}</span>
                  </Item>
                ))}
              </div>
            )}
            {genres.length > 0 && (
              <div role="group" aria-label="Genre" className="tool-group">
                <p className="tool-label">Genre</p>
                <Item checked={!genre} onSelect={() => onGenre(undefined)} testId="genre-chip" data={{ 'data-genre': '' }}>
                  <span className="tool-item-name">Any</span>
                </Item>
                {genres.map(([name, n]) => (
                  <Item key={name} checked={genre === name} onSelect={() => onGenre(genre === name ? undefined : name)} testId="genre-chip" data={{ 'data-genre': name }}>
                    <span className="tool-item-name">{name}</span>
                    <span className="tool-item-hint">{n}</span>
                  </Item>
                ))}
              </div>
            )}
            {filters > 0 && (
              <button type="button" role="menuitem" className="tool-clear" onClick={onClear} tabIndex={-1} data-testid="filter-clear">
                Clear the filters
              </button>
            )}
          </>
        </Tool>
        {list && (
          <Tool label="Properties" mark="columns" testId="library-columns" menuLabel="Properties">
            <>
              <Item role="menuitemcheckbox" checked onSelect={() => undefined} disabled testId="column" data={{ 'data-column': 'title' }}>
                <span className="tool-item-name">Title</span>
                <span className="tool-item-hint">always</span>
              </Item>
              {columns.map(({ column, name }) => (
                <Item
                  key={column}
                  role="menuitemcheckbox"
                  checked={!hidden.includes(column)}
                  onSelect={() => onHidden(hidden.includes(column) ? hidden.filter((other) => other !== column) : [...hidden, column])}
                  testId="column"
                  data={{ 'data-column': column }}
                >
                  <span className="tool-item-name">{name}</span>
                </Item>
              ))}
            </>
          </Tool>
        )}
        {list &&
          (searching || search ? (
            <label className="tool-search">
              <ToolMark name="search" />
              <input
                ref={field}
                type="search"
                value={search}
                placeholder="Title, maker or genre"
                aria-label="Search the list"
                onChange={(event) => onSearch(event.target.value)}
                onBlur={() => setSearching(false)}
                onKeyDown={(event) => {
                  if (event.key !== 'Escape') return;
                  event.preventDefault();
                  event.stopPropagation();
                  onSearch('');
                  setSearching(false);
                }}
                data-testid="library-search"
              />
              {search && (
                <button
                  type="button"
                  className="tool-search-clear"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onSearch('')}
                  aria-label="Clear the search"
                  data-testid="library-search-clear"
                >
                  <ToolMark name="close" />
                </button>
              )}
            </label>
          ) : (
            <button type="button" className="tool-button" onClick={() => setSearching(true)} data-testid="library-search-open">
              <ToolMark name="search" />
              Search
            </button>
          ))}
      </div>
    </div>
  );
}
