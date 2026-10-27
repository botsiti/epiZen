import { describe, expect, it } from 'vitest';
import {
  blockBetween,
  formatSeconds,
  heartbeat,
  initialTimer,
  openStretch,
  pause,
  readTimer,
  restLeft,
  restore,
  resume,
  setRest,
  settle,
  shownSeconds,
  start,
  startRest,
  stop,
  tick,
  type TimerState,
  type TimerTask,
} from './timer';

// Local times on 27 October 2026, so the tests read the same in any time zone.
const at = (h: number, m: number, s = 0, day = 27) => new Date(2026, 9, day, h, m, s).getTime();
const TASK: TimerTask = { path: 'Calendar/27.10.2026.md', day: '2026-10-27', line: 7, label: 'mrSuit skills', category: 'code' };
const begin = (mode: 'pomodoro' | 'stopwatch', when = at(10, 0), minutes?: number) => start(initialTimer(), when, { id: 's1', task: TASK, mode, minutes });
const blocks = (state: TimerState) => state.pending.map((p) => [p.day, p.start, p.end]);
const min = (h: number, m: number) => h * 60 + m;

describe('the timer', () => {
  it('starts a pomodoro of the chosen length on a task, and counts down', () => {
    const state = begin('pomodoro', at(10, 0), 42);
    expect(state.session).toMatchObject({ mode: 'pomodoro', planned: 42 * 60, task: TASK });
    expect(state.prefs).toMatchObject({ mode: 'pomodoro', minutes: 42 });
    expect(shownSeconds(state.session!, at(10, 1, 30))).toBe(42 * 60 - 90);
    expect(formatSeconds(shownSeconds(state.session!, at(10, 1, 30)))).toBe('40:30');
  });

  it('keeps a custom round between 1 and 240 minutes', () => {
    expect(begin('pomodoro', at(10, 0), 500).session?.planned).toBe(240 * 60);
    expect(begin('pomodoro', at(10, 0), 0).session?.planned).toBe(60);
  });

  it('runs the stopwatch up from zero, and stop writes the stretch as one block', () => {
    const running = begin('stopwatch');
    expect(shownSeconds(running.session!, at(10, 25, 10))).toBe(25 * 60 + 10);
    const stopped = stop(running, at(10, 25, 10));
    expect(stopped.session).toBeUndefined();
    expect(stopped.pending).toEqual([{ id: 's1@2026-10-27T600-625', task: TASK, day: '2026-10-27', start: min(10, 0), end: min(10, 25) }]);
  });

  it('pauses: the time stops counting', () => {
    const paused = pause(begin('stopwatch'), at(10, 10));
    expect(shownSeconds(paused.session!, at(10, 50))).toBe(600);
    expect(paused.pending).toEqual([]);
  });

  it('resuming within a minute continues the same block', () => {
    const resumed = resume(pause(begin('stopwatch'), at(10, 10)), at(10, 10, 45));
    expect(resumed.pending).toEqual([]);
    expect(resumed.session?.stretchStartedAt).toBe(at(10, 0));
    expect(blocks(stop(resumed, at(10, 30)))).toEqual([['2026-10-27', min(10, 0), min(10, 30)]]);
  });

  it('resuming after a longer pause writes the stretch up to the pause, and starts a new one', () => {
    const resumed = resume(pause(begin('stopwatch'), at(10, 10)), at(10, 20));
    expect(blocks(resumed)).toEqual([['2026-10-27', min(10, 0), min(10, 10)]]);
    expect(resumed.session?.stretchStartedAt).toBe(at(10, 20));
    expect(shownSeconds(resumed.session!, at(10, 25))).toBe(15 * 60);
    expect(blocks(stop(resumed, at(10, 40)))).toEqual([
      ['2026-10-27', min(10, 0), min(10, 10)],
      ['2026-10-27', min(10, 20), min(10, 40)],
    ]);
  });

  it('completes a pomodoro: writes the block, starts the rest and chimes, and never starts the next round', () => {
    const running = begin('pomodoro', at(10, 0), 25);
    const almost = tick(running, at(10, 24, 59));
    expect(almost.chime).toBeUndefined();
    expect(almost.state.session?.id).toBe('s1');
    expect(almost.state.pending).toEqual([]);
    const done = tick(running, at(10, 25));
    expect(done.chime).toBe('focus');
    expect(done.state.session).toBeUndefined();
    expect(blocks(done.state)).toEqual([['2026-10-27', min(10, 0), min(10, 25)]]);
    expect(done.state.rest).toEqual({ startedAt: at(10, 25), seconds: 367 });
    expect(restLeft(done.state.rest!, at(10, 26))).toBe(307);
    const rested = tick(done.state, at(10, 31, 7));
    expect(rested.chime).toBe('rest');
    expect(rested.state.rest).toBeUndefined();
    expect(rested.state.session).toBeUndefined();
  });

  it('counts a pomodoro’s pauses out of its round, and seals it where the round was reached', () => {
    const paused = resume(pause(begin('pomodoro', at(10, 0), 25), at(10, 10)), at(10, 10, 30));
    expect(tick(paused, at(10, 25, 15)).chime).toBeUndefined();
    // Noticed late (the Mac slept): the block still ends when the 25 minutes were reached.
    const done = tick(paused, at(11, 40));
    expect(blocks(done.state)).toEqual([['2026-10-27', min(10, 0), min(10, 25)]]);
  });

  it('rests for the length chosen, and a rest can be skipped or started by hand', () => {
    const state = setRest(initialTimer(), 600);
    expect(state.prefs.rest).toBe(600);
    const resting = startRest(state, at(12, 0));
    expect(resting.rest).toEqual({ startedAt: at(12, 0), seconds: 600 });
    expect(setRest(resting, 180).rest).toEqual({ startedAt: at(12, 0), seconds: 180 });
    expect(start(resting, at(12, 1), { id: 's2', task: TASK, mode: 'stopwatch' }).rest).toBeUndefined();
  });

  it('runs one session at a time: starting another stops the first and writes it', () => {
    const second = start(begin('stopwatch'), at(10, 30), { id: 's2', task: { ...TASK, label: 'planning', category: 'kaizen' }, mode: 'stopwatch' });
    expect(blocks(second)).toEqual([['2026-10-27', min(10, 0), min(10, 30)]]);
    expect(second.session?.id).toBe('s2');
  });

  it('stopping a paused session writes up to the pause; under a minute writes nothing', () => {
    expect(blocks(stop(pause(begin('stopwatch'), at(10, 12)), at(11, 0)))).toEqual([['2026-10-27', min(10, 0), min(10, 12)]]);
    expect(stop(begin('stopwatch'), at(10, 0, 50)).pending).toEqual([]);
  });

  it('after a restart, resumes paused at the last heartbeat', () => {
    let state = begin('stopwatch');
    state = heartbeat(state, at(10, 30));
    // The app went away at about 10:30:20 and came back at 14:00.
    const restored = restore(state, at(14, 0));
    expect(restored.session?.pausedAt).toBe(at(10, 30));
    expect(shownSeconds(restored.session!, at(14, 0))).toBe(30 * 60);
    // Going on after the break writes 10:00–10:30 and counts from now.
    const resumed = resume(restored, at(14, 0));
    expect(blocks(resumed)).toEqual([['2026-10-27', min(10, 0), min(10, 30)]]);
    expect(restore(restored, at(15, 0))).toEqual(restored);
  });

  it('takes a heartbeat every 30 seconds while running, and none while paused', () => {
    const running = begin('stopwatch');
    expect(tick(running, at(10, 0, 29)).state).toBe(running);
    const beat = tick(running, at(10, 0, 30)).state;
    expect(beat.session?.heartbeat).toBe(at(10, 0, 30));
    expect(tick(beat, at(10, 0, 45)).state).toBe(beat);
    const paused = pause(running, at(10, 0, 10));
    expect(tick(paused, at(10, 5)).state).toBe(paused);
  });

  it('keeps pending blocks across a restart until they are settled, and reads back what it saved', () => {
    const stopped = stop(begin('stopwatch'), at(10, 20));
    const saved = readTimer(JSON.parse(JSON.stringify(restore(stopped, at(11, 0)))));
    expect(saved).toEqual(stopped);
    expect(settle(saved, saved.pending[0]!.id).pending).toEqual([]);
    expect(readTimer({ session: { id: 1 }, pending: [{ id: 'x' }], prefs: { minutes: 9999, rest: -1 } })).toEqual({
      ...initialTimer(),
      prefs: { mode: 'pomodoro', minutes: 240, rest: 10 },
    });
    expect(readTimer('nonsense')).toEqual(initialTimer());
  });

  it('cuts a stretch past midnight at 23:59 of the day it began', () => {
    const late = start(initialTimer(), at(23, 30), { id: 's3', task: TASK, mode: 'stopwatch' });
    expect(blocks(stop(late, at(0, 20, 0, 28)))).toEqual([['2026-10-27', min(23, 30), min(23, 59)]]);
    expect(blockBetween(at(23, 59, 30), at(0, 0, 40, 28))).toBeUndefined();
    expect(blockBetween(at(23, 58, 30), at(0, 0, 10, 28))).toEqual({ day: '2026-10-27', start: min(23, 58), end: min(23, 59) });
    // A stretch that begins after midnight belongs to the new day.
    const resumed = resume(pause(late, at(23, 50)), at(0, 10, 0, 28));
    expect(blocks(stop(resumed, at(0, 40, 0, 28)))).toEqual([
      ['2026-10-27', min(23, 30), min(23, 50)],
      ['2026-10-28', min(0, 10), min(0, 40)],
    ]);
  });

  it('shows the open stretch as it grows, for the calendar', () => {
    const running = begin('stopwatch');
    expect(openStretch(running.session!, at(10, 0, 20))).toEqual({ day: '2026-10-27', start: min(10, 0), end: min(10, 0) });
    expect(openStretch(running.session!, at(10, 47))).toEqual({ day: '2026-10-27', start: min(10, 0), end: min(10, 47) });
  });
});
