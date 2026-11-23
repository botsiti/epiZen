import { usePluginDisplay } from '../workspace/PluginDisplay';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { addDays, formatDate, isoWeek, parseDate, sameDay, startOfWeek } from '../../lib/dates';
import { formatMinutes, parseDay } from '../../lib/day';
import type { CalendarEvent } from '../../lib/api';
import { allDayOn, calendarFor, planText, planTimes, plansOn, taskUrl, type PlanBlock, type TaskLink } from '../../lib/plans';
import type { DayEntry } from '../../lib/rollup';
import { calendarDay, calendarDayStart, calendarQueryRange, systemCalendarZone } from '../../lib/calendarZone';
import { CalendarZonePicker } from './CalendarZonePicker';
import { useNow } from './useNow';
import { shownHours } from '../../lib/schedule';
import { addTask, syncPlanDone } from '../../lib/edits';
import { addTaskWithFocusId, deleteTask, editTask, focusIdOf, newTaskLabel, withFocusId, type TaskEdit } from '../../lib/timeblocks';
import { dayKey } from '../../lib/timer';
import { CountUp } from '../periodic/motion';
import { primeChime } from './chime';
import { TimeGrid, type Column, type GridPlan } from './TimeGrid';
import { FocusMenu, type FocusHow } from './FocusMenu';
import { NewTask } from './NewTask';
import { DeleteTask, EditEvent, EditTask } from './TaskDialogs';
import { taskRefs } from './taskRefs';
import { TimerCard } from './Timer';
import type { DayTaskRef, TaskChange, TaskChoice } from './types';
import { usePlans } from './usePlans';
import type { TimerApi } from './useTimer';
import '../periodic/periodic.css';
import './calendar.css';

