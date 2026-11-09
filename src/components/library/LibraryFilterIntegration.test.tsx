import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import type { VaultFile } from '../../lib/api';
import { collectLibrary, type LibraryFilters } from '../../lib/library';
import { LibraryView } from './LibraryView';

vi.mock('../../lib/api', () => ({
  readImage: vi.fn(() => Promise.resolve(new ArrayBuffer(0))),
  lookupJson: vi.fn(() => Promise.resolve({ results: [] })),
  lookupImage: vi.fn(() => Promise.reject(new Error('offline'))),
}));
const notes = [
  { path: 'Rating/music/A.md', text: '---\nArtist: A\nYear: 2019\nlistened: 2026-01-01\ngenre: [ambient]\nrating: 85\n---\n' },
  { path: 'Rating/music/B.md', text: '---\nArtist: B\nYear: 2015\nlistened: 2025-01-01\ngenre: [post-rock]\nrating:\n---\n' },
  { path: 'Rating/kino/C.md', text: '---\nDirector: C\nYear: 2022\nWatched: 2026-02-01\ngenre: [drama]\nrating: 70\n---\n' },
];
const files: VaultFile[] = notes.map(({ path }) => ({ path, kind: 'note' }));
const library = collectLibrary(notes, files);
function Harness({ initial = { period: 'all' } }: { initial?: LibraryFilters }) {
  const [filters, setFilters] = useState<LibraryFilters>(initial);
  return <LibraryView library={library} files={files} tab="all" onTab={vi.fn()} layout="covers" onLayout={vi.fn()} hidden={[]} onHidden={vi.fn()} filters={filters} onFilters={setFilters} today={new Date(2026, 10, 9)} onOpenNote={vi.fn()} onCreated={() => Promise.resolve()} onChanged={() => Promise.resolve()} />;
}
const paths = () => screen.queryAllByTestId('library-card').map((card) => card.getAttribute('data-path'));

it('filters covers by multiple genres and removes the filter without changing notes', async () => {
  const user = userEvent.setup(); render(<Harness />);
  await user.click(screen.getByTestId('filter-add'));
  await user.click(within(screen.getByTestId('filter-add-menu')).getByText('Genre'));
  const dialog = screen.getByRole('dialog', { name: 'Genre' });
  await user.click(within(dialog).getByText('ambient'));
  await user.click(within(dialog).getByText('post-rock'));
  expect(paths().sort()).toEqual(['Rating/music/A.md', 'Rating/music/B.md']);
  await user.keyboard('{Escape}');
  await user.click(screen.getByRole('button', { name: 'Take away the genre filter' }));
  expect(paths()).toHaveLength(3);
});
it('offers unrated items and makes an empty period easy to recover', async () => {
  const user = userEvent.setup(); render(<Harness initial={{ period: 2024 }} />);
  expect(screen.getByTestId('library-none')).toHaveTextContent('No items match');
  await user.click(screen.getByRole('button', { name: 'Show everything' }));
  expect(paths()).toHaveLength(3);
  await user.click(screen.getByTestId('filter-add'));
  const add = screen.getByTestId('filter-add-menu');
  await user.click(within(add).getByText('Rating'));
  await user.click(within(screen.getByRole('dialog', { name: 'Rating' })).getByText('Not rated yet'));
  expect(paths()).toEqual(['Rating/music/B.md']);
});
it('keeps an invalid range visible instead of silently replacing the filter', async () => {
  const user = userEvent.setup(); render(<Harness />);
  await user.click(screen.getByTestId('filter-add'));
  await user.click(within(screen.getByTestId('filter-add-menu')).getByText('Rating'));
  const dialog = screen.getByRole('dialog', { name: 'Rating' });
  const from = within(dialog).getByLabelText('Between from'), to = within(dialog).getByLabelText('Between to');
  fireEvent.change(from, { target: { value: '90' } }); fireEvent.blur(from);
  fireEvent.change(to, { target: { value: '20' } }); fireEvent.blur(to);
  expect(within(dialog).getByRole('alert')).toHaveTextContent('must not exceed');
  expect(to).toHaveValue('20');
});
it('keeps quick year choices and visible filter pills in sync when reset', async () => {
  const user = userEvent.setup(); render(<Harness />);
  await user.click(screen.getByTestId('library-filter'));
  const year = screen.getAllByTestId('year-filter').find((item) => item.getAttribute('data-year') === '2025')!;
  await user.click(year);
  expect(paths()).toEqual(['Rating/music/B.md']);
  expect(screen.getByTestId('filter-years')).toHaveTextContent('2025');
  await user.keyboard('{Escape}');
  await user.click(screen.getByTestId('filter-reset'));
  expect(paths().sort()).toEqual(['Rating/kino/C.md', 'Rating/music/A.md']);
  expect(screen.queryByTestId('filter-years')).not.toBeInTheDocument();
});
it('keeps notes accessible when saving filters fails and offers an explicit retry', async () => {
  const user = userEvent.setup(), retry = vi.fn(), open = vi.fn();
  render(<LibraryView library={library} files={files} tab="all" onTab={vi.fn()} layout="covers" onLayout={vi.fn()} hidden={[]} onHidden={vi.fn()} filters={{ period: 'all' }} onFilters={vi.fn()} filterError="Disk unavailable" onRetryFilters={retry} today={new Date(2026, 10, 9)} onOpenNote={open} onCreated={() => Promise.resolve()} onChanged={() => Promise.resolve()} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Disk unavailable');
  await user.click(screen.getAllByTestId('library-card')[0]!);
  expect(open).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: 'Retry saving' }));
  expect(retry).toHaveBeenCalledOnce();
});
