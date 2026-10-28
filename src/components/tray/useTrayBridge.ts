import { useEffect, useMemo, useRef } from 'react';
import { onTimerDue, onTrayCommand, onTrayShown, publishTray } from '../../lib/api';
import { today } from '../../lib/dates';
import { dayKey } from '../../lib/timer';
import { readCommand, trayClock, trayTooltip, type PanelView, type TrayCommand } from '../../lib/tray';
import { checkToday } from '../../lib/useToday';
import { primeChime } from '../calendar/chime';
import type { FocusHow } from '../calendar/FocusMenu';
import type { TaskChoice } from '../calendar/types';
import type { TimerApi } from '../calendar/useTimer';

export interface TrayHandlers {
  timer: Pick<TimerApi, 'pause' | 'resume' | 'stop' | 'startRest' | 'endRest'>;
  /** Starts the timer on a task, as the calendar's menu does. */
  onStart: (choice: TaskChoice, how: FocusHow) => void;
  /** A start on another day's list: the panel was showing a day that has gone. */
  onStale: () => void;
}

/**
 * Applies one of the panel's commands to the main window's timer, exactly as the app's own
 * buttons do: a start goes through the same path as a right-click's "Start 25 min pomodoro".
 * Like every other start, it takes only today's tasks: one listed on another day is refused.
 */
export function runCommand(command: TrayCommand, { timer, onStart, onStale }: TrayHandlers, now = today()) {
  switch (command.kind) {
    case 'start': {
      if (command.day !== dayKey(now)) return onStale();
      const { line, text, label, category } = command.task;
      primeChime();
      onStart({ kind: 'task', ref: { line, text }, label, ...(category ? { category } : {}) }, { mode: command.mode, ...(command.minutes === undefined ? {} : { minutes: command.minutes }) });
      return;
    }
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
export function useTrayBridge(timer: TimerApi, view: PanelView, onStart: TrayHandlers['onStart'], onStale: TrayHandlers['onStale']) {
  const clock = useMemo(() => trayClock(timer.state), [timer.state]);
  const tooltip = useMemo(() => trayTooltip(timer.state), [timer.state]);
  const published = useRef<string>(undefined);
  useEffect(() => {
    const status = { clock, tooltip, panel: view };
    const text = JSON.stringify(status);
    if (text === published.current) return;
    published.current = text;
    publishTray(status).catch(() => {
      // Tried again with the next change.
      published.current = undefined;
    });
  }, [clock, tooltip, view]);

  const handlers = useRef<TrayHandlers & { tick: () => void }>({ timer, onStart, onStale, tick: timer.tick });
  useEffect(() => {
    handlers.current = { timer, onStart, onStale, tick: timer.tick };
  }, [timer, onStart, onStale]);
  useEffect(() => {
    const commands = onTrayCommand((value) => {
      const command = readCommand(value);
      if (command) runCommand(command, handlers.current);
    });
    const due = onTimerDue(() => handlers.current.tick());
    // The panel opening: a window asleep and hidden over midnight may still think it yesterday.
    const shown = onTrayShown(checkToday);
    return () => {
      void commands.then((unlisten) => unlisten());
      void due.then((unlisten) => unlisten());
      void shown.then((unlisten) => unlisten());
    };
  }, []);
}
