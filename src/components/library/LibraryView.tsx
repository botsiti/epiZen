import { useMemo, useState, type CSSProperties, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { VaultFile } from '../../lib/api';
import { formatDate, monthGrid } from '../../lib/dates';
import {
  allEntries,
  calendarStart,
  genreCounts,
  kindCounts,
  kindSpec,
  libraryStats,
  monthCounts,
  monthCovers,
  SHELVED_KINDS,
  sortEntries,
  toggleKind,
  withGenre,
  type KindSpec,
  type LibraryTab,
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
  tab: LibraryTab;
  onTab: (tab: LibraryTab) => void;
  today: Date;
  onOpenNote: (path: string) => void;
  /** A new note was created by Add: read the vault again and open it. */
  onCreated: (path: string) => Promise<void>;
}

const SUMMARY: Record<LibraryTab, string> = {
  all: 'Everything rated, together: the albums, films, books and podcasts, and the days they filled.',
  album: 'Every album listened to, with its cover and its rating.',
  film: 'The films watched, and what each was worth.',
  book: 'Books finished, from first page to last.',
  podcast: 'Conversations listened to, and the ones worth keeping.',
  video: 'Videos watched, rated.',
};

const NONE: MediaEntry[] = [];
const ALL = 'All';

interface Choice {
  sort: SortOrder;
  genre?: string;
  /** The All tab's kind chips; none on shows every kind. */
  kinds?: ReadonlySet<MediaKind>;
}

// The sort, the genre and the kinds chosen on each tab, for the session.
const chosen = new Map<LibraryTab, Choice>();

const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** At most this many covers fan out on one day of the calendar; the rest is "+n". */
const FAN = 3;

const a = (word: string) => `${/^[aeiou]/.test(word) ? 'an' : 'a'} ${word}`;
const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * The library, after Bookmory's: everything together on "All", where it opens, then a tab per kind
 * (albums, films, books and podcasts), each with its counts and the spread of its ratings, a grid
 * of covers to sort and filter by genre (and on All by kind), and a calendar of covers by the day
 * they were listened to, watched or finished. The hero has an Add for every kind on every tab.
 */
export function LibraryView({ library, files, tab, onTab, today, onOpenNote, onCreated }: Props) {
  // Videos are read as pages, not shelved here: the library is what is rated and added.
  const kinds = SHELVED_KINDS.map(kindSpec);
  const spec = tab === 'all' ? undefined : kinds.find((candidate) => candidate.kind === tab);
  const shownTab: LibraryTab = spec?.kind ?? 'all';
  const [choice, setChoice] = useState<Choice>(() => chosen.get(shownTab) ?? { sort: 'recent' });
  const [lastTab, setLastTab] = useState(shownTab);
  const [adding, setAdding] = useState<MediaKind>();
  // A new tab brings back what was chosen on it last.
  if (lastTab !== shownTab) {
    setLastTab(shownTab);
    setChoice(chosen.get(shownTab) ?? { sort: 'recent' });
  }
  const choose = (next: Choice) => {
    chosen.set(shownTab, next);
    setChoice(next);
  };

  const everything = useMemo(() => allEntries(library), [library]);
  const onKinds = choice.kinds ?? new Set<MediaKind>();
  const entries = spec ? (library.get(spec.kind) ?? NONE) : everything;
  // On All, the kind chips narrow the grid and the calendar; the hero counts everything.
  const listed = spec ? entries : allEntries(library, onKinds);
  const stats = libraryStats(entries, today);
  const genres = genreCounts(listed).slice(0, 12);
  const genre = choice.genre && genres.some(([name]) => name === choice.genre) ? choice.genre : undefined;
  const shown = sortEntries(withGenre(listed, genre), choice.sort);
  const adder = adding ? kindSpec(adding) : undefined;

  return (
    <div className="periodic-frame library-frame" data-testid="library" data-tab={shownTab} onPointerMove={(event: PointerEvent<HTMLDivElement>) => followPointer(event)}>
      <header className="hero glass library-hero rise" style={order(0)} data-testid="library-hero">
        <div className="hero-aurora" aria-hidden="true" />
        <div className="hero-main">
          <p className="kicker">Library · Rating{spec ? `/${spec.folder}` : ''}</p>
          <h1 className="hero-title" data-testid="hero-title">
            {spec ? spec.tab : 'Library'}
          </h1>
          <BlurText key={shownTab} text={SUMMARY[shownTab]} className="hero-summary" />
          <div className="library-adds" role="group" aria-label="Add">
            {/* The tab's own kind first, in the primary button; the rest quiet beside it. */}
            {kinds.toSorted((x, y) => Number(y.kind === spec?.kind) - Number(x.kind === spec?.kind)).map((kind) => (
              <button
                key={kind.kind}
                type="button"
                className={kind.kind === spec?.kind ? 'primary-button library-add' : 'nav-chip library-add is-quiet'}
                onClick={() => setAdding(kind.kind)}
                data-testid="library-add"
                data-kind={kind.kind}
              >
                + {kind.kind === spec?.kind ? `Add ${kind.kind === 'podcast' ? 'episode' : kind.one}` : capital(kind.kind === 'podcast' ? 'episode' : kind.one)}
              </button>
            ))}
          </div>
        </div>
        <Stats stats={stats} />
      </header>

      <Tabs
        tabs={[ALL, ...kinds.map((candidate) => candidate.tab)]}
        active={spec?.tab ?? ALL}
        onChange={(name) => onTab(kinds.find((candidate) => candidate.tab === name)?.kind ?? 'all')}
      />

      {entries.length === 0 ? (
        spec ? <Empty spec={spec} onAdd={() => setAdding(spec.kind)} /> : <EmptyAll onAdd={setAdding} />
      ) : (
        <div className="tab-panel" key={shownTab}>
          {!spec && (
            <div className="library-kinds" role="group" aria-label="Kinds">
              {kindCounts(library).map(([kind, count]) => (
                <button
                  key={kind}
                  type="button"
                  className={onKinds.has(kind) ? 'chip-filter library-kind is-on' : 'chip-filter library-kind'}
                  onClick={() => choose({ ...choice, kinds: toggleKind(onKinds, kind) })}
                  aria-pressed={onKinds.has(kind)}
                  disabled={!count}
                  data-testid="kind-chip"
                  data-kind={kind}
                >
                  <KindMark kind={kind} />
                  {kindSpec(kind).tab} <span className="faint">{count}</span>
                </button>
              ))}
            </div>
          )}
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
                <button type="button" className={genre ? 'chip-filter' : 'chip-filter is-on'} onClick={() => choose({ ...choice, genre: undefined })} data-testid="genre-chip" data-genre="">
                  All <span className="faint">{listed.length}</span>
                </button>
                {genres.map(([name, count]) => (
                  <button
                    key={name}
                    type="button"
                    className={genre === name ? 'chip-filter is-on' : 'chip-filter'}
                    onClick={() => choose({ ...choice, genre: genre === name ? undefined : name })}
                    data-testid="genre-chip"
                    data-genre={name}
                  >
                    {name} <span className="faint">{count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <ul className={spec ? 'library-grid' : 'library-grid is-mixed'} style={spec ? ({ '--aspect': spec.aspect } as CSSProperties) : undefined} data-testid="library-grid">
            {shown.map((entry, i) => (
              <li key={entry.path} className="rise" style={order(Math.min(i + 1, 24))}>
                <Card entry={entry} mixed={!spec} onOpen={onOpenNote} />
              </li>
            ))}
          </ul>

          <CoverCalendar key={shownTab} spec={spec} entries={listed} today={today} onOpen={onOpenNote} />
        </div>
      )}

      {adder?.source &&
        createPortal(
          <ErrorBoundary label={`Adding ${a(adder.one)}`} frame={(message) => <div className="add-backdrop" onMouseDown={() => setAdding(undefined)}>{message}</div>}>
            <AddMedia key={adder.kind} spec={{ ...adder, source: adder.source }} files={files} today={today} onClose={() => setAdding(undefined)} onCreated={onCreated} />
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

/** A kind's small mark, drawn in lines: a record, a strip of film, a book, a microphone. */
function KindMark({ kind }: { kind: MediaKind }) {
  const paths: Partial<Record<MediaKind, string>> = {
    album: 'M8 1.75a6.25 6.25 0 1 0 0 12.5 6.25 6.25 0 0 0 0-12.5ZM8 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z',
    film: 'M3 2.25h10v11.5H3zM5.5 2.25v11.5M10.5 2.25v11.5M3 5.5h2.5M3 8h2.5M3 10.5h2.5M10.5 5.5H13M10.5 8H13M10.5 10.5H13',
    book: 'M3.25 2.75c1.8-.6 3.4-.4 4.75.6v10.4c-1.35-1-2.95-1.2-4.75-.6zM12.75 2.75c-1.8-.6-3.4-.4-4.75.6v10.4c1.35-1 2.95-1.2 4.75-.6z',
    podcast: 'M6 2.25h4v6.5a2 2 0 0 1-4 0zM3.75 7.5a4.25 4.25 0 0 0 8.5 0M8 11.75v2.5M5.75 14.25h4.5',
  };
  return (
    <svg className="kind-mark" viewBox="0 0 16 16" aria-hidden="true">
      <path d={paths[kind] ?? ''} />
    </svg>
  );
}

function Card({ entry, mixed, onOpen }: { entry: MediaEntry; mixed?: boolean; onOpen: (path: string) => void }) {
  const spec = kindSpec(entry.kind);
  return (
    <button
      type="button"
      className="library-card"
      style={mixed ? ({ '--aspect': spec.aspect } as CSSProperties) : undefined}
      onClick={() => onOpen(entry.path)}
      title={entry.path}
      data-testid="library-card"
      data-path={entry.path}
      data-kind={entry.kind}
    >
      <span className="library-cover">
        {entry.cover ? <VaultImage path={entry.cover} alt={entry.title} className="library-cover-image" lazy /> : <span className="library-cover-blank">{entry.title}</span>}
        <span className={entry.rating === undefined ? 'library-badge is-unrated' : 'library-badge'} data-testid="library-rating">
          {entry.rating ?? '—'}
        </span>
      </span>
      <span className="library-card-title">{entry.title}</span>
      <span className="library-card-meta">
        {mixed && (
          <span className="library-card-kind" data-testid="library-card-kind">
            <KindMark kind={entry.kind} />
            {spec.one}
          </span>
        )}
        {[entry.maker, entry.year].filter(Boolean).join(' · ') || ' '}
      </span>
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
      {onAdd && spec.source && (
        <button type="button" className="primary-button" onClick={onAdd} data-testid="library-empty-add">
          + Add {spec.kind === 'podcast' ? 'episode' : spec.one}
        </button>
      )}
    </section>
  );
}

function EmptyAll({ onAdd }: { onAdd: (kind: MediaKind) => void }) {
  return (
    <section className="card glass rise library-empty" style={order(1)} data-testid="library-empty">
      <p className="kicker">Nothing rated yet</p>
      <h2 className="library-empty-title">Your first one</h2>
      <p className="muted">Pick an album, a film, a book or a podcast episode, rate it, and it lands here with its cover, on the day it filled.</p>
      <div className="library-adds">
        {SHELVED_KINDS.map((kind) => (
          <button key={kind} type="button" className="nav-chip library-add is-quiet" onClick={() => onAdd(kind)} data-testid="library-empty-add" data-kind={kind}>
            + {capital(kind === 'podcast' ? 'episode' : kindSpec(kind).one)}
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * The covers by day, a month at a time, after Bookmory's book calendar, under a strip of the
 * year's months. Several on one day fan out like cards in a hand, the best rated in front.
 */
function CoverCalendar({ spec, entries, today, onOpen }: { spec?: KindSpec; entries: MediaEntry[]; today: Date; onOpen: (path: string) => void }) {
  const [month, setMonth] = useState(() => calendarStart(entries, today));
  const counts = useMemo(() => monthCounts(entries, month.year), [entries, month.year]);
  const byDay = useMemo(() => monthCovers(entries, month.year, month.month), [entries, month]);
  const most = Math.max(1, ...counts);
  const first = new Date(month.year, month.month, 1);
  const step = (by: number) => {
    const next = new Date(month.year, month.month + by, 1);
    setMonth({ year: next.getFullYear(), month: next.getMonth() });
  };
  const verb = spec ? ` ${spec.dateLabel.toLowerCase()}` : '';
  return (
    <Section title="Calendar" note={`${counts[month.month] ?? 0}${verb} in ${formatDate(first, 'MMMM YYYY')}`} testId="cover-calendar">
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
                title={`${formatDate(new Date(month.year, i, 1), 'MMMM')}: ${count}${verb}`}
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
        <div className="cover-month" style={spec ? ({ '--aspect': spec.aspect } as CSSProperties) : undefined}>
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
              const fan = here.slice(0, FAN);
              return (
                <div
                  key={date.getTime()}
                  className={inside ? (here.length ? 'cover-day has-covers' : 'cover-day') : 'cover-day is-outside'}
                  data-testid={inside ? 'cover-day' : undefined}
                  data-day={inside ? date.getDate() : undefined}
                  data-count={here.length || undefined}
                >
                  <span className="cover-day-number">{date.getDate()}</span>
                  {fan.length > 0 && (
                    <div className={`cover-fan is-${fan.length}`} title={here.map((entry) => entry.title).join(', ')}>
                      {fan
                        .map((entry, i) => (
                          <button
                            key={entry.path}
                            type="button"
                            className={`cover-day-cover is-n${i}`}
                            style={{ '--aspect': kindSpec(entry.kind).aspect } as CSSProperties}
                            onClick={() => onOpen(entry.path)}
                            title={entry.title}
                            data-testid="cover-day-cover"
                            data-path={entry.path}
                          >
                            {entry.cover ? <VaultImage path={entry.cover} alt={entry.title} className="cover-day-image" lazy /> : <span className="cover-day-blank">{entry.title}</span>}
                          </button>
                        ))
                        // The best rated is drawn last, on top of the others.
                        .reverse()}
                      {here.length > FAN && <span className="cover-day-more">+{here.length - FAN}</span>}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </Section>
  );
}
