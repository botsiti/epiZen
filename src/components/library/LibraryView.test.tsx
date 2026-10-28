import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { VaultFile } from '../../lib/api';
import { collectLibrary, type LibraryTab } from '../../lib/library';
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

function renderLibrary(tab: LibraryTab = 'all') {
  const onTab = vi.fn();
  const view = render(<LibraryView library={library} files={files} tab={tab} onTab={onTab} today={new Date(2026, 9, 28)} onOpenNote={vi.fn()} onCreated={vi.fn(() => Promise.resolve())} onChanged={vi.fn(() => Promise.resolve())} />);
  return { onTab, view };
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
    view.rerender(<LibraryView library={library} files={files} tab="film" onTab={vi.fn()} today={new Date(2026, 9, 28)} onOpenNote={vi.fn()} onCreated={vi.fn(() => Promise.resolve())} onChanged={vi.fn(() => Promise.resolve())} />);
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
