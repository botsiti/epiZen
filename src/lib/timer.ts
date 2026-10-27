import { formatDate } from './dates';
import { LAST_MINUTE } from './timeblocks';

// The focus timer, as Senioro runs it (AppController's start, pause, resume, commit and rest),
// as pure functions over (state, now). Nothing here writes a note: a stretch of focus that is
// over becomes a pending block in the state, which is saved to the app's settings before the
// app writes it to the note and taken out after. A crash in between replays the same block on
// the next start, and writing the same range twice adds nothing (`addBlock` skips it).

export type TimerMode = 'stopwatch' | 'pomodoro';

/** Focus rounds, in minutes; Custom takes 1 to 240. */
export const POMODORO_PRESETS = [25, 42] as const;
export const CUSTOM_MINUTES = { min: 1, max: 240 } as const;
/** Rests, in seconds: 3:00, 6:07 (Senioro's default), 10:00 and 15:00. */
export const REST_PRESETS = [180, 367, 600, 900] as const;
export const DEFAULT_REST = 367;
/** A pause shorter than this is a micro-pause: resuming continues the same block. */
export const MICRO_PAUSE_SECONDS = 60;
/** How often a running session is saved, so a crash or a quit loses at most this much. */
export const HEARTBEAT_SECONDS = 30;

/** The task a session logs time on, as it read when the session started. */
export interface TimerTask {
  /** The daily note's vault path. */
  path: string;
  /** The note's day, `YYYY-MM-DD`. */
  day: string;
  line: number;
  label: string;
  category?: string;
  focusId?: string;
}

/** Times are milliseconds since the epoch; lengths are milliseconds unless named otherwise. */
export interface Session {
  id: string;
  task: TimerTask;
  mode: TimerMode;
  /** A pomodoro's length, in seconds. */
  planned?: number;
  startedAt: number;
  /** Where the open stretch of focus began: since the start, or since the last real break. */
  stretchStartedAt: number;
  /** When counting last began, at the start or a resume. */
  segmentStartedAt: number;
  /** Focus counted before `segmentStartedAt`. */
  accumulated: number;
  pausedAt?: number;
  /** The last moment the app was known to be running this session. */
  heartbeat: number;
}

export interface Rest {
  startedAt: number;
  /** In seconds. */
  seconds: number;
}

/** A finished stretch of focus that the note doesn't hold yet: minutes since midnight of `day`. */
export interface PendingBlock {
  id: string;
  task: TimerTask;
  /** The stretch's own day, `YYYY-MM-DD`; after midnight it is no longer the task's. */
  day: string;
  start: number;
  end: number;
}

export interface TimerPrefs {
  mode: TimerMode;
  /** The focus round last chosen, in minutes. */
  minutes: number;
  /** The rest after a round, in seconds. */
  rest: number;
}

export interface TimerState {
  session?: Session;
  rest?: Rest;
  pending: PendingBlock[];
  prefs: TimerPrefs;
}

export const initialTimer = (): TimerState => ({ pending: [], prefs: { mode: 'pomodoro', minutes: 25, rest: DEFAULT_REST } });

export const dayKey = (date: Date) => formatDate(date, 'YYYY-MM-DD');
const clampMinutes = (minutes: number) => Math.min(CUSTOM_MINUTES.max, Math.max(CUSTOM_MINUTES.min, Math.round(minutes) || CUSTOM_MINUTES.min));
const clampRest = (seconds: number) => Math.min(2 * 60 * 60, Math.max(10, Math.round(seconds) || DEFAULT_REST));

/** Focus counted so far, in milliseconds: pauses don't count. */
export const elapsed = (session: Session, now: number) =>
  session.accumulated + (session.pausedAt === undefined ? Math.max(0, now - session.segmentStartedAt) : 0);

/** What the dial shows, in whole seconds: time left in a pomodoro, time so far on the stopwatch. */
export function shownSeconds(session: Session, now: number): number {
  const seconds = Math.floor(elapsed(session, now) / 1000);
  return session.planned ? Math.max(0, session.planned - seconds) : seconds;
}

export const restLeft = (rest: Rest, now: number) => Math.max(0, Math.ceil((rest.startedAt + rest.seconds * 1000 - now) / 1000));

