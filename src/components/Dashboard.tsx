import { useMemo } from 'react';
import { combine, formatMinutes, meterMax, summarizeDay, type DaySummary, type Task, type Totals } from '../lib/dashboard';
import { formatDate } from '../lib/dates';

/** A day that a weekly or monthly note sums: its note, if it has one. */
export interface DayNote {
  date: Date;
  path?: string;
  text?: string;
}

/** What the dashboard above a periodic note sums. Built by App from the vault, no code in the note. */
export type DashboardSpec =
  | { period: 'day' }
  | { period: 'week'; days: DayNote[] }
  | { period: 'month'; weeks: { monday: Date; path?: string; days: DayNote[] }[] };

interface Props {
  spec: DashboardSpec;
  /** The note's own text, for a day. */
  text: string;
  onToggle: (task: Task) => void;
  onOpen: (path: string) => void;
}

export function Dashboard({ spec, text, onToggle, onOpen }: Props) {
  if (spec.period === 'day') return <DayDashboard text={text} onToggle={onToggle} />;
  if (spec.period === 'week') return <WeekDashboard days={spec.days} onOpen={onOpen} />;
  return <MonthDashboard weeks={spec.weeks} onOpen={onOpen} />;
}

const summaries = (days: DayNote[]) => days.flatMap((day) => (day.text === undefined ? [] : [summarizeDay(day.text)]));

