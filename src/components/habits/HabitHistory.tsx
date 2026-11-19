import { useMemo, useState } from 'react';
import { addDays, addMonths, formatDate, monthGrid, startOfMonth, startOfWeek } from '../../lib/dates';
import type { Habit, HabitMark } from '../../lib/habits';

const dayKey = (date: Date) => formatDate(date, 'YYYY-MM-DD');
const weekNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function ValueChart({ habit, today, marks }: { habit: Habit; today: Date; marks: Map<string, HabitMark> }) {
  const tracking = habit.tracking!;
  const dates = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const values = dates.map((date) => marks.get(dayKey(date))?.value);
  const known = values.filter((value): value is number => value !== undefined);
  const top = Math.max(1, tracking.kind === 'goal' ? tracking.target : 0, ...known);
  const low = Math.min(0, ...known);
  const x = (i: number) => 12 + i * 20;
  const y = (value: number) => 66 - (value - low) / (top - low) * 56;
  const point = (i: number, value: number) => `${x(i)},${y(value)}`;
  const path = values.map((v, i) => v === undefined ? '' : `${values[i - 1] === undefined ? 'M' : 'L'}${point(i, v)}`).join(' ');
  const title = tracking.kind === 'goal' ? 'Daily progress' : 'Daily trend';
  return <figure className="habit-values">
    <figcaption><strong>{title}</strong><span>{tracking.kind === 'goal' ? `Target · ${tracking.target} ${tracking.unit}` : tracking.unit}</span></figcaption>
    {!known.length ? <p>No values recorded in the last 14 days.</p> : <svg viewBox="0 0 284 76" role="img" aria-label={`${title}, last 14 days in ${tracking.unit}`}>
      <line x1="4" x2="280" y1={y(0)} y2={y(0)} className="habit-chart-axis" />
      {tracking.kind === 'goal' ? <line x1="4" x2="280" y1={y(tracking.target)} y2={y(tracking.target)} className="habit-chart-target" /> : <path d={path} className="habit-chart-line" />}
      {values.map((value, i) => value !== undefined && <g key={i}><title>{formatDate(dates[i]!, 'D MMM') + ' · ' + value + ' ' + tracking.unit}</title>{tracking.kind === 'goal'
        ? <rect x={x(i) - 5} width="10" y={Math.min(y(value), y(0)) - 1} height={Math.max(2, Math.abs(y(0) - y(value)))} rx="2" opacity={value >= tracking.target ? 1 : .55} />
        : <circle cx={x(i)} cy={y(value)} r="2.8" />}</g>)}
    </svg>}
    <div className="habit-chart-axis-labels"><span>{formatDate(dates[0]!, 'D MMM')}</span><span>{formatDate(today, 'D MMM')}</span></div>
    {known.length > 0 && <details><summary>Recorded values</summary><ul>{dates.map((date, i) => values[i] !== undefined && <li key={dayKey(date)}>{formatDate(date, 'D MMM')} · {values[i]} {tracking.unit}</li>)}</ul></details>}
  </figure>;
}

export function HabitHistory({ habit, marks, today, selected, onSelect }: { habit: Habit; marks: HabitMark[]; today: Date; selected: Date; onSelect: (date: Date) => void }) {
  const [view, setView] = useState<'Overview' | 'Calendar'>('Calendar');
  const selectedKey = dayKey(selected);
  const [browse, setBrowse] = useState<{ selectedKey: string; month: Date }>();
  const month = browse?.selectedKey === selectedKey ? browse.month : startOfMonth(selected);
  const move = (delta: number) => setBrowse({ selectedKey, month: addMonths(month, delta) });
  const byDate = useMemo(() => new Map(marks.map((m) => [dayKey(m.date), m])), [marks]);
  const start = addDays(startOfWeek(today), -7 * 19);
  const inMonth = marks.filter((mark) => mark.date.getFullYear() === month.getFullYear() && mark.date.getMonth() === month.getMonth());
  const monthCount = inMonth.filter((mark) => mark.done).length;
  const recent = marks.filter((m) => m.done && m.date >= start).length;
  const status = (date: Date) => {
    const mark = byDate.get(dayKey(date));
    if (date > today) return 'Future';
    if (mark?.done) return 'Completed';
    if (mark?.value !== undefined) return 'Partial';
    if (mark?.due) return dayKey(date) === dayKey(today) ? 'Pending' : 'Not completed';
    return 'Not scheduled';
  };
  return <div className="habit-history">
    <div className="habit-detail-tabs" role="group" aria-label="Habit history view">
      {(['Overview', 'Calendar'] as const).map((tab) => <button type="button" key={tab} aria-pressed={view === tab} onClick={() => setView(tab)}>{tab}</button>)}
    </div>
    {view === 'Overview' ? <>
      {habit.tracking && <ValueChart habit={habit} today={selected} marks={byDate} />}
      <div className="habit-history-heading"><strong>Activity</strong><span>{recent} completions · 20 weeks</span></div>
      <div className="habit-heatmap" role="img" aria-label={`${habit.name}, ${recent} completions in the last 20 weeks`}>
        <div className="habit-heatmap-labels" aria-hidden="true"><span>M</span><span>W</span><span>F</span><span>S</span></div>
        <div className="habit-history-grid">{Array.from({ length: 140 }, (_, i) => {
          const date = addDays(start, i);
          const state = status(date);
          return <i key={i} data-state={state} title={`${formatDate(date, 'D MMM YYYY')} · ${state}`} />;
        })}</div>
      </div>
      <div className="habit-chart-axis-labels"><span>{formatDate(start, 'D MMM')}</span><span>{formatDate(today, 'D MMM')}</span></div>
    </> : <>
      <div className="habits-calendar-head"><button type="button" aria-label="Previous habit month" className="quiet-chip" onClick={() => move(-1)}>←</button>
        <h3>{formatDate(month, 'MMMM YYYY')}</h3>
        <button type="button" aria-label="Next habit month" className="quiet-chip" disabled={month >= startOfMonth(today)} onClick={() => move(1)}>→</button></div>
      <p className="habit-month-count">{monthCount} {monthCount === 1 ? 'completion' : 'completions'} this month</p>
      <div className="habits-calendar" aria-label={`${habit.name} history`}>
        {weekNames.map((name) => <span className="habits-weekday" key={name}>{name}</span>)}
        {monthGrid(month).flat().map((date) => {
          const state = status(date);
          return <button type="button" key={dayKey(date)} data-date={dayKey(date)} disabled={date > today} data-state={state}
            aria-current={dayKey(today) === dayKey(date) ? 'date' : undefined} data-outside={date.getMonth() !== month.getMonth()}
            aria-pressed={dayKey(date) === selectedKey}
            title={`${formatDate(date, 'D MMM YYYY')} · ${state}`} aria-label={`${formatDate(date, 'D MMM YYYY')}: ${state}`}
            className="habits-calendar-day" onClick={() => onSelect(date)}><span>{date.getDate()}</span><i aria-hidden="true">{state === 'Completed' ? '✓' : state === 'Partial' ? '·' : ''}</i></button>;
        })}
      </div>
    </>}
    <div className="habits-legend"><span><i data-state="Completed" />Completed</span>{habit.tracking?.kind === 'goal' && <span><i data-state="Partial" />Partial</span>}<span><i data-state="Not completed" />Scheduled</span><span><i />Off schedule</span></div>
  </div>;
}
