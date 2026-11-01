import { afterEach, expect, it, vi } from 'vitest';
import { followPointer } from './effects';

afterEach(() => { delete document.documentElement.dataset.motion; document.body.replaceChildren(); vi.restoreAllMocks(); });

it('coalesces pointer movement into one frame at the latest position', () => {
  let frame: FrameRequestCallback | undefined;
  const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { frame = callback; return 1; });
  const card = document.createElement('div');
  card.className = 'glass';
  document.body.append(card);
  const rect = vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20 } as DOMRect);
  const event = (x: number, y: number) => ({ target: card, clientX: x, clientY: y }) as unknown as Parameters<typeof followPointer>[0];
  followPointer(event(20, 40));
  followPointer(event(40, 80));
  expect(request).toHaveBeenCalledTimes(1);
  expect(rect).not.toHaveBeenCalled();
  frame?.(0);
  expect(rect).toHaveBeenCalledTimes(1);
  expect(card.style.getPropertyValue('--mx')).toBe('30px');
  expect(card.style.getPropertyValue('--my')).toBe('60px');
});

it('does not animate when disabled or touch a card removed before the frame', () => {
  let frame: FrameRequestCallback | undefined;
  const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { frame = callback; return 1; });
  const card = document.createElement('div');
  card.className = 'glass';
  document.body.append(card);
  const event = { target: card, clientX: 10, clientY: 20 } as unknown as Parameters<typeof followPointer>[0];
  document.documentElement.dataset.motion = 'off';
  followPointer(event);
  expect(request).not.toHaveBeenCalled();
  delete document.documentElement.dataset.motion;
  followPointer(event);
  card.remove();
  frame?.(0);
  expect(card.style.getPropertyValue('--mx')).toBe('');
});
