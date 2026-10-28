import { useCallback, useMemo, useState, type CSSProperties, type PointerEvent } from 'react';
import { addDays, formatDate, isoWeek, sameDay, startOfWeek, today } from '../../lib/dates';
import { formatMinutes, parseDay } from '../../lib/day';
import type { CalendarEvent } from '../../lib/api';
import { allDayOn, at, calendarFor, planText, plansOn, taskUrl, type PlanBlock, type TaskLink } from '../../lib/plans';
import type { DayEntry } from '../../lib/rollup';
import { shownHours } from '../../lib/schedule';
import { addTask, syncPlanDone } from '../../lib/edits';
import { addTaskWithFocusId, deleteTask, editTask, focusIdOf, newTaskLabel, withFocusId, type TaskEdit } from '../../lib/timeblocks';
import { dayKey } from '../../lib/timer';
import { followPointer } from '../periodic/effects';
import { CountUp } from '../periodic/motion';
import { primeChime } from './chime';
import { TimeGrid, type Column } from './TimeGrid';
import { FocusMenu, type FocusHow } from './FocusMenu';
import { NewTask } from './NewTask';
import { DeleteTask, EditTask } from './TaskDialogs';
import { TimerCard } from './Timer';
import type { DayTaskRef, TaskChange, TaskChoice } from './types';
import { usePlans } from './usePlans';
import type { TimerApi } from './useTimer';
import '../periodic/periodic.css';
import './calendar.css';

interface Props {
  /** The day behind a date: its note, if it has one, and what the note holds. */
  dayOf: (date: Date) => DayEntry;
  /** A note's text as the app last read or wrote it. */
  textOf: (path: string) => string | undefined;
  /** The task categories the vault uses, most used first. */
  categories: string[];
  timer: TimerApi;
  /** Starts the timer on a task: as the timer card is set, or as a right-click asked. */
  onStartTimer: (choice: TaskChoice, how?: FocusHow) => void;
  /** Opens a day's page. */
  onOpenDay: (date: Date) => void;
  /** Changes a day's note, creating it from its template first. The note's path once the change is in it. */
  onWrite: (date: Date, edit: (text: string) => string, failed: string) => Promise<string | undefined>;
  /** A task edited or deleted here, once its note holds the change. */
  onTaskChanged: (change: TaskChange) => void;
  /** The open vault's name, which a plan's link in Calendar carries. */
  vault: string;
  /** The Apple Calendar last chosen for each category's plans, by calendar id. */
  planCalendars: Record<string, string>;
  onChooseCalendar: (category: string, calendar: string) => void;
  /** Why the last change didn't reach its note, if it didn't. */
  warning?: string;
}

type Mode = 'week' | 'day';
// Where the calendar was, so coming back to it shows the same week or day. Kept for the session.
let remembered: { mode: Mode; date: Date } = { mode: 'week', date: today() };

/** The days on show, as moments: from the first one's midnight to the midnight after the last. */
function shownRange(mode: Mode, time: number) {
  const first = mode === 'week' ? startOfWeek(new Date(time)) : new Date(time);
  return { from: at(first, 0), to: at(addDays(first, mode === 'week' ? 7 : 1), 0) };
}

function column(date: Date, dayOf: Props['dayOf'], textOf: Props['textOf'], events: CalendarEvent[], taskOf: (link?: TaskLink) => DayTaskRef | undefined): Column {
  const entry = dayOf(date);
  const text = entry.path === undefined ? undefined : textOf(entry.path);
  const lines = text?.split('\n').map((line) => line.replace(/\r$/, ''));
  const tasks: DayTaskRef[] = entry.day && lines ? entry.day.tasks.map((task) => ({ task, ref: { line: task.line, text: lines[task.line] ?? '' } })) : [];
  const plans: PlanBlock[] = plansOn(events, date);
  return {
    date,
    key: dayKey(date),
    allDay: allDayOn(events, date),
    // A plan's task is its own day's when its note is this day's: only then can it be edited or timed from here.
    plans: plans.map((plan) => ({ ...plan, task: taskOf(plan.link), here: plan.link !== undefined && plan.link.note === entry.path })),
    tasks,
    total: entry.day?.totals.logged ?? 0,
  };
}

/**
 * The calendar: a week or a day of Apple Calendar, as Calendar and Senioro show it, with the
 * focus timer and the minutes the daily notes log. Drawing on it plans a task: an event in
 * Calendar, never minutes in the note. The note's time blocks aren't drawn: they are the timer's
 * record, and the minutes are what counts.
 */
