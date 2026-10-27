import type { DayTask } from '../../lib/day';
import type { LineRef } from '../../lib/timeblocks';

/** A task of a day as the calendar shows it, with the line it was read from. */
export interface DayTaskRef {
  task: DayTask;
  ref: LineRef;
}

/** A task picked for a new block or for the timer: one the day has, or a new one to add. */
export type TaskChoice =
  | { kind: 'task'; ref: LineRef; label: string; category?: string }
  | { kind: 'new'; category: string; words: string };

/**
 * A task edited or deleted from its menu, once the note holds the change: the timer, if it runs
 * on the task, and the task's plans in Calendar follow it.
 */
export type TaskChange =
  | { kind: 'edited'; path: string; date: Date; focusId?: string; before: { label: string; category?: string }; after: { label: string; category?: string } }
  | { kind: 'deleted'; path: string; date: Date; focusId?: string };
