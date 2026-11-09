import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { CINEMA_TEXT } from '../../../test/fixtures/cinema-base';
import { NoteMarkdown } from '../NoteMarkdown';
import { BasesProvider } from './context';

const path = 'Rating/kino/00. Kino 2026.md';
const texts = new Map([
  ['Rating/kino/First film.md', '---\nwatched: 2026-01-01\nrating: 90\nYear: 2024\ngenre: [drama, comedy]\n---\nKeep the film.'],
  ['Rating/kino/Latest film.md', '---\nWatched: 2026-11-08\nrating: 80\nYear: 2025\ngenre: [animation]\n---\nAnother film.'],
  ['Rating/kino/Previous year.md', '---\nWatched: 2025-12-31\nrating: 95\n---\nEarlier.'],
  ['Rating/kino/Future film.md', '---\nwatched: 2027-01-01\n---\nLater.'],
  ['Rating/kino/Undated.md', 'No watched date.'],
  ['Elsewhere/Other film.md', '---\nwatched: 2026-03-01\n---\nOutside the folder.'],
]);
const files = [...texts.keys()].map((path) => ({ path, kind: 'note' as const }));
const props = { path, files, body: CINEMA_TEXT, onOpenLink: vi.fn() };

it('renders the reported cinema block with date boundaries, mixed-case properties, widths and named views', async () => {
  const user = userEvent.setup();
  render(<BasesProvider files={files} texts={texts} onRefresh={vi.fn()}><NoteMarkdown {...props} /></BasesProvider>);
  expect(screen.getByRole('heading', { name: 'Cinema base' })).toBeVisible();
  const table = screen.getByRole('table');
  expect(within(table).getAllByRole('link').map((link) => link.textContent)).toEqual(['Latest film', 'First film']);
  expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent?.replace(/[↑↓]/g, '').trim())).toEqual(['Movie name', 'rating', 'Year', 'genre', 'Watched']);
  expect(within(table).getAllByRole('columnheader')[0]).toHaveStyle({ minWidth: '305px' });
  expect(within(table).getByText('animation')).toBeVisible();
  expect(within(table).getByText('2025')).toBeVisible();
  expect(within(table).getByText('2026-11-08')).toBeVisible();
  await user.selectOptions(screen.getByLabelText('Table view'), '1');
  expect(within(screen.getByRole('table')).getAllByRole('link').map((link) => link.textContent)).toEqual(['Previous year']);
  expect(screen.queryByRole('alert')).toBeNull();
});

it('offers plugin settings while disabled, preserves the source, and renders immediately after enabling', async () => {
  const user = userEvent.setup(), settings = vi.fn(), save = vi.fn();
  const content = <NoteMarkdown {...props} onChangeBase={save} />;
  const view = render(<BasesProvider enabled={false} files={files} texts={texts} onRefresh={vi.fn()} onOpenSettings={settings}>{content}</BasesProvider>);
  expect(screen.getByRole('status')).toHaveTextContent('epiBase is disabled.');
  expect(screen.queryByRole('table')).toBeNull();
  expect(screen.queryByRole('textbox')).toBeNull();
  const source = screen.getByText('Base source').closest('details');
  expect(source).not.toHaveAttribute('open');
  await user.click(screen.getByRole('button', { name: 'Open plugin settings' }));
  expect(settings).toHaveBeenCalledOnce();
  await user.click(screen.getByText('Base source'));
  expect(source).toHaveTextContent('file.folder == "Rating/kino"');
  view.rerender(<BasesProvider enabled files={files} texts={texts} onRefresh={vi.fn()}>{content}</BasesProvider>);
  expect(screen.getByRole('table')).toBeVisible();
  expect(save).not.toHaveBeenCalled();
});
