import type { DayEntry } from '../../lib/rollup';
import type { DayTaskRef } from './types';

/** Keep the source line beside the task so later edits can check what the person saw. */
export function taskRefs(entry: DayEntry, source?: string): DayTaskRef[] {
  if (!entry.day || source === undefined) return [];
  const lines = source.split(/\r?\n/);
  return entry.day.tasks.map((task) => ({ task, ref: { line: task.line, text: lines[task.line] ?? '' } }));
}
