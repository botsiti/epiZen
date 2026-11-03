import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { NewNote } from './NewNote';

it('previews the configured location and retains the name after a collision', async () => {
  const user = userEvent.setup();
  const onCreate = vi.fn().mockRejectedValueOnce(new Error('Already exists')).mockResolvedValueOnce(undefined);
  render(<NewNote folders={['Inbox']} folder="Inbox" onCreate={onCreate} />);
  await user.type(screen.getByTestId('new-note-name'), 'My idea.md');
  expect(screen.getByText('Inbox/My idea.md')).toBeVisible();
  await user.click(screen.getByTestId('new-note-create'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Already exists');
  expect(screen.getByTestId('new-note-name')).toHaveValue('My idea.md');
  await user.clear(screen.getByTestId('new-note-name'));
  await user.type(screen.getByTestId('new-note-name'), 'Another');
  await user.click(screen.getByTestId('new-note-create'));
  expect(onCreate).toHaveBeenLastCalledWith('Inbox/Another.md');
});
it('creates a folder once and offers a note inside it', async () => {
  const user = userEvent.setup(), onCreate = vi.fn().mockResolvedValue(undefined), onNewNote = vi.fn();
  render(<NewNote kind="folder" folders={['Projects']} folder="Projects" onCreate={onCreate} onNewNote={onNewNote} />);
  await user.type(screen.getByTestId('new-folder-name'), 'Writing');
  await user.dblClick(screen.getByTestId('new-folder-create'));
  expect(onCreate).toHaveBeenCalledExactlyOnceWith('Projects/Writing');
  await user.click(screen.getByRole('button', { name: 'Create a note here' }));
  expect(onNewNote).toHaveBeenCalledWith('Projects/Writing');
});
