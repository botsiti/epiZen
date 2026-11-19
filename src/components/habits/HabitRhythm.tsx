import { formatDate, sameDay } from '../../lib/dates';

export function HabitRhythm({ today, selected, due, completed, week, onSelect }: {
  today: Date; selected: Date; due: number; completed: number;
  week: { date: Date; due: number; completed: number }[];
  onSelect: (date: Date) => void;
}) {
  return <section className="habits-today" aria-label="Habit check-in dates">
    <div className="habit-today-count">
      <div><span className="kicker">{sameDay(today, selected) ? 'Today' : formatDate(selected, 'ddd, D MMM')}</span>
        <strong>{completed}<small> / {due}</small></strong><span>{due ? 'Habits complete' : 'No habits scheduled'}</span></div>
      {!sameDay(today, selected) && <button type="button" className="quiet-chip" onClick={() => onSelect(today)}>Today</button>}
    </div>
    <div className="habit-week-chart" role="group" aria-label="Last seven days">{week.map(({ date, completed, due }) =>
      <button type="button" key={date.getTime()} data-date={formatDate(date, 'YYYY-MM-DD')} aria-pressed={sameDay(date, selected)}
        aria-label={`${formatDate(date, 'D MMM YYYY')}, ${completed} of ${due} complete`} onClick={() => onSelect(date)}>
        <span>{formatDate(date, 'ddd')}</span>
        <svg className="habit-ring" viewBox="0 0 34 34" aria-hidden="true">
          <circle cx="17" cy="17" r="14" />
          {completed > 0 && <circle cx="17" cy="17" r="14" pathLength="100" strokeDasharray={`${completed / due * 100} 100`} />}
          <text x="17" y="17" dominantBaseline="central" textAnchor="middle">{date.getDate()}</text>
        </svg>
      </button>)}</div>
  </section>;
}
