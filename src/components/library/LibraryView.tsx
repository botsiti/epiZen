import { useMemo, useState, type CSSProperties, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { VaultFile } from '../../lib/api';
import { formatDate, monthGrid } from '../../lib/dates';
import {
  calendarStart,
  genreCounts,
  kindSpec,
  KINDS,
  libraryStats,
  monthCounts,
  monthCovers,
  sortEntries,
  withGenre,
  type KindSpec,
  type MediaEntry,
  type MediaKind,
  type SortOrder,
} from '../../lib/library';
import { SOURCE_NAMES } from '../../lib/lookup';
import { followPointer, order } from '../periodic/effects';
import { BlurText, CountUp } from '../periodic/motion';
import { Section, Tabs } from '../periodic/parts';
import { ErrorBoundary } from '../ErrorBoundary';
import { VaultImage } from '../VaultImage';
import { AddMedia } from './AddMedia';
import '../periodic/periodic.css';
import './library.css';

interface Props {
  library: ReadonlyMap<MediaKind, MediaEntry[]>;
  files: VaultFile[];
  tab: MediaKind;
  onTab: (kind: MediaKind) => void;
  today: Date;
  onOpenNote: (path: string) => void;
  /** A new note was created by Add: read the vault again and open it. */
  onCreated: (path: string) => Promise<void>;
}

const SUMMARY: Record<MediaKind, string> = {
  album: 'Every album listened to, with its cover and its rating.',
  film: 'The films watched, and what each was worth.',
  book: 'Books finished, from first page to last.',
  podcast: 'Conversations listened to, and the ones worth keeping.',
  video: 'Videos watched, rated.',
};

const NONE: MediaEntry[] = [];

// The sort and the genre chosen for each tab, for the session.
const chosen = new Map<MediaKind, { sort: SortOrder; genre?: string }>();

const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * The library, after Bookmory's: a tab per kind (albums, films, books and podcasts), each with its counts and the spread of its ratings, a grid of covers to
 * sort and filter by genre, and a calendar of covers by the day they were listened to, watched or
 * finished. "Add" looks a new one up and writes its note.
 */
export function LibraryView({ library, files, tab, onTab, today, onOpenNote, onCreated }: Props) {
  // Videos are read as pages, not shelved here: the library is what is rated and added.
  const kinds = KINDS.filter((spec) => spec.kind !== 'video');
  const spec = kinds.find((candidate) => candidate.kind === tab) ?? kindSpec('album');
  const entries = library.get(spec.kind) ?? NONE;
  const [choice, setChoice] = useState<{ sort: SortOrder; genre?: string }>(() => chosen.get(spec.kind) ?? { sort: 'recent' });
  const [shownKind, setShownKind] = useState(spec.kind);
  const [adding, setAdding] = useState(false);
  // A new tab brings back what was chosen on it last.
  if (shownKind !== spec.kind) {
    setShownKind(spec.kind);
    setChoice(chosen.get(spec.kind) ?? { sort: 'recent' });
  }
  const choose = (next: { sort: SortOrder; genre?: string }) => {
    chosen.set(spec.kind, next);
    setChoice(next);
  };
  const stats = libraryStats(entries, today);
  const genres = genreCounts(entries).slice(0, 12);
  const genre = choice.genre && genres.some(([name]) => name === choice.genre) ? choice.genre : undefined;
  const shown = sortEntries(withGenre(entries, genre), choice.sort);
  const source = spec.source;

  return (
    <div className="periodic-frame library-frame" data-testid="library" data-tab={spec.kind} onPointerMove={(event: PointerEvent<HTMLDivElement>) => followPointer(event)}>
      <header className="hero glass library-hero rise" style={order(0)} data-testid="library-hero">
        <div className="hero-aurora" aria-hidden="true" />
        <div className="hero-main">
          <p className="kicker">Library · Rating/{spec.folder}</p>
          <h1 className="hero-title" data-testid="hero-title">
            {spec.tab}
          </h1>
          <BlurText key={spec.kind} text={SUMMARY[spec.kind]} className="hero-summary" />
          {source && (
            <button type="button" className="primary-button library-add" onClick={() => setAdding(true)} data-testid="library-add">
              + Add {spec.one}
            </button>
          )}
        </div>
        <Stats stats={stats} />
      </header>

      <Tabs tabs={kinds.map((candidate) => candidate.tab)} active={spec.tab} onChange={(name) => onTab(kinds.find((candidate) => candidate.tab === name)?.kind ?? 'album')} />

      {entries.length === 0 ? (
        <Empty spec={spec} onAdd={source ? () => setAdding(true) : undefined} />
      ) : (
        <div className="tab-panel" key={spec.kind}>
          <div className="library-tools">
            <div className="library-sorts" role="group" aria-label="Sort">
              {(['recent', 'rating', 'title'] as const).map((sort) => (
                <button
                  key={sort}
                  type="button"
                  className={choice.sort === sort ? 'chip-filter is-on' : 'chip-filter'}
                  onClick={() => choose({ ...choice, sort })}
                  aria-pressed={choice.sort === sort}
                  data-testid="sort"
                  data-sort={sort}
                >
                  {{ recent: 'Recent', rating: 'Rating', title: 'Title' }[sort]}
                </button>
              ))}
            </div>
            {genres.length > 0 && (
              <div className="library-genres" role="group" aria-label="Genre">
                <button type="button" className={genre ? 'chip-filter' : 'chip-filter is-on'} onClick={() => choose({ sort: choice.sort })} data-testid="genre-chip" data-genre="">
                  All <span className="faint">{entries.length}</span>
                </button>
                {genres.map(([name, count]) => (
                  <button
                    key={name}
                    type="button"
                    className={genre === name ? 'chip-filter is-on' : 'chip-filter'}
                    onClick={() => choose({ sort: choice.sort, genre: genre === name ? undefined : name })}
                    data-testid="genre-chip"
                    data-genre={name}
                  >
                    {name} <span className="faint">{count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <ul className="library-grid" style={{ '--aspect': spec.aspect } as CSSProperties} data-testid="library-grid">
            {shown.map((entry, i) => (
              <li key={entry.path} className="rise" style={order(i + 1)}>
                <Card entry={entry} onOpen={onOpenNote} />
              </li>
            ))}
          </ul>

          <CoverCalendar key={spec.kind} spec={spec} entries={entries} today={today} onOpen={onOpenNote} />
        </div>
      )}

      {adding &&
        source &&
        createPortal(
          <ErrorBoundary label={`Adding ${spec.one === 'album' ? 'an' : 'a'} ${spec.one}`} frame={(message) => <div className="add-backdrop" onMouseDown={() => setAdding(false)}>{message}</div>}>
            <AddMedia spec={{ ...spec, source }} files={files} today={today} onClose={() => setAdding(false)} onCreated={onCreated} />
          </ErrorBoundary>,
          document.body,
        )}
    </div>
  );
}

function Stats({ stats }: { stats: ReturnType<typeof libraryStats> }) {
  const most = Math.max(1, ...stats.histogram);
  return (
    <div className="library-stats" data-testid="library-stats">
      <dl className="library-numbers">
        <div>
          <dt className="tile-label">In all</dt>
          <dd className="library-number" data-testid="library-total">
            <CountUp value={stats.total} />
          </dd>
        </div>
        <div>
          <dt className="tile-label">This year</dt>
          <dd className="library-number">
            <CountUp value={stats.thisYear} />
          </dd>
        </div>
        <div>
          <dt className="tile-label">Average</dt>
          <dd className="library-number is-accent" data-testid="library-average">
            {stats.average === undefined ? <span className="faint">—</span> : <CountUp value={stats.average} />}
          </dd>
        </div>
      </dl>
      <div className="histogram" aria-label={`${stats.rated} rated, from 0 to 100`} role="img">
        {stats.histogram.map((count, i) => (
          <span key={i} className={count ? 'histogram-bar' : 'histogram-bar is-empty'} style={{ '--h': count / most, '--i': i } as CSSProperties} title={`${i * 10}–${i === 9 ? 100 : i * 10 + 9}: ${count}`} />
        ))}
      </div>
      <p className="histogram-axis">
        <span>0</span>
        <span>{stats.rated} rated</span>
        <span>100</span>
      </p>
    </div>
  );
}

function Card({ entry, onOpen }: { entry: MediaEntry; onOpen: (path: string) => void }) {
  return (
    <button type="button" className="library-card" onClick={() => onOpen(entry.path)} title={entry.path} data-testid="library-card" data-path={entry.path}>
      <span className="library-cover">
        {entry.cover ? <VaultImage path={entry.cover} alt={entry.title} className="library-cover-image" lazy /> : <span className="library-cover-blank">{entry.title}</span>}
        <span className={entry.rating === undefined ? 'library-badge is-unrated' : 'library-badge'} data-testid="library-rating">
          {entry.rating ?? '—'}
        </span>
      </span>
      <span className="library-card-title">{entry.title}</span>
      <span className="library-card-meta">{[entry.maker, entry.year].filter(Boolean).join(' · ') || ' '}</span>
    </button>
  );
}

function Empty({ spec, onAdd }: { spec: KindSpec; onAdd?: () => void }) {
  return (
    <section className="card glass rise library-empty" style={order(1)} data-testid="library-empty">
      <p className="kicker">Nothing in Rating/{spec.folder} yet</p>
      <h2 className="library-empty-title">Your first {spec.one}</h2>
      <p className="muted">
        {spec.source
          ? `Search ${SOURCE_NAMES[spec.source]}, pick it, rate it. Epizen writes its note the way your vault's ${spec.tab.toLowerCase()} are written, with the cover beside it.`
          : `${spec.tab} are read from Rating/${spec.folder}; add them in Obsidian.`}
      </p>
      {onAdd && (
        <button type="button" className="primary-button" onClick={onAdd} data-testid="library-empty-add">
          + Add {spec.one}
        </button>
      )}
    </section>
  );
}

/** The covers by day, a month at a time, after Bookmory's book calendar, under a strip of the year's months. */
function CoverCalendar({ spec, entries, today, onOpen }: { spec: KindSpec; entries: MediaEntry[]; today: Date; onOpen: (path: string) => void }) {
  const [month, setMonth] = useState(() => calendarStart(entries, today));
  const counts = useMemo(() => monthCounts(entries, month.year), [entries, month.year]);
  const byDay = useMemo(() => monthCovers(entries, month.year, month.month), [entries, month]);
  const most = Math.max(1, ...counts);
  const first = new Date(month.year, month.month, 1);
  const step = (by: number) => {
    const next = new Date(month.year, month.month + by, 1);
    setMonth({ year: next.getFullYear(), month: next.getMonth() });
  };
  const verb = spec.dateLabel.toLowerCase();
  return (
    <Section title="Calendar" note={`${counts[month.month] ?? 0} ${verb} in ${formatDate(first, 'MMMM YYYY')}`} testId="cover-calendar">
      <div className="card glass cover-calendar">
        <div className="calendar-top">
          <h3 className="calendar-month" data-testid="cover-calendar-month">
            {formatDate(first, 'MMMM')} <span className="faint">{month.year}</span>
          </h3>
          <div className="year-strip" role="group" aria-label={`${month.year} by month`}>
            {counts.map((count, i) => (
              <button
                key={i}
                type="button"
                className={i === month.month ? 'year-month is-on' : 'year-month'}
                onClick={() => setMonth({ year: month.year, month: i })}
                title={`${formatDate(new Date(month.year, i, 1), 'MMMM')}: ${count} ${verb}`}
                data-testid="year-month"
              >
                <span className="year-month-bar" style={{ '--h': count / most } as CSSProperties} />
                <span className="year-month-letter">{MONTH_LETTERS[i]}</span>
              </button>
            ))}
          </div>
          <div className="calendar-steps">
            <button type="button" className="nav-chip" onClick={() => step(-1)} aria-label="Previous month" data-testid="cover-calendar-prev">
              ‹
            </button>
            <button type="button" className="nav-chip" onClick={() => step(1)} aria-label="Next month" data-testid="cover-calendar-next">
              ›
            </button>
          </div>
        </div>
        <div className="cover-month" style={{ '--aspect': spec.aspect } as CSSProperties}>
          {WEEKDAYS.map((name) => (
            <span key={name} className="cover-weekday">
              {name}
            </span>
          ))}
          {monthGrid(first)
            // A week wholly in the next month adds nothing.
            .filter((week) => week.some((date) => date.getMonth() === month.month))
            .flat()
            .map((date) => {
              const inside = date.getMonth() === month.month;
              const here = inside ? (byDay.get(date.getDate()) ?? []) : [];
              const top = here[0];
              return (
                <div key={date.getTime()} className={inside ? (here.length ? 'cover-day has-covers' : 'cover-day') : 'cover-day is-outside'} data-testid={inside ? 'cover-day' : undefined}>
                  <span className="cover-day-number">{date.getDate()}</span>
                  {top && (
                    <button type="button" className="cover-day-cover" onClick={() => onOpen(top.path)} title={here.map((entry) => entry.title).join(', ')}>
                      {top.cover ? <VaultImage path={top.cover} alt={top.title} className="cover-day-image" lazy /> : <span className="cover-day-blank">{top.title}</span>}
                      {here.length > 1 && <span className="cover-day-more">+{here.length - 1}</span>}
                    </button>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </Section>
  );
}
