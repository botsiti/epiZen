import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { NoteMarkdown } from './NoteMarkdown';

const state = vi.hoisted(() => ({ broken: true }));
vi.mock('./bases/BaseBlock', () => ({ BaseBlock: () => { if (state.broken) throw new Error('Table failed'); return <span>Recovered table</span>; } }));

it('contains a table render failure, keeps surrounding text and navigation, and retries it', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    const user = userEvent.setup(), open = vi.fn();
    render(<NoteMarkdown path="note.md" files={[]} onOpenLink={open} body={'Keep this text.\n\n```base\nviews: [{type: table}]\n```\n\n[[Another note]]'} />);
    expect(screen.getByRole('alert')).toHaveTextContent('This table couldn’t be shown');
    expect(screen.getByText('Keep this text.')).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Another note' }));
    expect(open).toHaveBeenCalledWith('Another note', 'note.md', false);
    state.broken = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('Recovered table')).toBeVisible();
  } finally { log.mockRestore(); }
});
