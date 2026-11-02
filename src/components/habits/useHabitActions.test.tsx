import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useHabitActions } from './useHabitActions';
import { createNote, readNote, vaultStatus, writeNote } from '../../lib/api';
import { newHabit, readHabit } from '../../lib/habits';

vi.mock('../../lib/api', () => ({ createNote: vi.fn(), readNote: vi.fn(), writeNote: vi.fn(), vaultStatus: vi.fn() }));
beforeEach(() => { vi.resetAllMocks();vi.mocked(vaultStatus).mockResolvedValue({ state: 'open', root: '/copy', name: 'demo' }); });
const fixture = () => { const n = newHabit('No sweets', '2026-11-01', 'habit-sweets-001');return readHabit(n.path, n.text)!; };
const options = () => ({ root: '/copy', habits: [fixture()], onSaved: vi.fn(), refresh: vi.fn(() => Promise.resolve()), changeDay: vi.fn(() => Promise.resolve({ path: 'day.md', text: '' })) });
it('creates only a new definition, refreshes and refuses duplicate names', async () => {
  const p = options();const { result } = renderHook(() => useHabitActions(p));
  await act(() => result.current.onCreate('Read', '2026-11-02'));
  expect(createNote).toHaveBeenCalledWith(expect.stringMatching(/^Habits\/Read-.+\.md$/), expect.stringContaining('type: habit'));
  expect(writeNote).not.toHaveBeenCalled();expect(p.refresh).toHaveBeenCalledOnce();
  await expect(result.current.onCreate('no sweets', '2026-11-02')).rejects.toThrow('already has a history');
  expect(createNote).toHaveBeenCalledOnce();
});
it('uses a conditional write for archive and refuses an outside edit', async () => {
  const p = options();const habit = p.habits[0]!;vi.mocked(readNote).mockResolvedValue(habit.source!);
  const { result } = renderHook(() => useHabitActions(p));
  await act(() => result.current.onLifecycle(habit, { kind: 'archive', date: '2026-12-01' }));
  expect(writeNote).toHaveBeenCalledWith(habit.path, expect.stringContaining('2026-12-01'), habit.source);
  vi.mocked(readNote).mockResolvedValue(habit.source! + '\nAn outside edit.');
  await expect(result.current.onLifecycle(habit, { kind: 'archive', date: '2026-12-01' })).rejects.toThrow('changed outside');
  expect(writeNote).toHaveBeenCalledOnce();
});
it('refuses writes after switching vaults and never runs a daily edit for an archived date', async () => {
  const p = options();const habit = p.habits[0]!;
  vi.mocked(vaultStatus).mockResolvedValue({ state: 'open', root: '/other', name: 'other' });
  const { result } = renderHook(() => useHabitActions(p));
  await expect(result.current.onCreate('Read', '2026-11-02')).rejects.toThrow('vault changed');
  expect(createNote).not.toHaveBeenCalled();
  vi.mocked(vaultStatus).mockResolvedValue({ state: 'open', root: '/copy', name: 'demo' });
  vi.mocked(readNote).mockResolvedValue(habit.source!);
  await expect(result.current.onComplete(new Date(2026, 9, 31), habit, false, true)).rejects.toThrow('not scheduled');
  expect(p.changeDay).not.toHaveBeenCalled();
});
