import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarAccess, CalendarEvent, CalendarInfo, NewCalendarEvent, Occurrence } from '../../lib/api';
import { addDays, sameDay, startOfWeek, today } from '../../lib/dates';
import { parseDay } from '../../lib/day';
import { at, taskUrl } from '../../lib/plans';
import type { DayEntry } from '../../lib/rollup';
import { dayKey, initialTimer } from '../../lib/timer';
import { CalendarView } from './CalendarView';
import type { TimerApi } from './useTimer';

// Apple Calendar, in memory: two calendars and the events made in the test.
const calendar = vi.hoisted(() => {
  const state: { access: CalendarAccess; calendars: CalendarInfo[]; events: CalendarEvent[] } = {
    access: 'allowed',
    calendars: [
      { id: 'home', title: 'Home', color: '#5b8def', writable: true, default: true },
      { id: 'sport', title: 'Sport', color: '#86d8ac', writable: true, default: false },
      { id: 'holidays', title: 'Holidays', color: '#e0707f', writable: false, default: false },
    ],
    events: [],
  };
  return state;
});

vi.mock(import('../../lib/api'), async (original) => ({
  ...(await original()),
  calendarAccess: () => Promise.resolve(calendar.access),
  requestCalendarAccess: () => Promise.resolve((calendar.access = 'allowed')),
  listCalendars: () => Promise.resolve(calendar.calendars),
  calendarEvents: (from: number, to: number) => Promise.resolve(calendar.events.filter((event) => event.start < to && event.end > from)),
  createEvent: (event: NewCalendarEvent) => {
    const made = { ...event, id: `e${calendar.events.length + 1}`, allDay: false, writable: true };
    calendar.events.push(made);
    return Promise.resolve(made);
  },
  updateEvent: (occurrence: Occurrence, change: { start?: number; end?: number }) => {
    const event = calendar.events.find((e) => e.id === occurrence.id);
    if (!event) return Promise.reject(new Error('gone'));
    Object.assign(event, change);
    return Promise.resolve({ ...event });
  },
  deleteEvent: (occurrence: Occurrence) => {
    calendar.events = calendar.events.filter((e) => e.id !== occurrence.id);
    return Promise.resolve();
  },
}));

beforeAll(() => {
  document.documentElement.dataset.motion = 'off';
});

beforeEach(() => {
  calendar.access = 'allowed';
  calendar.events = [];
});

// A day of last week, so it is never today.
const DAY = addDays(startOfWeek(today()), -5);
const TEXT = `### Tasks
- [ ] #daily/code — refactor the settings screen [minutes::58]
    - 09:26–10:24
- [x] #daily/sport — gym [minutes::30]
    - 12:30–13:00
`;
const dayOf = (date: Date): DayEntry => (sameDay(date, DAY) ? { date, path: 'day.md', day: parseDay(TEXT) } : { date });
const textOf = (path: string) => (path === 'day.md' ? TEXT : undefined);
const timer = (): TimerApi => ({
  state: initialTimer(),
  failures: new Map(),
  start: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  stop: vi.fn(),
  startRest: vi.fn(),
  endRest: vi.fn(),
  setRest: vi.fn(),
  setPrefs: vi.fn(),
  retry: vi.fn(),
  retryAll: vi.fn(),
  discard: vi.fn(),
  retask: vi.fn(),
  tick: vi.fn(),
});

// jsdom lays nothing out: the grid's top is at 0, so a time's place is its minutes past 07:00.
const HOUR = 44;
const y = (h: number, m = 0) => ((h * 60 + m - 7 * 60) / 60) * HOUR;

function setup() {
  // Runs the edit on the day's text, as the app's writer does, and answers with the note's path.
  const onWrite = vi.fn<(date: Date, edit: (text: string) => string, failed: string) => Promise<string | undefined>>((_, edit) => {
    edit(TEXT);
    return Promise.resolve('day.md');
  });
  const onStartTimer = vi.fn();
  const onOpenDay = vi.fn();
  const onChooseCalendar = vi.fn();
  render(
    <CalendarView
      dayOf={dayOf}
      textOf={textOf}
      categories={['code', 'sport', 'book']}
      timer={timer()}
      onStartTimer={onStartTimer}
      onOpenDay={onOpenDay}
      onWrite={onWrite}
      onTaskChanged={vi.fn()}
      vault="demo-vault"
      planCalendars={{}}
      onChooseCalendar={onChooseCalendar}
    />,
  );
  // The calendar remembers where it was; start from this week and go back one.
  const back = screen.queryByTestId('cal-today');
  if (back) fireEvent.click(back);
  fireEvent.click(screen.getByTestId('cal-prev'));
  const column = document.querySelector<HTMLElement>(`[data-testid="cal-col"][data-date="${dayKey(DAY)}"]`);
  if (!column) throw new Error('no column for the day');
  /** The edit the last write asked for, run on the day's text. */
  const written = () => {
    const call = onWrite.mock.calls.at(-1);
    expect(call?.[0]).toEqual(DAY);
    return call?.[1](TEXT);
  };
  return { onWrite, onStartTimer, onOpenDay, onChooseCalendar, column, written };
}

