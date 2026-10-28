import { Fragment, type CSSProperties, type KeyboardEvent } from 'react';
import { formatDate } from '../../lib/dates';
import { kindSpec, type KindSpec, type MediaEntry, type SortOrder } from '../../lib/library';
import { order } from '../periodic/effects';
import { VaultImage } from '../VaultImage';
import { KindMark } from './marks';
import { useInBatches } from './useInBatches';

interface Props {
  /** What is in view, sorted and filtered already. */
  entries: MediaEntry[];
  /** The tab's kind; none on All, where each row says its kind. */
  spec?: KindSpec;
  sort: SortOrder;
  onSort: (sort: SortOrder) => void;
  onOpen: (path: string) => void;
  /** How many rows rise into place as it opens: those on its first screen. */
  rising: number;
}

/** The sorts that run A to Z; the others put the latest, the best or the newest first. */
const ASCENDING: readonly SortOrder[] = ['title', 'maker'];

/** A day as the list shows it: "27 Sep 2026". */
function day(date: string): string {
  const [year, month, dayOfMonth] = date.split('-').map(Number);
  return formatDate(new Date(year ?? 0, (month ?? 1) - 1, dayOfMonth ?? 1), 'D MMM YYYY');
}

/**
 * The library as a list, after Obsidian's tables: a row per note with its cover small, the title,
 * who made it, the year, the kind (on All), the genres, the rating as a bar and the day. The
 * headers sort, the same sorts as the chips above. A row opens the note's page; ↑ and ↓ move
 * between rows. Rows are put on the page in batches and drawn only near the view, as the covers
 * are, so 600 of them open and scroll as lightly as 20.
 */
export function LibraryList({ entries, spec, sort, onSort, onOpen, rising }: Props) {
  const count = useInBatches(entries.length);
  const columns: { key: string; label: string; sort?: SortOrder }[] = [
    { key: 'cover', label: 'Cover' },
    { key: 'title', label: 'Title', sort: 'title' },
    { key: 'maker', label: spec?.makerLabel ?? 'By', sort: 'maker' },
    { key: 'year', label: 'Year', sort: 'year' },
    ...(spec ? [] : [{ key: 'kind', label: 'Kind' }]),
    { key: 'genres', label: 'Genres' },
    { key: 'rating', label: 'Rating', sort: 'rating' as const },
    { key: 'date', label: spec?.dateLabel ?? 'Date', sort: 'recent' as const },
  ];
  // ↑ and ↓ go from row to row, Home and End to the first and the last, Page Up and Down by ten.
  const move = (event: KeyboardEvent<HTMLButtonElement>) => {
    const rows = [...(event.currentTarget.closest('[role="rowgroup"]')?.querySelectorAll<HTMLButtonElement>('.row-open') ?? [])];
    const at = rows.indexOf(event.currentTarget);
    const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: rows.length - 1, PageDown: at + 10, PageUp: at - 10 }[event.key];
    if (to === undefined) return;
    event.preventDefault();
    rows[Math.max(0, Math.min(rows.length - 1, to))]?.focus();
  };
  return (
    <div className={spec ? 'library-list' : 'library-list is-mixed'} role="table" aria-label={spec ? spec.tab : 'Library'} aria-rowcount={entries.length + 1} data-testid="library-list">
      <div role="rowgroup" className="library-list-head">
        <div role="row" className="library-list-row">
          {columns.map((column) => {
            const on = column.sort === sort;
            const ascending = column.sort !== undefined && ASCENDING.includes(column.sort);
            return (
              <div
                key={column.key}
                role="columnheader"
                className={`list-head is-${column.key}${on ? ' is-on' : ''}`}
                aria-sort={on ? (ascending ? 'ascending' : 'descending') : undefined}
                aria-label={column.key === 'cover' ? column.label : undefined}
                data-testid="list-head"
                data-column={column.key}
              >
                {column.key === 'cover' ? null : column.sort ? (
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
              onClick={() => onOpen(entry.path)}
              title={entry.path}
              data-testid="library-row"
              data-path={entry.path}
              data-kind={entry.kind}
              data-drawn-near
            >
              <div role="cell" className="row-cover">
                {entry.cover ? (
                  <VaultImage path={entry.cover} alt={entry.title} className="row-cover-image" lazy />
                ) : (
                  <span className="row-cover-blank" aria-hidden="true">
                    {[...entry.title][0]}
                  </span>
                )}
              </div>
              <div role="cell" className="row-title">
                {/* Enter or a click on it opens the page; the row takes the click. */}
                <button type="button" className="row-open" onKeyDown={move} data-testid="row-open">
                  {entry.title}
                </button>
              </div>
              <div role="cell" className="row-maker">
                {entry.maker ?? <span className="faint">—</span>}
              </div>
              <div role="cell" className="row-year">
                {entry.year ?? <span className="faint">—</span>}
              </div>
              {!spec && (
                <div role="cell" className="row-kind" data-testid="row-kind">
                  <KindMark kind={entry.kind} />
                  {kind.one}
                </div>
              )}
              <div role="cell" className="row-genres" title={entry.genres.join(', ') || undefined}>
                {entry.genres.length
                  ? entry.genres.map((genre, n) => (
                      <Fragment key={genre}>
                        {n > 0 && <span className="row-genre-dot"> · </span>}
                        {genre}
                      </Fragment>
                    ))
                  : <span className="faint">—</span>}
              </div>
              <div role="cell" className="row-rating" data-testid="row-rating">
                {entry.rating === undefined ? (
                  <span className="faint" aria-label="not rated">
                    —
                  </span>
                ) : (
                  <>
                    <span className="row-meter" aria-hidden="true">
                      <span style={{ '--r': Math.max(0, Math.min(100, entry.rating)) / 100 } as CSSProperties} />
                    </span>
                    <span className="row-rating-number">{entry.rating}</span>
                  </>
                )}
              </div>
              <div role="cell" className="row-date">
                {entry.date ? day(entry.date) : <span className="faint">—</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
