import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { publishTray } from '../../lib/api';
import { initialTimer, start, type TimerState } from '../../lib/timer';
import { panelView, type TrayCommand } from '../../lib/tray';
import type { TimerApi } from '../calendar/useTimer';
import { runCommand, useTrayBridge } from './useTrayBridge';

const bus = vi.hoisted(() => ({
  command: undefined as ((value: unknown) => void) | undefined,
  due: undefined as (() => void) | undefined,
}));
vi.mock('../../lib/api', () => ({
  publishTray: vi.fn(() => Promise.resolve()),
  onTrayCommand: vi.fn((handler: (value: unknown) => void) => {
    bus.command = handler;
    return Promise.resolve(() => undefined);
  }),
  onTimerDue: vi.fn((handler: () => void) => {
    bus.due = handler;
    return Promise.resolve(() => undefined);
  }),
}));

const timer = (state: TimerState = initialTimer()): TimerApi => ({
  state,
  failures: new Map(),
  start: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  stop: vi.fn(),
  startRest: vi.fn(),
  endRest: vi.fn(),
  setRest: vi.fn(),
  setPrefs: vi.fn(),
  retry: vi.fn(),
  retryAll: vi.fn(),
  discard: vi.fn(),
  retask: vi.fn(),
  tick: vi.fn(),
});

const START: TrayCommand = {
  kind: 'start',
  task: { line: 7, text: '- [ ] #daily/kaizen — draft the weekly review [minutes::33]', label: 'draft the weekly review', category: 'kaizen' },
  mode: 'pomodoro',
  minutes: 42,
};

describe('the panel’s commands in the main window', () => {
  it('start a round as the calendar’s right-click does, with the same task and the same round', () => {
    const onStart = vi.fn();
    runCommand(START, { timer: timer(), onStart });
    expect(onStart).toHaveBeenCalledWith(
      { kind: 'task', ref: { line: 7, text: '- [ ] #daily/kaizen — draft the weekly review [minutes::33]' }, label: 'draft the weekly review', category: 'kaizen' },
      { mode: 'pomodoro', minutes: 42 },
    );
    runCommand({ ...START, mode: 'stopwatch', minutes: undefined }, { timer: timer(), onStart });
    expect(onStart).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'task' }), { mode: 'stopwatch' });
  });

  it('pause, resume, stop, rest and skip the rest on the one timer', () => {
    const api = timer();
    for (const kind of ['pause', 'resume', 'stop', 'rest', 'skip-rest'] as const) runCommand({ kind }, { timer: api, onStart: vi.fn() });
    for (const call of [api.pause, api.resume, api.stop, api.startRest, api.endRest]) expect(call).toHaveBeenCalledTimes(1);
  });
});

describe('the main window’s side of the menu bar', () => {
  beforeEach(() => vi.mocked(publishTray).mockClear());

  const TASK = { path: 'day.md', day: '2026-09-01', line: 1, label: 'review', category: 'code' };
  const view = (state: TimerState) => panelView({ vault: 'demo', today: new Date(2026, 8, 1), timer: state, unwritten: 0 });

  it('publishes what changed, and nothing when only the heartbeat did', () => {
    const first = start(initialTimer(), 1000, { id: 's', task: TASK, mode: 'stopwatch' });
    const { rerender } = renderHook(({ state }) => useTrayBridge(timer(state), view(state), vi.fn()), { initialProps: { state: first } });
    expect(publishTray).toHaveBeenCalledTimes(1);
    expect(vi.mocked(publishTray).mock.calls[0]?.[0]).toMatchObject({ clock: { kind: 'focus', label: 'code', since: 1000 }, tooltip: 'Stopwatch · review' });
    const beat = { ...first, session: first.session && { ...first.session, heartbeat: 31_000 } };
    rerender({ state: beat });
    expect(publishTray).toHaveBeenCalledTimes(1);
    rerender({ state: initialTimer() });
    expect(publishTray).toHaveBeenCalledTimes(2);
    expect(vi.mocked(publishTray).mock.calls[1]?.[0]).toMatchObject({ clock: { kind: 'idle' }, tooltip: 'Epizen' });
  });

  it('applies the panel’s commands once checked, and ticks when the item says time is up', () => {
    const api = timer();
    const onStart = vi.fn();
    renderHook(() => useTrayBridge(api, view(api.state), onStart));
    bus.command?.({ kind: 'pause' });
    bus.command?.({ kind: 'format-the-disk' });
    bus.command?.(JSON.parse(JSON.stringify(START)));
    expect(api.pause).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledTimes(1);
    bus.due?.();
    expect(api.tick).toHaveBeenCalledTimes(1);
  });
});
