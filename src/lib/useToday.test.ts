import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { day } from './dates';
import { useToday } from './useToday';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useToday', () => {
  it('moves on at midnight', () => {
    vi.setSystemTime(new Date(2026, 9, 25, 23, 58));
    const { result } = renderHook(() => useToday());
    expect(result.current).toEqual(day(2026, 9, 25));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toEqual(day(2026, 9, 25));
    act(() => {
      vi.advanceTimersByTime(2 * 60_000);
    });
    expect(result.current).toEqual(day(2026, 9, 26));
    // And again the night after.
    act(() => {
      vi.advanceTimersByTime(24 * 60 * 60_000);
    });
    expect(result.current).toEqual(day(2026, 9, 27));
  });

  it('looks again when the window gets focus, for a Mac that slept through midnight', () => {
    vi.setSystemTime(new Date(2026, 9, 25, 22, 0));
    const { result } = renderHook(() => useToday());
    // The clock moves on without the timers firing, as it does while the Mac sleeps.
    vi.setSystemTime(new Date(2026, 9, 27, 8, 0));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(result.current).toEqual(day(2026, 9, 27));
  });

  it('keeps the same date, and the same object, within a day', () => {
    vi.setSystemTime(new Date(2026, 9, 25, 9, 0));
    const { result } = renderHook(() => useToday());
    const first = result.current;
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(result.current).toBe(first);
  });
});
