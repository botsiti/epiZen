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
  LATEST,
  libraryStats,
  monthCounts,
  monthCovers,
  searchEntries,
  SHELVED_KINDS,
  sortEntries,
  toggleKind,
  withGenre,
  type KindSpec,
  type LibraryLayout,
  type LibraryTab,
  type ListColumn,
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
import { FindCovers } from './FindCovers';
import { LibraryList } from './LibraryList';
import { LibraryToolbar } from './LibraryToolbar';
import { KindMark, ToolMark } from './marks';
import '../periodic/periodic.css';
import './library.css';

interface Props {
  library: ReadonlyMap<MediaKind, MediaEntry[]>;
  files: VaultFile[];
  tab: LibraryTab;
  onTab: (tab: LibraryTab) => void;
  /** Covers or the list, and the list's hidden columns: kept in the app's settings, never the vault. */
  layout: LibraryLayout;
  onLayout: (layout: LibraryLayout) => void;
  hidden: readonly ListColumn[];
  onHidden: (hidden: ListColumn[]) => void;
  today: Date;
  onOpenNote: (path: string) => void;
  /** A new note was created by Add: read the vault again and open it. */
  onCreated: (path: string) => Promise<void>;
  /** Notes were changed here (covers found for them): read the vault again. */
  onChanged: () => Promise<void>;
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
  /** The list's sort; the covers show the latest. */
  sort: SortOrder;
  genre?: string;
  /** The All tab's kinds; none on shows every kind. */
  kinds?: ReadonlySet<MediaKind>;
  /** What the list is searched for. */
  search?: string;
}

// The sort, the filters and the search chosen on each tab, for the session.
const chosen = new Map<LibraryTab, Choice>();

const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** At most this many covers fan out on one day of the calendar; the rest is "+n". */
const FAN = 3;
/**
 * The list's rows that rise into place as it opens: those on its first screen. The hundreds below
 * come in still; animating them too (with a blur) stalled the opening.
 */
const RISING = 24;

const a = (word: string) => `${/^[aeiou]/.test(word) ? 'an' : 'a'} ${word}`;
const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
const results = (n: number) => `${n} ${n === 1 ? 'result' : 'results'}`;

/**
 * The library, after Bookmory's: everything together on "All", where it opens, then a tab per kind
 * (albums, films, books and podcasts), each with its counts and the spread of its ratings. Under
 * the tabs a toolbar, after Obsidian's bases: the latest fifteen as covers, with a calendar of
 * covers by the day they were listened to, watched or finished, or all of them as a list to sort,
 * search and pick the columns of. Both filter by genre, and on All by kind. The hero has an Add
 * for every kind on every tab.
 */
