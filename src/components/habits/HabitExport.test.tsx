import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { exportMarkdown } from '../../lib/api';
import { parseDay } from '../../lib/day';
import { day } from '../../lib/dates';
import { HabitExport } from './HabitExport';

vi.mock('../../lib/api', () => ({ exportMarkdown: vi.fn() }));

it('keeps the export dialog available after a cancelled destination or a failed save', async () => {
  const user = userEvent.setup();
  const saved = vi.fn();
  vi.mocked(exportMarkdown).mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('This file already exists.')).mockResolvedValueOnce('/chosen/Journal.md');
  const today = day(2026, 10, 19);
  render(<HabitExport habits={[]} problems={[]} today={today} days={[{ date: today, day: parseDay('> [!habits]\n> - [x] Read a chapter') }]} onClose={vi.fn()} onSaved={saved} />);
  const save = screen.getByRole('button', { name: 'Save Markdown…' });
  await user.click(save);
  expect(saved).not.toHaveBeenCalled();
  expect(save).toBeEnabled();
  await user.click(save);
  expect(screen.getByRole('alert')).toHaveTextContent('already exists');
  await user.click(save);
  expect(exportMarkdown).toHaveBeenLastCalledWith('Habit journal - 2026-11-19.md', expect.stringContaining('Read a chapter'));
  expect(saved).toHaveBeenCalledWith('Habit journal exported.');
});