export function CalendarView({ dayOf, textOf, categories, timer, onStartTimer, onOpenDay, onWrite, onTaskChanged, vault, planCalendars, onChooseCalendar, warning }: Props) {
  const [mode, setMode] = useState<Mode>(remembered.mode);
  const [date, setDate] = useState(remembered.date);
  const [early, setEarly] = useState(false);
  const [late, setLate] = useState(false);
  const [highlight, setHighlight] = useState<number>();
  const [menu, setMenu] = useState<{ x: number; y: number; date: Date; item: DayTaskRef }>();
  const [adding, setAdding] = useState(false);
  const [dialog, setDialog] = useState<{ kind: 'edit' | 'delete'; date: Date; item: DayTaskRef }>();
  const show = (nextMode: Mode, nextDate: Date) => {
    remembered = { mode: nextMode, date: nextDate };
    setMode(nextMode);
    setDate(nextDate);
    setHighlight(undefined);
  };

  const now = today();
  const monday = startOfWeek(date);
  const time = date.getTime();
  const range = shownRange(mode, time);
  const plans = usePlans(range.from, range.to);
  const planEvents = plans.events;
  // The task a plan is bound to, read from its note as the app knows it, wherever the plan is now.
  const taskOf = useCallback(
    (link?: TaskLink): DayTaskRef | undefined => {
      const text = link && link.vault === vault ? textOf(link.note) : undefined;
      if (!link || text === undefined) return undefined;
      const lines = text.split('\n').map((line) => line.replace(/\r$/, ''));
      const task = parseDay(text).tasks.find((t) => focusIdOf(lines[t.line] ?? '') === link.id);
      return task && { task, ref: { line: task.line, text: lines[task.line] ?? '' } };
    },
    [textOf, vault],
  );
  const columns = useMemo(() => {
    const day = new Date(time);
    const days = mode === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(day), i)) : [day];
    return days.map((d) => column(d, dayOf, textOf, planEvents, taskOf));
  }, [mode, time, dayOf, textOf, planEvents, taskOf]);
  const todayTasks = useMemo(() => column(today(), dayOf, textOf, [], taskOf).tasks, [dayOf, textOf, taskOf]);
  const total = columns.reduce((sum, col) => sum + col.total, 0);
  // The period's minutes by category, most first, for the legend under the title.
  const byCategory = useMemo(() => {
    const totals = new Map<string, { color: string; minutes: number }>();
    for (const col of columns) {
      for (const { task } of col.tasks) {
        if (!task.minutes) continue;
        const name = task.category?.name ?? 'other';
        const entry = totals.get(name) ?? { color: task.category?.color ?? 'var(--accent)', minutes: 0 };
        totals.set(name, { ...entry, minutes: entry.minutes + task.minutes });
      }
    }
    return [...totals].sort((a, b) => b[1].minutes - a[1].minutes || a[0].localeCompare(b[0]));
  }, [columns]);
  // Each event once, though one that spans days is on each of them.
  const events = new Set(columns.flatMap((col) => [...col.plans.map((plan) => plan.key), ...col.allDay.map((event) => `${event.id}@${event.start}`)])).size;
  const hours = shownHours(early, late);
  const shown = columns.some((col) => sameDay(col.date, now));

  const end = addDays(monday, 6);
  const kicker = mode === 'week' ? `Week ${isoWeek(monday).week} · ${formatDate(end, 'YYYY')}` : `${formatDate(date, 'dddd')} · Week ${isoWeek(date).week} · ${formatDate(date, 'YYYY')}`;
  const title =
    mode === 'day'
      ? formatDate(date, 'D MMMM')
      : monday.getMonth() === end.getMonth()
        ? `${monday.getDate()} – ${end.getDate()} ${formatDate(end, 'MMMM')}`
        : `${formatDate(monday, 'D MMM')} – ${formatDate(end, 'D MMM')}`;
  const step = (by: number) => show(mode, addDays(mode === 'week' ? monday : date, by * (mode === 'week' ? 7 : 1)));

  // A plan: the task, given a focus-id (and added, when new), then its event in Calendar,
  // linked to it. The note gets no time: minutes come from the timer or the task's card.
  const plan = async (day: Date, start: number, finish: number, choice: TaskChoice, calendar: string) => {
    const made: { focusId?: string } = {};
    const path = await onWrite(
      day,
      (text) => {
        const next = choice.kind === 'task' ? withFocusId(text, choice.ref, day) : addTaskWithFocusId(text, choice.category, choice.words, day);
        made.focusId = next.focusId;
        return choice.kind === 'task' ? next.text : syncPlanDone(next.text);
      },
      'The task wasn’t planned',
    );
    if (!path || !made.focusId) return;
    if (choice.category) onChooseCalendar(choice.category.toLowerCase(), calendar);
    const text = planText(choice.category, choice.kind === 'task' ? choice.label : newTaskLabel(choice.words));
    await plans.create({ calendar, ...text, start: at(day, start), end: at(day, finish), url: taskUrl({ vault, note: path, id: made.focusId }) });
  };
  const focus = (ref: DayTaskRef['ref'], task: DayTaskRef['task'], how: FocusHow) =>
    onStartTimer({ kind: 'task', ref, label: task.label, category: task.category?.name }, how);
  // A new task on a day, with no time yet: time comes from blocks or the timer.
  const addTo = (day: Date, category: string, words: string) =>
    onWrite(day, (text) => syncPlanDone(addTask(text, category, words)), 'The task wasn’t added');
  // An edited or deleted task takes the timer and its plans with it.
  const editOn = (day: Date, { task, ref }: DayTaskRef, edit: TaskEdit) =>
    void onWrite(day, (text) => editTask(text, ref, edit), 'The task wasn’t changed').then((path) => {
      const after = { label: newTaskLabel(edit.words), category: edit.category?.toLowerCase() };
      if (path) onTaskChanged({ kind: 'edited', path, date: day, focusId: focusIdOf(ref.text), before: { label: task.label, category: task.category?.name }, after });
    });
  const deleteOn = (day: Date, { ref }: DayTaskRef) =>
    void onWrite(day, (text) => syncPlanDone(deleteTask(text, ref)), 'The task wasn’t deleted').then((path) => {
      if (path) onTaskChanged({ kind: 'deleted', path, date: day, focusId: focusIdOf(ref.text) });
    });

  const single = mode === 'day' ? columns[0] : undefined;
  return (
    <div className="periodic-frame cal-frame" onPointerMove={(event: PointerEvent<HTMLDivElement>) => followPointer(event)} data-testid="cal-view" data-mode={mode} data-start={columns[0]?.key}>
      {(warning ?? plans.error) && (
        <p className="note-warning" data-testid="cal-warning">
          {[warning, plans.error].filter(Boolean).join(' ')}
        </p>
      )}
      <div className="cal-top">
        <header className="hero glass cal-hero" data-testid="hero">
          <div className="hero-aurora" aria-hidden="true" />
          <div className="hero-main">
            <p className="kicker">{kicker}</p>
            <h1 className="hero-title cal-title" data-testid="cal-title">
              {title}
            </h1>
            <p className="cal-summary">
              {total ? (
                <>
                  <CountUp value={total} format={formatMinutes} /> logged
                </>
              ) : (
                'Nothing logged yet'
              )}
              {plans.access === 'allowed' && (
                <span data-testid="cal-planned">
                  {' '}
                  · {events} event{events === 1 ? '' : 's'} in Calendar
                </span>
              )}
            </p>
            {byCategory.length > 0 && (
              <ul className="cal-legend" data-testid="cal-legend">
                {byCategory.slice(0, 7).map(([name, { color, minutes }]) => (
                  <li key={name} style={{ '--tone': color } as CSSProperties}>
                    <span className="chip-dot" />
                    <span className="cal-legend-name">{name}</span>
                    <span className="cal-legend-time">{formatMinutes(minutes)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <nav className="hero-nav">
            <button type="button" className="nav-chip" onClick={() => step(-1)} title={mode === 'week' ? 'The week before' : 'The day before'} data-testid="cal-prev">
              ‹
            </button>
            <button type="button" className="nav-chip" onClick={() => step(1)} title={mode === 'week' ? 'The week after' : 'The day after'} data-testid="cal-next">
              ›
            </button>
            {!shown && (
              <button type="button" className="nav-chip" onClick={() => show(mode, now)} data-testid="cal-today">
                Today
              </button>
            )}
            {single && (
              <button type="button" className="nav-chip is-action" onClick={() => onOpenDay(single.date)} data-testid="cal-open-day">
                Open the day’s page
              </button>
            )}
            <span className="nav-space" />
            {plans.access && plans.access !== 'allowed' && (
              <button
                type="button"
                className="nav-chip"
                onClick={plans.ask}
                title={plans.access === 'denied' ? 'Epizen can’t use your calendars: allow it in System Settings' : 'Show your Apple Calendar here, and plan tasks into it'}
                data-testid="cal-connect"
              >
                {plans.access === 'denied' ? 'Calendar is off ›' : 'Connect Apple Calendar'}
              </button>
            )}
            <button type="button" className="nav-chip is-action" onClick={() => setAdding(true)} data-testid="cal-new-task">
              + New task
            </button>
            <div className="switch" role="radiogroup" aria-label="Show">
              {(['week', 'day'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={mode === option}
                  className={mode === option ? 'switch-option is-chosen' : 'switch-option'}
                  onClick={() => show(option, option === 'day' && mode === 'week' ? (shown ? now : monday) : date)}
                  data-testid={`cal-mode-${option}`}
                >
                  {option === 'week' ? 'Week' : 'Day'}
                </button>
              ))}
            </div>
          </nav>
        </header>
        <TimerCard timer={timer} tasks={todayTasks} categories={categories} onStart={onStartTimer} />
      </div>

      <div className={single ? 'cal-main is-day' : 'cal-main'}>
        <TimeGrid
          key={mode}
          columns={columns}
          hours={hours}
          early={early}
          late={late}
          onFold={(edge) => (edge === 'early' ? setEarly((open) => !open) : setLate((open) => !open))}
          hourHeight={single ? 52 : 44}
          categories={categories}
          session={timer.state.session}
          wide={Boolean(single)}
          highlight={highlight}
          plans={plans}
          calendarFor={(category) => calendarFor(category, plans.calendars, planCalendars)}
          onPlan={plan}
          onMovePlan={(day, item, start, finish) => plans.move(item.event, at(day, start), at(day, finish))}
          onDeletePlan={(item) => plans.remove(item.event)}
          onFocus={(_, item, how) => focus(item.ref, item.task, how)}
          onEditTask={(day, item) => setDialog({ kind: 'edit', date: day, item })}
          onOpenDay={onOpenDay}
          onHead={(day) => (single ? onOpenDay(day) : show('day', day))}
        />
        {single && (
          <aside className="cal-side glass rise" data-testid="cal-day-tasks">
            <p className="tile-label">The day’s tasks</p>
            <p className="cal-side-total">
              <CountUp value={single.total} format={formatMinutes} />
              <span className="of"> logged</span>
            </p>
            {single.tasks.length ? (
              <ul className="cal-side-list">
                {single.tasks.map(({ task, ref }) => (
                  <li
                    key={ref.line}
                    className={task.done ? 'is-done' : undefined}
                    style={{ '--tone': task.category?.color ?? 'var(--accent)' } as CSSProperties}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setMenu({ x: event.clientX, y: event.clientY, date: single.date, item: { task, ref } });
                    }}
                    onPointerEnter={() => setHighlight(task.line)}
                    onPointerLeave={() => setHighlight(undefined)}
                    data-testid="cal-day-task"
                  >
                    <span className="chip-dot" />
                    <span className="cal-side-label" title={task.label}>
                      {task.label || <span className="faint">untitled</span>}
                    </span>
                    <span className="cal-side-minutes">{task.minutes ? formatMinutes(task.minutes) : '—'}</span>
                    {sameDay(single.date, now) && !timer.state.session && (
                      <button
                        type="button"
                        className="cal-side-start"
                        title="Focus on this task"
                        aria-label={`Focus on ${task.label}`}
                        onClick={() => {
                          primeChime();
                          onStartTimer({ kind: 'task', ref, label: task.label, category: task.category?.name });
                        }}
                      />
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-line">No tasks on this day yet. Add one, or draw a block on the day.</p>
            )}
          </aside>
        )}
      </div>
      {menu && (
        <FocusMenu
          at={menu}
          label={menu.item.task.label}
          noFocus={sameDay(menu.date, now) ? undefined : 'Focus runs on today’s tasks: the timer logs into today’s note.'}
          running={Boolean(timer.state.session)}
          onFocus={(how) => focus(menu.item.ref, menu.item.task, how)}
          onOpenDay={() => onOpenDay(menu.date)}
          onEdit={() => setDialog({ kind: 'edit', date: menu.date, item: menu.item })}
          onDeleteTask={() => setDialog({ kind: 'delete', date: menu.date, item: menu.item })}
          onClose={() => setMenu(undefined)}
        />
      )}
      {dialog?.kind === 'edit' && (
        <EditTask
          task={dialog.item.task}
          categories={categories}
          onCancel={() => setDialog(undefined)}
          onSave={(edit) => {
            setDialog(undefined);
            editOn(dialog.date, dialog.item, edit);
          }}
        />
      )}
      {dialog?.kind === 'delete' && (
        <DeleteTask
          task={dialog.item.task}
          onCancel={() => setDialog(undefined)}
          onConfirm={() => {
            setDialog(undefined);
            deleteOn(dialog.date, dialog.item);
          }}
        />
      )}
      {adding && (
        <NewTask
          days={columns.map((col) => col.date)}
          initial={columns.find((col) => sameDay(col.date, now))?.date ?? columns[0]?.date ?? now}
          categories={categories}
          onCancel={() => setAdding(false)}
          onSave={(day, category, words) => {
            setAdding(false);
            void addTo(day, category, words).catch(() => undefined);
          }}
        />
      )}
    </div>
  );
}
