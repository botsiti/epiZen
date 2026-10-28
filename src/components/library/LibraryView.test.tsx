import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { VaultFile } from '../../lib/api';
import { collectLibrary, type LibraryLayout, type LibraryTab } from '../../lib/library';
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

function renderLibrary(tab: LibraryTab = 'all', layout: LibraryLayout = 'covers', shelved = library) {
  const onTab = vi.fn();
  const onLayout = vi.fn();
  const onOpenNote = vi.fn();
  const view = render(
    <LibraryView library={shelved} files={files} tab={tab} onTab={onTab} layout={layout} onLayout={onLayout} today={new Date(2026, 9, 28)} onOpenNote={onOpenNote} onCreated={vi.fn(() => Promise.resolve())} onChanged={vi.fn(() => Promise.resolve())} />,
  );
  return { onTab, onLayout, onOpenNote, view };
}

const cards = () => screen.getAllByTestId('library-card').map((card) => card.getAttribute('data-path'));

describe('the library\'s All tab', () => {
  it('opens on everything together: All first among the tabs, the counts of all of it, each card with its kind', () => {
    renderLibrary();
    expect(screen.getByTestId('library')).toHaveAttribute('data-tab', 'all');
    expect(screen.getAllByTestId('tab').map((tab) => tab.textContent)).toEqual(['All', 'Albums', 'Films', 'Books', 'Podcasts']);
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
    // Videos are read as pages, not shelved.
    expect(screen.getByTestId('library-total')).toHaveTextContent('5');
    expect(cards()).toHaveLength(5);
    expect(screen.getAllByTestId('library-card-kind').map((kind) => kind.textContent)).toEqual(['album', 'album', 'film', 'podcast', 'book']);
  });

  it('narrows the grid and the calendar by kind, several at once', async () => {
    const user = userEvent.setup();
    renderLibrary();
    const chip = (kind: string) => screen.getAllByTestId('kind-chip').find((found) => found.getAttribute('data-kind') === kind)!;
    expect(screen.getAllByTestId('kind-chip').map((found) => found.textContent)).toEqual(['Albums 2', 'Films 1', 'Books 1', 'Podcasts 1']);
    await user.click(chip('film'));
    await user.click(chip('book'));
    expect(chip('film')).toHaveAttribute('aria-pressed', 'true');
    expect(cards().sort()).toEqual(['Rating/books/Thinking in Seasons.md', 'Rating/kino/Static Bloom.md']);
    // The hero still counts everything.
    expect(screen.getByTestId('library-total')).toHaveTextContent('5');
    await user.click(chip('film'));
    expect(cards()).toEqual(['Rating/books/Thinking in Seasons.md']);
    await user.click(chip('book'));
    expect(cards()).toHaveLength(5);
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

  it('has an Add for every kind in the hero, on every tab, the tab\'s own first, in the primary button', async () => {
    const user = userEvent.setup();
    const { view } = renderLibrary();
    const adds = () => screen.getAllByTestId('library-add').map((button) => [button.getAttribute('data-kind'), button.textContent, button.className.includes('primary-button')]);
    expect(adds()).toEqual([
      ['album', '+ Album', false],
      ['film', '+ Film', false],
      ['book', '+ Book', false],
      ['podcast', '+ Episode', false],
    ]);
    view.rerender(<LibraryView library={library} files={files} tab="film" onTab={vi.fn()} layout="covers" onLayout={vi.fn()} today={new Date(2026, 9, 28)} onOpenNote={vi.fn()} onCreated={vi.fn(() => Promise.resolve())} onChanged={vi.fn(() => Promise.resolve())} />);
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

  it('goes to a kind\'s tab from the tabs', async () => {
    const user = userEvent.setup();
    const { onTab } = renderLibrary();
    await user.click(screen.getByRole('tab', { name: 'Podcasts' }));
    expect(onTab).toHaveBeenLastCalledWith('podcast');
  });
});

const rows = () => screen.getAllByTestId('library-row').map((row) => row.getAttribute('data-path'));
const row = (path: string) => screen.getAllByTestId('library-row').find((found) => found.getAttribute('data-path') === path)!;
const cells = (path: string) => within(row(path)).getAllByRole('cell').map((cell) => cell.textContent);
const heads = () => screen.getAllByRole('columnheader').map((head) => head.getAttribute('aria-label') ?? head.textContent);
const sorted = () => screen.getAllByRole('columnheader').filter((head) => head.hasAttribute('aria-sort')).map((head) => [head.textContent, head.getAttribute('aria-sort')]);
const pressedSort = () => screen.getAllByTestId('sort').filter((chip) => chip.getAttribute('aria-pressed') === 'true').map((chip) => chip.textContent);

describe("the library's list", () => {
  it('switches between the covers and the list, the choice handed up to be kept in the settings', async () => {
    const user = userEvent.setup();
    const { onLayout, view } = renderLibrary();
    expect(screen.getByTestId('library-grid')).toBeInTheDocument();
    expect(screen.getAllByTestId('library-view').map((option) => [option.textContent, option.getAttribute('aria-pressed')])).toEqual([
      ['Covers', 'true'],
      ['List', 'false'],
    ]);
    await user.click(screen.getByRole('button', { name: 'List' }));
    expect(onLayout).toHaveBeenLastCalledWith('list');
    view.unmount();

    renderLibrary('all', 'list');
    expect(screen.queryByTestId('library-grid')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('library-card')).toHaveLength(0);
    expect(rows()).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows each note as a row: its cover, title, maker, year, kind on All, genres, rating and day', () => {
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

  it('sorts from its headers, in step with the sort chips', async () => {
    const user = userEvent.setup();
    renderLibrary('all', 'list');
    expect(sorted()).toEqual([['Date', 'descending']]);
    expect(pressedSort()).toEqual(['Recent']);
    expect(rows()[0]).toBe('Rating/music/Monastery Wi-Fi.md');

    await user.click(within(screen.getAllByRole('columnheader').find((head) => head.textContent === 'Rating')!).getByRole('button'));
    expect(sorted()).toEqual([['Rating', 'descending']]);
    expect(pressedSort()).toEqual(['Rating']);
    expect(rows()[0]).toBe('Rating/podcasts/Why Dogs Dream.md');

    await user.click(screen.getAllByTestId('sort').find((chip) => chip.textContent === 'Title')!);
    expect(sorted()).toEqual([['Title', 'ascending']]);
    expect(rows()).toEqual(['Rating/music/Monastery Wi-Fi.md', 'Rating/music/Salt & Graphite.md', 'Rating/kino/Static Bloom.md', 'Rating/books/Thinking in Seasons.md', 'Rating/podcasts/Why Dogs Dream.md']);

    // By maker, A to Z, the film without a director last; no chip is that sort.
    await user.click(within(screen.getAllByRole('columnheader').find((head) => head.textContent === 'By')!).getByRole('button'));
    expect(sorted()).toEqual([['By', 'ascending']]);
    expect(pressedSort()).toEqual([]);
    expect(rows().at(-1)).toBe('Rating/kino/Static Bloom.md');
    expect(rows()[0]).toBe('Rating/books/Thinking in Seasons.md');
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
    await user.click(screen.getAllByTestId('kind-chip').find((chip) => chip.getAttribute('data-kind') === 'album')!);
    expect(rows()).toEqual(['Rating/music/Monastery Wi-Fi.md', 'Rating/music/Salt & Graphite.md']);
    expect(screen.getByTestId('library-missing')).toHaveTextContent('2 without a cover · Find covers');
    await user.click(screen.getAllByTestId('genre-chip').find((chip) => chip.getAttribute('data-genre') === 'ambient')!);
    expect(rows()).toEqual(['Rating/music/Monastery Wi-Fi.md']);
  });
});

describe('a long library', () => {
  // 40 albums, as a real vault has hundreds.
  const many = Array.from({ length: 40 }, (_, i) => ({ path: `Rating/music/Album ${i + 1}.md`, text: `---\nArtist: Band ${i}\nlistened: 2026-09-${String((i % 28) + 1).padStart(2, '0')}\nrating: ${50 + i}\n---\n` }));
  const shelved = collectLibrary(many, many.map((note) => ({ path: note.path, kind: 'note' as const })));

  it('puts its first screens on the page at once and the rest just after, only the first screen rising into place', async () => {
    const { view } = renderLibrary('album', 'covers', shelved);
    const rising = (items: Element[]) => items.map((item) => item.classList.contains('rise'));
    expect(screen.getAllByTestId('library-card')).toHaveLength(36);
    await waitFor(() => expect(screen.getAllByTestId('library-card')).toHaveLength(40));
    const cardItems = screen.getAllByTestId('library-card').map((card) => card.closest('li')!);
    expect(rising(cardItems)).toEqual(Array.from({ length: 40 }, (_, i) => i < 24));
    // Every note in view is offered to Find covers, put on the page yet or not.
    expect(screen.getByTestId('library-missing')).toHaveTextContent('40 without a cover');
    view.unmount();
    renderLibrary('album', 'list', shelved);
    await waitFor(() => expect(screen.getAllByTestId('library-row')).toHaveLength(40));
    expect(rising(screen.getAllByTestId('library-row'))).toEqual(Array.from({ length: 40 }, (_, i) => i < 24));
  });
});
