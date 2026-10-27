import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { VaultFile } from '../../lib/api';
import { kindSpec } from '../../lib/library';
import { MediaPage } from './MediaPage';

vi.mock('../../lib/api', () => ({
  readImage: vi.fn(() => Promise.resolve(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>').buffer)),
}));

const files: VaultFile[] = [
  { path: 'Rating/kino/00. Kino 2026.md', kind: 'note' },
  { path: 'Rating/kino/Election.md', kind: 'note' },
  { path: 'Rating/kino/_attachments/election.svg', kind: 'image' },
  { path: 'Rating/books/Life 3.0.md', kind: 'note' },
];

// As the owner's vault writes them: this film says `rating` and `genre` in lower case.
const FILM = `---
Year: 1999
genre:
  - black comedy
  - drama
rating: 58
Watched: 2026-09-09
---
[[00. Kino 2026]]

![[election.svg|200]]

Jim McAllister, a well-liked high school teacher.
`;

function renderPage(text: string, path = 'Rating/kino/Election.md', kind: 'film' | 'book' = 'film') {
  const onSetProperty = vi.fn();
  const onOpenLink = vi.fn();
  render(
    <MediaPage
      spec={kindSpec(kind)}
      path={path}
      text={text}
      files={files}
      onOpenLink={onOpenLink}
      onSetProperty={onSetProperty}
      onEdit={vi.fn()}
      onOpenLibrary={vi.fn()}
    />,
  );
  return { onSetProperty, onOpenLink };
}

describe('MediaPage', () => {
  it('shows the title, who made it and when, its genres, its rating and its text without the cover again', () => {
    renderPage(FILM);
    expect(screen.getByTestId('note-title')).toHaveTextContent('Election');
    expect(screen.getByTestId('media-genres')).toHaveTextContent('black comedydrama');
    expect(screen.getByTestId('rating-ring')).toHaveAttribute('data-value', '58');
    expect(screen.getByTestId('media-date')).toHaveValue('2026-09-09');
    const text = screen.getByTestId('media-text');
    expect(text).toHaveTextContent('Jim McAllister');
    expect(text.querySelector('img')).toBeNull();
    expect(text.querySelector('a[data-wikilink="00. Kino 2026"]')).not.toBeNull();
  });

  it("writes a rating or a date under the key the note already uses, and refuses one that doesn't fit", () => {
    const { onSetProperty } = renderPage(FILM);
    const rating = screen.getByTestId('rating-field');
    fireEvent.change(rating, { target: { value: '64' } });
    fireEvent.blur(rating);
    expect(onSetProperty).toHaveBeenLastCalledWith('rating', '64');

    fireEvent.change(rating, { target: { value: '640' } });
    fireEvent.blur(rating);
    expect(onSetProperty).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toHaveTextContent('0 to 100');

    const date = screen.getByTestId('media-date');
    fireEvent.change(date, { target: { value: '2026-09-31' } });
    fireEvent.blur(date);
    expect(onSetProperty).toHaveBeenCalledTimes(1);
    fireEvent.change(date, { target: { value: '2026-09-10' } });
    fireEvent.blur(date);
    expect(onSetProperty).toHaveBeenLastCalledWith('Watched', '2026-09-10');
  });

  it('writes the kind\'s own key when the note has none yet, as "Finshed" for a book', () => {
    const { onSetProperty } = renderPage('---\nYear: 2017\nRating:\n---\n[[00. Books]]\n', 'Rating/books/Life 3.0.md', 'book');
    expect(screen.getByTestId('rating-ring')).toHaveAttribute('data-value', '');
    const date = screen.getByTestId('media-date');
    fireEvent.change(date, { target: { value: '2025-05-17' } });
    fireEvent.blur(date);
    expect(onSetProperty).toHaveBeenLastCalledWith('Finshed', '2025-05-17');
    fireEvent.change(screen.getByTestId('rating-field'), { target: { value: '88' } });
    fireEvent.blur(screen.getByTestId('rating-field'));
    expect(onSetProperty).toHaveBeenLastCalledWith('Rating', '88');
  });

  it('sets the rating from the ring with the keys, once, a moment after the last press', () => {
    vi.useFakeTimers();
    try {
      const { onSetProperty } = renderPage(FILM);
      const ring = screen.getByRole('slider', { name: 'Rating' });
      fireEvent.keyDown(ring, { key: 'ArrowUp' });
      fireEvent.keyDown(ring, { key: 'ArrowUp', shiftKey: true });
      expect(ring).toHaveAttribute('aria-valuenow', '69');
      expect(onSetProperty).not.toHaveBeenCalled();
      vi.advanceTimersByTime(800);
      expect(onSetProperty).toHaveBeenCalledTimes(1);
      expect(onSetProperty).toHaveBeenLastCalledWith('rating', '69');
    } finally {
      vi.useRealTimers();
    }
  });
});
