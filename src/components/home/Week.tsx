import { useMemo, useState, type CSSProperties } from 'react';
import { formatDate, isoWeek, startOfMonth, startOfWeek } from '../../lib/dates';
import { formatMinutes } from '../../lib/day';
import { averages, focusWeek, lastDays } from '../../lib/home';
import type { Period } from '../../lib/periodic';
import type { DayEntry } from '../../lib/rollup';
import { order } from '../periodic/effects';
import { CountUp } from '../periodic/motion';
import { Bar, NavButton } from '../periodic/parts';

/** Sleep, focus, energy, mood and social over the last seven days, each against its scale. */
export function Averages({ dayOf, today, scales, i }: { dayOf: (date: Date) => DayEntry; today: Date; scales: Record<string, number>; i: number }) {
  const rows = useMemo(() => averages(lastDays(dayOf, today), scales), [dayOf, today, scales]);
  const logged = Math.max(0, ...rows.map((row) => row.count));
  return (
    <section className="card glass rise" style={order(i)} data-testid="averages">
      <div className="card-head">
        <p className="tile-label">7-day averages</p>
        <span className="card-note">{logged ? `${logged}/7 days` : 'no data'}</span>
      </div>
      <ul className="home-averages">
        {rows.map((row) => (
          <li key={row.key} title={`${row.label}: ${row.count} of 7 days logged, out of ${row.scale}${row.unit}`}>
            <span className="home-average-label">{row.label}</span>
            <span className="home-average-value" style={{ color: row.value === undefined ? undefined : row.color }}>
              {row.value === undefined ? '—' : <CountUp value={row.value} format={(n) => `${n.toFixed(1)}${row.unit}`} />}
            </span>
            <Bar share={row.share} color={row.color} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Logged minutes on each of the last seven days; pointing at a day shows its categories. */
export function Focus({ dayOf, today, onOpenNote, i }: { dayOf: (date: Date) => DayEntry; today: Date; onOpenNote: (path: string) => void; i: number }) {
  const entries = useMemo(() => lastDays(dayOf, today), [dayOf, today]);
  const week = useMemo(() => focusWeek(entries), [entries]);
  // The panel opens on the latest day with time logged, so it shows something before any pointing.
  const latest = week.days.findLastIndex((row) => row.minutes > 0);
  const [pointed, setPointed] = useState<number>();
  const shown = week.days[pointed ?? latest];
  return (
    <section className="card glass rise" style={order(i)} data-testid="focus">
      <div className="card-head">
        <p className="tile-label">7-day focus</p>
        <span className="card-note">
          <span className="accent">{formatMinutes(week.total)}</span> · {formatMinutes(week.average)} a day
        </span>
      </div>
      <div className="focus-bars" onPointerLeave={() => setPointed(undefined)}>
        {week.days.map((row, n) => {
          const path = entries[n]?.path;
          return (
            <button
              key={row.date.getTime()}
              type="button"
              className={`focus-day${row.minutes > week.average && row.minutes ? ' is-high' : ''}${n === (pointed ?? latest) ? ' is-shown' : ''}`}
              onPointerEnter={() => setPointed(n)}
              onFocus={() => setPointed(n)}
              onClick={() => path && onOpenNote(path)}
              aria-disabled={!path}
              title={path ? `${formatDate(row.date, 'dddd, D MMMM')}: open the note` : `${formatDate(row.date, 'dddd, D MMMM')}: no note`}
              data-testid="focus-day"
            >
              <span className="focus-time">{row.minutes ? short(row.minutes) : '0'}</span>
              <span className="focus-column">
                <span style={{ height: `${week.most ? (row.minutes / week.most) * 100 : 0}%`, '--i': n } as CSSProperties} />
              </span>
              <span className="focus-weekday">{formatDate(row.date, 'ddd')}</span>
            </button>
          );
        })}
      </div>
      <div className="focus-detail" data-testid="focus-detail">
        {shown ? (
          <>
            <p className="focus-detail-head">
              <span>{formatDate(shown.date, 'dddd, D MMM')}</span>
              <span className="accent">{shown.minutes ? formatMinutes(shown.minutes) : 'nothing logged'}</span>
            </p>
            <ul className="legend">
              {shown.byCategory.map(([meta, minutes]) => (
                <li key={meta.name}>
                  <span className="chip-dot" style={{ '--tone': meta.color } as CSSProperties} />
                  <span className="legend-name">{meta.name}</span>
                  <span className="legend-value">{formatMinutes(minutes)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="faint">No time logged in the last seven days.</p>
        )}
      </div>
    </section>
  );
}

/** 125 → "2.1h"; 40 → "40m": short enough to sit over a bar. */
const short = (minutes: number) => (minutes >= 60 ? `${(minutes / 60).toFixed(minutes % 60 ? 1 : 0)}h` : `${minutes}m`);

interface TodayProps {
  entry: DayEntry;
  today: Date;
  todayNote: { name: string; path?: string };
  exists: (period: Period, date: Date) => boolean;
  onOpenPeriod: (period: Period, date: Date) => void;
  i: number;
}

/** Today's tasks with their category and time, and the way to today's, this week's and this month's notes. */
export function Today({ entry, today, todayNote, exists, onOpenPeriod, i }: TodayProps) {
  const tasks = entry.day?.tasks ?? [];
  const done = tasks.filter((task) => task.done).length;
  const monday = startOfWeek(today);
  const month = startOfMonth(today);
  return (
    <section className="card glass rise today-card" style={order(i)} data-testid="today">
      <div className="card-head">
        <p className="tile-label">Today</p>
        <span className="card-note">{tasks.length ? `${done}/${tasks.length} done` : formatDate(today, 'D MMM')}</span>
      </div>
      {tasks.length ? (
        <ul className="today-tasks">
          {tasks.slice(0, 9).map((task) => (
            <li key={task.line} className={task.done ? 'is-done' : undefined}>
              <span className="chip-dot" style={{ '--tone': task.category?.color ?? 'var(--accent)' } as CSSProperties} title={task.category?.name} />
              <span className="today-task">{task.label || task.category?.name}</span>
              <span className="today-minutes">{task.minutes ? formatMinutes(task.minutes) : ''}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="today-empty">{entry.day ? 'No tasks logged today.' : `No daily note for today yet. ${todayNote.name} will be created when you open it.`}</p>
      )}
      {tasks.length > 9 && <p className="faint today-more">and {tasks.length - 9} more</p>}
      <nav className="today-nav">
        <NavButton
          label="Today"
          title={`Open ${todayNote.name}`}
          onClick={() => onOpenPeriod('day', today)}
          exists={Boolean(todayNote.path)}
          testId={todayNote.path ? 'today-open' : 'today-create'}
        />
        <NavButton label={`Week ${isoWeek(today).week}`} title="This week's note" onClick={() => onOpenPeriod('week', monday)} exists={exists('week', monday)} testId="today-week" />
        <NavButton
          label={formatDate(today, 'MMMM')}
          title="This month's note"
          onClick={() => onOpenPeriod('month', month)}
          exists={exists('month', month)}
          testId="today-month"
        />
      </nav>
    </section>
  );
}
