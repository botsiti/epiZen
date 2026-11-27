import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarAccess, CalendarEvent, CalendarInfo, NewCalendarEvent, Occurrence } from '../../lib/api';
import { addDays, sameDay, startOfWeek, today } from '../../lib/dates';
import { calendarDay } from '../../lib/calendarZone';
import { parseDay } from '../../lib/day';
import { at, taskUrl } from '../../lib/plans';
import type { DayEntry } from '../../lib/rollup';
import { DEFAULT_HOURS, type Hours } from '../../lib/schedule';
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
  updateEvent: (occurrence: Occurrence, change: Partial<CalendarEvent>) => {
    const event = calendar.events.find((e) => e.id === occurrence.id);
    if (!event) return Promise.reject(new Error('gone'));
    Object.assign(event, JSON.parse(JSON.stringify(change)));
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

function setup(source = TEXT) {
  // Runs the edit on the day's text, as the app's writer does, and answers with the note's path.
  const onWrite = vi.fn<(date: Date, edit: (text: string) => string, failed: string) => Promise<string | undefined>>((_, edit) => {
    edit(TEXT);
    return Promise.resolve('day.md');
  });
  const onStartTimer = vi.fn();
  const onOpenDay = vi.fn();
  const onChooseCalendar = vi.fn();
  const onTaskChanged = vi.fn();
  const onWriteTask = vi.fn<(path: string, edit: (text: string) => string) => Promise<string>>();
  const view = () => <CalendarView
      dayOf={dayOf}
      textOf={(path) => path === 'day.md' ? source : undefined}
      categories={['code', 'sport', 'book']}
      timer={timer()}
      onStartTimer={onStartTimer}
      onOpenDay={onOpenDay}
      onWrite={onWrite}
      onWriteTask={onWriteTask}
      onTaskChanged={onTaskChanged}
      vault="demo-vault"
      planCalendars={{}}
      onChooseCalendar={onChooseCalendar}
    />;
  const { rerender } = render(view());
  onWriteTask.mockImplementation((_, edit) =>
    Promise.resolve().then(() => {
      source = edit(source);
      rerender(view());
      return source;
    }),
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
  return { onWrite, onWriteTask, onTaskChanged, onStartTimer, onOpenDay, onChooseCalendar, column, written, source: () => source };
}

/** Draws from one time to another on the day's column, as a mouse would. */
function draw(column: HTMLElement, from: number, to: number, hourHeight = HOUR) {
  fireEvent.pointerDown(column, { button: 0, clientY: y(Math.floor(from / 60), from % 60) * hourHeight / HOUR });
  if (to !== from) fireEvent.pointerMove(window, { clientY: y(Math.floor(to / 60), to % 60) * hourHeight / HOUR });
  fireEvent.pointerUp(window, { clientY: y(Math.floor(to / 60), to % 60) * hourHeight / HOUR });
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
    const activity = screen.getByTestId('cal-activity');
    expect(activity).toHaveTextContent('1h 28m logged');
    expect(screen.queryByTestId('cal-planned')).toBeNull();
    await userEvent.click(activity);
    expect(screen.getByTestId('cal-planned')).toHaveTextContent('2 events in Calendar');
  });

  it('keeps adjacent short events labelled and reachable at the evening fold', async () => {
    calendar.events = ['Review', 'Call'].map((title, index) => ({
      id: title, calendar: 'home', title, start: at(DAY, 21 * 60 + 50 + index * 5),
      end: at(DAY, 21 * 60 + 55 + index * 5), allDay: false, writable: true,
    }));
    const { column } = setup();
    const [review, call] = await within(column).findAllByTestId('cal-plan');
    expect(review).toHaveTextContent('Review21:50–21:55');
    expect(call).toHaveTextContent('Call21:55–22:00');
    expect(review?.style.getPropertyValue('--lane')).not.toBe(call?.style.getPropertyValue('--lane'));
    await userEvent.dblClick(within(column).getByRole('button', { name: 'Call' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('21:55');
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
    await userEvent.click(screen.getByTestId('cal-activity'));
    expect(screen.getByTestId('cal-planned')).toHaveTextContent('1 event in Calendar');
  });

  it('plans half an hour of a new task on a click, in the calendar named for its category', async () => {
    const { column, written, onChooseCalendar } = setup();
    await screen.findByTestId('cal-grid');
    draw(column, 18 * 60 + 10, 18 * 60 + 10);
    const popover = screen.getByTestId('block-popover');
    expect(popover).toHaveTextContent('18:00–18:30');
    await userEvent.type(within(popover).getByTestId('pick-new'), 'evening ');
    await userEvent.click(within(popover).getByRole('radio', { name: 'sport' }));
    expect(within(popover).getByTestId('pick-new')).toHaveFocus();
    await userEvent.keyboard('run');
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

  it('offers event editing and deletion on a right-click without task actions', async () => {
    calendar.events = [{ id: 'dentist', calendar: 'home', title: 'Dentist', notes: 'check-up', start: at(DAY, 15 * 60), end: at(DAY, 16 * 60), allDay: false, writable: true }];
    const user = userEvent.setup();
    const { column, onStartTimer } = setup();
    const event = await within(column).findByTestId('cal-plan');
    fireEvent.contextMenu(event, { clientX: 200, clientY: 300 });
    const menu = screen.getByTestId('focus-menu');
    expect(menu).toHaveTextContent('An event from Calendar, not one of your tasks.');
    expect(within(menu).queryByTestId('focus-start')).not.toBeInTheDocument();
    expect(within(menu).getByTestId('focus-menu-edit')).toHaveTextContent('Edit event');
    await user.click(within(menu).getByTestId('focus-menu-delete'));
    expect(screen.getByTestId('plan-delete-popover')).toHaveTextContent('Delete 15:00–16:00 “Dentist”, check-up, from Calendar?');
    expect(onStartTimer).not.toHaveBeenCalled();
  });

  it('opens the current task from a moved plan and updates the grid after saving its original note', async () => {
    const moved = addDays(DAY, 1);
    const event = {
      id: 'code', calendar: 'home', title: 'business', notes: 'An old task name',
      start: at(moved, 13 * 60), end: at(moved, 14 * 60), allDay: false, writable: true,
      url: taskUrl({ vault: 'demo-vault', note: 'day.md', id: 'work' }),
    };
    calendar.events = [event];
    const text = TEXT.replace('[minutes::58]', '[minutes::58] <!-- focus-id: work -->');
    const { onWrite, onWriteTask, onTaskChanged, onOpenDay, source } = setup(text);
    const block = await screen.findByTestId('cal-plan');
    expect(block.closest('[data-date]')).toHaveAttribute('data-date', dayKey(moved));
    expect(block).toHaveTextContent('code13:00–14:00refactor the settings screen');
    expect(block).not.toHaveTextContent('An old task name');
    const user = userEvent.setup();
    await user.dblClick(within(block).getByRole('button', { name: 'code' }));
    expect(onOpenDay).not.toHaveBeenCalled();
    const editor = screen.getByRole('dialog', { name: 'Edit task' });
    expect(editor).toHaveTextContent(/13:00\s*[–-]\s*14:00/);
    expect(editor).toHaveTextContent('day.md');
    expect(within(editor).getByLabelText('Minutes spent')).toHaveValue('58');
    const description = within(editor).getByLabelText('Description');
    await user.clear(description);
    await user.type(description, 'review the calendar');
    onWriteTask.mockRejectedValueOnce(new Error('The note changed on disk'));
    await user.click(within(editor).getByRole('button', { name: 'Save' }));
    expect(await within(editor).findByRole('alert')).toHaveTextContent('The note changed on disk');
    expect(description).toHaveValue('review the calendar');
    expect(onTaskChanged).not.toHaveBeenCalled();
    await user.click(within(editor).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(editor).not.toBeInTheDocument());
    expect(onWriteTask).toHaveBeenLastCalledWith('day.md', expect.any(Function));
    expect(onWrite).not.toHaveBeenCalled();
    expect(source()).toBe(text.replace('refactor the settings screen', 'review the calendar'));
    expect(onTaskChanged).toHaveBeenCalledWith(expect.objectContaining({ path: 'day.md', date: moved, focusId: 'work' }));
    expect(screen.getByTestId('cal-plan')).toHaveTextContent('review the calendar');
    expect(screen.getByTestId('cal-plan').closest('[data-date]')).toHaveAttribute('data-date', dayKey(moved));
  });

  it('finishes and reopens a moved task from the calendar without rewriting its scheduled event', async () => {
    const moved = addDays(DAY, 1);
    const event = { id: 'plan', calendar: 'home', title: 'code', notes: 'planned',
      start: at(moved, 13 * 60), end: at(moved, 14 * 60), allDay: false, writable: false,
      url: taskUrl({ vault: 'demo-vault', note: 'day.md', id: 'work' }) };
    calendar.events = [event];
    const original = '---\ndone: 50\n---\n' + TEXT.replace('[minutes::58]', '[due::today]  [minutes::58] <!-- focus-id: work -->');
    const { source, onWrite, onWriteTask, onTaskChanged } = setup(original);
    const user = userEvent.setup();
    const open = async () => {
      await user.dblClick(await screen.findByTestId('cal-plan'));
      return screen.getByRole('checkbox', { name: 'Completed' });
    };
    const check = await open();
    expect(check).not.toBeChecked();
    await user.click(check);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onWriteTask).not.toHaveBeenCalled();

    await user.click(await open());
    onWriteTask.mockRejectedValueOnce(new Error('The note changed on disk'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The note changed on disk');
    expect(source()).toBe(original);
    expect(screen.getByRole('checkbox', { name: 'Completed' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('img', { name: 'Completed' })).toBeInTheDocument();
    expect(source()).toBe(original.replace('done: 50', 'done: 100').replace('- [ ]', '- [x]'));
    const completed = await open();
    expect(completed).toBeChecked();
    await user.click(completed);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(source()).toBe(original);
    expect(screen.queryByRole('img', { name: 'Completed' })).not.toBeInTheDocument();
    expect(onWrite).not.toHaveBeenCalled();
    expect(onTaskChanged).not.toHaveBeenCalled();
    expect(calendar.events).toEqual([event]);
  });

  it('edits an unlinked event in Calendar, preserving its date and untouched multiline description', async () => {
    const event = { id: 'legacy', calendar: 'home', title: 'code', notes: 'plan\nExtra details', start: at(DAY, 13 * 60), end: at(DAY, 15 * 60), allDay: false, writable: true };
    calendar.events = [{ ...event }];
    const { onWrite, onWriteTask } = setup();
    const user = userEvent.setup();
    await user.dblClick(await screen.findByTestId('cal-plan'));
    const editor = screen.getByRole('dialog', { name: 'Edit event' });
    expect(within(editor).queryByRole('checkbox', { name: 'Completed' })).not.toBeInTheDocument();
    expect(within(editor).getByLabelText('Description')).toHaveValue(event.notes);
    const title = within(editor).getByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'planning');
    await user.click(within(editor).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(editor).not.toBeInTheDocument());
    expect(screen.getByTestId('cal-plan')).toHaveTextContent('planning');
    expect(calendar.events).toEqual([{ ...event, title: 'planning' }]);
    expect(onWrite).not.toHaveBeenCalled();
    expect(onWriteTask).not.toHaveBeenCalled();

    // A reschedule in Apple Calendar replaces the occurrence in Epizen when it returns to focus.
    const next = addDays(DAY, 1);
    calendar.events = [{ ...event, title: 'planning', start: at(next, 11 * 60), end: at(next, 13 * 60) }];
    fireEvent(window, new Event('focus'));
    await waitFor(() => {
      const moved = screen.getByTestId('cal-plan');
      expect(moved.closest('[data-date]')).toHaveAttribute('data-date', dayKey(next));
      expect(moved).toHaveTextContent('11:00–13:00');
    });
  });

  it('adds a task to a day of the week, with no time yet', async () => {
    const user = userEvent.setup();
    const { onWrite } = setup();
    await user.click(screen.getByTestId('cal-new-task'));
    expect(screen.getByTestId('new-task-text')).toHaveFocus();
    await user.click(document.querySelector(`[data-testid="new-task-day"][data-date="${dayKey(DAY)}"]`) as HTMLElement);
    expect(screen.getByTestId('new-task-text')).toHaveFocus();
    await user.click(screen.getByRole('radio', { name: 'book' }));
    expect(screen.getByTestId('new-task-text')).toHaveFocus();
    await user.keyboard('read 30 pages');
    await user.click(screen.getByTestId('new-task-add'));
    const call = onWrite.mock.calls.at(-1);
    expect(call?.[0]).toEqual(DAY);
    expect(call?.[1](TEXT)).toBe(TEXT.replace('    - 12:30–13:00\n', '    - 12:30–13:00\n- [ ] #daily/book — read 30 pages\n'));
  });
});

it('reveals an assistant block date once without taking over later calendar navigation', async () => {
  const onFocusDate = vi.fn();
  const props = { dayOf, textOf, categories: ['code'], timer: timer(), onStartTimer: vi.fn(), onOpenDay: vi.fn(), onWrite: vi.fn().mockResolvedValue(undefined), onWriteTask: vi.fn(), onTaskChanged: vi.fn(), vault: 'copy', planCalendars: {}, onChooseCalendar: vi.fn(), onFocusDate };
  const view = render(<CalendarView {...props} focusDate={{ time: new Date(2026, 11, 1, 9).getTime(), token: 1 }} />);
  expect(screen.getByTestId('cal-view')).toHaveAttribute('data-mode', 'day');
  expect(screen.getByTestId('cal-view')).toHaveAttribute('data-start', '2026-12-01');
  await waitFor(() => expect(onFocusDate).toHaveBeenCalledOnce());
  view.rerender(<CalendarView {...props} />);
  fireEvent.click(screen.getByTestId('cal-next'));
  expect(screen.getByTestId('cal-view')).toHaveAttribute('data-start', '2026-12-02');
  view.rerender(<CalendarView {...props} />);
  expect(screen.getByTestId('cal-view')).toHaveAttribute('data-start', '2026-12-02');
});

it('changes the calendar zone, places an event in its new day, and saves a newly drawn plan at that wall time', async () => {
  const anchor = Date.parse('2026-11-17T20:00:00Z');
  calendar.events = [{ id: 'one', title: 'Design review', calendar: 'work', start: Date.parse('2026-11-18T02:00:00Z'), end: Date.parse('2026-11-18T03:00:00Z'), allDay: false, writable: true }];
  const save = vi.fn<(zone?: string) => Promise<void>>().mockRejectedValueOnce(new Error('Settings busy')).mockResolvedValue(undefined);
  const write = vi.fn((_date: Date, edit: (text: string) => string) => { edit(TEXT); return Promise.resolve('november.md'); });
  function Display() {
    const [zone, setZone] = useState<string | undefined>('America/Los_Angeles');
    return <CalendarView timeZone={zone} onSaveTimeZone={async (next) => { await save(next); setZone(next); }}
      focusDate={{ time: anchor, token: 1 }} dayOf={dayOf} textOf={textOf} categories={['code']} timer={timer()} onStartTimer={vi.fn()} onOpenDay={vi.fn()}
      onWrite={write} onWriteTask={vi.fn()} onTaskChanged={vi.fn()} vault="copy" planCalendars={{}} onChooseCalendar={vi.fn()} />;
  }
  render(<Display />);
  expect(await screen.findByTestId('cal-plan')).toHaveTextContent('18:00–19:00');
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', {name:'Calendar time zone'}));
  await user.type(screen.getByRole('searchbox', {name:'Search time zones'}), 'Tokyo');
  const choice = screen.getByRole('button', {name: 'Asia/Tokyo'});
  await user.click(choice);
  expect(screen.getByRole('alert')).toHaveTextContent('Settings busy');
  expect(screen.getByTestId('cal-time-zone')).toHaveTextContent('Los Angeles');
  await user.click(choice);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByTestId('cal-plan')).toBeNull();
  await user.click(screen.getByTestId('cal-next'));
  expect(await screen.findByTestId('cal-plan')).toHaveTextContent('11:00–12:00');
  draw(screen.getByTestId('cal-col'), 13 * 60, 14 * 60, 52);
  await user.type(screen.getByTestId('pick-new'), 'Schedule in Tokyo');
  await user.click(screen.getByTestId('block-save'));
  await waitFor(() => expect(calendar.events).toHaveLength(2));
  expect(calendar.events[1]).toMatchObject({ timeZone: 'Asia/Tokyo', start: Date.parse('2026-11-18T04:00:00Z'), end: Date.parse('2026-11-18T05:00:00Z') });
  expect(dayKey(write.mock.calls[0]![0])).toBe('2026-11-18');
  await user.click(screen.getByTestId('cal-time-zone'));
  await user.click(screen.getByRole('button', { name: /Follow Mac time zone/ }));
  expect(save).toHaveBeenLastCalledWith(undefined);
});

it('highlights today in the display zone while focus stays attached to the Mac day’s note', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    const instant = Date.parse('2026-11-17T21:00:00Z');
    vi.setSystemTime(instant);
    const local = today();
    const zone = sameDay(local, calendarDay(instant, 'Asia/Tokyo')) ? 'America/Los_Angeles' : 'Asia/Tokyo';
    const viewed = calendarDay(instant, zone);
    const note = (date: Date) => `### Tasks
- [ ] #daily/code — ${dayKey(date)} task
`;
    const data = (date: Date) => ({ date, path: dayKey(date), day: parseDay(note(date)) });
    const text = (path: string) => path === dayKey(local) ? note(local) : note(viewed);
    render(<CalendarView timeZone={zone} focusDate={{ time: instant, token: 1 }} dayOf={data} textOf={text} categories={['code']}
      timer={timer()} onStartTimer={vi.fn()} onOpenDay={vi.fn()} onWrite={vi.fn()} onWriteTask={vi.fn()} onTaskChanged={vi.fn()} vault="copy" planCalendars={{}} onChooseCalendar={vi.fn()} />);
    expect(screen.getByTestId('cal-view')).toHaveAttribute('data-start', dayKey(viewed));
    expect(screen.getByTestId('cal-day-head')).toHaveClass('is-today');
    expect(screen.getByTestId('cal-day-task')).toHaveTextContent(dayKey(viewed));
    expect(screen.queryByRole('button', { name: /^Focus on/ })).toBeNull();
    fireEvent.click(screen.getByText('Start focus…'));
    expect(await screen.findByTestId('pick-task')).toHaveTextContent(dayKey(local));
  } finally { vi.useRealTimers(); }
});

it('rejects a plan in a skipped hour before creating its task or event', async () => {
  const write = vi.fn(), zone = 'America/Los_Angeles';
  render(<CalendarView timeZone={zone} focusDate={{ time: Date.parse('2026-03-08T18:00:00Z'), token: 1 }}
    dayOf={dayOf} textOf={textOf} categories={['code']} timer={timer()} onStartTimer={vi.fn()} onOpenDay={vi.fn()}
    onWrite={write} onWriteTask={vi.fn()} onTaskChanged={vi.fn()} vault="copy" planCalendars={{}} onChooseCalendar={vi.fn()} />);
  fireEvent.click(screen.getByTestId('cal-activity'));
  expect(await screen.findByTestId('cal-planned')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Close daily activity' }));
  fireEvent.click(screen.getByTestId('cal-fold-early'));
  fireEvent.pointerDown(screen.getByTestId('cal-col'), { button: 0, clientY: 2.5 * 52 });
  fireEvent.pointerUp(window, { clientY: 2.5 * 52 });
  const user = userEvent.setup();
  await user.type(screen.getByTestId('pick-new'), 'Skipped time');
  await user.click(screen.getByTestId('block-save'));
  expect(screen.getByTestId('cal-warning')).toHaveTextContent('does not exist');
  expect(write).not.toHaveBeenCalled();
  expect(calendar.events).toHaveLength(0);
});

it('shows the logged total in the header and opens a complete weekly breakdown on demand', async () => {
  const week = 'Calendar/Week.md';
  const open = vi.fn();
  render(<CalendarView
    timeZone="UTC" focusDate={{ time: DAY.getTime(), token: 2 }}
    dayOf={dayOf} textOf={textOf} categories={['code', 'sport']} timer={timer()} timerEnabled={false}
    onStartTimer={vi.fn()} onOpenDay={vi.fn()} onOpenLinkedNote={open} weekNote={() => week}
    onWrite={vi.fn()} onWriteTask={vi.fn()} onTaskChanged={vi.fn()} vault="copy" planCalendars={{}} onChooseCalendar={vi.fn()} />);
  const user = userEvent.setup();
  if (screen.getByTestId('cal-view').dataset.mode === 'day') await user.click(screen.getByTestId('cal-mode-week'));
  const trigger = screen.getByRole('button', { name: 'Show weekly activity' });
  expect(trigger).toHaveTextContent('1h 28m logged');
  expect(screen.queryByText('Productive')).toBeNull();
  await user.click(trigger);
  const summary = within(screen.getByRole('dialog', { name: 'Weekly activity' }));
  expect(summary.getByText('code').parentElement).toHaveTextContent('code58m');
  expect(summary.getByText('sport')).toBeVisible();
  expect(summary.getByText('1 of 2 tasks done')).toBeVisible();
  await user.click(summary.getByRole('button', { name: 'Close weekly activity' }));
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  await user.click(screen.getByRole('button', { name: 'Open weekly note' }));
  expect(open).toHaveBeenCalledWith(week);
});

it('sets both day boundaries, preserves a failed draft, and temporarily unfolds the saved range', async () => {
  const save = vi.fn<(value: Hours) => Promise<void>>().mockRejectedValueOnce(new Error('Settings busy')).mockResolvedValue(undefined);
  function Display() {
    const [hours, setHours] = useState(DEFAULT_HOURS);
    return <CalendarView dayHours={hours} onSaveDayHours={async (next) => { await save(next); setHours(next); }}
      dayOf={dayOf} textOf={textOf} categories={['code']} timer={timer()} timerEnabled={false}
      onStartTimer={vi.fn()} onOpenDay={vi.fn()} onWrite={vi.fn()} onWriteTask={vi.fn()}
      onTaskChanged={vi.fn()} vault="copy" planCalendars={{}} onChooseCalendar={vi.fn()} />;
  }
  render(<Display />);
  const user = userEvent.setup();
  const early = screen.getByTestId('cal-fold-early');
  const late = screen.getByTestId('cal-fold-late');
  fireEvent.contextMenu(late);
  const end = screen.getByLabelText('Day ends');
  expect(end).toHaveFocus();
  await user.selectOptions(screen.getByLabelText('Day starts'), '480');
  await user.selectOptions(end, '1380');
  await user.click(screen.getByRole('button', {name: 'Save hours'}));
  expect(screen.getByRole('alert')).toHaveTextContent('Settings busy');
  expect(end).toHaveValue('1380');
  expect(early).toHaveAttribute('title', 'Show 00:00–07:00');
  await user.click(screen.getByRole('button', {name: 'Save hours'}));
  expect(save).toHaveBeenLastCalledWith({ first: 480, last: 1380 });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(early).toHaveAttribute('title', 'Show 00:00–08:00');
  expect(late).toHaveAttribute('title', 'Show 23:00–24:00');
  await user.click(early);
  expect(early).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText('00:00')).toBeVisible();
  await user.click(early);
  expect(screen.queryByText('00:00')).toBeNull();
  await user.click(screen.getByTestId('cal-day-hours'));
  await user.selectOptions(screen.getByLabelText('Day starts'), '0');
  await user.selectOptions(screen.getByLabelText('Day ends'), '1440');
  await user.click(screen.getByRole('button', {name: 'Save hours'}));
  expect(screen.queryByTestId('cal-fold-early')).toBeNull();
  expect(screen.queryByTestId('cal-fold-late')).toBeNull();
  expect(screen.getByTestId('cal-day-hours')).toHaveAttribute('aria-label', 'Day hours, 00:00 to 24:00');
});