/** Draws from one time to another on the day's column, as a mouse would. */
function draw(column: HTMLElement, from: number, to: number) {
  fireEvent.pointerDown(column, { button: 0, clientY: y(Math.floor(from / 60), from % 60) });
  if (to !== from) fireEvent.pointerMove(window, { clientY: y(Math.floor(to / 60), to % 60) });
  fireEvent.pointerUp(window, { clientY: y(Math.floor(to / 60), to % 60) });
}

describe('the calendar', () => {
  it('shows Calendar’s events as Senioro does, and none of the note’s blocks', async () => {
    calendar.events = [
      { id: 'code', calendar: 'sport', title: 'code', notes: 'epiGym release\nmore words', start: at(DAY, 17 * 60 + 30), end: at(DAY, 19 * 60), allDay: false, writable: true },
      // Two days away: on both days' columns, one event all the same.
      { id: 'away', calendar: 'holidays', title: 'Away', start: at(DAY, 0), end: at(addDays(DAY, 2), 0), allDay: true, writable: false },
    ];
    const { column } = setup();
    expect(screen.getAllByTestId('cal-day-head')).toHaveLength(7);
    const [event] = await within(column).findAllByTestId('cal-plan');
    // The title and time on one line, the notes' first line under them, in the calendar's colour.
    expect(event).toHaveTextContent('code17:30–19:00epiGym release');
    expect(event).not.toHaveTextContent('more words');
    expect(event?.style.getPropertyValue('--tone')).toBe('#86d8ac');
    expect(within(screen.getByTestId('cal-allday')).getAllByText('Away')).toHaveLength(2);
    // A read-only calendar's event can't be deleted from here.
    expect(within(column).getAllByTestId('cal-plan-delete')).toHaveLength(1);
    // The time logged is the tasks' minutes; the blocks under them aren't drawn.
    expect(within(column).queryByText('refactor the settings screen')).not.toBeInTheDocument();
    expect(screen.getByTestId('cal-view')).toHaveTextContent('1h 28m logged · 2 events in Calendar');
  });

  it('plans a task of the day in Calendar: its line gets a focus-id and no minutes, Calendar gets the event', async () => {
    const { column, written } = setup();
    await screen.findByTestId('cal-grid');
    draw(column, 19 * 60 + 5, 20 * 60);
    const popover = screen.getByTestId('block-popover');
    expect(popover).toHaveTextContent('19:00–20:00');
    await userEvent.click(within(popover).getAllByTestId('pick-task')[0]!);
    // A code task: no calendar called code, so the system's default.
    expect(within(popover).getByTestId('plan-calendar')).toHaveValue('home');
    await userEvent.click(within(popover).getByTestId('block-save'));
    const id = `${dayKey(DAY).replaceAll('-', '')}-01`;
    expect(written()).toBe(TEXT.replace('screen [minutes::58]', `screen [minutes::58] <!-- focus-id: ${id} -->`));
    await waitFor(() => expect(calendar.events).toHaveLength(1));
    // Named as Senioro names it: the category, with the task's words in the notes.
    expect(calendar.events[0]).toMatchObject({
      calendar: 'home',
      title: 'code',
      notes: 'refactor the settings screen',
      start: at(DAY, 19 * 60),
      end: at(DAY, 20 * 60),
      url: taskUrl({ vault: 'demo-vault', note: 'day.md', id }),
    });
    expect(await within(column).findByTestId('cal-plan')).toHaveTextContent('code19:00–20:00refactor the settings screen');
    expect(screen.getByTestId('cal-planned')).toHaveTextContent('1 event in Calendar');
  });

  it('plans half an hour of a new task on a click, in the calendar named for its category', async () => {
    const { column, written, onChooseCalendar } = setup();
    await screen.findByTestId('cal-grid');
    draw(column, 18 * 60 + 10, 18 * 60 + 10);
    const popover = screen.getByTestId('block-popover');
    expect(popover).toHaveTextContent('18:00–18:30');
    await userEvent.type(within(popover).getByTestId('pick-new'), 'evening run');
    await userEvent.click(within(popover).getByRole('radio', { name: 'sport' }));
    await waitFor(() => expect(within(popover).getByTestId('plan-calendar')).toHaveValue('sport'));
    await userEvent.click(within(popover).getByTestId('block-save'));
    const id = `${dayKey(DAY).replaceAll('-', '')}-01`;
    expect(written()).toBe(`${TEXT}- [ ] #daily/sport — evening run <!-- focus-id: ${id} -->\n`);
    await waitFor(() => expect(calendar.events).toHaveLength(1));
    expect(calendar.events[0]).toMatchObject({ calendar: 'sport', title: 'sport', notes: 'evening run', start: at(DAY, 18 * 60), end: at(DAY, 18 * 60 + 30) });
    expect(onChooseCalendar).toHaveBeenCalledWith('sport', 'sport');
  });

  it('moves a plan in Calendar by dragging it, and deletes it after asking', async () => {
    calendar.events = [{ id: 'dentist', calendar: 'home', title: 'Dentist', start: at(DAY, 15 * 60), end: at(DAY, 15 * 60 + 45), allDay: false, writable: true }];
    const { column, onWrite } = setup();
    const plan = await within(column).findByTestId('cal-plan');
    expect(plan).toHaveTextContent('Dentist');
    expect(plan.style.getPropertyValue('--tone')).toBe('#5b8def');
    fireEvent.pointerDown(plan, { button: 0, clientY: y(15, 10) });
    fireEvent.pointerMove(window, { clientY: y(16, 10) });
    await act(async () => {
      fireEvent.pointerUp(window, { clientY: y(16, 10) });
      await Promise.resolve();
    });
    await waitFor(() => expect(calendar.events[0]).toMatchObject({ start: at(DAY, 16 * 60), end: at(DAY, 16 * 60 + 45) }));
    await userEvent.click(within(column).getByTestId('cal-plan-delete'));
    expect(screen.getByTestId('plan-delete-popover')).toHaveTextContent('Delete 16:00–16:45 “Dentist” from Calendar?');
    await userEvent.click(screen.getByTestId('plan-delete-confirm'));
    await waitFor(() => expect(calendar.events).toEqual([]));
    // Plans never touch the note.
    expect(onWrite).not.toHaveBeenCalled();
  });

  it('asks for Calendar before a plan, when Epizen may not use it yet', async () => {
    calendar.access = 'unknown';
    const { column } = setup();
    expect(await screen.findByTestId('cal-connect')).toHaveTextContent('Connect Apple Calendar');
    draw(column, 9 * 60, 9 * 60);
    const popover = screen.getByTestId('block-popover');
    expect(within(popover).queryByTestId('block-save')).not.toBeInTheDocument();
    await userEvent.click(within(popover).getByTestId('plan-allow'));
    await waitFor(() => expect(screen.queryByTestId('cal-connect')).not.toBeInTheDocument());
  });

  it('starts the timer on a new task for today', async () => {
    const { onStartTimer } = setup();
    await userEvent.click(screen.getByTestId('timer-start'));
    const setup_ = screen.getByTestId('timer-setup');
    await userEvent.type(within(setup_).getByTestId('pick-new'), 'deep work');
    await userEvent.click(within(setup_).getByRole('radio', { name: 'book' }));
    await userEvent.click(within(setup_).getByTestId('timer-go'));
    expect(onStartTimer).toHaveBeenCalledWith({ kind: 'new', category: 'book', words: 'deep work' });
  });

  it('shows a day with its tasks beside it', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^\\w+${DAY.getDate()}`) }));
    expect(screen.getByTestId('cal-view')).toHaveAttribute('data-mode', 'day');
    const side = screen.getByTestId('cal-day-tasks');
    expect(within(side).getAllByTestId('cal-day-task').map((row) => row.textContent)).toEqual([expect.stringContaining('58m'), expect.stringContaining('30m')]);
    await userEvent.click(screen.getByTestId('cal-mode-week'));
  });

  it('opens a menu on a right-click: an event that isn’t a task can only be deleted', async () => {
    calendar.events = [{ id: 'dentist', calendar: 'home', title: 'Dentist', notes: 'check-up', start: at(DAY, 15 * 60), end: at(DAY, 16 * 60), allDay: false, writable: true }];
    const user = userEvent.setup();
    const { column, onStartTimer } = setup();
    const event = await within(column).findByTestId('cal-plan');
    fireEvent.contextMenu(event, { clientX: 200, clientY: 300 });
    const menu = screen.getByTestId('focus-menu');
    expect(menu).toHaveTextContent('An event from Calendar, not one of your tasks.');
    expect(within(menu).queryByTestId('focus-start')).not.toBeInTheDocument();
    expect(within(menu).queryByTestId('focus-menu-edit')).not.toBeInTheDocument();
    await user.click(within(menu).getByTestId('focus-menu-delete'));
    expect(screen.getByTestId('plan-delete-popover')).toHaveTextContent('Delete 15:00–16:00 “Dentist”, check-up, from Calendar?');
    expect(onStartTimer).not.toHaveBeenCalled();
  });

  it('adds a task to a day of the week, with no time yet', async () => {
    const user = userEvent.setup();
    const { onWrite } = setup();
    await user.click(screen.getByTestId('cal-new-task'));
    await user.click(document.querySelector(`[data-testid="new-task-day"][data-date="${dayKey(DAY)}"]`) as HTMLElement);
    await user.click(screen.getByRole('radio', { name: 'book' }));
    await user.type(screen.getByTestId('new-task-text'), 'read 30 pages');
    await user.click(screen.getByTestId('new-task-add'));
    const call = onWrite.mock.calls.at(-1);
    expect(call?.[0]).toEqual(DAY);
    expect(call?.[1](TEXT)).toBe(TEXT.replace('    - 12:30–13:00\n', '    - 12:30–13:00\n- [ ] #daily/book — read 30 pages\n'));
  });
});
