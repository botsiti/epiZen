import { formatDate } from './dates';
import { formatMinutes, type Day } from './day';
import { focusIdOf } from './timeblocks';
import { CUSTOM_MINUTES, dayKey, dayOfKey, elapsed, formatSeconds, restLeft, shownSeconds, type Rest, type SessionTime, type TimerMode, type TimerPrefs, type TimerState, type TimerTask } from './timer';

// The menu bar item and its panel (src-tauri/src/tray.rs), as the main window shapes them. The
// timer is the main window's: it publishes what the item and the panel show, and the panel's
// buttons come back to it as commands. Nothing here runs a timer or writes a note.

/** What the item's title is made from: `Clock` in src-tauri/src/tray.rs, which ticks it. */
export type TrayClock =
  | { kind: 'idle' }
  /** Focus counted is `accumulated`, plus the time since `since` unless paused; a pomodoro counts down from `planned` seconds. */
  | { kind: 'focus'; label: string; accumulated: number; since: number; paused: boolean; planned?: number }
  | { kind: 'rest'; endsAt: number };

/** The word after the time in the menu bar: the task's category, as Senioro shows it, or "focus". */
export const menuBarLabel = (category?: string) => category?.trim().toLowerCase() || 'focus';

export function trayClock({ session, rest }: TimerState): TrayClock {
  if (session) {
    const { accumulated, segmentStartedAt: since, planned } = session;
    return { kind: 'focus', label: menuBarLabel(session.task.category), accumulated, since, paused: session.pausedAt !== undefined, ...(planned ? { planned } : {}) };
  }
  return rest ? { kind: 'rest', endsAt: rest.startedAt + rest.seconds * 1000 } : { kind: 'idle' };
}

/** What the item says when pointed at. It doesn't tick, so it holds no time. */
export function trayTooltip({ session, rest }: TimerState): string {
  if (session) {
    const kind = session.planned ? `Pomodoro · ${Math.round(session.planned / 60)} min` : 'Stopwatch';
    return `${kind}${session.pausedAt === undefined ? '' : ', paused'} · ${session.task.label || 'untitled'}`;
  }
  return rest ? 'Resting' : 'Epizen';
}

/** One of today's tasks, as the panel lists it. `line` and `text` are its line as the main window read it. */
export interface PanelTask {
  line: number;
  text: string;
  label: string;
  category?: string;
  minutes: number;
  done: boolean;
  /** The round under way, running or paused, is on this task. */
  current: boolean;
}

/** The round under way: its time, and the task it is on as it started. */
export interface PanelSession extends SessionTime {
  label: string;
  category?: string;
}

/** Everything the panel shows, published by the main window whenever it changes. */
export interface PanelView {
  /** The open vault's name. Without one there is nothing to start. */
  vault?: string;
  /** The main window's today, `YYYY-MM-DD`. */
  day: string;
  /** Today has its note. */
  note: boolean;
  tasks: PanelTask[];
  /** Minutes today's note logs. */
  logged: number;
  session?: PanelSession;
  rest?: Rest;
  prefs: TimerPrefs;
  /** Something to say: why the timer didn't start, or time that isn't in its note. */
  warning?: string;
}

/** The round is on this one of the note's tasks: by focus-id when both have one, else by words and category. */
export function isSessionTask(task: TimerTask, path: string, line: string, label: string, category?: string): boolean {
  if (task.path !== path) return false;
  const id = focusIdOf(line);
  if (task.focusId && id) return task.focusId === id;
  return task.label === label && (task.category ?? '').toLowerCase() === (category ?? '').toLowerCase();
}

export interface PanelInput {
  vault?: string;
  today: Date;
  /** Today's note, its text and what it holds, when it has one. */
  path?: string;
  text?: string;
  day?: Day;
  timer: TimerState;
  /** Stretches of focus that couldn't be written into their notes. */
  unwritten: number;
  /** Why the timer couldn't save itself, or start, the last time it couldn't. */
  problem?: string;
}

export function panelView({ vault, today, path, text, day, timer, unwritten, problem }: PanelInput): PanelView {
  const lines = text?.split('\n').map((line) => line.replace(/\r$/, '')) ?? [];
  const { session, rest, prefs } = timer;
  const tasks = day && path !== undefined && vault
    ? day.tasks.map((task): PanelTask => {
        const line = lines[task.line] ?? '';
        const category = task.category?.name;
        return {
          line: task.line,
          text: line,
          label: task.label,
          ...(category ? { category } : {}),
          minutes: task.minutes ?? 0,
          done: task.done,
          current: Boolean(session && isSessionTask(session.task, path, line, task.label, category)),
        };
      })
    : [];
  const stray = unwritten ? `${unwritten === 1 ? 'A stretch of focus isn’t' : `${unwritten} stretches of focus aren’t`} in the note yet. Open Epizen to see why.` : undefined;
  const warning = problem ?? stray;
  return {
    ...(vault ? { vault } : {}),
    day: dayKey(today),
    note: path !== undefined,
    tasks,
    logged: vault ? (day?.totals.logged ?? 0) : 0,
    ...(session ? {
      session: {
        label: session.task.label,
        ...(session.task.category ? { category: session.task.category } : {}),
        mode: session.mode,
        ...(session.planned ? { planned: session.planned } : {}),
        accumulated: session.accumulated,
        segmentStartedAt: session.segmentStartedAt,
        ...(session.pausedAt === undefined ? {} : { pausedAt: session.pausedAt }),
        stretchStartedAt: session.stretchStartedAt,
      },
    } : {}),
    ...(rest ? { rest } : {}),
    prefs,
    ...(warning ? { warning } : {}),
  };
}