interface Props {
  /** A newly saved assistant block reveals its date once; ordinary navigation remains local. */
  focusDate?: { time: number; token: number };
  onFocusDate?: () => void;
  timerEnabled?: boolean;
  timeZone?: string;
  onSaveTimeZone?: (zone: string | undefined) => Promise<void>;
  /** The day behind a date: its note, if it has one, and what the note holds. */
  dayOf: (date: Date) => DayEntry;
  /** A note's text as the app last read or wrote it. */
  textOf: (path: string) => string | undefined;
  resolveTaskPath?: (path: string, focusId: string) => string;
  /** The task categories the vault uses, most used first. */
  categories: string[];
  timer: TimerApi;
  /** Starts the timer on a task: as the timer card is set, or as a right-click asked. */
  onStartTimer: (choice: TaskChoice, how?: FocusHow) => void;
  /** Opens a day's page. */
  onOpenDay: (date: Date) => void;
  onOpenLinkedNote?: (path: string) => void;
  /** Changes a day's note, creating it with built-in starting text first. The note's path once the change is in it. */
  onWrite: (date: Date, edit: (text: string) => string, failed: string) => Promise<string | undefined>;
  onWriteTask: (path: string, edit: (text: string) => string) => Promise<unknown>;
  /** A task edited or deleted here, once its note holds the change. */
  onTaskChanged: (change: TaskChange) => void | Promise<void>;
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
let remembered: { mode: Mode; date?: string } = { mode: 'week' };

function column(date: Date, dayOf: Props['dayOf'], textOf: Props['textOf'], events: CalendarEvent[], taskOf: (link?: TaskLink) => DayTaskRef | undefined, zone: string, resolveLink?: (link: TaskLink) => TaskLink): Column {
  const entry = dayOf(date);
  const text = entry.path === undefined ? undefined : textOf(entry.path);
  const tasks = taskRefs(entry, text);
  const plans: PlanBlock[] = plansOn(events, date, zone);
  return {
    date,
    key: dayKey(date),
    allDay: allDayOn(events, date),
    // Focus runs on this day's tasks; a linked task can also be edited from a rescheduled block.
    plans: plans.map((plan) => {
      const link = plan.link && (resolveLink?.(plan.link) ?? plan.link);
      const task = taskOf(link);
      return { ...plan, link, task, here: task !== undefined && link?.note === entry.path };
    }),
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
export function CalendarView({ timeZone, onSaveTimeZone, focusDate, onFocusDate, dayOf, textOf, resolveTaskPath, categories, timer, timerEnabled = true, onStartTimer, onOpenDay, onOpenLinkedNote, onWrite, onWriteTask, onTaskChanged, vault, planCalendars, onChooseCalendar, warning }: Props) {
  const display = usePluginDisplay('calendar');
  const [mode, setMode] = useState<Mode>(display.defaultView === 'Week' ? 'week' : display.defaultView === 'Day' ? 'day' : remembered.mode);
  const clock = useNow(true, 30_000);
  const { local, zone, now, localToday } = useMemo(() => {
    const local = systemCalendarZone(), zone = timeZone ?? local;
    return { local, zone, now: calendarDay(clock, zone), localToday: calendarDay(clock, local) };
  }, [clock, timeZone]);
  const [selectedDate, setDate] = useState(remembered.date);
  const date = (selectedDate && parseDate(selectedDate, 'YYYY-MM-DD')) || now;
  useEffect(() => { remembered = { mode, date: selectedDate }; }, [mode, selectedDate]);
  const [timeError, setTimeError] = useState<string>();
  const [seenFocus, setSeenFocus] = useState<number>();
  if (focusDate && focusDate.token !== seenFocus && Number.isFinite(focusDate.time)) {
    const date = calendarDay(focusDate.time, zone);
    setSeenFocus(focusDate.token); setDate(dayKey(date)); setMode('day');
  }
  useEffect(() => { if (focusDate?.token === seenFocus && focusDate !== undefined) onFocusDate?.(); }, [focusDate, seenFocus, onFocusDate]);
  const [early, setEarly] = useState(false);
  const [late, setLate] = useState(false);
  const [highlight, setHighlight] = useState<number>();
  const [menu, setMenu] = useState<{ x: number; y: number; date: Date; item: DayTaskRef }>();
  const [adding, setAdding] = useState(false);
  const [dialog, setDialog] = useState<
    | { kind: 'edit' | 'delete'; date: Date; item: DayTaskRef }
    | { kind: 'plan'; plan: GridPlan }
  >();
  const show = (nextMode: Mode, nextDate: Date) => {
    setMode(nextMode);
    setDate(sameDay(nextDate, now) ? undefined : dayKey(nextDate));
    setHighlight(undefined);
  };

  const monday = startOfWeek(date);
  const time = date.getTime();
  const first = mode === 'week' ? monday : date;
  const range = useMemo(() => calendarQueryRange(mode === 'week' ? startOfWeek(new Date(time)) : new Date(time), mode === 'week' ? 7 : 1, zone, local), [time, mode, zone, local]);
  const plans = usePlans(range.from, range.to);
  const planEvents = plans.events;
  // The task a plan is bound to, read from its note as the app knows it, wherever the plan is now.
  const taskOf = useCallback(
    (link?: TaskLink): DayTaskRef | undefined => {
      const text = link && link.vault === vault ? textOf(link.note) : undefined;
      if (!link || text === undefined) return undefined;
      const lines = text.split('\n').map((line) => line.replace(/\r$/, ''));
      const matches = parseDay(text).tasks.filter((t) => focusIdOf(lines[t.line] ?? '') === link.id);
      const [task] = matches;
      if (!task || matches.length !== 1) return undefined;
      return { task, ref: { line: task.line, text: lines[task.line] ?? '' } };
    },
    [textOf, vault],
  );
  const columns = useMemo(() => {
    const day = new Date(time);
    const days = mode === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(day), i)) : [day];
    const follow = (link: TaskLink) => resolveTaskPath && link.vault === vault ? { ...link, note: resolveTaskPath(link.note, link.id) } : link;
    return days.map((d) => column(d, dayOf, textOf, planEvents, taskOf, zone, follow));
  }, [mode, time, dayOf, textOf, planEvents, taskOf, zone, resolveTaskPath, vault]);
  const localDayKey = localToday.getTime();
  const todayTasks = useMemo(() => column(new Date(localDayKey), dayOf, textOf, [], taskOf, zone).tasks, [dayOf, textOf, taskOf, localDayKey, zone]);
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
  const events = new Set(columns.flatMap((col) => [...col.plans.map(({ event }) => `${event.id}@${event.start}`), ...col.allDay.map((event) => `${event.id}@${event.start}`)])).size;
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
    setTimeError(undefined);
    let times;
    try { times = planTimes(day, start, finish, zone); }
    catch (error) { setTimeError(error instanceof Error ? error.message : String(error)); return; }
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
    await plans.create({ calendar, ...text, ...times, timeZone, url: taskUrl({ vault, note: path, id: made.focusId }) });
  };
  const focus = (ref: DayTaskRef['ref'], task: DayTaskRef['task'], how: FocusHow) =>
    onStartTimer({ kind: 'task', ref, label: task.label, category: task.category?.name }, how);
  // A new task on a day, with no time yet: time comes from blocks or the timer.
  const addTo = (day: Date, category: string, words: string) =>
    onWrite(day, (text) => syncPlanDone(addTask(text, category, words)), 'The task wasn’t added');
  // An edited or deleted task takes the timer and its plans with it.
  const editOn = async (day: Date, { task, ref }: DayTaskRef, edit: TaskEdit, link?: TaskLink) => {
    const apply = (text: string) => editTask(text, ref, edit);
    let path = link?.note;
    if (path) await onWriteTask(path, apply);
    else path = await onWrite(day, apply, 'The task wasn’t changed');
    if (!path) throw new Error('The task couldn’t be saved. Close this editor to see the note’s error.');
    const after = { label: newTaskLabel(edit.words), category: edit.category?.toLowerCase() };
    try {
      await onTaskChanged({ kind: 'edited', path, date: day, focusId: focusIdOf(ref.text), before: { label: task.label, category: task.category?.name }, after });
    } finally {
      plans.refresh();
    }
  };
  const deleteOn = (day: Date, { ref }: DayTaskRef) =>
    void onWrite(day, (text) => syncPlanDone(deleteTask(text, ref)), 'The task wasn’t deleted').then(async (path) => {
      if (!path) return;
      await onTaskChanged({ kind: 'deleted', path, date: day, focusId: focusIdOf(ref.text) });
      plans.refresh();
    });

