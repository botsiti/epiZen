import type { CalendarEvent } from '../api';
import { readDay } from '../datePicker';
import { addDays, formatDate } from '../dates';
import { addTask, setSummary } from '../edits';
import { monthlyFields, readMonthlySection, writeMonthlySection, type MonthlyField } from '../monthlyReview';
import { builtInPeriodicText, periodicCatalog, periodicPath, periodKey, type Period } from '../periodic';
import { addQuest, parseQuests, questLine, TIERS, type NewQuest } from '../quests';
import { WEEK_HEADINGS, writeSection, type WeekHeading } from '../sections';
import { hasTask, newTaskLabel } from '../timeblocks';
import { noteChange } from './changes';
import type { AssistantContext, ToolResult } from './types';

export function planningDate(value: string, now: Date): Date {
  const date = value === '' ? new Date(now.getFullYear(), now.getMonth(), now.getDate()) : readDay(value);
  if (!date) throw new Error('Choose a real local date in YYYY-MM-DD format.');
  return date;
}
export function planningPeriod(value: string): Period {
  if (value !== 'day' && value !== 'week' && value !== 'month') throw new Error('Choose day, week or month.');
  return value;
}
/** Use the same recognition and ambiguity rules as the calendar; never create a duplicate date. */
export function periodDestination(context: AssistantContext, period: Period, date: Date): string {
  const catalog = periodicCatalog(context.files, context.periodic, context.texts, context.recognition), key = periodKey(period, date);
  if (period === 'day' && formatDate(date, 'YYYY-MM-DD') === formatDate(context.now, 'YYYY-MM-DD')) {
    if (context.dailyAmbiguous) throw new Error('Several notes match today. Choose the daily note in Periodic notes settings first.');
    if (context.dailyPath) return context.dailyPath;
  }
  const path = catalog.index.get(key);
  if (!path && (catalog.matches.get(key)?.length ?? 0) > 1) throw new Error('Several notes match this period. Choose its note in Periodic notes settings first.');
  return path ?? periodicPath(period, date, context.periodic);
}
export function openPeriod(context: AssistantContext, path: string, period: Period, date: Date, before: string | null, startCbt = false): ToolResult {
  return {
    ...(before === null ? { change: noteChange(context, path, null, builtInPeriodicText(period, date), `Create ${formatDate(date, 'YYYY-MM-DD')} ${period} note`) } : { value: { path, opened: true } }),
    openPath: path, ...(startCbt ? { openCbt: true, startCbt: true } : {}),
  };
}
export function tasksChange(context: AssistantContext, path: string, date: Date, before: string | null, tasks: { category: string; title: string }[]): ToolResult {
  let after = before ?? builtInPeriodicText('day', date);
  for (const task of tasks) {
    const label = newTaskLabel(task.title);
    // Repeated requests don't duplicate an existing task or change its logged time/completion.
    if (!hasTask(after, { label, category: task.category })) after = addTask(after, task.category, task.title);
  }
  return { change: noteChange(context, path, before, after, `Add ${tasks.length === 1 ? 'a task' : `${tasks.length} tasks`} for ${formatDate(date, 'YYYY-MM-DD')}`), openPath: path };
}
export function questChange(context: AssistantContext, path: string, date: Date, before: string | null, quest: NewQuest): ToolResult {
  const text = before ?? builtInPeriodicText(quest.scope === 'weekly' ? 'week' : 'month', date);
  if (parseQuests(path, text).some((existing) => existing.title === quest.title.trim())) throw new Error('A quest with this title already exists. Open it to update its progress.');
  return { change: noteChange(context, path, before, addQuest(text, questLine(quest)), `Add ${quest.scope} quest: ${quest.title}`), openPath: path };
}
export function questTier(value: string): NewQuest['tier'] {
  if (!Object.hasOwn(TIERS, value)) throw new Error('Choose common, rare, epic or legendary.');
  return value as NewQuest['tier'];
}
export function sectionChange(context: AssistantContext, path: string, period: Period, date: Date, before: string | null, section: string, value: string): ToolResult {
  const text = before ?? builtInPeriodicText(period, date);
  let after: string;
  if (period === 'day' && section === 'summary') after = setSummary(text, value);
  else if (period === 'week' && WEEK_HEADINGS.includes(section as WeekHeading)) after = writeSection(text, section as WeekHeading, value);
  else if (period === 'month' && monthlyFields.includes(section as MonthlyField)) {
    const current = readMonthlySection(text, section as MonthlyField);
    if (current.problem) throw new Error(current.problem);
    after = writeMonthlySection(text, section as MonthlyField, value, current.snapshot);
  } else throw new Error('Use summary for a day; Plus, Minus or Next for a week; summary, decisions, spending, expenses or sphere:<life area> for a month.');
  return { change: noteChange(context, path, before, after, `Update ${section} in this ${period}`), openPath: path };
}

export type DayWindow = 'morning' | 'afternoon' | 'evening' | 'any';
export const DAY_WINDOWS: Record<DayWindow, [number, number]> = { morning: [9, 12], afternoon: [12, 18], evening: [18, 22], any: [9, 22] };
export function calendarRange(date: Date) { return { from: date.getTime(), to: addDays(date, 1).getTime() }; }
/** Find a free interval in local civil time. Planned time is never logged as completed work. */
export function calendarSlot(date: Date, now: Date, minutes: number, start: string, window: string, events: CalendarEvent[]): { start: number; end: number } {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 720) throw new Error('Choose a duration from 1 to 720 minutes.');
  if (!Object.hasOwn(DAY_WINDOWS, window)) throw new Error('Choose morning, afternoon, evening or any.');
  const [first, last] = DAY_WINDOWS[window as DayWindow];
  const at = (hour: number, minute = 0) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute).getTime();
  const duration = minutes * 60000;
  const free = (time: number) => !events.some((event) => event.start < time + duration && event.end > time);
  if (start) {
    const match = /^(\d{2}):(\d{2})$/.exec(start), hour = Number(match?.[1]), minute = Number(match?.[2]);
    if (!match || hour > 23 || minute > 59) throw new Error('Use a local start time in HH:mm format.');
    const time = at(hour, minute), resolved = new Date(time);
    if (resolved.getHours() !== hour || resolved.getMinutes() !== minute) throw new Error('This local time does not exist because the clocks change. Choose another time.');
    if (time + duration > calendarRange(date).to) throw new Error('Keep this block within the selected day.');
    if (!free(time)) throw new Error('That time overlaps an existing calendar event. Choose another time or explicitly request an overlapping event.');
    return { start: time, end: time + duration };
  }
  // Quarter-hour suggestions start after now, within the requested part of the day.
  const earliest = Math.max(at(first), now.getTime());
  for (let time = Math.ceil(earliest / 900000) * 900000; time + duration <= at(last); time += 900000) {
    if (free(time)) return { start: time, end: time + duration };
  }
  throw new Error(`There is no free ${minutes}-minute block in this ${window === 'any' ? 'day (09:00–22:00)' : window}. Ask for another time window or date.`);
}