/** Where now is in the day, by the clock: 0 at midnight, 1 at the next. */
export const dayShare = (now: Date) => (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86_400;

/** The day's timeline's marks: every three hours, the six-hourly ones longer and labelled. */
export const TIMELINE_MARKS = Array.from({ length: 9 }, (_, i) => ({ hour: i * 3, share: (i * 3) / 24, major: i % 2 === 0 }));

/** What the panel shows at `now`, from what was published: the parts that move with the clock. */
export interface PanelNow {
  /** `Wednesday, 28 October`. */
  date: string;
  /** `14:05`. */
  clock: string;
  /** How much of the day has passed, 0 to 1, and as a whole percentage. */
  share: number;
  percent: number;
  /** Minutes focused today, `2h 5m`: what the note logs and the stretch under way. */
  focused: string;
  round?: {
    /** Time left in a pomodoro, so far on the stopwatch. */
    time: string;
    state: 'left' | 'focused' | 'paused';
    /** `Pomodoro · 25 min`, or `Stopwatch`. */
    kind: string;
    /** How far through its round a pomodoro is, 0 to 1. */
    progress?: number;
  };
  rest?: { time: string; progress: number };
}

export function panelNow(view: PanelView, now: number): PanelNow {
  const at = new Date(now);
  const share = dayShare(at);
  const { session, rest } = view;
  // The stretch under way isn't in the note until it ends; it counts today if it began today.
  const open = session && dayKey(new Date(session.stretchStartedAt)) === view.day ? Math.max(0, Math.floor(((session.pausedAt ?? now) - session.stretchStartedAt) / 60_000)) : 0;
  const round = session && {
    time: formatSeconds(shownSeconds(session, now)),
    state: session.pausedAt !== undefined ? ('paused' as const) : session.planned ? ('left' as const) : ('focused' as const),
    kind: session.planned ? `Pomodoro · ${Math.round(session.planned / 60)} min` : 'Stopwatch',
    ...(session.planned ? { progress: Math.min(1, elapsed(session, now) / 1000 / session.planned) } : {}),
  };
  return {
    date: formatDate(dayOfKey(view.day), 'dddd, D MMMM'),
    clock: formatDate(at, 'HH:mm'),
    share,
    percent: Math.floor(share * 100),
    focused: formatMinutes(view.logged + open),
    ...(round ? { round } : {}),
    ...(!session && rest ? { rest: { time: formatSeconds(restLeft(rest, now)), progress: Math.min(1, 1 - restLeft(rest, now) / rest.seconds) } } : {}),
  };
}

/** A command from one of the panel's buttons, for the main window's timer to apply. */
export type TrayCommand =
  | { kind: 'start'; task: { line: number; text: string; label: string; category?: string }; mode: TimerMode; minutes?: number }
  | { kind: 'pause' | 'resume' | 'stop' | 'rest' | 'skip-rest' };

/** How a round runs: 25 or 42 minutes, Custom, or Live (the stopwatch). */
export type RoundHow = { mode: 'pomodoro'; minutes: number } | { mode: 'stopwatch' };

export const startCommand = (task: PanelTask, how: RoundHow): TrayCommand => ({
  kind: 'start',
  task: { line: task.line, text: task.text, label: task.label, ...(task.category ? { category: task.category } : {}) },
  ...how,
});

/** Custom's minutes as typed, or nothing when they aren't a round the timer takes. */
export function customMinutes(text: string): number | undefined {
  if (!/^\s*\d+\s*$/.test(text)) return undefined;
  const minutes = Number(text);
  return minutes >= CUSTOM_MINUTES.min && minutes <= CUSTOM_MINUTES.max ? minutes : undefined;
}

const SIMPLE = new Set(['pause', 'resume', 'stop', 'rest', 'skip-rest']);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A command as it arrives from the panel, checked; anything else is left alone. */
export function readCommand(value: unknown): TrayCommand | undefined {
  if (!isRecord(value) || typeof value.kind !== 'string') return undefined;
  if (SIMPLE.has(value.kind)) return { kind: value.kind as 'pause' | 'resume' | 'stop' | 'rest' | 'skip-rest' };
  if (value.kind !== 'start' || !isRecord(value.task)) return undefined;
  const { line, text, label, category } = value.task;
  const mode = value.mode === 'pomodoro' || value.mode === 'stopwatch' ? value.mode : undefined;
  if (typeof line !== 'number' || !Number.isInteger(line) || line < 0 || typeof text !== 'string' || typeof label !== 'string' || !mode) return undefined;
  if (category !== undefined && typeof category !== 'string') return undefined;
  const minutes = typeof value.minutes === 'number' && Number.isFinite(value.minutes) ? value.minutes : undefined;
  if (mode === 'pomodoro' && minutes === undefined) return undefined;
  return { kind: 'start', task: { line, text, label, ...(category ? { category } : {}) }, mode, ...(mode === 'pomodoro' ? { minutes } : {}) };
}
