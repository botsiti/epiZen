import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { formatDate } from '../../lib/dates';
import { kindSpec, type KindSpec, type ListColumn, type MediaEntry, type SortOrder } from '../../lib/library';
import { order } from '../periodic/effects';
import { VaultImage } from '../VaultImage';
import { KindMark } from './marks';
import { sortDirection, type SortDirection } from '../../lib/libraryViews';
import { useInBatches } from './useInBatches';

interface Props {
  /** What is in view, sorted, filtered and searched already. */
  entries: MediaEntry[];
  /** The tab's kind; none on All, where each row says its kind. */
  spec?: KindSpec;
  sort: SortOrder;
  direction?: SortDirection;
  onSort: (sort: SortOrder) => void;
  /** The columns hidden from Properties. */
  hidden: readonly ListColumn[];
  onOpen: (path: string, newTab?: boolean) => void;
  /** How many rows rise into place as it opens: those on its first screen. */
  rising: number;
}

type Column = ListColumn | 'title';

interface ColumnSpec {
  column: Column;
  label: string;
  /** Its track in the rows' grid. */
  track: string;
  sort?: SortOrder;
  /** Below this width of list the column goes, the least needed first. */
  from?: number;
}

/** The sorts that run A to Z; the others put the latest, the best or the newest first. */


/** A day as the list shows it: "27 Sep 2026". */
function day(date: string): string {
  const [year, month, dayOfMonth] = date.split('-').map(Number);
  return formatDate(new Date(year ?? 0, (month ?? 1) - 1, dayOfMonth ?? 1), 'D MMM YYYY');
}

/** The list's width, as it changes; wide until it can be told. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(Infinity);
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([seen]) => seen && setWidth(seen.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

const dash = <span className="faint">—</span>;

/**
 * The library as a list, after the table of Obsidian's bases: a row per note with its cover small,
 * the title in the serif, who made it, the year, the kind (on All), the genres as chips, the rating
 * as a bar and the day. Properties picks the columns; a narrow pane lets the genres go first, then
 * the kind, the year and the rating's bar. The headers sort, the same sorts as Sort. A row opens the note's page; ↑ and
 * ↓ move between rows. Rows are put on the page in batches, so 600 of them open as quickly as 20.
 */
