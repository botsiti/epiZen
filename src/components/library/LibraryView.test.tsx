import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { VaultFile } from '../../lib/api';
import { collectLibrary, type LibraryLayout, type LibraryTab, type ListColumn } from '../../lib/library';
import { LibraryView } from './LibraryView';

vi.mock('../../lib/api', () => ({
  readImage: vi.fn(() => Promise.resolve(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>').buffer)),
  lookupJson: vi.fn(() => Promise.resolve({ results: [] })),
  lookupImage: vi.fn(() => Promise.reject(new Error('offline'))),
}));

// Numbers show their value at once, as in the e2e run.
beforeAll(() => {
  document.documentElement.dataset.motion = 'off';
});

// Notes from demo-vault/Rating, shortened: two of them on 21 September, and two on the 3rd.
const notes = [
  { path: 'Rating/music/Monastery Wi-Fi.md', text: '---\nArtist: Hollow Choir\nYear: 2019\nlistened: 2026-09-27\ngenre:\n  - ambient\nrating: 81\n---\n' },
  { path: 'Rating/music/Salt & Graphite.md', text: '---\nArtist: Ostrava Signal\nYear: 2016\nlistened: 2026-09-21\ngenre:\n  - post-rock\nrating: 70\n---\n' },
  { path: 'Rating/kino/Static Bloom.md', text: '---\nYear: 2024\nWatched: 2026-09-21\ngenre:\n  - sci-fi\nrating: 68\n---\n' },
  { path: 'Rating/books/Thinking in Seasons.md', text: '---\nAuthor: Ada Morrow\nYear: 2023\nGenre_book:\n  - philosophy\nRating: 81\nFinshed: 2026-09-03\nStarted: 2026-08-26\n---\n' },
  { path: 'Rating/podcasts/Why Dogs Dream.md', text: '---\nAuthor: Field Notes Weekly\nRating: 85\nGenre:\n  - science\nListened: 2026-09-03\n---\n' },
  { path: 'Rating/youtube/How I Plan a Week in Plain Text.md', text: '---\nChannel: Slow Systems\nWatched: 2026-09-15\nrating: 81\n---\n' },
];
const files: VaultFile[] = notes.map((note) => ({ path: note.path, kind: 'note' }));
const library = collectLibrary(notes, files);

function renderLibrary(tab: LibraryTab = 'all', layout: LibraryLayout = 'covers', shelved = library, hidden: ListColumn[] = []) {
  const onTab = vi.fn();
  const onLayout = vi.fn();
  const onHidden = vi.fn();
  const onOpenNote = vi.fn();
  const props = { library: shelved, files, tab, onTab, layout, onLayout, hidden, onHidden, today: new Date(2026, 9, 28), onOpenNote, onCreated: vi.fn(() => Promise.resolve()), onChanged: vi.fn(() => Promise.resolve()) };
  const view = render(<LibraryView {...props} />);
  return { onTab, onLayout, onHidden, onOpenNote, view, props };
}

const cards = () => screen.queryAllByTestId('library-card').map((card) => card.getAttribute('data-path'));
const byData = (testId: string, name: string, value: string) => screen.getAllByTestId(testId).find((found) => found.getAttribute(name) === value)!;
/** Opens a toolbar menu (Covers or List, Sort, Filter, Properties) unless it is open. */
async function openTool(user: ReturnType<typeof userEvent.setup>, testId: string) {
  const button = screen.getByTestId(testId);
  if (button.getAttribute('aria-expanded') !== 'true') await user.click(button);
  return screen.getByTestId(`${testId}-menu`);
}

describe("the library's All tab", () => {
  it('opens on everything together: All first among the tabs, the counts of all of it, each card with its kind', () => {
    renderLibrary();
    expect(screen.getByTestId('library')).toHaveAttribute('data-tab', 'all');
    expect(screen.getAllByTestId('tab').map((tab) => tab.textContent)).toEqual(['All', 'Albums', 'Films', 'Books', 'Podcasts']);
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
    // Videos are read as pages, not shelved.
    expect(screen.getByTestId('library-total')).toHaveTextContent('5');
    expect(cards()).toHaveLength(5);
    expect(screen.getByTestId('library-count')).toHaveTextContent('5 results');
    // The latest first.
    expect(cards()[0]).toBe('Rating/music/Monastery Wi-Fi.md');
    expect(screen.getAllByTestId('library-card-kind').map((kind) => kind.textContent)).toEqual(['album', 'album', 'film', 'podcast', 'book']);
  });

  it('narrows the covers and the calendar by kind from Filter, several at once', async () => {
    const user = userEvent.setup();
    renderLibrary();
    const menu = await openTool(user, 'library-filter');
    expect(within(menu).getAllByTestId('kind-chip').map((found) => found.textContent)).toEqual(['Albums2', 'Films1', 'Books1', 'Podcasts1']);
    await user.click(byData('kind-chip', 'data-kind', 'film'));
    await user.click(byData('kind-chip', 'data-kind', 'book'));
    // Filters stay open to pick more.
    expect(byData('kind-chip', 'data-kind', 'film')).toHaveAttribute('aria-checked', 'true');
    expect(cards().sort()).toEqual(['Rating/books/Thinking in Seasons.md', 'Rating/kino/Static Bloom.md']);
    expect(screen.getByTestId('library-filter')).toHaveTextContent('Filter2');
    expect(screen.getByTestId('library-filters')).toHaveTextContent('Films · Books');
    // The hero still counts everything.
    expect(screen.getByTestId('library-total')).toHaveTextContent('5');
    await user.click(byData('kind-chip', 'data-kind', 'film'));
    expect(cards()).toEqual(['Rating/books/Thinking in Seasons.md']);
    await user.click(screen.getByTestId('filter-clear'));
    expect(cards()).toHaveLength(5);
    expect(screen.queryByTestId('library-filters')).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('library-filter-menu')).not.toBeInTheDocument();
    expect(screen.getByTestId('library-filter')).toHaveFocus();
  });

  it('keeps the focus in a menu, so Escape and Tab are its own, and the window gets Escape only when none is open', async () => {
    const user = userEvent.setup();
    const escapes = vi.fn();
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') escapes();
    };
    window.addEventListener('keydown', onEscape);
    try {
      renderLibrary();
      await openTool(user, 'library-filter');
      await user.click(byData('kind-chip', 'data-kind', 'film'));
      // Clear takes itself away; the focus goes to the first item, not the page behind.
      screen.getByTestId('filter-clear').focus();
      await user.keyboard('{Enter}');
      expect(screen.queryByTestId('filter-clear')).not.toBeInTheDocument();
      expect(byData('kind-chip', 'data-kind', 'album')).toHaveFocus();
      await user.keyboard('{Escape}');
      expect(screen.queryByTestId('library-filter-menu')).not.toBeInTheDocument();
      expect(screen.getByTestId('library-filter')).toHaveFocus();
      expect(escapes).not.toHaveBeenCalled();
      await user.keyboard('{Escape}');
      expect(escapes).toHaveBeenCalledTimes(1);
      // Tab leaves a menu, and closes it.
      await openTool(user, 'library-filter');
      await user.tab();
      expect(screen.queryByTestId('library-filter-menu')).not.toBeInTheDocument();
    } finally {
      window.removeEventListener('keydown', onEscape);
    }
  });

  it('narrows the calendar by genre too', async () => {
    const user = userEvent.setup();
    renderLibrary();
    const day = (n: number) => screen.getAllByTestId('cover-day').find((cell) => cell.getAttribute('data-day') === String(n))!;
    expect(day(21)).toHaveAttribute('data-count', '2');
    await openTool(user, 'library-filter');
    await user.click(byData('genre-chip', 'data-genre', 'sci-fi'));
    expect(cards()).toEqual(['Rating/kino/Static Bloom.md']);
    expect(day(21)).toHaveAttribute('data-count', '1');
    await user.click(byData('genre-chip', 'data-genre', ''));
    expect(day(21)).toHaveAttribute('data-count', '2');
  });

  it('draws several covers on a day of the calendar, the best rated in front', () => {
    renderLibrary();
    expect(screen.getByTestId('cover-calendar-month')).toHaveTextContent('September 2026');
    const day = (n: number) => screen.getAllByTestId('cover-day').find((cell) => cell.getAttribute('data-day') === String(n))!;
    expect(day(21)).toHaveAttribute('data-count', '2');
    // Drawn back to front: the best rated is the last, on top.
    expect(within(day(21)).getAllByTestId('cover-day-cover').map((cover) => cover.getAttribute('data-path'))).toEqual(['Rating/kino/Static Bloom.md', 'Rating/music/Salt & Graphite.md']);
    expect(within(day(3)).getAllByTestId('cover-day-cover')).toHaveLength(2);
    expect(within(day(27)).getAllByTestId('cover-day-cover')).toHaveLength(1);
  });

  it("has an Add for every kind in the hero, on every tab, the tab's own first, in the primary button", async () => {
    const user = userEvent.setup();
    const { view, props } = renderLibrary();
    const adds = () => screen.getAllByTestId('library-add').map((button) => [button.getAttribute('data-kind'), button.textContent, button.className.includes('primary-button')]);
    expect(adds()).toEqual([
      ['album', '+ Album', false],
      ['film', '+ Film', false],
      ['book', '+ Book', false],
      ['podcast', '+ Episode', false],
    ]);
    view.rerender(<LibraryView {...props} tab="film" />);
    expect(screen.getByTestId('library')).toHaveAttribute('data-tab', 'film');
    expect(adds()).toEqual([
      ['film', '+ Add film', true],
      ['album', '+ Album', false],
      ['book', '+ Book', false],
      ['podcast', '+ Episode', false],
    ]);
    // On the films' tab, adding a podcast episode is a click away.
    await user.click(screen.getAllByTestId('library-add').find((button) => button.getAttribute('data-kind') === 'podcast')!);
    expect(screen.getByRole('dialog', { name: 'Add an episode' })).toBeInTheDocument();
    expect(screen.getByTestId('add-search')).toHaveAttribute('placeholder', 'Show or host');
  });

  it("goes to a kind's tab from the tabs", async () => {
    const user = userEvent.setup();
    const { onTab } = renderLibrary();
    await user.click(screen.getByRole('tab', { name: 'Podcasts' }));
    expect(onTab).toHaveBeenLastCalledWith('podcast');
  });
});

