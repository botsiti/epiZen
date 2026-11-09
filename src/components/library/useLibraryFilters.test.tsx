import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { flushAll } from '../../lib/saving';
import { useLibraryFilters } from './useLibraryFilters';

it('keeps existing vaults on all time and initializes new vaults with This year', () => {
  const save = vi.fn().mockResolvedValue(undefined);
  const existing = renderHook(() => useLibraryFilters(undefined, true, true, save));
  const fresh = renderHook(() => useLibraryFilters(undefined, true, false, save));
  expect(existing.result.current.filters.period).toBe('all');
  expect(fresh.result.current.filters.period).toBe('this-year');
  existing.unmount(); fresh.unmount();
});
it('retains the selected filters on a failed save and retries only when asked', async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error('Disk unavailable')).mockResolvedValue(undefined);
  const hook = renderHook(() => useLibraryFilters(undefined, true, true, save));
  act(() => hook.result.current.change({ period: 'all', cover: 'without' }));
  await waitFor(() => expect(hook.result.current.error).toBe('Disk unavailable'));
  expect(hook.result.current.filters).toEqual({ period: 'all', cover: 'without' });
  expect(await flushAll()).toContain('Library filters');
  act(() => hook.result.current.retry());
  await waitFor(() => expect(hook.result.current.error).toBeUndefined());
  expect(save).toHaveBeenCalledTimes(2);
  expect(await flushAll()).not.toContain('Library filters');
  hook.unmount();
});
it('serializes rapid changes so an older save cannot overwrite the latest choice', async () => {
  let finish: () => void = () => undefined;
  const save = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; })).mockResolvedValue(undefined);
  const hook = renderHook(() => useLibraryFilters(undefined, true, true, save));
  act(() => hook.result.current.change({ period: 2025 }));
  act(() => hook.result.current.change({ period: 'all', rating: 'unrated' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(hook.result.current.filters).toEqual({ period: 'all', rating: 'unrated' });
  act(() => finish());
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(save.mock.calls[1]?.[0]).toEqual({ period: 'all', rating: 'unrated' });
  hook.unmount();
});
