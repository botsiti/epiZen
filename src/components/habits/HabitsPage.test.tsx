import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { useState } from 'react';
import { day } from '../../lib/dates';
import { parseDay } from '../../lib/day';
import { changeHabit, newHabit, readHabit, type Habit } from '../../lib/habits';
import { HabitsPage, type HabitsPageProps } from './HabitsPage';

const TODAY = day(2026, 10, 2);
const create = () => { const n = newHabit('No sweets', '2026-11-01', 'habit-sweets-001'); return readHabit(n.path, n.text)!; };
const entries = [{ date: day(2026, 10, 1), day: parseDay('> [!habits]\n> - [x] No sweets\n') }];
const props = (): HabitsPageProps => ({ habits: [create()], problems: [], days: entries, today: TODAY, onCreate: vi.fn(async () => {}), onLifecycle: vi.fn(async () => {}), onComplete: vi.fn(async () => {}), onOpenDay: vi.fn(), onOpenNote: vi.fn() });

it('creates a habit with a chosen date and retains a failed creation draft', async () => {
  const user = userEvent.setup();const p = props();p.habits = [];p.days = [];
  p.onCreate = vi.fn().mockRejectedValueOnce(new Error('The vault is read-only.')).mockResolvedValue(undefined);
  render(<HabitsPage {...p} />);
  await user.click(screen.getByRole('button', { name: /New habit/ }));
  await user.type(screen.getByLabelText('Habit name'), 'Read a chapter');
  fireEvent.change(screen.getByTestId('habit-effective-date'), { target: { value: '2026-11-03' } });
  await user.click(screen.getByRole('button', { name: 'Save habit' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('read-only');
  expect(screen.getByLabelText('Habit name')).toHaveValue('Read a chapter');
  await user.click(screen.getByRole('button', { name: 'Save habit' }));
  expect(p.onCreate).toHaveBeenLastCalledWith('Read a chapter', '2026-11-03', undefined);
});

it('archives, views history and reactivates the same habit with an explicit streak choice', async () => {
  const user = userEvent.setup();const lifecycle = vi.fn();
  function Page() {
    const [habit, setHabit] = useState<Habit>(create());
    return <HabitsPage {...props()} habits={[habit]} onLifecycle={(shown, change) => { lifecycle(shown.id, change);setHabit(readHabit(shown.path!, changeHabit(shown.source!, shown, change))!);return Promise.resolve(); }} />;
  }
  render(<Page />);
  expect(screen.getByTestId('habit-detail')).toHaveTextContent('Best streak1 day');
  await user.click(screen.getByRole('button', { name: 'Archive' }));
  expect(screen.getByText(/Previous check-ins/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Archive habit' }));
  expect(lifecycle).toHaveBeenLastCalledWith('habit-sweets-001', { kind: 'archive', date: '2026-11-02' });
  expect(screen.getByRole('button', { name: 'Archived1' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByTestId('habit-detail')).toHaveTextContent('Best streak1 day');
  await user.click(screen.getByRole('button', { name: 'Calendar' }));
  expect(screen.getByRole('button', { name: '1 Nov 2026: Completed' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Reactivate' }));
  await user.click(screen.getByRole('radio', { name: /Start fresh/ }));
  await user.click(screen.getByRole('button', { name: 'Save habit' }));
  expect(lifecycle).toHaveBeenLastCalledWith('habit-sweets-001', { kind: 'resume', date: '2026-11-02', restart: true });
  expect(screen.getByRole('button', { name: 'Active1' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByTestId('habit-detail')).toHaveTextContent('Best streak1 day');
});

it('offers older habits for continuation and keeps their history separate from the active list', async () => {
  const user = userEvent.setup();const p = props();p.habits = [];
  render(<HabitsPage {...p} />);
  expect(screen.getByRole('button', { name: 'Continue 1 habits' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'History1' }));
  expect(within(screen.getByTestId('habit-detail')).getByRole('heading', { name: 'No sweets' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Continue tracking' }));
  await user.click(screen.getByRole('button', { name: 'Save habit' }));
  expect(p.onCreate).toHaveBeenCalledWith('No sweets', '2026-11-02', expect.objectContaining({ id: 'legacy:no sweets' }));
});

it('prevents duplicate clicks during a completion write and surfaces the rejection', async () => {
  const user = userEvent.setup();const p = props();let finish: (() => void) | undefined;
  p.onComplete = vi.fn(() => new Promise<void>((_resolve, reject) => { finish = () => reject(new Error('This completion changed outside Epizen.')); }));
  render(<HabitsPage {...p} />);
  const button = screen.getByRole('button', { name: /Mark today complete/ });
  await user.click(button);expect(button).toBeDisabled();
  act(() => finish?.());
  expect(await screen.findByRole('alert')).toHaveTextContent('changed outside');
  expect(button).toBeEnabled();
});

it('checks in directly from a habit card without opening its history first', async () => {
  const user = userEvent.setup();const p = props();render(<HabitsPage {...p} />);
  await user.click(screen.getByRole('button', { name: 'Complete today for No sweets' }));
  expect(p.onComplete).toHaveBeenCalledWith(TODAY, expect.objectContaining({ id: 'habit-sweets-001' }), false, true);
});

it('contains the creation dialog focus and cancels without creating a note', async () => {
  const user = userEvent.setup();const p = props();render(<HabitsPage {...p} />);
  const add = screen.getByRole('button', { name: /New habit/ });
  await user.click(add);
  const dialog = screen.getByRole('dialog', { name: 'New habit' });
  expect(within(dialog).getByLabelText('Habit name')).toHaveFocus();
  await user.type(within(dialog).getByLabelText('Habit name'), 'Read a chapter');
  within(dialog).getByRole('button', { name: 'Save habit' }).focus();
  await user.tab();
  expect(within(dialog).getByLabelText('Habit name')).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(add).toHaveFocus();expect(p.onCreate).not.toHaveBeenCalled();
});