const rows = () => screen.getAllByTestId('library-row').map((row) => row.getAttribute('data-path'));
const row = (path: string) => byData('library-row', 'data-path', path);
const cells = (path: string) => within(row(path)).getAllByRole('cell').map((cell) => cell.textContent);
const heads = () => screen.getAllByRole('columnheader').map((head) => head.getAttribute('aria-label') ?? head.textContent);
const sorted = () => screen.getAllByRole('columnheader').filter((head) => head.hasAttribute('aria-sort')).map((head) => [head.textContent, head.getAttribute('aria-sort')]);
const header = (name: string) => within(screen.getAllByRole('columnheader').find((head) => head.textContent === name)!).getByRole('button');

describe("the library's list", () => {
  it('switches between the covers and the list from Covers or List, the choice handed up to be kept in the settings', async () => {
    const user = userEvent.setup();
    const { onLayout, view } = renderLibrary();
    expect(screen.getByTestId('library-grid')).toBeInTheDocument();
    expect(screen.getByTestId('library-view-menu')).toHaveTextContent('Covers');
    const menu = await openTool(user, 'library-view-menu');
    expect(within(menu).getAllByTestId('library-view').map((option) => [option.textContent, option.getAttribute('aria-checked')])).toEqual([
      ['Coversthe latest 15', 'true'],
      ['Listall of them, as a table', 'false'],
    ]);
    // The menu takes the focus on the chosen one; the arrows move in it.
    expect(byData('library-view', 'data-view', 'covers')).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(byData('library-view', 'data-view', 'list')).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onLayout).toHaveBeenLastCalledWith('list');
    expect(screen.queryByTestId('library-view-menu-menu')).not.toBeInTheDocument();
    view.unmount();

    renderLibrary('all', 'list');
    expect(screen.queryByTestId('library-grid')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cover-calendar')).not.toBeInTheDocument();
    expect(rows()).toHaveLength(5);
    expect(screen.getByTestId('library-view-menu')).toHaveTextContent('List');
    expect(screen.getByTestId('library-count')).toHaveTextContent('5 results');
  });

  it('shows each note as a row: its cover, title, maker, year, kind on All, genres as chips, rating and day', () => {
    renderLibrary('all', 'list');
    expect(heads()).toEqual(['Cover', 'Title', 'By', 'Year', 'Kind', 'Genres', 'Rating', 'Date']);
    expect(cells('Rating/books/Thinking in Seasons.md')).toEqual(['T', 'Thinking in Seasons', 'Ada Morrow', '2023', 'book', 'philosophy', '81', '3 Sep 2026']);
    // A film without a director shows a faint dash, as an empty property does.
    expect(cells('Rating/kino/Static Bloom.md')).toEqual(['S', 'Static Bloom', '—', '2024', 'film', 'sci-fi', '68', '21 Sep 2026']);
    expect(within(row('Rating/books/Thinking in Seasons.md')).getByTestId('row-rating').querySelector('.row-meter span')).toHaveStyle({ '--r': '0.81' });
  });

  it("names a kind's own columns on its tab, and leaves the kind out", () => {
    renderLibrary('film', 'list');
    expect(heads()).toEqual(['Cover', 'Title', 'Director', 'Year', 'Genres', 'Rating', 'Watched']);
    expect(screen.queryAllByTestId('row-kind')).toHaveLength(0);
    expect(rows()).toEqual(['Rating/kino/Static Bloom.md']);
  });

  it('hides and shows columns from Properties, the choice handed up to be kept in the settings', async () => {
    const user = userEvent.setup();
    const { onHidden, view } = renderLibrary('all', 'list');
    const menu = await openTool(user, 'library-columns');
    expect(within(menu).getAllByTestId('column').map((item) => [item.textContent, item.getAttribute('aria-checked')])).toEqual([
      ['Titlealways', 'true'],
      ['Cover', 'true'],
      ['By', 'true'],
      ['Year', 'true'],
      ['Kind', 'true'],
      ['Genres', 'true'],
      ['Rating', 'true'],
      ['Date', 'true'],
    ]);
    expect(byData('column', 'data-column', 'title')).toBeDisabled();
    await user.click(byData('column', 'data-column', 'genres'));
    expect(onHidden).toHaveBeenLastCalledWith(['genres']);
    view.unmount();

    renderLibrary('all', 'list', library, ['genres', 'year']);
    expect(heads()).toEqual(['Cover', 'Title', 'By', 'Kind', 'Rating', 'Date']);
    expect(cells('Rating/books/Thinking in Seasons.md')).toEqual(['T', 'Thinking in Seasons', 'Ada Morrow', 'book', '81', '3 Sep 2026']);
  });

  it('sorts from Sort and from its headers, in step', async () => {
    const user = userEvent.setup();
    const { view } = renderLibrary('all', 'list');
    expect(sorted()).toEqual([['Date', 'descending']]);
    expect(rows()[0]).toBe('Rating/music/Monastery Wi-Fi.md');

    await user.click(header('Rating'));
    expect(sorted()).toEqual([['Rating', 'descending']]);
    expect(rows()[0]).toBe('Rating/podcasts/Why Dogs Dream.md');
    const menu = await openTool(user, 'library-sort');
    expect(within(menu).getAllByTestId('sort').map((item) => [item.textContent, item.getAttribute('aria-checked')])).toEqual([
      ['Recentlatest first', 'false'],
      ['Ratingbest first', 'true'],
      ['TitleA to Z', 'false'],
      ['ByA to Z', 'false'],
      ['Yearnewest first', 'false'],
    ]);
    await user.click(byData('sort', 'data-sort', 'title'));
    expect(screen.queryByTestId('library-sort-menu')).not.toBeInTheDocument();
    expect(sorted()).toEqual([['Title', 'ascending']]);
    expect(rows()).toEqual(['Rating/music/Monastery Wi-Fi.md', 'Rating/music/Salt & Graphite.md', 'Rating/kino/Static Bloom.md', 'Rating/books/Thinking in Seasons.md', 'Rating/podcasts/Why Dogs Dream.md']);

    // By maker, A to Z, the film without a director last.
    await user.click(header('By'));
    expect(sorted()).toEqual([['By', 'ascending']]);
    expect(rows().at(-1)).toBe('Rating/kino/Static Bloom.md');
    expect(rows()[0]).toBe('Rating/books/Thinking in Seasons.md');
    view.unmount();

    // The covers are the latest, whatever the list is sorted by; the list keeps its sort.
    const covers = renderLibrary('all', 'covers');
    expect(screen.queryByTestId('library-sort')).not.toBeInTheDocument();
    expect(cards()[0]).toBe('Rating/music/Monastery Wi-Fi.md');
    covers.view.unmount();
    renderLibrary('all', 'list');
    expect(sorted()).toEqual([['By', 'ascending']]);
    // Back to the day, for the tests after this one: the choice is kept for the session.
    await user.click(header('Date'));
    expect(sorted()).toEqual([['Date', 'descending']]);
  });

  it('searches titles, makers and genres, and says so when nothing matches', async () => {
    const user = userEvent.setup();
    renderLibrary('all', 'list');
    await user.click(screen.getByTestId('library-search-open'));
    expect(screen.getByTestId('library-search')).toHaveFocus();
    await user.keyboard('ada');
    expect(rows()).toEqual(['Rating/books/Thinking in Seasons.md']);
    expect(screen.getByTestId('library-count')).toHaveTextContent('1 result');
    await user.clear(screen.getByTestId('library-search'));
    await user.keyboard('ambient');
    expect(rows()).toEqual(['Rating/music/Monastery Wi-Fi.md']);
    await user.keyboard(' nothing');
    expect(screen.queryAllByTestId('library-row')).toHaveLength(0);
    expect(screen.getByTestId('library-none')).toHaveTextContent('Nothing here matches “ambient nothing”. Clear the search');
    await user.keyboard('{Escape}');
    expect(rows()).toHaveLength(5);
    expect(screen.queryByTestId('library-search')).not.toBeInTheDocument();
  });

  it("opens a row's page from a click anywhere on it, or from the keyboard, ↑ and ↓ going from row to row", async () => {
    const user = userEvent.setup();
    const { onOpenNote } = renderLibrary('all', 'list');
    await user.click(within(row('Rating/kino/Static Bloom.md')).getByText('2024'));
    expect(onOpenNote).toHaveBeenLastCalledWith('Rating/kino/Static Bloom.md');
    onOpenNote.mockClear();

    const opens = screen.getAllByTestId('row-open');
    opens[0]!.focus();
    await user.keyboard('{ArrowDown}');
    expect(opens[1]).toHaveFocus();
    await user.keyboard('{End}');
    expect(opens.at(-1)).toHaveFocus();
    await user.keyboard('{ArrowDown}{ArrowUp}');
    expect(opens.at(-2)).toHaveFocus();
    await user.keyboard('{Home}{Enter}');
    expect(opens[0]).toHaveFocus();
    expect(onOpenNote).toHaveBeenCalledTimes(1);
    expect(onOpenNote).toHaveBeenLastCalledWith(rows()[0]);
  });

  it('narrows by kind and genre as the covers do, and offers Find covers for those in view without one', async () => {
    const user = userEvent.setup();
    renderLibrary('all', 'list');
    expect(screen.getByTestId('library-missing')).toHaveTextContent('5 without a cover · Find covers');
    await openTool(user, 'library-filter');
    await user.click(byData('kind-chip', 'data-kind', 'album'));
    expect(rows()).toEqual(['Rating/music/Monastery Wi-Fi.md', 'Rating/music/Salt & Graphite.md']);
    expect(screen.getByTestId('library-missing')).toHaveTextContent('2 without a cover · Find covers');
    await user.click(byData('genre-chip', 'data-genre', 'ambient'));
    expect(rows()).toEqual(['Rating/music/Monastery Wi-Fi.md']);
    await user.click(screen.getByTestId('filter-clear'));
    expect(rows()).toHaveLength(5);
  });
});