/** 125 → "2:05", 3725 → "1:02:05". */
export function formatSeconds(total: number): string {
  const seconds = Math.max(0, Math.floor(total));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/**
 * The wall-clock stretch from `start` to `end` as minutes since midnight of the start's day.
 * Past midnight it stops at 23:59 of that day, and it never holds more minutes than really
 * passed. `undefined` when that is under a minute (SenioroCore's FocusBlockMath.block).
 */
export function blockBetween(start: number, end: number): { day: string; start: number; end: number } | undefined {
  const from = new Date(start);
  const to = new Date(end);
  const first = from.getHours() * 60 + from.getMinutes();
  const sameDay = dayKey(from) === dayKey(to);
  const last = sameDay ? to.getHours() * 60 + to.getMinutes() : end > start ? LAST_MINUTE : first;
  const cut = Math.min(last, first + Math.max(0, Math.floor((end - start) / 60_000)));
  return cut - first >= 1 ? { day: dayKey(from), start: first, end: cut } : undefined;
}

/**
 * Where a pomodoro's stretch really ended: at the moment its round was reached, when the app
 * only noticed later (the Mac slept, the app was closed). The stopwatch ends where it ends.
 */
function cappedEnd(session: Session, end: number): number {
  if (session.mode !== 'pomodoro' || !session.planned) return end;
  const over = elapsed(session, end) - session.planned * 1000;
  return over > 0 ? end - over : end;
}

/** The open stretch, from its start to `end`, as a pending block, unless it is under a minute. */
function seal(state: TimerState, session: Session, end: number): TimerState {
  const block = blockBetween(session.stretchStartedAt, cappedEnd(session, end));
  if (!block) return state;
  const id = `${session.id}@${block.day}T${block.start}-${block.end}`;
  if (state.pending.some((pending) => pending.id === id)) return state;
  return { ...state, pending: [...state.pending, { id, task: session.task, ...block }] };
}

/** The live stretch for the calendar: from its start to now (or the pause), on its own day, even under a minute. */
export function openStretch(session: Session, now: number): { day: string; start: number; end: number } {
  const from = new Date(session.stretchStartedAt);
  const start = from.getHours() * 60 + from.getMinutes();
  const block = blockBetween(session.stretchStartedAt, cappedEnd(session, session.pausedAt ?? now));
  return { day: dayKey(from), start, end: block?.end ?? start };
}

/**
 * Starts a session on the task. One session at a time: a session already running is stopped
 * first (its stretch written), and a rest ends.
 */
export function start(state: TimerState, now: number, next: { id: string; task: TimerTask; mode: TimerMode; minutes?: number }): TimerState {
  const settled = stop(state, now);
  const minutes = clampMinutes(next.minutes ?? settled.prefs.minutes);
  const session: Session = {
    id: next.id,
    task: next.task,
    mode: next.mode,
    planned: next.mode === 'pomodoro' ? minutes * 60 : undefined,
    startedAt: now,
    stretchStartedAt: now,
    segmentStartedAt: now,
    accumulated: 0,
    heartbeat: now,
  };
  const prefs = { ...settled.prefs, mode: next.mode, minutes: next.mode === 'pomodoro' ? minutes : settled.prefs.minutes };
  return { ...settled, session, rest: undefined, prefs };
}

export function pause(state: TimerState, now: number): TimerState {
  const session = state.session;
  if (!session || session.pausedAt !== undefined) return state;
  return { ...state, session: { ...session, accumulated: elapsed(session, now), pausedAt: now, heartbeat: now } };
}

/**
 * Counts again. Within a minute of the pause it is the same stretch, and so the same block;
 * after a real break the stretch up to the pause is written as a block and a new one begins.
 */
export function resume(state: TimerState, now: number): TimerState {
  const session = state.session;
  if (!session || session.pausedAt === undefined) return state;
  const real = now - session.pausedAt >= MICRO_PAUSE_SECONDS * 1000;
  const sealed = real ? seal(state, session, session.pausedAt) : state;
  const resumed: Session = { ...session, pausedAt: undefined, segmentStartedAt: now, stretchStartedAt: real ? now : session.stretchStartedAt, heartbeat: now };
  return { ...sealed, session: resumed };
}

/** Ends the session and writes its open stretch: up to now, or up to the pause. */
export function stop(state: TimerState, now: number): TimerState {
  const session = state.session;
  if (!session) return state;
  return { ...seal(state, session, session.pausedAt ?? now), session: undefined };
}

/**
 * What time alone changes, checked every second: a pomodoro that reached its round is written
 * and a rest begins (the next round never starts on its own), a rest that ran out ends, and a
 * running session takes a heartbeat every 30 seconds. `chime` says which of the first two
 * just happened. Nothing due gives back the same state.
 */
export function tick(state: TimerState, now: number): { state: TimerState; chime?: 'focus' | 'rest' } {
  let next = state;
  let chime: 'focus' | 'rest' | undefined;
  if (next.rest && now >= next.rest.startedAt + next.rest.seconds * 1000) {
    next = { ...next, rest: undefined };
    chime = 'rest';
  }
  const session = next.session;
  if (session?.mode === 'pomodoro' && session.planned && session.pausedAt === undefined && elapsed(session, now) >= session.planned * 1000) {
    next = { ...seal(next, session, now), session: undefined, rest: { startedAt: now, seconds: next.prefs.rest } };
    chime = 'focus';
  } else if (session && session.pausedAt === undefined && now - session.heartbeat >= HEARTBEAT_SECONDS * 1000) {
    next = heartbeat(next, now);
  }
  return { state: next, chime };
}

export const startRest = (state: TimerState, now: number, seconds = state.prefs.rest): TimerState =>
  state.session ? state : { ...state, rest: { startedAt: now, seconds: clampRest(seconds) }, prefs: { ...state.prefs, rest: clampRest(seconds) } };

export const endRest = (state: TimerState): TimerState => (state.rest ? { ...state, rest: undefined } : state);

/** Chooses the rest's length; a rest under way takes it at once. */
export function setRest(state: TimerState, seconds: number): TimerState {
  const rest = clampRest(seconds);
  return { ...state, prefs: { ...state.prefs, rest }, rest: state.rest ? { ...state.rest, seconds: rest } : undefined };
}

export const setPrefs = (state: TimerState, prefs: Partial<Pick<TimerPrefs, 'mode' | 'minutes'>>): TimerState => ({
  ...state,
  prefs: { ...state.prefs, ...prefs, minutes: clampMinutes(prefs.minutes ?? state.prefs.minutes) },
});

/** Marks a running session as alive now, for the next save. */
export function heartbeat(state: TimerState, now: number): TimerState {
  const session = state.session;
  return session && session.pausedAt === undefined ? { ...state, session: { ...session, heartbeat: now } } : state;
}

/**
 * The state as the app finds it on its next start. A session that was running when the app
 * went away is paused at its last heartbeat, so the time the app was closed never counts; a
 * rest that ran out is over. Pending blocks stay, to be written again.
 */
export function restore(state: TimerState, now: number): TimerState {
  let next = state;
  const session = next.session;
  if (session && session.pausedAt === undefined) {
    const cutoff = Math.min(now, Math.max(session.heartbeat, session.segmentStartedAt));
    next = { ...next, session: { ...session, accumulated: elapsed(session, cutoff), pausedAt: cutoff } };
  }
  if (next.rest && now >= next.rest.startedAt + next.rest.seconds * 1000) next = { ...next, rest: undefined };
  return next;
}

/** The block is in the note (or the user let it go): it is no longer owed. */
export const settle = (state: TimerState, id: string): TimerState => ({ ...state, pending: state.pending.filter((pending) => pending.id !== id) });

// Reading the state back from settings, which a person could have edited by hand.

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
const str = (value: unknown) => (typeof value === 'string' ? value : undefined);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function readTask(value: unknown): TimerTask | undefined {
  if (!isRecord(value)) return undefined;
  const path = str(value.path);
  const day = str(value.day);
  const line = num(value.line);
  const label = str(value.label);
  if (!path || !day || !DAY.test(day) || line === undefined || label === undefined) return undefined;
  return { path, day, line, label, category: str(value.category), focusId: str(value.focusId) };
}

function readSession(value: unknown): Session | undefined {
  if (!isRecord(value)) return undefined;
  const task = readTask(value.task);
  const id = str(value.id);
  const mode = value.mode === 'pomodoro' || value.mode === 'stopwatch' ? value.mode : undefined;
  const times = ['startedAt', 'stretchStartedAt', 'segmentStartedAt', 'accumulated', 'heartbeat'].map((key) => num(value[key]));
  const [startedAt, stretchStartedAt, segmentStartedAt, accumulated, beat] = times;
  if (!task || !id || !mode || startedAt === undefined || stretchStartedAt === undefined || segmentStartedAt === undefined || accumulated === undefined || beat === undefined) return undefined;
  const planned = num(value.planned);
  return { id, task, mode, planned: mode === 'pomodoro' && planned ? planned : undefined, startedAt, stretchStartedAt, segmentStartedAt, accumulated, pausedAt: num(value.pausedAt), heartbeat: beat };
}

function readPending(value: unknown): PendingBlock[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): PendingBlock[] => {
    if (!isRecord(item)) return [];
    const task = readTask(item.task);
    const id = str(item.id);
    const day = str(item.day);
    const start = num(item.start);
    const end = num(item.end);
    return task && id && day && DAY.test(day) && start !== undefined && end !== undefined ? [{ id, task, day, start, end }] : [];
  });
}

/** The timer as the settings hold it; anything unreadable is left out. */
export function readTimer(value: unknown): TimerState {
  const initial = initialTimer();
  if (!isRecord(value)) return initial;
  const prefs = isRecord(value.prefs) ? value.prefs : {};
  const restValue = isRecord(value.rest) ? value.rest : undefined;
  const restStart = num(restValue?.startedAt);
  const restSeconds = num(restValue?.seconds);
  return {
    session: readSession(value.session),
    rest: restStart !== undefined && restSeconds !== undefined ? { startedAt: restStart, seconds: restSeconds } : undefined,
    pending: readPending(value.pending),
    prefs: {
      mode: prefs.mode === 'stopwatch' ? 'stopwatch' : 'pomodoro',
      minutes: clampMinutes(num(prefs.minutes) ?? initial.prefs.minutes),
      rest: clampRest(num(prefs.rest) ?? initial.prefs.rest),
    },
  };
}
