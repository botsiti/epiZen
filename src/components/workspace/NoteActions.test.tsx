import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NoteActionDialog, NoteMenu } from './NoteActions';
import { NoteTitle } from './NoteTitle';

describe('note actions', () => {
  it('offers the four requested actions from the menu and dismisses with Escape', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn(); const onClose = vi.fn();
    render(<NoteMenu path="Rating/music/Album.md" x={10} y={10} onPick={onPick} onClose={onClose} />);
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Duplicate', 'Reveal in Finder', 'Rename…', 'Delete…']);
    await user.click(screen.getByRole('menuitem', { name: 'Reveal in Finder' }));
    expect(onPick).toHaveBeenCalledWith('reveal');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the new name and shows a failed rename so it can be retried', async () => {
    const user = userEvent.setup(); const close = vi.fn();
    const run = vi.fn().mockRejectedValueOnce(new Error('A file with this name already exists')).mockResolvedValueOnce(undefined);
    render(<NoteActionDialog action="rename" path="Rating/music/Album.md" onClose={close} onRun={run} />);
    const input = screen.getByRole('textbox', { name: 'Filename' });
    await user.clear(input); await user.type(input, 'New title');
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    expect(screen.getByRole('alert')).toHaveTextContent('already exists');
    expect(input).toHaveValue('New title');
    expect(close).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    expect(run).toHaveBeenCalledWith('rename', 'Rating/music/Album.md', 'New title');
    expect(close).toHaveBeenCalled();
  });

  it('validates names and requires a separate trash confirmation', async () => {
    const user = userEvent.setup(); const run = vi.fn();
    const { unmount } = render(<NoteActionDialog action="duplicate" path="a.md" onClose={vi.fn()} onRun={run} />);
    await user.clear(screen.getByRole('textbox', { name: 'Filename' }));
    await user.click(screen.getByRole('button', { name: 'Duplicate' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Give the note a name');
    expect(run).not.toHaveBeenCalled();
    unmount();
    render(<NoteActionDialog action="delete" path="a.md" onClose={vi.fn()} onRun={run} />);
    expect(screen.getByText(/\.trash/)).toBeInTheDocument();
    expect(run).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Move to trash' }));
    expect(run).toHaveBeenCalledWith('delete', 'a.md', 'a');
  });

  it('exposes the title as a rename control', async () => {
    const onRename = vi.fn(); render(<NoteTitle title="Album" onRename={onRename} />);
    await userEvent.click(screen.getByRole('button', { name: 'Rename Album' }));
    expect(onRename).toHaveBeenCalled();
  });
});
