import type { CalendarEvent, CalendarInfo } from './api';
import { addDays } from './dates';

// The calendar view is Apple Calendar: its events, as Calendar and Senioro show them. A task
// planned on it becomes an event written as Senioro writes one (the category as its title, the
// task's words as its notes, in the calendar the category belongs to), never a line in the note:
// the note keeps only the minutes spent. Epizen binds the event to its task by a link in its URL
// field, made of the vault, the task's note and its focus-id (Senioro's `<!-- focus-id: … -->`),
// so the binding lasts through a rename, a move in the note, and a move in Calendar.

export interface TaskLink {
  /** The vault's name, so a copy of a vault never claims another's events. */
  vault: string;
  /** The task's daily note, vault-relative. */
  note: string;
  /** The task's focus-id. */
  id: string;
}

const SCHEME = 'epizen://task';

export const taskUrl = ({ vault, note, id }: TaskLink) => `${SCHEME}?${new URLSearchParams({ vault, note, id }).toString()}`;

/** The task an event's URL links to, if it is one of Epizen's. */
export function parseTaskUrl(url: string | null | undefined): TaskLink | undefined {
  if (!url?.startsWith(`${SCHEME}?`)) return undefined;
  const params = new URLSearchParams(url.slice(SCHEME.length + 1));
  const [vault, note, id] = ['vault', 'note', 'id'].map((key) => params.get(key));
  return vault && note && id ? { vault, note, id } : undefined;
}

export const sameLink = (a: TaskLink | undefined, b: TaskLink) => a?.vault === b.vault && a.note === b.note && a.id === b.id;

// The calendar Senioro files each category under, by title (SenioroCore's CategoryMapping), so
// a plan from either app lands in the same place.
const SENIORO: Record<string, string> = {
  arthobby: 'arthobby',
  business: 'business',
  dog: 'dog',
  education: 'education',
  routine: 'routine',
  sportrest: 'sportrest',
  watchread: 'watchread',
  kaizen: 'business',
  sport: 'sportrest',
  travel: 'sportrest',
  meditation: 'sportrest',
  leisure: 'arthobby',
  english: 'arthobby',
  code: 'education',
  biology: 'education',
  math: 'education',
  book: 'watchread',
  cinema: 'watchread',
};

/**
 * The calendar a plan of that category goes to: the one last chosen for the category, else one
 * named like it, else the one Senioro files it under, else the system's default. Only calendars
 * that take changes.
 */
export function calendarFor(category: string | undefined, calendars: CalendarInfo[], chosen: Record<string, string>): CalendarInfo | undefined {
  const writable = calendars.filter((calendar) => calendar.writable);
  const name = category?.toLowerCase();
  const titled = (title: string | undefined) => (title ? writable.find((calendar) => calendar.title.toLowerCase() === title) : undefined);
  return (name ? writable.find((calendar) => calendar.id === chosen[name]) : undefined) ?? titled(name) ?? titled(name && SENIORO[name]) ?? writable.find((calendar) => calendar.default) ?? writable[0];
}

/** A moment: that day at that minute, in local time (a day with a clock change included). */
export const at = (day: Date, minute: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minute).getTime();

/** An event as one day's column shows it: its part of that day, in minutes since midnight. */
export interface PlanBlock {
  /** The occurrence: an event's id, and its start. */
  key: string;
  start: number;
  end: number;
  event: CalendarEvent;
  link?: TaskLink;
  /** It began before this day or runs on after it, so the column holds only part of it. */
  cut: boolean;
}

const minuteOf = (time: number) => {
  const date = new Date(time);
  return date.getHours() * 60 + date.getMinutes();
};

/** The timed events on a day, cut to it. All-day events take no time on the grid. */
export function plansOn(events: CalendarEvent[], day: Date): PlanBlock[] {
  const from = at(day, 0);
  const to = at(addDays(day, 1), 0);
  return events
    .filter((event) => !event.allDay && event.start < to && event.end > from)
    .map((event) => {
      const start = event.start <= from ? 0 : minuteOf(event.start);
      const end = event.end >= to ? 24 * 60 : minuteOf(event.end);
      return { key: `${event.id}@${event.start}`, start, end: Math.max(end, start + 1), event, link: parseTaskUrl(event.url), cut: event.start < from || event.end > to };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);
}

/** The all-day events on a day, for the row above its hours. */
export function allDayOn(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const from = at(day, 0);
  const to = at(addDays(day, 1), 0);
  return events.filter((event) => event.allDay && event.start < to && event.end > from);
}

/** What a plan of a task is called in Calendar, as Senioro names it: its category, with the task's words in the notes. */
export const planText = (category: string | undefined, label: string) => ({ title: category?.toLowerCase() || label, notes: label });

/** Where to look for a task's events: Calendar may have moved them, so a month either side of its day. */
export const planWindow = (day: Date) => ({ from: at(addDays(day, -30), 0), to: at(addDays(day, 31), 0) });