/** A task as it reads: no tag, no minutes field; those show beside it. */
const taskLabel = (task: Task) =>
  task.text
    .replace(/#daily\/[\w-]+\s*(?:—\s*)?/, '')
    .replace(/\[minutes::\s*\d+\s*\]/, '')
    .trim();

function DayDashboard({ text, onToggle }: { text: string; onToggle: (task: Task) => void }) {
  const day = useMemo(() => summarizeDay(text), [text]);
  const tasks = day.tasks.filter((task) => !task.habit);
  const habits = day.tasks.filter((task) => task.habit);
  return (
    <section className="dashboard" data-testid="dashboard" data-period="day">
      <Meters values={day.numbers} />
      <div className="dash-columns">
        <div className="dash-block">
          <TaskList title="Tasks" tasks={tasks} onToggle={onToggle} />
          <TaskList title="Habits" tasks={habits} onToggle={onToggle} />
        </div>
        <Minutes minutes={day.minutes} />
      </div>
    </section>
  );
}

function TaskList({ title, tasks, onToggle }: { title: string; tasks: Task[]; onToggle: (task: Task) => void }) {
  if (!tasks.length) return null;
  const done = tasks.filter((task) => task.done).length;
  return (
    <div className="dash-list">
      <p className="eyebrow">
        {title} · {done} of {tasks.length} done
      </p>
      <ul className="dash-tasks">
        {tasks.map((task) => (
          <li key={task.line}>
            <label className={task.done ? 'dash-task is-done' : 'dash-task'}>
              <input type="checkbox" checked={task.done} onChange={() => onToggle(task)} data-testid="dash-task" data-line={task.line} />
              <span className="dash-task-text">{taskLabel(task)}</span>
              {(task.category ?? task.minutes) !== undefined && (
                <span className="dash-faint">{[task.category, task.minutes && formatMinutes(task.minutes)].filter(Boolean).join(' · ')}</span>
              )}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WeekDashboard({ days, onOpen }: { days: DayNote[]; onOpen: (path: string) => void }) {
  const totals = useMemo(() => combine(summaries(days)), [days]);
  return (
    <section className="dashboard" data-testid="dashboard" data-period="week">
      <Meters values={totals.averages} note="average" />
      <div className="dash-columns">
        <div className="dash-block">
          <p className="eyebrow">
            Days · {totals.tasksDone} of {totals.tasks} done
          </p>
          <ul className="dash-rows">
            {days.map((day) => (
              <PeriodRow
                key={day.date.getTime()}
                label={formatDate(day.date, 'ddd D MMM')}
                path={day.path}
                totals={day.text === undefined ? undefined : combine([summarizeDay(day.text)])}
                onOpen={onOpen}
              />
            ))}
          </ul>
        </div>
        <Minutes minutes={totals.minutes} />
      </div>
    </section>
  );
}

function MonthDashboard({ weeks, onOpen }: { weeks: { monday: Date; path?: string; days: DayNote[] }[]; onOpen: (path: string) => void }) {
  const byWeek = useMemo(() => weeks.map((week) => ({ ...week, totals: combine(summaries(week.days)) })), [weeks]);
  const totals = useMemo(() => combine(weeks.flatMap((week) => summaries(week.days))), [weeks]);
  return (
    <section className="dashboard" data-testid="dashboard" data-period="month">
      <Meters values={totals.averages} note="average" />
      <div className="dash-columns">
        <div className="dash-block">
          <p className="eyebrow" title={`${totals.days} days with a note`}>
            Weeks · {totals.tasksDone} of {totals.tasks} done
          </p>
          <ul className="dash-rows">
            {byWeek.map((week) => (
              <PeriodRow
                key={week.monday.getTime()}
                label={`W${formatDate(week.monday, 'W')} · ${formatDate(week.monday, 'D MMM')}`}
                path={week.path}
                totals={week.totals.days ? week.totals : undefined}
                onOpen={onOpen}
              />
            ))}
          </ul>
        </div>
        <Minutes minutes={totals.minutes} />
      </div>
    </section>
  );
}

/** One day or week: its share of tasks done, its minutes, its mood. Opens its note. */
function PeriodRow({ label, path, totals, onOpen }: { label: string; path?: string; totals?: Totals; onOpen: (path: string) => void }) {
  const minutes = totals ? [...totals.minutes.values()].reduce((sum, entry) => sum + entry.done, 0) : 0;
  const mood = totals?.averages.find(([key]) => key === 'mood')?.[1];
  const share = totals?.tasks ? totals.tasksDone / totals.tasks : 0;
  const content = (
    <>
      <span className="dash-row-label">{label}</span>
      <span className="dash-bar" aria-hidden="true">
        <span style={{ width: `${Math.round(share * 100)}%` }} />
      </span>
      <span className="dash-faint">{totals ? `${formatMinutes(minutes)}${mood === undefined ? '' : ` · mood ${mood}`}` : 'no note'}</span>
    </>
  );
  return (
    <li>
      {path ? (
        <button type="button" className="dash-row" onClick={() => onOpen(path)} data-testid="dash-row">
          {content}
        </button>
      ) : (
        <div className="dash-row is-missing">{content}</div>
      )}
    </li>
  );
}

/** Numeric properties as small meters. */
function Meters({ values, note }: { values: [string, number][]; note?: string }) {
  if (!values.length) return null;
  return (
    <dl className="dash-meters" data-testid="dash-meters">
      {values.map(([key, value]) => {
        const max = meterMax(value);
        return (
          <div className="dash-meter" key={key}>
            <dt>{key}</dt>
            <dd>
              {value}
              {note && <span className="dash-faint"> {note}</span>}
            </dd>
            {max !== undefined && (
              <span className="dash-bar" aria-hidden="true">
                <span style={{ width: `${Math.min(100, Math.max(0, (value / max) * 100))}%` }} />
              </span>
            )}
          </div>
        );
      })}
    </dl>
  );
}

/** Minutes per category: ticked in accent over planned. */
function Minutes({ minutes }: { minutes: DaySummary['minutes'] }) {
  const rows = [...minutes].sort((a, b) => b[1].planned - a[1].planned);
  if (!rows.length) return null;
  const most = Math.max(...rows.map(([, entry]) => entry.planned));
  return (
    <div className="dash-block" data-testid="dash-minutes">
      <p className="eyebrow">Minutes by category</p>
      <ul className="dash-rows">
        {rows.map(([category, entry]) => (
          <li key={category} className="dash-row is-static">
            <span className="dash-row-label">{category}</span>
            <span className="dash-bar is-planned" aria-hidden="true" style={{ width: `${(entry.planned / most) * 100}%` }}>
              <span style={{ width: `${entry.planned ? (entry.done / entry.planned) * 100 : 0}%` }} />
            </span>
            <span className="dash-faint">
              {formatMinutes(entry.done)} of {formatMinutes(entry.planned)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