  const single = mode === 'day' ? columns[0] : undefined;
  const editingPlan = dialog?.kind === 'plan' ? dialog.plan : undefined;
  const linkedTask = editingPlan?.task;
  const taskLink = editingPlan?.link;
  const planRange = editingPlan && new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatRange(editingPlan.event.start, editingPlan.event.end);
  return (
    <div className="periodic-frame cal-frame" data-testid="cal-view" data-mode={mode} data-start={columns[0]?.key}>
      {(warning || plans.error || timeError) && (
        <p className="note-warning" data-testid="cal-warning">
          {[warning, plans.error, timeError].filter(Boolean).join(' ')}
        </p>
      )}
      <div className="cal-top">
        <header className="cal-hero" data-testid="hero">
          <div>
            <div className="cal-hero-heading"><p className="kicker">{kicker}</p>
              {onSaveTimeZone && <CalendarZonePicker value={timeZone} instant={shown ? clock : calendarDayStart(first, zone)} onSave={async (next) => {
                await onSaveTimeZone(next); setTimeError(undefined); setHighlight(undefined);
              }} />}
            </div>
            <div className="cal-hero-period">
              <h1 className="cal-title" data-testid="cal-title">{title}</h1>
              <p className="cal-summary">
                {total ? <><CountUp value={total} format={formatMinutes} /> logged</> : 'Nothing logged yet'}
                {plans.access === 'allowed' && (
                  <span data-testid="cal-planned"> · {events} event{events === 1 ? '' : 's'} in Calendar</span>
                )}
              </p>
            </div>
          </div>
          <nav className="cal-toolbar" aria-label="Calendar controls">
            <button type="button" className="nav-chip cal-step" aria-label={`Previous ${mode}`} onClick={() => step(-1)} title={mode === 'week' ? 'The week before' : 'The day before'} data-testid="cal-prev">
              ‹
            </button>
            <button type="button" className="nav-chip cal-step" aria-label={`Next ${mode}`} onClick={() => step(1)} title={mode === 'week' ? 'The week after' : 'The day after'} data-testid="cal-next">
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
            <button type="button" className="nav-chip cal-add-task" onClick={() => setAdding(true)} data-testid="cal-new-task">
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
        </header>
        {timerEnabled && <TimerCard timeZone={zone} timer={timer} tasks={todayTasks} categories={categories} onStart={onStartTimer} />}
      </div>

      <div className={single ? 'cal-main is-day' : 'cal-main'}>
        <TimeGrid
          focusEnabled={timerEnabled}
          key={`${mode}-${columns[0]?.key}-${zone}`}
          zone={zone}
          now={clock}
          columns={columns}
          hours={hours}
          early={early}
          late={late}
          onFold={(edge) => (edge === 'early' ? setEarly((open) => !open) : setLate((open) => !open))}
          categories={categories}
          session={timer.state.session}
          wide={Boolean(single)}
          highlight={highlight}
          plans={plans}
          calendarFor={(category) => calendarFor(category, plans.calendars, planCalendars)}
          onPlan={plan}
          onMovePlan={async (day, item, start, finish, edge) => {
            setTimeError(undefined);
            try {
              const times = planTimes(day, start, finish, zone, { event: item.event, edge });
              await plans.move(item.event, times.start, times.end);
            } catch (error) { setTimeError(error instanceof Error ? error.message : String(error)); }
          }}
          onDeletePlan={(item) => plans.remove(item.event)}
          onFocus={(_, item, how) => focus(item.ref, item.task, how)}
          onEditPlan={(plan) => setDialog({ kind: 'plan', plan })}
          onOpenDay={onOpenDay}
          onOpenLinkedNote={onOpenLinkedNote}
          onHead={(day) => (single ? onOpenDay(day) : show('day', day))}
        />
        {single && (
          <aside className="cal-side" data-testid="cal-day-tasks">
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
                    onDoubleClick={(event) => {
                      if (!(event.target as Element).closest('button')) setDialog({ kind: 'edit', date: single.date, item: { task, ref } });
                    }}
                    data-testid="cal-day-task"
                  >
                    <span className="chip-dot" />
                    <span className="cal-side-label" title={task.label}>
                      {task.label || <span className="faint">untitled</span>}
                    </span>
                    <span className="cal-side-minutes">{task.minutes ? formatMinutes(task.minutes) : '—'}</span>
                    {sameDay(single.date, localToday) && !timer.state.session && (
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
          focusEnabled={timerEnabled}
          at={menu}
          label={menu.item.task.label}
          noFocus={sameDay(menu.date, localToday) ? undefined : 'Focus runs on today’s tasks: the timer logs into today’s note.'}
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
          onSave={(edit) => editOn(dialog.date, dialog.item, edit)}
        />
      )}
      {editingPlan && planRange && (linkedTask && taskLink ? (
        <EditTask
          task={linkedTask.task}
          categories={categories}
          when={planRange}
          note={taskLink.note}
          onCancel={() => setDialog(undefined)}
          onSave={(edit) => editOn(calendarDay(editingPlan.event.start, zone), linkedTask, edit, taskLink)}
        />
      ) : (
        <EditEvent event={editingPlan.event} when={planRange} onCancel={() => setDialog(undefined)} onSave={(fields) => plans.edit(editingPlan.event, fields)} />
      ))}
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
