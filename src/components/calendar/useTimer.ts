import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  endRest,
  initialTimer,
  pause,
  readTimer,
  restore,
  resume,
  setPrefs,
  setRest,
  settle,
  start,
  startRest,
  stop,
  tick,
  type PendingBlock,
  type TimerMode,
  type TimerPrefs,
  type TimerState,
  type TimerTask,
} from '../../lib/timer';
import { reason } from './useNoteWriter';

export interface TimerDeps {
  /** Saves the timer to the app's settings. */
  save: (state: TimerState) => Promise<unknown>;
  /** Writes a finished stretch into its daily note. */
  write: (block: PendingBlock) => Promise<void>;
  chime: (kind: 'focus' | 'rest') => void;
}

export interface TimerView {
  state: TimerState;
  /** Why a pending block couldn't be written, by its id. */
  failures: ReadonlyMap<string, string>;
  /** Why the timer couldn't save itself, the last time it couldn't. */
  saveError?: string;
}

export interface TimerApi extends TimerView {
  start: (task: TimerTask, mode: TimerMode, minutes: number) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  startRest: (seconds?: number) => void;
  endRest: () => void;
  setRest: (seconds: number) => void;
  setPrefs: (prefs: Partial<Pick<TimerPrefs, 'mode' | 'minutes'>>) => void;
  /** Tries a block that couldn't be written again, or lets it go. */
  retry: (id: string) => void;
  discard: (id: string) => void;
}

/**
 * Runs the timer: applies its pure steps (src/lib/timer.ts), saves every new state to the
 * app's settings, and only once a state is saved writes the blocks it owes, so a block is on
 * record before it reaches a note. A block that can't be written stays owed, with the reason,
 * until it is tried again or let go.
 */
class TimerRuntime {
  private state = initialTimer();
  private view: TimerView = { state: this.state, failures: new Map() };
  private listeners = new Set<() => void>();
  private saving: Promise<void> = Promise.resolve();
  private writing = new Set<string>();
  private failures = new Map<string, string>();
  private saveError: string | undefined;
  private loaded = false;
  private deps: TimerDeps;

  constructor(deps: TimerDeps) {
    this.deps = deps;
  }

  setDeps(deps: TimerDeps) {
    this.deps = deps;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  snapshot = () => this.view;

  private emit() {
    this.view = { state: this.state, failures: new Map(this.failures), saveError: this.saveError };
    for (const listener of this.listeners) listener();
  }

  /** Takes the timer from the settings once: a session that was running is paused at its last heartbeat. */
  load(stored: unknown) {
    if (this.loaded) return;
    this.loaded = true;
    this.state = restore(readTimer(stored), Date.now());
    this.emit();
    // Saved even when nothing changed: the save writes the blocks owed from before the app closed.
    this.save(this.state);
  }

  apply(change: (state: TimerState, now: number) => TimerState) {
    if (this.loaded) this.set(change(this.state, Date.now()));
  }

  tick() {
    if (!this.loaded) return;
    const { state, chime } = tick(this.state, Date.now());
    if (chime) this.deps.chime(chime);
    this.set(state);
  }

  private set(next: TimerState) {
    if (next === this.state) return;
    this.state = next;
    this.emit();
    this.save(next);
  }

  private save(state: TimerState) {
    this.saving = this.saving
      .then(() => this.deps.save(state))
      .then(
        () => {
          if (this.saveError) {
            this.saveError = undefined;
            this.emit();
          }
          this.flush(state);
        },
        (err: unknown) => {
          this.saveError = reason(err);
          this.emit();
        },
      );
  }

  /** Writes the blocks that this saved state owes and that are still owed, one attempt each. */
  private flush(saved: TimerState) {
    for (const block of saved.pending) {
      if (this.writing.has(block.id) || this.failures.has(block.id)) continue;
      if (!this.state.pending.some((pending) => pending.id === block.id)) continue;
      this.writing.add(block.id);
      this.deps.write(block).then(
        () => {
          this.writing.delete(block.id);
          this.apply((state) => settle(state, block.id));
        },
        (err: unknown) => {
          this.writing.delete(block.id);
          this.failures.set(block.id, reason(err));
          this.emit();
        },
      );
    }
  }

  retry(id: string) {
    if (!this.failures.delete(id)) return;
    this.emit();
    this.flush(this.state);
  }

  discard(id: string) {
    this.failures.delete(id);
    this.emit();
    this.apply((state) => settle(state, id));
  }
}

/**
 * The focus timer for the whole app. `stored` is the timer as the settings held it at startup,
 * read once `ready`.
 */
export function useTimer(deps: TimerDeps, stored: unknown, ready: boolean): TimerApi {
  const [runtime] = useState(() => new TimerRuntime(deps));
  useEffect(() => runtime.setDeps(deps), [runtime, deps]);
  useEffect(() => {
    if (ready) runtime.load(stored);
  }, [runtime, ready, stored]);
  const view = useSyncExternalStore(runtime.subscribe, runtime.snapshot);
  const running = Boolean(view.state.session ?? view.state.rest);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => runtime.tick(), 1000);
    return () => clearInterval(timer);
  }, [runtime, running]);

  return useMemo(
    (): TimerApi => ({
      ...view,
      start: (task, mode, minutes) => runtime.apply((state, now) => start(state, now, { id: crypto.randomUUID(), task, mode, minutes })),
      pause: () => runtime.apply(pause),
      resume: () => runtime.apply(resume),
      stop: () => runtime.apply(stop),
      startRest: (seconds) => runtime.apply((state, now) => startRest(state, now, seconds)),
      endRest: () => runtime.apply(endRest),
      setRest: (seconds) => runtime.apply((state) => setRest(state, seconds)),
      setPrefs: (prefs) => runtime.apply((state) => setPrefs(state, prefs)),
      retry: (id) => runtime.retry(id),
      discard: (id) => runtime.discard(id),
    }),
    [runtime, view],
  );
}
