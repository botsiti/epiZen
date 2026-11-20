import { useCallback, useEffect, useRef, useState } from 'react';
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
  refresh: () => void;
  create: (event: NewCalendarEvent) => Promise<void>;
  move: (at: Occurrence, start: number, end: number) => Promise<void>;
  edit: (at: Occurrence, fields: { title?: string; notes?: string }) => Promise<CalendarEvent>;
  remove: (at: Occurrence) => Promise<void>;
}

/** How often the events on show are read again while the window is open: Calendar changes them too. */
const REFRESH_MS = 60_000;
const same = (at: Occurrence) => (event: CalendarEvent) => event.id === at.id && event.start === at.start;

/**
 * Apple Calendar's events between `from` and `to`, read again when the range changes, when the
 * window comes back to the front, every minute, and after each change made here.
 */
export function usePlans(from: number, to: number): PlansApi {
  const [access, setAccess] = useState<CalendarAccess>();
  const [calendars, setCalendars] = useState<CalendarInfo[]>([]);
  const [snapshot, setSnapshot] = useState<{ from: number; to: number; events: CalendarEvent[] }>();
  const [error, setError] = useState<string>();
  const [reads, setReads] = useState(0);
  const revision = useRef(0);
  const reload = useCallback(() => {
    revision.current += 1;
    setReads(revision.current);
  }, []);

  useEffect(() => {
    // Only the latest read lands: one for an earlier range that answers late is dropped.
    let current = true;
    const readable = () => current && reads === revision.current;
    calendarAccess()
      .then(async (now) => {
        if (!readable()) return;
        setAccess(now);
        if (now !== 'allowed') {
          setSnapshot(undefined);
          return;
        }
        const [all, found] = await Promise.all([listCalendars(), calendarEvents(from, to)]);
        if (!readable()) return;
        setCalendars(all);
        setSnapshot({ from, to, events: found });
        setError(undefined);
      })
      .catch((err: unknown) => {
        if (readable()) setError(`Calendar couldn’t be read: ${reason(err)}`);
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

  const publish = useCallback((apply: (list: CalendarEvent[]) => CalendarEvent[]) => {
    setSnapshot((current) => current?.from === from && current.to === to
      ? { ...current, events: apply(current.events).filter((event) => event.start < to && event.end > from) }
      : current);
  }, [from, to]);

  // A change shows at once (what Calendar answered), then everything on show is read again.
  const change = useCallback(
    async (work: () => Promise<(list: CalendarEvent[]) => CalendarEvent[]>, failed: string) => {
      try {
        const apply = await work();
        publish(apply);
        setError(undefined);
      } catch (err) {
        setError(`${failed}: ${reason(err)}`);
      }
      reload();
    },
    [publish, reload],
  );
  return {
    access,
    calendars,
    events: snapshot?.from === from && snapshot.to === to ? snapshot.events : EMPTY_EVENTS,
    error,
    refresh: reload,
    ask: () => {
      if (access === 'denied') void openCalendarSettings();
      else void requestCalendarAccess().then(reload, (err: unknown) => setError(`Calendar couldn’t be asked: ${reason(err)}`));
    },
    create: (event) =>
      change(async () => {
        const made = await createEvent(event);
        return (list) => [...list.filter((event) => !same(made)(event)), made];
      }, 'The plan wasn’t added to Calendar'),
    move: (at, start, end) =>
      change(async () => {
        const moved = await updateEvent(at, { start, end });
        return (list) => list.map((event) => (same(at)(event) ? moved : event));
      }, 'The plan wasn’t moved in Calendar'),
    edit: async (at, fields) => {
      try {
        const edited = await updateEvent(at, fields);
        publish((list) => list.map((event) => same(at)(event) ? edited : event));
        return edited;
      } finally {
        reload();
      }
    },
    remove: (at) =>
      change(async () => {
        await deleteEvent(at);
        return (list) => list.filter((event) => !same(at)(event));
      }, 'The plan wasn’t deleted from Calendar'),
  };
}

const EMPTY_EVENTS: CalendarEvent[] = [];
