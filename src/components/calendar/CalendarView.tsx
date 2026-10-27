import { useMemo, useState, type CSSProperties, type PointerEvent } from 'react';
import { addDays, formatDate, isoWeek, sameDay, startOfWeek, today } from '../../lib/dates';
import { formatMinutes } from '../../lib/day';
import type { DayEntry } from '../../lib/rollup';
import { gridBlocks, shownHours, type GridBlock } from '../../lib/schedule';
import { addBlock, addTaskWithBlock, deleteBlock, moveBlock } from '../../lib/timeblocks';
import { dayKey } from '../../lib/timer';
import { followPointer } from '../periodic/effects';
import { CountUp } from '../periodic/motion';
import { primeChime } from './chime';
import { TimeGrid, type Column } from './TimeGrid';
import { TimerCard } from './Timer';
import type { DayTaskRef, TaskChoice } from './types';
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
  onStartTimer: (choice: TaskChoice) => void;
  /** Opens a day's page. */
  onOpenDay: (date: Date) => void;
  /** Changes a day's note, creating it from its template first. Rejects when nothing was written. */
  onWrite: (date: Date, edit: (text: string) => string, failed: string) => Promise<void>;
  /** Why the last change didn't reach its note, if it didn't. */
  warning?: string;
}

type Mode = 'week' | 'day';
// Where the calendar was, so coming back to it shows the same week or day. Kept for the session.
let remembered: { mode: Mode; date: Date } = { mode: 'week', date: today() };

function column(date: Date, dayOf: Props['dayOf'], textOf: Props['textOf']): Column {
  const entry = dayOf(date);
  const text = entry.path === undefined ? undefined : textOf(entry.path);
  const lines = text?.split('\n').map((line) => line.replace(/\r$/, ''));
  const tasks: DayTaskRef[] = entry.day && lines ? entry.day.tasks.map((task) => ({ task, ref: { line: task.line, text: lines[task.line] ?? '' } })) : [];
  return {
    date,
    key: dayKey(date),
    blocks: entry.day && text !== undefined ? gridBlocks(entry.day, text) : [],
    tasks,
    total: entry.day?.totals.logged ?? 0,
  };
}

/** The calendar: a week or a day of time blocks from the daily notes, with the focus timer. */
export function CalendarView({ dayOf, textOf, categories, timer, onStartTimer, onOpenDay, onWrite, warning }: Props) {
  const [mode, setMode] = useState<Mode>(remembered.mode);
  const [date, setDate] = useState(remembered.date);
  const [early, setEarly] = useState(false);
  const [late, setLate] = useState(false);
  const [highlight, setHighlight] = useState<number>();
  const show = (nextMode: Mode, nextDate: Date) => {
    remembered = { mode: nextMode, date: nextDate };
    setMode(nextMode);
    setDate(nextDate);
    setHighlight(undefined);
  };

  const now = today();
  const monday = startOfWeek(date);
  const time = date.getTime();
  const columns = useMemo(() => {
    const day = new Date(time);
    const days = mode === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(day), i)) : [day];
    return days.map((d) => column(d, dayOf, textOf));
  }, [mode, time, dayOf, textOf]);
  const todayTasks = useMemo(() => column(today(), dayOf, textOf).tasks, [dayOf, textOf]);
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
  const blocks = columns.reduce((sum, col) => sum + col.blocks.length, 0);
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

  const add = (day: Date, start: number, finish: number, choice: TaskChoice) =>
    onWrite(day, (text) => (choice.kind === 'task' ? addBlock(text, choice.ref, start, finish) : addTaskWithBlock(text, choice.category, choice.words, start, finish)), 'The block wasn’t added');
  const move = (day: Date, block: GridBlock, start: number, finish: number) =>
    onWrite(day, (text) => moveBlock(text, block.taskRef, block.blockRef, start, finish), 'The block wasn’t moved');
  const remove = (day: Date, block: GridBlock) => onWrite(day, (text) => deleteBlock(text, block.taskRef, block.blockRef), 'The block wasn’t deleted');

  const single = mode === 'day' ? columns[0] : undefined;
  return (
    <div className="periodic-frame cal-frame" onPointerMove={(event: PointerEvent<HTMLDivElement>) => followPointer(event)} data-testid="cal-view" data-mode={mode} data-start={columns[0]?.key}>
      {warning && (
        <p className="note-warning" data-testid="cal-warning">
          {warning}
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
                  <CountUp value={total} format={formatMinutes} /> logged in {blocks} block{blocks === 1 ? '' : 's'}
                </>
              ) : (
                'Nothing logged yet. Draw a block, or start the timer.'
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
          onAdd={add}
          onMove={move}
          onDelete={remove}
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
                    onPointerEnter={() => setHighlight(task.line)}
                    onPointerLeave={() => setHighlight(undefined)}
                    data-testid="cal-day-task"
                  >
                    <span className="chip-dot" />
                    <span className="cal-side-label" title={task.label}>
                      {task.label || <span className="faint">untitled</span>}
                    </span>
                    <span className="cal-side-blocks">{task.blocks.length ? `${task.blocks.length}×` : ''}</span>
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
              <p className="empty-line">No tasks on this day yet. Draw a block on the day to add one.</p>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
