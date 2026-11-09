import { beforeEach, expect, it, vi } from 'vitest';
import { onQuickCommand } from './api';
const events = vi.hoisted(() => [] as { event: string; target?: string; receive: (value: { payload: string }) => void }[]);
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn((event: string, receive: (value: { payload: string }) => void, options?: { target?: string }) => {
  events.push({ event, receive, target: options?.target }); return Promise.resolve(() => undefined);
}) }));
beforeEach(() => { events.length = 0; });
it('keeps prompt close/flush commands out of the main workspace error listener', async () => {
  const main = vi.fn(), prompt = vi.fn();
  await onQuickCommand(main, 'main'); await onQuickCommand(prompt);
  const emit = (target: string, payload: string) => events.filter((event) => event.event === 'epizen://prompt-command' && (!event.target || event.target === target)).forEach((event) => event.receive({ payload }));
  emit('spike-prompt', 'flush'); emit('spike-prompt', 'close');
  expect(prompt.mock.calls).toEqual([['flush'], ['close']]); expect(main).not.toHaveBeenCalled();
  emit('main', 'The shortcut could not be registered');
  expect(main).toHaveBeenCalledWith('The shortcut could not be registered'); expect(prompt).toHaveBeenCalledTimes(2);
});
