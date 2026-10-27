import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { blockBetween, type PendingBlock, type TimerState, type TimerTask } from '../../lib/timer';
import { useTimer } from './useTimer';

const TASK: TimerTask = { path: 'days/27.10.2026.md', day: '2026-10-27', line: 7, label: 'planning', category: 'kaizen' };

/** A stopwatch that ran from ten minutes ago, last seen alive a minute ago, as the settings hold it. */
function stored() {
  const startedAt = Date.now() - 10 * 60_000;
  const heartbeat = startedAt + 9 * 60_000;
  const session = { id: 's1', task: TASK, mode: 'stopwatch', startedAt, stretchStartedAt: startedAt, segmentStartedAt: startedAt, accumulated: 0, heartbeat };
  return { value: { session, pending: [], prefs: { mode: 'stopwatch', minutes: 25, rest: 367 } }, block: blockBetween(startedAt, heartbeat) };
}

function run(write: (block: PendingBlock) => Promise<void>) {
  const order: string[] = [];
  const save = vi.fn((state: TimerState) => {
    order.push(`save ${state.pending.length}`);
    return Promise.resolve();
  });
  const writes = vi.fn((block: PendingBlock) => {
    order.push(`write ${block.start}-${block.end}`);
    return write(block);
  });
  const { value, block } = stored();
  const deps = { save, write: writes, chime: vi.fn() };
  const hook = renderHook(() => useTimer(deps, value, true));
  return { ...hook, order, save, writes, block };
}

describe('the timer at work', () => {
  it('comes back paused at its last heartbeat, and saves a block before it writes it', async () => {
    const { result, order, block } = run(() => Promise.resolve());
    expect(result.current.state.session?.pausedAt).toBeDefined();
    await waitFor(() => expect(order).toEqual(['save 0']));
    act(() => result.current.stop());
    await waitFor(() => expect(order).toEqual(['save 0', 'save 1', `write ${block?.start}-${block?.end}`, 'save 0']));
    expect(result.current.state.pending).toEqual([]);
  });

  it('keeps a block that couldn’t be written, with why, until it is tried again or let go', async () => {
    let fail = true;
    const { result, writes } = run(() => (fail ? Promise.reject(new Error('Error: “planning” is no longer in the note')) : Promise.resolve()));
    act(() => result.current.stop());
    await waitFor(() => expect(result.current.failures.size).toBe(1));
    const [id, why] = [...result.current.failures][0] ?? [];
    expect(why).toBe('“planning” is no longer in the note');
    expect(result.current.state.pending.map((block) => block.id)).toEqual([id]);
    fail = false;
    act(() => result.current.retry(id ?? ''));
    await waitFor(() => expect(result.current.state.pending).toEqual([]));
    expect(writes).toHaveBeenCalledTimes(2);
    expect(result.current.failures.size).toBe(0);
  });

  it('writes a block it still owed when the app went away, once it has started again', async () => {
    const owed: PendingBlock = { id: 'old@2026-10-26T600-625', task: TASK, day: '2026-10-26', start: 600, end: 625 };
    const writes = vi.fn(() => Promise.resolve());
    const value = { pending: [owed], prefs: { mode: 'pomodoro', minutes: 25, rest: 367 } };
    const deps = { save: () => Promise.resolve(), write: writes, chime: vi.fn() };
    const { result } = renderHook(() => useTimer(deps, value, true));
    await waitFor(() => expect(result.current.state.pending).toEqual([]));
    expect(writes).toHaveBeenCalledWith(owed);
  });

  it('lets a block go when asked', async () => {
    const { result } = run(() => Promise.reject(new Error('the note changed')));
    act(() => result.current.stop());
    await waitFor(() => expect(result.current.failures.size).toBe(1));
    act(() => result.current.discard(result.current.state.pending[0]?.id ?? ''));
    await waitFor(() => expect(result.current.state.pending).toEqual([]));
  });
});
