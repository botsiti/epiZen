import { formatDate } from './dates';
import { parseDay } from './day';
import { collectHabits, habitMatches, type Habit } from './habits';

export function canDeleteHabit(habit: Habit, date: Date): boolean {
  const end = habit.periods.at(-1)?.until;
  return Boolean(habit.path && (!end || end > formatDate(date, 'YYYY-MM-DD')));
}

/** Remove only check-in lines. Names and aliases have meaning only in recognized daily notes. */
export function habitDeletionEdits(
  habit: Habit,
  notes: readonly { path: string; text: string }[],
  dailyPaths: ReadonlySet<string>,
) {
  const { habits } = collectHabits(new Map(notes.map(({ path, text }) => [path, text])));
  const current = habits.find(({ id }) => id === habit.id);
  if (!current || current.path !== habit.path || current.source !== habit.source) {
    throw new Error('This habit changed. Close the dialog and review it before deleting.');
  }

  return notes.flatMap(({ path, text }) => {
    if (path === habit.path || (!dailyPaths.has(path) && !text.includes(`[habit::${habit.id}]`))) return [];
    if (!/\[!habits\]/i.test(text)) return [];
    const masked = text
      .replace(/^(?:\uFEFF)?---\r?\n[\s\S]*?\r?\n---(?=\r?\n|$)/, blank)
      .replace(/<!--[\s\S]*?(?:-->|$)|%%[\s\S]*?(?:%%|$)/g, blank);
    const removed = new Set(parseDay(masked).habits.filter((record) => record.habitId
      ? record.habitId === habit.id
      : dailyPaths.has(path) && habitMatches(current, record)).map(({ line }) => line));
    if (!removed.size) return [];
    const original = text.split('\n');
    const visible = masked.split('\n');
    if ([...removed].some((line) => original[line] !== visible[line])) {
      throw new Error(`A check-in in ${path} contains a comment. Move the comment to its own line before deleting the habit.`);
    }
    const next = original.map((value, line) => removed.has(line) ? '' : value + (line < original.length - 1 ? '\n' : '')).join('');
    return [{ path, expected: text, text: next }];
  });
}

function blank(text: string): string {
  return text.replace(/[^\r\n]/g, ' ');
}