describe('a long library', () => {
  // 40 albums, as a real vault has hundreds.
  const many = Array.from({ length: 40 }, (_, i) => ({ path: `Rating/music/Album ${i + 1}.md`, text: `---\nArtist: Band ${i}\nlistened: 2026-09-${String((i % 28) + 1).padStart(2, '0')}\nrating: ${50 + i}\n---\n` }));
  const shelved = collectLibrary(many, many.map((note) => ({ path: note.path, kind: 'note' as const })));

  it('shows the latest 15 as covers, and the rest a click away in the list', async () => {
    const user = userEvent.setup();
    const { onLayout } = renderLibrary('album', 'covers', shelved);
    expect(cards()).toHaveLength(15);
    // The latest first, album 28 on the 28th, each rising in.
    expect(cards()[0]).toBe('Rating/music/Album 28.md');
    expect(screen.getAllByTestId('library-card').every((card) => card.closest('li')?.classList.contains('rise'))).toBe(true);
    expect(screen.getByTestId('library-count')).toHaveTextContent('The latest 15 of 40');
    // Every note in view is offered to Find covers, not only the latest.
    expect(screen.getByTestId('library-missing')).toHaveTextContent('40 without a cover');
    await user.click(screen.getByTestId('library-see-all'));
    expect(screen.getByTestId('library-see-all')).toHaveTextContent('See all 40 in the list');
    expect(onLayout).toHaveBeenLastCalledWith('list');
  });

  it('leaves the search with the list: the covers, and "See all", count what the list will show', async () => {
    const user = userEvent.setup();
    const { onLayout, view, props } = renderLibrary('album', 'list', shelved);
    await user.click(screen.getByTestId('library-search-open'));
    // Every word: "Band 12" is the maker of Album 13, and "12" the title of Album 12.
    await user.keyboard('Band 12');
    expect(rows().sort()).toEqual(['Rating/music/Album 12.md', 'Rating/music/Album 13.md']);
    expect(screen.getByTestId('library-count')).toHaveTextContent('2 results');
    await openTool(user, 'library-view-menu');
    await user.click(byData('library-view', 'data-view', 'covers'));
    expect(onLayout).toHaveBeenLastCalledWith('covers');
    view.rerender(<LibraryView {...props} layout="covers" />);
    expect(screen.getByTestId('library-see-all')).toHaveTextContent('See all 40 in the list');
    view.rerender(<LibraryView {...props} layout="list" />);
    expect(screen.getByTestId('library-count')).toHaveTextContent('40 results');
    expect(screen.queryByTestId('library-search')).not.toBeInTheDocument();
  });

  it('puts the list on the page a few screens at once and the rest just after, only the first screen rising into place', async () => {
    renderLibrary('album', 'list', shelved);
    const rising = (items: Element[]) => items.map((item) => item.classList.contains('rise'));
    expect(screen.getAllByTestId('library-row')).toHaveLength(36);
    await waitFor(() => expect(screen.getAllByTestId('library-row')).toHaveLength(40));
    expect(rising(screen.getAllByTestId('library-row'))).toEqual(Array.from({ length: 40 }, (_, i) => i < 24));
  });
});