export function LibraryList({ entries, spec, sort, direction = sortDirection(sort), onSort, hidden, onOpen, rising }: Props) {
  const count = useInBatches(entries.length);
  const { ref, width } = useWidth();
  // In a narrow pane the rating is its number alone.
  const slim = width < 640;
  const all: ColumnSpec[] = [
    { column: 'cover', label: 'Cover', track: '44px' },
    { column: 'title', label: 'Title', track: 'minmax(0, 2.2fr)', sort: 'title' },
    { column: 'maker', label: spec?.makerLabel ?? 'By', track: 'minmax(0, 1.4fr)', sort: 'maker' },
    { column: 'year', label: 'Year', track: '48px', sort: 'year', from: 600 },
    ...(spec ? [] : [{ column: 'kind', label: 'Kind', track: '84px', from: 760 } satisfies ColumnSpec]),
    { column: 'genres', label: 'Genres', track: 'minmax(0, 1.5fr)', from: 860 },
    { column: 'rating', label: 'Rating', track: slim ? '48px' : '112px', sort: 'rating' },
    { column: 'date', label: spec?.dateLabel ?? 'Date', track: '96px', sort: 'recent' },
  ];
  const columns = all.filter((column) => column.column === 'title' || (!hidden.includes(column.column) && width >= (column.from ?? 0)));
  const template = { '--list-columns': columns.map((column) => column.track).join(' ') } as CSSProperties;

  // ↑ and ↓ go from row to row, Home and End to the first and the last, Page Up and Down by ten.
  const move = (event: KeyboardEvent<HTMLButtonElement>) => {
    const rows = [...(event.currentTarget.closest('[role="rowgroup"]')?.querySelectorAll<HTMLButtonElement>('.row-open') ?? [])];
    const at = rows.indexOf(event.currentTarget);
    const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: rows.length - 1, PageDown: at + 10, PageUp: at - 10 }[event.key];
    if (to === undefined) return;
    event.preventDefault();
    rows[Math.max(0, Math.min(rows.length - 1, to))]?.focus();
  };

  const cell = (column: Column, entry: MediaEntry, kind: KindSpec): ReactNode => {
    switch (column) {
      case 'cover':
        return entry.cover ? (
          <VaultImage path={entry.cover} alt={entry.title} className="row-cover-image" lazy />
        ) : (
          <span className="row-cover-blank" aria-hidden="true">
            {[...entry.title][0]}
          </span>
        );
      case 'title':
        // Enter or a click on it opens the page; the row takes the click.
        return (
          <button type="button" className="row-open" onKeyDown={move} title={entry.title} data-testid="row-open">
            {entry.title}
          </button>
        );
      case 'maker':
        return entry.maker ?? dash;
      case 'year':
        return entry.year ?? dash;
      case 'kind':
        return (
          <>
            <KindMark kind={entry.kind} />
            {kind.one}
          </>
        );
      case 'genres':
        // The first genre whole, as a chip, and how many more.
        return entry.genres.length ? (
          <>
            <span className="row-genre">{entry.genres[0]}</span>
            {entry.genres.length > 1 && <span className="row-genre-more">+{entry.genres.length - 1}</span>}
          </>
        ) : (
          dash
        );
      case 'rating':
        return entry.rating === undefined ? (
          <span className="faint" aria-label="not rated">
            —
          </span>
        ) : (
          <>
            {!slim && (
              <span className="row-meter" aria-hidden="true">
                <span style={{ '--r': Math.max(0, Math.min(100, entry.rating)) / 100 } as CSSProperties} />
              </span>
            )}
            <span className="row-rating-number">{entry.rating}</span>
          </>
        );
      case 'date':
        return entry.date ? day(entry.date) : dash;
    }
  };

  return (
    <div ref={ref} className="library-list" style={template} role="table" aria-label={spec ? spec.tab : 'Library'} aria-rowcount={entries.length + 1} data-testid="library-list">
      <div role="rowgroup" className="library-list-head">
        <div role="row" className="library-list-row">
          {columns.map((column) => {
            const on = column.sort === sort;
            const ascending = (on ? direction : column.sort ? sortDirection(column.sort) : 'desc') === 'asc';
            return (
              <div
                key={column.column}
                role="columnheader"
                className={`list-head is-${column.column}${on ? ' is-on' : ''}`}
                aria-sort={on ? (ascending ? 'ascending' : 'descending') : undefined}
                aria-label={column.column === 'cover' ? column.label : undefined}
                data-testid="list-head"
                data-column={column.column}
              >
                {column.column === 'cover' ? null : column.sort ? (
                  <button type="button" className="list-sort" onClick={() => column.sort && onSort(column.sort)} data-testid="list-sort" data-sort={column.sort}>
                    {column.label}
                    <svg className={ascending ? 'list-arrow is-up' : 'list-arrow'} viewBox="0 0 10 10" aria-hidden="true">
                      <path d="M2.5 4l2.5 2.5L7.5 4" />
                    </svg>
                  </button>
                ) : (
                  column.label
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div role="rowgroup">
        {entries.slice(0, count).map((entry, i) => {
          const kind = kindSpec(entry.kind);
          const style = { '--aspect': kind.aspect, ...(i < rising ? order(Math.min(i + 1, 16)) : {}) } as CSSProperties;
          return (
            <div
              key={entry.path}
              role="row"
              className={i < rising ? 'library-list-row library-row rise' : 'library-list-row library-row'}
              style={style}
              onClick={(event) => (event.metaKey || event.ctrlKey) ? onOpen(entry.path, true) : onOpen(entry.path)}
              data-testid="library-row"
              data-path={entry.path}
              data-kind={entry.kind}
            >
              {columns.map(({ column }) => (
                <div key={column} role="cell" className={`row-${column}`} data-testid={`row-${column}`} title={column === 'genres' && entry.genres.length > 1 ? entry.genres.join(', ') : undefined}>
                  {cell(column, entry, kind)}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
