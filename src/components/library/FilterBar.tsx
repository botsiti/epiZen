import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { DEFAULT_FILTERS, isDefaultFilters, kindSpec, periodName, type KindSpec, type LibraryFilters, type LibraryTab, type MediaKind } from '../../lib/library';
import { KindMark, ToolMark } from './marks';
import { Group, Item, Tool } from './menus';

interface Props {
  filters: LibraryFilters;
  onFilters: (filters: LibraryFilters) => void;
  tab: LibraryTab;
  /** The tab's kind; none on All, where the kinds can be filtered too. */
  spec?: KindSpec;
  /** The choices, from what the tab has: the years with something in them, the decades things came out in. */
  years: number[];
  decades: number[];
  /** Each kind and genre with how many the other filters let through. */
  kinds: [MediaKind, number][];
  genres: [string, number][];
}

/** The filters that are added one by one, in the order their pills stand. */
type Optional = 'kinds' | 'genres' | 'rating' | 'released' | 'cover' | 'years';
const NAMES: Record<Optional, string> = { kinds: 'Kind', genres: 'Genre', rating: 'Rating', released: 'Release year', cover: 'Cover', years: 'Recorded years' };

const RATINGS: { id: string; name: string; value: LibraryFilters['rating'] }[] = [
  { id: 'any', name: 'Any', value: {} },
  { id: '90', name: '90 and up', value: { min: 90 } },
  { id: '80', name: '80 and up', value: { min: 80 } },
  { id: '70', name: '70 and up', value: { min: 70 } },
  { id: '60', name: '60 and up', value: { min: 60 } },
  { id: 'below-60', name: 'Below 60', value: { max: 59 } },
  { id: 'unrated', name: 'Not rated yet', value: 'unrated' },
];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A filter's value on its pill: "70+", "1990s", "ambient, folk +1"; "any" while nothing is chosen. */
function valueOf(key: Optional, filters: LibraryFilters, tab: LibraryTab): string | undefined {
  if (key === 'kinds') return filters.kinds?.length ? filters.kinds.map((kind) => kindSpec(kind).tab).join(', ') : undefined;
  if (key === 'years') return filters.years?.length ? filters.years.join(', ') : undefined;
  if (key === 'genres') {
    const genres = filters.genres?.[tab] ?? [];
    return genres.length ? `${genres.slice(0, 2).join(', ')}${genres.length > 2 ? ` +${genres.length - 2}` : ''}` : undefined;
  }
  if (key === 'cover') return filters.cover === 'with' ? 'with one' : filters.cover === 'without' ? 'without' : undefined;
  if (key === 'rating') {
    const rating = filters.rating;
    if (rating === 'unrated') return 'not rated yet';
    if (!rating || (rating.min === undefined && rating.max === undefined)) return undefined;
    if (rating.max === undefined) return `${rating.min}+`;
    if (rating.min === undefined) return `up to ${rating.max}`;
    return `${rating.min}–${rating.max}`;
  }
  const released = filters.released;
  if (!released || (released.from === undefined && released.to === undefined)) return undefined;
  const { from, to } = released;
  if (from !== undefined && to !== undefined) return from % 10 === 0 && to === from + 9 ? `${from}s` : from === to ? String(from) : `${from}–${to}`;
  return from !== undefined ? `from ${from}` : `until ${to}`;
}

/** Whether a filter is on the bar (added), whatever is chosen in it. */
const has = (key: Optional, filters: LibraryFilters, tab: LibraryTab) => (key === 'genres' ? Boolean(filters.genres && tab in filters.genres) : filters[key] !== undefined);

/** Two whole-number fields, from and to, set when one is left or Enter is pressed. */
function Between({ label, from, to, low, high, onSet, testId }: { label: string; from?: number; to?: number; low: number; high: number; onSet: (from?: number, to?: number) => void; testId: string }) {
  const [draft, setDraft] = useState<{ from?: string; to?: string }>({});
  const [problem, setProblem] = useState<string>();
  const shown = (end: 'from' | 'to', value?: number) => draft[end] ?? (value === undefined ? '' : String(value));
  const number = (text: string | undefined, fallback?: number) => {
    if (text === undefined) return fallback;
    if (!text.trim()) return undefined;
    const n = Number(text.trim());
    if (!Number.isInteger(n) || n < low || n > high) throw new Error(`Enter whole numbers from ${low} to ${high}.`);
    return n;
  };
  const commit = () => {
    if (draft.from === undefined && draft.to === undefined) return;
    try {
      const first = number(draft.from, from), last = number(draft.to, to);
      if (first !== undefined && last !== undefined && first > last) throw new Error('The first number must not exceed the last.');
      onSet(first, last); setDraft({}); setProblem(undefined);
    } catch (error) { setProblem(error instanceof Error ? error.message : String(error)); }
  };
  const keys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') { event.preventDefault(); commit(); }
  };
  return (
    <div className="filter-between" role="group" aria-label={label}>
      <span className="tool-label">{label}</span>
      <input
        inputMode="numeric"
        value={shown('from', from)}
        placeholder={String(low)}
        aria-label={`${label} from`}
        onChange={(event) => setDraft({ ...draft, from: event.target.value })}
        onBlur={commit}
        onKeyDown={keys}
        data-testid={`${testId}-from`}
      />
      <span className="faint">to</span>
      <input
        inputMode="numeric"
        value={shown('to', to)}
        placeholder={String(high)}
        aria-label={`${label} to`}
        onChange={(event) => setDraft({ ...draft, to: event.target.value })}
        onBlur={commit}
        onKeyDown={keys}
        data-testid={`${testId}-to`}
      />
      {problem && <p className="filter-between-error" role="alert">{problem}</p>}
    </div>
  );
}

