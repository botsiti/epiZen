import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { onTimerDue, onTrayCommand, onTrayShown, publishTray } from '../../lib/api';
import { today } from '../../lib/dates';
import { dayKey } from '../../lib/timer';
import { readCommand, trayClock, trayTooltip, type PanelView, type TrayCommand, type TrayDestination } from '../../lib/tray';
import { checkToday } from '../../lib/useToday';
import { primeChime } from '../calendar/chime';
import type { FocusHow } from '../calendar/FocusMenu';
import type { TaskChoice } from '../calendar/types';
import type { TimerApi } from '../calendar/useTimer';

export interface TrayHandlers {
  timer: Pick<TimerApi, 'pause' | 'resume' | 'stop' | 'startRest' | 'endRest'>;
  /** Starts the timer on a task, as the calendar's menu does. */
  onStart: (choice: TaskChoice, how: FocusHow) => void;
  onOpen: (destination: TrayDestination) => void;
  /** A start on another day's list: the panel was showing a day that has gone. */
  onStale: () => void;
}

/**
 * Applies one of the panel's commands to the main window's timer, exactly as the app's own
 * buttons do: a start goes through the same path as a right-click's "Start 25 min pomodoro".
 * Like every other start, it takes only today's tasks: one listed on another day is refused.
 */
export function runCommand(command: TrayCommand, { timer, onStart, onStale, onOpen }: TrayHandlers, now = today()) {
  switch (command.kind) {
    case 'start': {
      if (command.day !== dayKey(now)) return onStale();
      const { line, text, label, category } = command.task;
      primeChime();
      onStart({ kind: 'task', ref: { line, text }, label, ...(category ? { category } : {}) }, { mode: command.mode, ...(command.minutes === undefined ? {} : { minutes: command.minutes }) });
      return;
    }
    case 'open':
      return onOpen(command.destination);
    case 'pause':
      return timer.pause();
    case 'resume':
      return timer.resume();
    case 'stop':
      return timer.stop();
    case 'rest':
      return timer.startRest();
    case 'skip-rest':
      return timer.endRest();
  }
}

/**
 * The main window's side of the menu bar item: publishes the timer and today's tasks for the
 * item and its panel whenever they change, applies the panel's commands, ticks the timer as
 * soon as the item says a round or a rest has run out, and looks at the date again when the
 * panel opens, since a hidden window's own timers are held back.
 */
export function useTrayBridge(timer: TimerApi, view: PanelView, actions: Omit<TrayHandlers, 'timer'>, enabled = true) {
  const timerEnabled = view.options?.timer ?? enabled;
  const [attempt, setAttempt] = useState(0);
  const [problem, setProblem] = useState<string>();
  const published = useRef<string>(undefined);
  const retry = () => { setProblem(undefined); published.current = undefined; setAttempt((previous) => previous + 1); };
  const clock = useMemo(() => timerEnabled ? trayClock(timer.state) : { kind: 'idle' } as const, [timerEnabled, timer.state]);
  const tooltip = timerEnabled && enabled ? trayTooltip(timer.state) : 'Epizen';
  useEffect(() => {
    // An invisible menu can still wake a running focus timer. Only visible menus receive vault data.
    const status = { visible: enabled, clock, tooltip, panel: enabled ? view : null };
    const text = JSON.stringify(status);
    if (text === published.current) return;
    published.current = text;
    void publishTray(status).catch((error: unknown) => {
      if (published.current !== text) return;
      published.current = undefined;
      setProblem(`Could not update the menu bar. ${String(error)}`);
    });
  }, [clock, tooltip, view, enabled, attempt]);

  const handlers = useRef({ timer, ...actions, enabled, timerEnabled, scope: view.scope });
  useLayoutEffect(() => { handlers.current = { timer, ...actions, enabled, timerEnabled, scope: view.scope }; }, [timer, actions, enabled, timerEnabled, view.scope]);
  useEffect(() => {
    if (!timerEnabled) return;
    let live = true;
    const due = onTimerDue(() => { if (live && handlers.current.timerEnabled) handlers.current.timer.tick(); });
    void due.catch(() => { if (live) setProblem('The menu bar could not connect to the focus timer.'); });
    return () => { live = false; void due.then((unlisten) => unlisten(), () => undefined); };
  }, [timerEnabled, attempt]);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const commands = onTrayCommand((value) => {
      const current = handlers.current;
      if (current.scope && (!value || typeof value !== 'object' || !('scope' in value) || value.scope !== current.scope)) return;
      const command = readCommand(value);
      if (live && current.enabled && command && (command.kind === 'open' || current.timerEnabled)) runCommand(command, current);
    });
    const shown = onTrayShown(() => { if (live) checkToday(); });
    void Promise.all([commands, shown]).catch(() => { if (live) setProblem('The menu bar could not connect to workspace shortcuts.'); });
    return () => {
      live = false;
      void commands.then((unlisten) => unlisten(), () => undefined);
      void shown.then((unlisten) => unlisten(), () => undefined);
    };
  }, [enabled, attempt]);
  return { problem, retry };
}
