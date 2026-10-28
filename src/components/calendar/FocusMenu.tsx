import { useLayoutEffect, useRef } from 'react';
import { POMODORO_PRESETS, type TimerMode } from '../../lib/timer';
import { primeChime } from './chime';
import { useEscape } from './useEscape';

/** How a focus round runs: counting up, or a pomodoro of so many minutes. */
export interface FocusHow {
  mode: TimerMode;
  minutes?: number;
}

interface Props {
  /** Where the right-click was, in the window. */
  at: { x: number; y: number };
  /** The task's words, at the top of the menu. */
  label: string;
  /**
   * Why focus can't start here, if it can't: the timer logs into today's note, so only today's
   * tasks take a round (as in Senioro).
   */
  noFocus?: string;
  /** A round is running: starting another saves it first. */
  running?: boolean;
  onFocus: (how: FocusHow) => void;
  onOpenDay?: () => void;
  /** Changes the task's words, category or minutes. */
  onEdit?: () => void;
  /** Deletes the block the menu was opened on. */
  onDelete?: () => void;
  /** Deletes the task, with what is written under it. */
  onDeleteTask?: () => void;
  onClose: () => void;
}

/** The menu a right-click on a task or a block opens: focus on it, open its day, edit or delete it. */
export function FocusMenu({ at, label, noFocus, running, onFocus, onOpenDay, onEdit, onDelete, onDeleteTask, onClose }: Props) {
  useEscape(onClose);
  const menu = useRef<HTMLDivElement>(null);
  // Kept inside the window, like a system menu.
  useLayoutEffect(() => {
    const element = menu.current;
    if (!element) return;
    const box = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(at.x, window.innerWidth - box.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(at.y, window.innerHeight - box.height - 8))}px`;
  }, [at]);
  const pick = (action: () => void) => () => {
    onClose();
    action();
  };
  const focus = (how: FocusHow) =>
    pick(() => {
      primeChime();
      onFocus(how);
    });
  return (
    <div className="focus-menu-backdrop" onMouseDown={onClose} onContextMenu={(event) => event.preventDefault()}>
      <div
        ref={menu}
        className="focus-menu glass"
        role="menu"
        aria-label={`Actions for ${label}`}
        style={{ left: at.x, top: at.y }}
        onMouseDown={(event) => event.stopPropagation()}
        data-testid="focus-menu"
      >
        <p className="focus-menu-label" title={label}>
          {label || 'untitled'}
        </p>
        {noFocus ? (
          <p className="focus-menu-note">{noFocus}</p>
        ) : (
          <>
            <button type="button" role="menuitem" onClick={focus({ mode: 'stopwatch' })} data-testid="focus-start">
              Start focus
              {running && <span className="faint"> · ends the running one</span>}
            </button>
            {POMODORO_PRESETS.map((minutes) => (
              <button key={minutes} type="button" role="menuitem" onClick={focus({ mode: 'pomodoro', minutes })} data-testid="focus-pomodoro" data-minutes={minutes}>
                Start {minutes} min pomodoro
              </button>
            ))}
          </>
        )}
        {(onOpenDay ?? onEdit ?? onDelete ?? onDeleteTask) && <hr />}
        {onOpenDay && (
          <button type="button" role="menuitem" onClick={pick(onOpenDay)}>
            Open the day
          </button>
        )}
        {onEdit && (
          <button type="button" role="menuitem" onClick={pick(onEdit)} data-testid="focus-menu-edit">
            Edit task…
          </button>
        )}
        {onDelete && (
          <button type="button" role="menuitem" onClick={pick(onDelete)} data-testid="focus-menu-delete">
            Delete block…
          </button>
        )}
        {onDeleteTask && (
          <button type="button" role="menuitem" onClick={pick(onDeleteTask)} data-testid="focus-menu-delete-task">
            Delete task…
          </button>
        )}
      </div>
    </div>
  );
}