/**
 * The filters as pills under the toolbar, after Notion's: the period always (This year at first),
 * then each filter added with "+ Filter", its value on its pill ("Rating 70+"), a click to change
 * it, × to take it away. "All time" beside the period, and "Reset" back to This year alone.
 */
export function FilterBar({ filters, onFilters, tab, spec, years, decades, kinds, genres }: Props) {
  // The filter just added opens at once, to be set.
  const [added, setAdded] = useState<Optional>();
  const [find, setFind] = useState('');
  const optional: Optional[] = spec ? ['genres', 'rating', 'released', 'cover', 'years'] : ['kinds', 'genres', 'rating', 'released', 'cover', 'years'];
  const on = optional.filter((key) => has(key, filters, tab));
  const set = (next: Partial<LibraryFilters>) => onFilters(Object.fromEntries(Object.entries({ ...filters, ...next }).filter(([, value]) => value !== undefined)) as unknown as LibraryFilters);
  const remove = (key: Optional) => {
    const next = { ...filters };
    if (key === 'genres') {
      const genres = { ...filters.genres };
      delete genres[tab];
      next.genres = genres;
      if (!Object.keys(genres).length) delete next.genres;
    } else delete next[key];
    onFilters(next);
  };
  const tabGenres = filters.genres?.[tab] ?? [];
  const toggleGenre = (name: string) => set({ genres: { ...filters.genres, [tab]: tabGenres.includes(name) ? tabGenres.filter((genre) => genre !== name) : [...tabGenres, name] } });
  const shownGenres = genres
    .filter(([name]) => tabGenres.includes(name) || name.includes(find.trim().toLowerCase()))
    .sort((a, b) => Number(tabGenres.includes(b[0])) - Number(tabGenres.includes(a[0])));

  const editors: Record<Optional, () => ReactNode> = {
    years: () => years.map((year) => <Item key={year} role="menuitemcheckbox" checked={Boolean(filters.years?.includes(String(year)))} onSelect={() => { const current = filters.years ?? [], value = String(year); set({ period: 'all', years: current.includes(value) ? current.filter((item) => item !== value) : [...current, value] }); }} testId="recorded-year" data={{ 'data-year': String(year) }}><span className="tool-item-name">{year}</span></Item>),
    kinds: () =>
      kinds.map(([kind, n]) => (
        <Item
          key={kind}
          role="menuitemcheckbox"
          checked={Boolean(filters.kinds?.includes(kind))}
          onSelect={() => set({ kinds: filters.kinds?.includes(kind) ? filters.kinds.filter((other) => other !== kind) : [...(filters.kinds ?? []), kind] })}
          testId="kind-chip"
          data={{ 'data-kind': kind }}
        >
          <KindMark kind={kind} />
          <span className="tool-item-name">{kindSpec(kind).tab}</span>
          <span className="tool-item-hint">{n}</span>
        </Item>
      )),
    genres: () => (
      <>
        <label className="filter-find">
          <ToolMark name="search" />
          <input value={find} placeholder="Find a genre" aria-label="Find a genre" onChange={(event) => setFind(event.target.value)} data-testid="genre-find" data-focus-first />
        </label>
        <div role="group" aria-label="Genres" className="filter-choices">
          {shownGenres.slice(0, 40).map(([name, n]) => (
            <Item key={name} role="checkbox" checked={tabGenres.includes(name)} onSelect={() => toggleGenre(name)} testId="genre-chip" data={{ 'data-genre': name }}>
              <span className="tool-item-name">{name}</span>
              <span className="tool-item-hint">{n}</span>
            </Item>
          ))}
          {!shownGenres.length && <p className="filter-none">No genre has those letters.</p>}
        </div>
      </>
    ),
    rating: () => (
      <>
        <Group label="Rating" role="radiogroup">
          {RATINGS.map((preset) => (
            <Item key={preset.id} role="radio" checked={same(filters.rating, preset.value)} onSelect={() => set({ rating: preset.value })} testId="rating-preset" data={{ 'data-rating': preset.id }}>
              <span className="tool-item-name">{preset.name}</span>
            </Item>
          ))}
        </Group>
        <Between
          label="Between"
          from={filters.rating === 'unrated' ? undefined : filters.rating?.min}
          to={filters.rating === 'unrated' ? undefined : filters.rating?.max}
          low={0}
          high={100}
          onSet={(min, max) => set({ rating: { ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) } })}
          testId="rating"
        />
      </>
    ),
    released: () => (
      <>
        <Group label="Came out" role="radiogroup">
          <Item role="radio" checked={same(filters.released, {})} onSelect={() => set({ released: {} })} testId="decade" data={{ 'data-decade': 'any' }}>
            <span className="tool-item-name">Any year</span>
          </Item>
          {decades.map((decade) => (
            <Item
              key={decade}
              role="radio"
              checked={same(filters.released, { from: decade, to: decade + 9 })}
              onSelect={() => set({ released: { from: decade, to: decade + 9 } })}
              testId="decade"
              data={{ 'data-decade': String(decade) }}
            >
              <span className="tool-item-name">{decade}s</span>
            </Item>
          ))}
        </Group>
        <Between
          label="Between"
          from={filters.released?.from}
          to={filters.released?.to}
          low={0}
          high={9999}
          onSet={(from, to) => set({ released: { ...(from === undefined ? {} : { from }), ...(to === undefined ? {} : { to }) } })}
          testId="released"
        />
      </>
    ),
    cover: () =>
      (['any', 'with', 'without'] as const).map((cover) => (
        <Item key={cover} checked={(filters.cover ?? 'any') === cover} onSelect={() => set({ cover })} testId="cover-filter" data={{ 'data-cover': cover }}>
          <span className="tool-item-name">{{ any: 'Any', with: 'With a cover', without: 'Without a cover' }[cover]}</span>
        </Item>
      )),
  };

  return (
    <div className="filter-bar" role="group" aria-label="Filters" data-testid="filter-bar">
      <span className="filter-pill is-period" data-testid="filter-pill" data-filter="period">
        <Tool label={periodName(filters.period)} mark="calendar" testId="filter-period" menuLabel="When" className="filter-pill-button" closes>
          <Group label="Lately">
            {(['this-year', 'last-12'] as const).map((period) => (
              <Item key={period} checked={filters.period === period && !filters.years?.length} onSelect={() => set({ period, years: undefined })} testId="period" data={{ 'data-period': period }}>
                <span className="tool-item-name">{periodName(period)}</span>
              </Item>
            ))}
          </Group>
          {years.length > 0 && (
            <Group label="Years">
              {years.map((year) => (
                <Item key={year} checked={filters.period === year && !filters.years?.length} onSelect={() => set({ period: year, years: undefined })} testId="period" data={{ 'data-period': String(year) }}>
                  <span className="tool-item-name">{year}</span>
                </Item>
              ))}
            </Group>
          )}
          <Group label="Ever">
            <Item checked={filters.period === 'all' && !filters.years?.length} onSelect={() => set({ period: 'all', years: undefined })} testId="period" data={{ 'data-period': 'all' }}>
              <span className="tool-item-name">All time</span>
            </Item>
          </Group>
        </Tool>
      </span>
      {on.map((key) => {
        const value = valueOf(key, filters, tab);
        return (
          <span key={key} className="filter-pill" data-testid="filter-pill" data-filter={key}>
            <Tool
              label={
                <>
                  <span className="pill-key">{NAMES[key]}</span>
                  <span className={value ? 'pill-value' : 'pill-value is-any'}>{value ?? 'any'}</span>
                </>
              }
              testId={`filter-${key}`}
              menuLabel={NAMES[key]}
              className="filter-pill-button"
              closes={key === 'cover'}
              dialog={key === 'genres' || key === 'rating' || key === 'released'}
              open={added === key}
            >
              {editors[key]()}
            </Tool>
            <button type="button" className="pill-remove" onClick={() => remove(key)} aria-label={`Take away the ${NAMES[key].toLowerCase()} filter`} data-testid="filter-remove" data-filter={key}>
              <ToolMark name="close" />
            </button>
          </span>
        );
      })}
      {on.length < optional.length && (
        <Tool label="Add filter" mark="plus" testId="filter-add" menuLabel="Add a filter" className="filter-add" closes>
          {optional
            .filter((key) => !on.includes(key))
            .map((key) => (
              <Item
                key={key}
                checked={false}
                onSelect={() => {
                  setAdded(key);
                  set(key === 'genres' ? { genres: { ...filters.genres, [tab]: [] } } : key === 'kinds' ? { kinds: [] } : key === 'years' ? { years: [] } : key === 'cover' ? { cover: 'any' } : { [key]: {} });
                }}
                testId="filter-add-item"
                data={{ 'data-filter': key }}
              >
                <span className="tool-item-name">{NAMES[key]}</span>
              </Item>
            ))}
        </Tool>
      )}
      {(filters.period !== 'all' || Boolean(filters.years?.length)) && (
        <button type="button" className="filter-quiet" onClick={() => set({ period: 'all', years: undefined })} data-testid="filter-all-time">
          All time
        </button>
      )}
      {!isDefaultFilters(filters) && (
        <button type="button" className="filter-quiet" onClick={() => onFilters({ ...DEFAULT_FILTERS })} data-testid="filter-reset">
          Reset
        </button>
      )}
    </div>
  );
}