export function LibraryView({ library, files, tab, onTab, layout, onLayout, hidden, onHidden, today, onOpenNote, onCreated, onChanged }: Props) {
  // Videos are read as pages, not shelved here: the library is what is rated and added.
  const kinds = SHELVED_KINDS.map(kindSpec);
  const spec = tab === 'all' ? undefined : kinds.find((candidate) => candidate.kind === tab);
  const shownTab: LibraryTab = spec?.kind ?? 'all';
  const [choice, setChoice] = useState<Choice>(() => chosen.get(shownTab) ?? { sort: 'recent' });
  const [lastTab, setLastTab] = useState(shownTab);
  const [adding, setAdding] = useState<MediaKind>();
  // The notes that were in view without a cover when "Find covers" was pressed.
  const [finding, setFinding] = useState<MediaEntry[]>();
  // A new tab brings back what was chosen on it last.
  if (lastTab !== shownTab) {
    setLastTab(shownTab);
    setChoice(chosen.get(shownTab) ?? { sort: 'recent' });
  }
  const choose = (next: Choice) => {
    chosen.set(shownTab, next);
    setChoice(next);
  };
  // The search is the list's: the covers have none, so going to them leaves it, on every tab, and
  // "See all N" is what the list will show.
  const showAs = (next: LibraryLayout) => {
    if (next === 'covers') {
      for (const [kept, was] of chosen) chosen.set(kept, { ...was, search: undefined });
      setChoice({ ...choice, search: undefined });
    }
    onLayout(next);
  };

  const everything = useMemo(() => allEntries(library), [library]);
  const onKinds = choice.kinds ?? new Set<MediaKind>();
  const entries = spec ? (library.get(spec.kind) ?? NONE) : everything;
  // On All, the kinds narrow the covers, the list and the calendar, as the genre does; the hero counts everything.
  const listed = spec ? entries : allEntries(library, onKinds);
  const stats = libraryStats(entries, today);
  const genres = genreCounts(listed).slice(0, 12);
  const genre = choice.genre && genres.some(([name]) => name === choice.genre) ? choice.genre : undefined;
  const filtered = withGenre(listed, genre);
  const list = layout === 'list';
  const search = choice.search ?? '';
  // The covers are the latest few; the list is all of them, sorted and searched.
  const shown = list ? sortEntries(searchEntries(filtered, search), choice.sort) : sortEntries(filtered, 'recent');
  const latest = list ? NONE : shown.slice(0, LATEST);
  const adder = adding ? kindSpec(adding) : undefined;
  // Those in view a cover can be looked up for: all that are filtered (and searched) to, not only the latest.
  const coverless = shown.filter((entry) => !entry.cover && kindSpec(entry.kind).source);
  const count = list ? results(shown.length) : shown.length > LATEST ? `The latest ${LATEST} of ${shown.length}` : results(shown.length);
  const summary = [...onKinds].map((kind) => kindSpec(kind).tab).concat(genre ? [genre] : []).join(' · ') || undefined;

  return (
    <div className="periodic-frame library-frame" data-testid="library" data-tab={shownTab} data-layout={layout} onPointerMove={(event: PointerEvent<HTMLDivElement>) => followPointer(event)}>
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
          <LibraryToolbar
            layout={layout}
            onLayout={showAs}
            count={count}
            summary={summary}
            spec={spec}
            kinds={kindCounts(library)}
            onKinds={onKinds}
            onToggleKind={(kind) => choose({ ...choice, kinds: toggleKind(onKinds, kind) })}
            genres={genres}
            genre={genre}
            onGenre={(next) => choose({ ...choice, genre: next })}
            onClear={() => choose({ ...choice, kinds: undefined, genre: undefined })}
            sort={choice.sort}
            onSort={(sort) => choose({ ...choice, sort })}
            hidden={hidden}
            onHidden={onHidden}
            search={search}
            onSearch={(next) => choose({ ...choice, search: next })}
          />

          {coverless.length > 0 && (
            <p className="library-missing" data-testid="library-missing">
              <span>{coverless.length} without a cover</span>{' '}
              <span className="faint" aria-hidden="true">
                ·
              </span>{' '}
              <button type="button" className="library-find" onClick={() => setFinding(coverless)} data-testid="find-covers-open">
                Find covers
              </button>
            </p>
          )}

          {list ? (
            shown.length ? (
              <LibraryList entries={shown} spec={spec} sort={choice.sort} onSort={(sort) => choose({ ...choice, sort })} hidden={hidden} onOpen={onOpenNote} rising={RISING} />
            ) : (
              <p className="library-none" data-testid="library-none">
                Nothing here matches “{search.trim()}”.{' '}
                <button type="button" className="library-find" onClick={() => choose({ ...choice, search: '' })}>
                  Clear the search
                </button>
              </p>
            )
          ) : (
            <>
              <ul className={spec ? 'library-grid' : 'library-grid is-mixed'} data-testid="library-grid">
                {latest.map((entry, i) => (
                  <li key={entry.path} className="rise" style={{ ...order(i + 1), '--aspect': kindSpec(entry.kind).aspect } as CSSProperties}>
                    <Card entry={entry} mixed={!spec} onOpen={onOpenNote} />
                  </li>
                ))}
              </ul>
              {shown.length > LATEST && (
                <button type="button" className="library-more" onClick={() => showAs('list')} data-testid="library-see-all">
                  See all {shown.length} in the list
                  <ToolMark name="arrow" />
                </button>
              )}
              <CoverCalendar key={shownTab} spec={spec} entries={filtered} today={today} onOpen={onOpenNote} />
            </>
          )}
        </div>
      )}

      {finding &&
        createPortal(
          <ErrorBoundary label="Finding covers" frame={(message) => <div className="add-backdrop" onMouseDown={() => setFinding(undefined)}>{message}</div>}>
            <FindCovers entries={finding} files={files} scope={spec ? spec.tab : 'Library'} onClose={() => setFinding(undefined)} onSaved={onChanged} />
          </ErrorBoundary>,
          document.body,
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

function Card({ entry, mixed, onOpen }: { entry: MediaEntry; mixed?: boolean; onOpen: (path: string) => void }) {
  const spec = kindSpec(entry.kind);
  return (
    <button
      type="button"
      className="library-card"
      onClick={() => onOpen(entry.path)}
      // The whole title where the card's ends in "…"; never the file's path.
      title={entry.title}
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
          <h3 className="cover-calendar-month" data-testid="cover-calendar-month">
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
