import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NoteActionDialog, NoteMenu } from './NoteActions';
import { NoteTitle } from './NoteTitle';

describe('note actions', () => {
  it('offers file actions from the menu and dismisses with Escape', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn(); const onClose = vi.fn();
    render(<NoteMenu path="Rating/music/Album.md" x={10} y={10} onPick={onPick} onClose={onClose} />);
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Duplicate', 'Reveal in Finder', 'Rename…', 'Move to folder…', 'Delete…']);
    await user.click(screen.getByRole('menuitem', { name: 'Reveal in Finder' }));
    expect(onPick).toHaveBeenCalledWith('reveal');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('finds a destination by keyboard and keeps it selected if a move collides', async () => {
    const user = userEvent.setup();
    const run = vi.fn().mockRejectedValueOnce(new Error('Already exists')).mockResolvedValueOnce(undefined);
    const close = vi.fn();
    render(<NoteActionDialog action="move" path="Notes/Idea.md" folders={['Notes', 'Reading', 'Projects/Archive']} updateLinks={false} onRun={run} onClose={close} />);
    await user.type(screen.getByRole('searchbox'), 'archive');
    expect(screen.queryByRole('button', { name: 'Reading' })).not.toBeInTheDocument();
    await user.tab(); await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: 'Move' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Already exists');
    expect(screen.getByRole('button', { name: 'Projects/Archive' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Move' }));
    expect(run).toHaveBeenLastCalledWith('move', 'Notes/Idea.md', 'Projects/Archive');
    expect(close).toHaveBeenCalledOnce();
  });

  it('keeps the new name and shows a failed rename so it can be retried', async () => {
    const user = userEvent.setup(); const close = vi.fn();
    const run = vi.fn().mockRejectedValueOnce(new Error('A file with this name already exists')).mockResolvedValueOnce(undefined);
    render(<NoteActionDialog folders={[]} updateLinks action="rename" path="Rating/music/Album.md" onClose={close} onRun={run} />);
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
    const { unmount } = render(<NoteActionDialog folders={[]} updateLinks action="duplicate" path="a.md" onClose={vi.fn()} onRun={run} />);
    await user.clear(screen.getByRole('textbox', { name: 'Filename' }));
    await user.click(screen.getByRole('button', { name: 'Duplicate' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Give the note a name');
    expect(run).not.toHaveBeenCalled();
    unmount();
    render(<NoteActionDialog folders={[]} updateLinks action="delete" path="a.md" onClose={vi.fn()} onRun={run} />);
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
