import { useCallback, useEffect, useState } from 'react';
import {
  calendarAccess,
  calendarEvents,
  createEvent,
  deleteEvent,
  listCalendars,
  openCalendarSettings,
  requestCalendarAccess,
  updateEvent,
  type CalendarAccess,
  type CalendarEvent,
  type CalendarInfo,
  type NewCalendarEvent,
  type Occurrence,
} from '../../lib/api';
import { parseTaskUrl, planWindow, sameLink, type TaskLink } from '../../lib/plans';
import { reason } from './useNoteWriter';

export interface PlansApi {
  /** `undefined` until Epizen knows. */
  access?: CalendarAccess;
  calendars: CalendarInfo[];
  /** The events of the days on show. */
  events: CalendarEvent[];
  /** Why the last read or change of Calendar didn't happen, if it didn't. */
  error?: string;
  /** Shows the system's prompt (the first time), or System Settings once it was refused. */
  ask: () => void;
  create: (event: NewCalendarEvent) => Promise<void>;
  move: (at: Occurrence, start: number, end: number) => Promise<void>;
  remove: (at: Occurrence) => Promise<void>;
}

/** How often the events on show are read again while the window is open: Calendar changes them too. */
const REFRESH_MS = 60_000;

/**
 * Apple Calendar's events between `from` and `to`, read again when the range changes, when the
 * window comes back to the front, every minute, and after each change made here.
 */
export function usePlans(from: number, to: number): PlansApi {
  const [access, setAccess] = useState<CalendarAccess>();
  const [calendars, setCalendars] = useState<CalendarInfo[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [error, setError] = useState<string>();
  const [reads, setReads] = useState(0);
  const reload = useCallback(() => setReads((n) => n + 1), []);

  useEffect(() => {
    // Only the latest read lands: one for an earlier range that answers late is dropped.
    let current = true;
    calendarAccess()
      .then(async (now) => {
        if (!current) return;
        setAccess(now);
        if (now !== 'allowed') return;
        const [all, found] = await Promise.all([listCalendars(), calendarEvents(from, to)]);
        if (!current) return;
        setCalendars(all);
        setEvents(found);
        setError(undefined);
      })
      .catch((err: unknown) => {
        if (current) setError(`Calendar couldn’t be read: ${reason(err)}`);
      });
    return () => {
      current = false;
    };
  }, [from, to, reads]);

  useEffect(() => {
    window.addEventListener('focus', reload);
    const timer = setInterval(reload, REFRESH_MS);
    return () => {
      window.removeEventListener('focus', reload);
      clearInterval(timer);
    };
  }, [reload]);

  // A change shows at once (what Calendar answered), then everything on show is read again.
  const change = useCallback(
    async (work: () => Promise<(list: CalendarEvent[]) => CalendarEvent[]>, failed: string) => {
      try {
        const apply = await work();
        setEvents(apply);
        setError(undefined);
      } catch (err) {
        setError(`${failed}: ${reason(err)}`);
      }
      reload();
    },
    [reload],
  );
  const same = (at: Occurrence) => (event: CalendarEvent) => event.id === at.id && event.start === at.start;

  return {
    access,
    calendars,
    events,
    error,
    ask: () => {
      if (access === 'denied') void openCalendarSettings();
      else void requestCalendarAccess().then(reload, (err: unknown) => setError(`Calendar couldn’t be asked: ${reason(err)}`));
    },
    create: (event) =>
      change(async () => {
        const made = await createEvent(event);
        return (list) => [...list, made];
      }, 'The plan wasn’t added to Calendar'),
    move: (at, start, end) =>
      change(async () => {
        const moved = await updateEvent(at, { start, end });
        return (list) => list.map((event) => (same(at)(event) ? moved : event));
      }, 'The plan wasn’t moved in Calendar'),
    remove: (at) =>
      change(async () => {
        await deleteEvent(at);
        return (list) => list.filter((event) => !same(at)(event));
      }, 'The plan wasn’t deleted from Calendar'),
  };
}

/** A task's events, wherever Calendar has them now. None when Epizen can't use Calendar. */
async function eventsOf(link: TaskLink, day: Date): Promise<CalendarEvent[]> {
  if ((await calendarAccess()) !== 'allowed') return [];
  const { from, to } = planWindow(day);
  return (await calendarEvents(from, to)).filter((event) => sameLink(parseTaskUrl(event.url), link));
}

/** An edited task's events take its new words (their notes) and category (their title). */
export async function renamePlans(link: TaskLink, day: Date, text: { title: string; notes: string }): Promise<void> {
  for (const event of await eventsOf(link, day)) if (event.title !== text.title || event.notes !== text.notes) await updateEvent(event, text);
}

/** A deleted task's events go from Calendar with it. */
export async function deletePlans(link: TaskLink, day: Date): Promise<void> {
  for (const event of await eventsOf(link, day)) await deleteEvent(event);
}
