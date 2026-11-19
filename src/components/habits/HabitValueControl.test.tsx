import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { HabitValueControl } from './HabitValueControl';
import type { Habit } from '../../lib/habits';

const water: Habit = { id: 'water-001', name: 'Water', aliases: [], periods: [{ from: '2026-01-01' }], tracking: { kind: 'goal', target: 8, unit: 'glasses' } };

it('retains a failed entry and refuses to overwrite an external value change', async () => {
  const user = userEvent.setup();
  const save = vi.fn().mockRejectedValue(new Error('Conflict in today’s note.'));
  const { rerender } = render(<HabitValueControl habit={water} value={2} onSave={save} />);
  await user.click(screen.getByRole('button', {name: 'Log Water value'}));
  const input = screen.getByRole('spinbutton', {name: 'Water value'});
  await user.clear(input);
  await user.type(input, '3.5');
  await user.click(screen.getByRole('button', {name: 'Save'}));
  expect(save).toHaveBeenCalledWith(3.5);
  expect(input).toHaveValue(3.5);
  expect(screen.getByRole('alert')).toHaveTextContent('Conflict');
  rerender(<HabitValueControl habit={water} value={4} onSave={save} />);
  await user.click(screen.getByRole('button', {name: 'Save'}));
  expect(save).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', {name: 'Cancel'}));
  expect(screen.getByRole('button', {name: 'Log Water value'})).toHaveTextContent('4 / 8 glasses');
});
