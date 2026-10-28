import { describe, expect, it } from 'vitest';
import { parseDay } from './day';
import { initialTimer, pause, start, startRest, type TimerState, type TimerTask } from './timer';
import { customMinutes, dayShare, isSessionTask, menuBarLabel, panelNow, panelView, readCommand, startCommand, TIMELINE_MARKS, trayClock, trayTooltip, type PanelView } from './tray';

// The tasks of demo-vault/Calendar/2026/days 2026/01.09.2026.md, as they are, the last one given a focus-id.
const TEXT = `### Tasks
- [x] #daily/study — linear algebra: eigenvectors [minutes::82]
    - 08:58–10:20
- [x] #daily/dog — long walk with the dog [minutes::67]
    - 10:32–11:39
- [x] #daily/code — refactor the settings screen [minutes::30]
    - 12:12–12:42
- [ ] #daily/kaizen — draft the weekly review [minutes::33] <!-- focus-id: 20260901-01 -->
    - 13:02–13:35
`;
const PATH = 'Calendar/2026/days 2026/01.09.2026.md';
const TODAY = new Date(2026, 8, 1);
/** 1 September 2026, 14:30 local time. */
const AT = new Date(2026, 8, 1, 14, 30).getTime();
const REVIEW: TimerTask = { path: PATH, day: '2026-09-01', line: 7, label: 'draft the weekly review', category: 'kaizen', focusId: '20260901-01', vault: '/vaults/demo' };

const running = (task: TimerTask, mode: 'pomodoro' | 'stopwatch', at = AT): TimerState => start(initialTimer(), at, { id: 's1', task, mode, minutes: 25 });

const view = (timer: TimerState, more: Partial<Parameters<typeof panelView>[0]> = {}) =>
  panelView({ vault: 'demo', today: TODAY, path: PATH, text: TEXT, day: parseDay(TEXT), timer, unwritten: 0, ...more });

describe('the menu bar item', () => {
  it('names a round by its task’s category, or "focus"', () => {
    expect(menuBarLabel('Code')).toBe('code');
    expect(menuBarLabel(undefined)).toBe('focus');
    expect(menuBarLabel('  ')).toBe('focus');
  });

  it('hands the title’s ticking the round’s timing, not its time', () => {
    const pomodoro = running(REVIEW, 'pomodoro');
    expect(trayClock(pomodoro)).toEqual({ kind: 'focus', label: 'kaizen', accumulated: 0, since: AT, paused: false, planned: 1500 });
    const stopwatch = running({ ...REVIEW, category: undefined }, 'stopwatch');
    expect(trayClock(stopwatch)).toEqual({ kind: 'focus', label: 'focus', accumulated: 0, since: AT, paused: false });
    const paused = pause(stopwatch, AT + 37_000);
    expect(trayClock(paused)).toEqual({ kind: 'focus', label: 'focus', accumulated: 37_000, since: AT, paused: true });
    expect(trayClock(startRest(initialTimer(), AT, 252))).toEqual({ kind: 'rest', endsAt: AT + 252_000 });
    expect(trayClock(initialTimer())).toEqual({ kind: 'idle' });
  });

  it('says what runs when pointed at, without a time that would go stale', () => {
    expect(trayTooltip(running(REVIEW, 'pomodoro'))).toBe('Pomodoro · 25 min · draft the weekly review');
    expect(trayTooltip(pause(running(REVIEW, 'stopwatch'), AT + 1000))).toBe('Stopwatch, paused · draft the weekly review');
    expect(trayTooltip(startRest(initialTimer(), AT))).toBe('Resting');
    expect(trayTooltip(initialTimer())).toBe('Epizen');
  });
});

describe('the panel’s view', () => {
  it('lists today’s tasks with their lines, minutes and the one the round is on', () => {
    const shown = view(running(REVIEW, 'pomodoro'));
    expect(shown.day).toBe('2026-09-01');
    expect(shown.note).toBe(true);
    expect(shown.logged).toBe(82 + 67 + 30 + 33);
    expect(shown.tasks.map((task) => [task.line, task.label, task.category, task.minutes, task.done, task.current])).toEqual([
      [1, 'linear algebra: eigenvectors', 'study', 82, true, false],
      [3, 'long walk with the dog', 'dog', 67, true, false],
      [5, 'refactor the settings screen', 'code', 30, true, false],
      [7, 'draft the weekly review', 'kaizen', 33, false, true],
    ]);
    expect(shown.tasks[3]?.text).toBe('- [ ] #daily/kaizen — draft the weekly review [minutes::33] <!-- focus-id: 20260901-01 -->');
    expect(shown.session).toEqual({ label: 'draft the weekly review', category: 'kaizen', mode: 'pomodoro', planned: 1500, accumulated: 0, segmentStartedAt: AT, stretchStartedAt: AT });
  });

  it('finds the round’s task by focus-id first, then by its words and category', () => {
    const line = TEXT.split('\n')[7] ?? '';
    expect(isSessionTask(REVIEW, PATH, line, 'draft the weekly review', 'kaizen')).toBe(true);
    expect(isSessionTask({ ...REVIEW, focusId: '20260901-02' }, PATH, line, 'draft the weekly review', 'kaizen')).toBe(false);
    expect(isSessionTask({ ...REVIEW, focusId: undefined, category: 'Kaizen' }, PATH, line, 'draft the weekly review', 'kaizen')).toBe(true);
    expect(isSessionTask(REVIEW, 'Calendar/2026/days 2026/02.09.2026.md', line, 'draft the weekly review', 'kaizen')).toBe(false);
  });

  it('keeps out what changes without changing anything shown, so it isn’t sent again for nothing', () => {
    const timer = running(REVIEW, 'stopwatch');
    const later = { ...timer, session: timer.session && { ...timer.session, heartbeat: AT + 30_000 } };
    expect(view(later)).toEqual(view(timer));
  });

  it('has nothing to start without a vault or today’s note, and says what went wrong', () => {
    const none = view(initialTimer(), { vault: undefined });
    expect(none.vault).toBeUndefined();
    expect(none.tasks).toEqual([]);
    const noNote = view(initialTimer(), { path: undefined, text: undefined, day: undefined });
    expect([noNote.note, noNote.tasks.length, noNote.logged]).toEqual([false, 0, 0]);
    expect(view(initialTimer(), { unwritten: 2 }).warning).toBe('2 stretches of focus aren’t in the note yet. Open Epizen to see why.');
    expect(view(initialTimer(), { unwritten: 1, problem: 'The timer didn’t start: no.' }).warning).toBe('The timer didn’t start: no.');
  });
});

