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
