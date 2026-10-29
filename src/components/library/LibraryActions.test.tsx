import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LibraryActions } from './LibraryActions';
const selection = { entry: { path: 'Rating/music/Album.md', title: 'Album', kind: 'album' as const, genres: [], tracks: [] }, x: 20, y: 20 };
describe('library note actions', () => {
  it('requires confirmation, reports a conflict without closing, and allows retry', async () => {
    const user = userEvent.setup(), onClose = vi.fn();
    const onDelete = vi.fn().mockRejectedValueOnce(new Error('The note changed')).mockResolvedValueOnce('.trash/Album.md');
    render(<LibraryActions selection={selection} onClose={onClose} onOpen={vi.fn()} onDelete={onDelete} />);
    await user.click(screen.getByRole('menuitem', { name: 'Delete note…' }));
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('library-delete-confirm'));
    await screen.findByRole('alert');
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('library-delete-confirm'));
    expect(onDelete).toHaveBeenLastCalledWith(selection.entry.path);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('can open a new tab without deleting', async () => {
    const user = userEvent.setup(), onOpen = vi.fn(), onDelete = vi.fn();
    render(<LibraryActions selection={selection} onClose={vi.fn()} onOpen={onOpen} onDelete={onDelete} />);
    await user.click(screen.getByRole('menuitem', { name: /Open in new tab/ }));
    expect(onOpen).toHaveBeenCalledWith(selection.entry.path, true);
    expect(onDelete).not.toHaveBeenCalled();
  });
});
