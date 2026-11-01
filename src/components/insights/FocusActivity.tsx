import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { addDays, formatDate, sameDay } from '../../lib/dates';
import { formatMinutes } from '../../lib/day';
import type { DayEntry } from '../../lib/rollup';

/** Day inspection owns its state so scrubbing does not rebuild the other statistics. */
export function FocusActivity({ dayOf, today }: { dayOf: (date: Date) => DayEntry; today: Date }) {
  const [selected, setSelected] = useState(today);
  const grid = useRef<HTMLDivElement>(null);
  const entry = dayOf(selected);
  const activity = useMemo(() => Array.from({ length: 364 }, (_, i) => dayOf(addDays(today, i - 363))), [today, dayOf]);
  const tasks = entry.day?.tasks ?? [];

  // In narrow panes the grid overflows. Start at the recent days; don't move it while scrubbing.
  useLayoutEffect(() => {
    if (grid.current) grid.current.scrollLeft = grid.current.scrollWidth;
  }, []);

  return <section className="card glass insight-card focus-activity" aria-labelledby="focus-activity-title">
    <h2 id="focus-activity-title">Focus activity</h2>
    <p className="insight-subtitle">Last 52 weeks · point to or select a day</p>
    <div className="activity-detail" data-testid="activity-detail">
      <div className="activity-detail-heading">
        <strong>{formatDate(selected, 'dddd, MMM D, YYYY')}</strong>
        <span>{formatMinutes(entry.day?.totals.logged ?? 0)} · {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}</span>
      </div>
      <div key={selected.getTime()} className="activity-detail-scroll" role="region" aria-label="Selected day details" tabIndex={0}>
        {!entry.day ? <p className="activity-empty">No daily note for this day.</p> : tasks.length === 0 ? <p className="activity-empty">No tasks recorded for this day.</p> : <>
          <div className="activity-categories">{entry.day.byCategory.map(([meta, minutes]) => <span key={meta.name} style={{ color: meta.color }}>{meta.name} {formatMinutes(minutes)}</span>)}</div>
          <ul>{tasks.map((task) => <li key={task.line}>
            <span><span style={{ color: task.category?.color }}>{task.category?.name ?? 'other'}</span> {task.label}</span>
            <small>{formatMinutes(task.minutes ?? 0)}</small>
          </li>)}</ul>
        </>}
      </div>
    </div>
    <div ref={grid} className="activity-grid" aria-label="Focus activity over the last 52 weeks">{activity.map((value) => {
      const minutes = value.day?.totals.logged ?? 0;
      return <button key={value.date.getTime()} className="activity-dot"
        data-date={formatDate(value.date, 'YYYY-MM-DD')}
        data-level={minutes === 0 ? 0 : minutes < 60 ? 1 : minutes < 180 ? 2 : minutes < 300 ? 3 : 4}
        aria-label={`${formatDate(value.date, 'MMM D, YYYY')}: ${formatMinutes(minutes)}`}
        aria-pressed={sameDay(value.date, selected)}
        onMouseEnter={() => setSelected(value.date)} onFocus={() => setSelected(value.date)} onClick={() => setSelected(value.date)}>
        <span aria-hidden="true" />
      </button>;
    })}</div>
  </section>;
}