describe('the panel at a moment', () => {
  it('places now on the day by the clock', () => {
    expect(dayShare(new Date(2026, 8, 1, 0, 0))).toBe(0);
    expect(dayShare(new Date(2026, 8, 1, 18, 0))).toBe(0.75);
    expect(TIMELINE_MARKS.filter((mark) => mark.major).map((mark) => mark.hour)).toEqual([0, 6, 12, 18, 24]);
  });

  it('shows the round’s time, the day’s focus with the stretch under way, and the day gone', () => {
    const shown = panelNow(view(running(REVIEW, 'pomodoro')), AT + 10 * 60_000 + 30_000);
    expect(shown.date).toBe('Tuesday, 1 September');
    expect(shown.clock).toBe('14:40');
    expect(shown.percent).toBe(61);
    expect(shown.focused).toBe('3h 42m');
    expect(shown.round).toEqual({ time: '14:30', state: 'left', kind: 'Pomodoro · 25 min', progress: 630 / 1500 });
    expect(shown.rest).toBeUndefined();
  });

  it('holds a paused round still, and counts its stretch only up to the pause', () => {
    const paused = pause(running(REVIEW, 'stopwatch'), AT + 5 * 60_000);
    const shown = panelNow(view(paused), AT + 60 * 60_000);
    expect(shown.round).toEqual({ time: '5:00', state: 'paused', kind: 'Stopwatch' });
    expect(shown.focused).toBe('3h 37m');
  });

  it('counts a rest down, and a stretch begun yesterday no more today', () => {
    const rest = panelNow(view(startRest(initialTimer(), AT, 367)), AT + 7000);
    expect(rest.rest?.time).toBe('6:00');
    expect(rest.rest?.progress).toBeCloseTo(7 / 367, 9);
    const yesterday = running(REVIEW, 'stopwatch', AT - 24 * 3_600_000);
    expect(panelNow(view(yesterday), AT).focused).toBe('3h 32m');
  });
});

describe('the panel’s commands', () => {
  const task = (view(initialTimer()).tasks[3] ?? {}) as PanelView['tasks'][number];

  it('start a round on the task as it read on its day’s list, the way it was asked for', () => {
    expect(startCommand('2026-09-01', task, { mode: 'pomodoro', minutes: 42 })).toEqual({
      kind: 'start',
      day: '2026-09-01',
      task: { line: 7, text: '- [ ] #daily/kaizen — draft the weekly review [minutes::33] <!-- focus-id: 20260901-01 -->', label: 'draft the weekly review', category: 'kaizen' },
      mode: 'pomodoro',
      minutes: 42,
    });
    expect(startCommand('2026-09-01', task, { mode: 'stopwatch' })).toMatchObject({ mode: 'stopwatch' });
  });

  it('are read back only when they are whole', () => {
    const command = startCommand('2026-09-01', task, { mode: 'pomodoro', minutes: 25 });
    expect(readCommand(JSON.parse(JSON.stringify(command)))).toEqual(command);
    expect(readCommand({ kind: 'pause' })).toEqual({ kind: 'pause' });
    expect(readCommand({ kind: 'skip-rest' })).toEqual({ kind: 'skip-rest' });
    const day = '2026-09-01';
    expect(readCommand({ kind: 'start', day, task: { line: 7, text: '', label: 'x' }, mode: 'stopwatch' })).toEqual({ kind: 'start', day, task: { line: 7, text: '', label: 'x' }, mode: 'stopwatch' });
    expect(readCommand({ kind: 'start', day, task: { line: 7, text: '', label: 'x' }, mode: 'pomodoro' })).toBeUndefined();
    expect(readCommand({ kind: 'start', day, task: { line: -1, text: '', label: 'x' }, mode: 'stopwatch' })).toBeUndefined();
    expect(readCommand({ kind: 'start', day, task: { line: 7, text: '', label: 'x', category: 3 }, mode: 'stopwatch' })).toBeUndefined();
    // Without the day its task was listed on, a start can't be checked against today.
    expect(readCommand({ kind: 'start', task: { line: 7, text: '', label: 'x' }, mode: 'stopwatch' })).toBeUndefined();
    expect(readCommand({ kind: 'start', day: 'today', task: { line: 7, text: '', label: 'x' }, mode: 'stopwatch' })).toBeUndefined();
    expect(readCommand({ kind: 'delete-everything' })).toBeUndefined();
    expect(readCommand('pause')).toBeUndefined();
    expect(readCommand(null)).toBeUndefined();
  });

  it('take a custom round of 1 to 240 minutes', () => {
    expect(customMinutes('30')).toBe(30);
    expect(customMinutes('240')).toBe(240);
    expect(customMinutes('241')).toBeUndefined();
    expect(customMinutes('0')).toBeUndefined();
    expect(customMinutes('')).toBeUndefined();
    expect(customMinutes('2.5')).toBeUndefined();
  });
});
