import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { getRewardSettings, saveRewardSettings } from '../../lib/api';
import { newRewardSettings } from '../../lib/rewardRules';
import { useQuestRules } from './useQuestRules';

vi.mock('../../lib/api', () => ({ getRewardSettings: vi.fn(), saveRewardSettings: vi.fn() }));

it('isolates vault changes, retains unsupported settings, and retries a failed read', async () => {
  let finish!: (value: unknown) => void;
  vi.mocked(getRewardSettings).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
    .mockResolvedValueOnce({ revision: 2, state: { version: 42 } }).mockResolvedValueOnce(null);
  const { result, rerender } = renderHook(({ root }) => useQuestRules(root), { initialProps: { root: 'first' } });
  rerender({ root: 'second' });
  await waitFor(() => expect(result.current.error).toContain('different version'));
  await act(async () => {
    finish({ revision: 1, state: newRewardSettings('first') });
    await Promise.resolve();
  });
  expect(result.current.document).toBeUndefined();
  expect(saveRewardSettings).not.toHaveBeenCalled();
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.document?.revision).toBe(0));
  const rules = newRewardSettings('second');
  vi.mocked(saveRewardSettings).mockResolvedValueOnce(1);
  await act(() => result.current.save(0, rules));
  expect(saveRewardSettings).toHaveBeenCalledWith('second', 0, rules);
  expect(result.current.document).toEqual({ revision: 1, value: rules });
});
