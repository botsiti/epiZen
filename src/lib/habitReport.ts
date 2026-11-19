import { formatDate } from './dates';
import { discoveredHabits, habitHistory, habitStats, type Habit, type HabitProblem } from './habits';
import type { DayEntry } from './rollup';

// Treat note titles and user-entered data as literal text in generated Markdown.
const literal = (value: string) => value.replace(/[\\`*_{}[\]()#+.!|<>~-]/g, '\\$&').replace(/[\r\n]+/g, ' ');
const dateKey = (date: Date) => formatDate(date, 'YYYY-MM-DD');
const code = (text: string) => {
  const runs = text.match(/`+/g) ?? [];
  const fence = '`'.repeat(runs.reduce((length, run) => Math.max(length, run.length + 1), 3));
  return fence + 'markdown\n' + text + (text.endsWith('\n') ? '' : '\n') + fence;
};

/** A portable report, plus original definitions and the recorded habit rows only. */
export function habitReport(habits: Habit[], days: DayEntry[], problems: HabitProblem[], today: Date): string {
  const all = [...habits, ...discoveredHabits(days, habits)];
  const lines = ['# Habit journal', '', `Streaks and totals through ${formatDate(today, 'D MMMM YYYY')}.`, '',
    '| Habit | Current streak | Best streak | Completions |', '| --- | ---: | ---: | ---: |'];
  for (const habit of all) {
    const stats = habitStats(habitHistory(habit, days, today), today);
    lines.push(`| ${literal(habit.name)} | ${stats.current} days | ${stats.best} days | ${stats.completed} |`);
  }
  lines.push('', '## Routines', '');
  for (const habit of all) {
    const goal = habit.tracking;
    const type = goal?.kind === 'goal' ? `Daily goal of ${goal.target} ${literal(goal.unit)}`
      : goal?.kind === 'measure' ? `Daily measurement in ${literal(goal.unit)}` : 'Daily check-in';
    lines.push(`### ${literal(habit.name)}`, '', type, '');
    for (const period of habit.periods) lines.push(`- From ${period.from}${period.until ? ` until ${period.until} (exclusive)` : ' onward'}${period.reset ? ' · streak restarted' : ''}`);
    lines.push('');
  }
  lines.push('## Daily records', '');
  const entries = days.filter((entry) => entry.day?.habits.length).sort((a, b) => b.date.getTime() - a.date.getTime());
  if (!entries.length) lines.push('No check-ins recorded.', '');
  for (const { date, day } of entries) {
    lines.push(`### ${dateKey(date)}`, '');
    for (const record of day!.habits) lines.push(`- [${record.done ? 'x' : ' '}] ${literal(record.label)}${record.habitValue !== undefined ? ` · ${record.habitValue}` : ''}`);
    lines.push('');
  }
  lines.push('## Source archive', '', 'Original habit definitions and recorded task fields for reuse in Markdown.', '');
  const definitions = new Map<string, string>();
  for (const habit of habits) if (habit.path && habit.source !== undefined) definitions.set(habit.path, habit.source);
  for (const problem of problems) if (problem.source !== undefined) definitions.set(problem.path, problem.source);
  for (const [path, source] of definitions) lines.push(`### ${literal(path)}`, '', code(source), '');
  if (problems.length) {
    lines.push('### Definitions needing attention', '');
    for (const { path, message } of problems) lines.push(`- ${literal(path)} — ${literal(message)}`);
    lines.push('');
  }
  for (const { date, path, day } of entries) {
    lines.push(`### ${literal(path ?? dateKey(date))}`, '', code(['> [!habits]', ...day!.habits.map((r) => `> - [${r.done ? 'x' : ' '}] ${r.text}`)].join('\n')), '');
  }
  return lines.join('\n');
}
