import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CountUp } from './motion';

afterEach(() => {
  delete document.documentElement.dataset.motion;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('shows totals immediately, continues interrupted updates and cancels work on unmount', () => {
  let frame: FrameRequestCallback | undefined;
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frame = callback;
    return 1;
  });
  const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => { frame = undefined; });
  const view = render(<CountUp value={100} />);
  expect(screen.getByText('100')).toBeInTheDocument();
  expect(request).not.toHaveBeenCalled();
  view.rerender(<CountUp value={200} />);
  now = 100;
  act(() => frame?.(now));
  const midway = Number(view.container.textContent);
  expect(midway).toBeGreaterThan(100);
  expect(midway).toBeLessThan(200);
  view.rerender(<CountUp value={300} />);
  expect(Number(view.container.textContent)).toBe(midway);
  now = 520;
  act(() => frame?.(now));
  expect(screen.getByText('300')).toBeInTheDocument();
  view.rerender(<CountUp value={400} />);
  view.unmount();
  expect(cancel).toHaveBeenCalled();
  expect(frame).toBeUndefined();
});

it.each(['system', 'test'] as const)('shows changed values immediately with %s motion disabled', (source) => {
  if (source === 'test') document.documentElement.dataset.motion = 'off';
  else vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
  const request = vi.spyOn(window, 'requestAnimationFrame');
  const view = render(<CountUp value={100} />);
  view.rerender(<CountUp value={200} />);
  expect(screen.getByText('200')).toBeInTheDocument();
  expect(request).not.toHaveBeenCalled();
});
