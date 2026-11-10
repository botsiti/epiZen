import { act, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Spike } from './Spike';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('sleeps between actual sprite changes and stops work when hidden, paused or unmounted', () => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const frame = vi.spyOn(window, 'requestAnimationFrame');
  const view = render(<Spike />);
  const sprite = view.container.firstElementChild as HTMLElement;
  expect(vi.getTimerCount()).toBe(1);
  act(() => { vi.advanceTimersByTime(279); });
  expect(sprite.style.getPropertyValue('--spike-x')).toBe('0%');
  act(() => { vi.advanceTimersByTime(1); });
  expect(sprite.style.getPropertyValue('--spike-x')).not.toBe('0%');
  expect(frame).not.toHaveBeenCalled();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(vi.getTimerCount()).toBe(0);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(vi.getTimerCount()).toBe(1);
  view.rerender(<Spike motion={false} />);
  expect(vi.getTimerCount()).toBe(0);
  view.rerender(<Spike />);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
