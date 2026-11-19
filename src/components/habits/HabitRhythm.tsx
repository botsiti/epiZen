import { addDays, formatDate } from '../../lib/dates';

export function HabitRhythm({ today, due, completed, best, week }: {
  today: Date; due: number; completed: number; best: number; week: number[];
}) {
  const percent = due ? completed / due * 100 : 0;
  const total = week.reduce((sum, value) => sum + value, 0);
  const peak = Math.max(1, ...week);
  return <section className="habits-today" aria-label="Today's habit progress">
    <div className="habit-today-count">
      <svg className="habit-ring" viewBox="0 0 68 68" aria-hidden="true">
        <circle cx="34" cy="34" r="29" />
        <circle cx="34" cy="34" r="29" pathLength="100" strokeDasharray={`${percent} 100`} opacity={percent ? 1 : 0} />
        <path d="m25 34 6 6 13-14" />
      </svg>
      <div><span className="kicker">Today</span><strong>{completed}<small> / {due}</small></strong>
        <span>{!due ? 'No habits scheduled' : completed === due ? 'Routine complete' : 'Habits complete'}</span></div>
    </div>
    <div className="habit-week"><div className="habit-week-title"><span className="kicker">Last 7 days</span><span>{total} completions</span></div>
      <div className="habit-week-chart">{week.map((value, i) => {
        const date = addDays(today, i - 6);
        return <div key={i} data-today={i === 6} title={`${formatDate(date, 'ddd, D MMM')} · ${value} completions`}><div className="habit-bar-track"><i style={{ height: `${100 * value / peak}%` }} /></div><span>{formatDate(date, 'ddd')}</span></div>;
      })}</div>
    </div>
    <div className="habit-best"><span className="kicker">Leading streak</span><strong>{best}<small> {best === 1 ? 'day' : 'days'}</small></strong><span>Across active habits</span></div>
  </section>;
}
