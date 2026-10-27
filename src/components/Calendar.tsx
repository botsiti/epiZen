import { addMonths, formatDate, isoWeek, monthGrid, sameDay, today } from '../lib/dates';
import type { Period } from '../lib/periodic';

interface Props {
  month: Date;
  onMonthChange: (month: Date) => void;
  /** Whether that day's, week's or month's note exists, for the dot under it. */
  has: (period: Period, date: Date) => boolean;
  /** The day, week or month whose note is open. */
  selected?: { period: Period; date: Date };
  /** Opens the note, or creates it from its template. */
  onOpen: (period: Period, date: Date) => void;
  /** Opens the big calendar: the time blocks of a week or a day, and the timer. */
  onOpenCalendar: () => void;
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/** A month in the sidebar. A day opens its daily note, a week number its weekly note, the month's name its monthly note. */
export function Calendar({ month, onMonthChange, has, selected, onOpen, onOpenCalendar }: Props) {
  const now = today();
  const isSelected = (period: Period, date: Date) => selected?.period === period && sameDay(selected.date, date);
  const classes = (...names: (string | false)[]) => names.filter(Boolean).join(' ');

  return (
    <div className="calendar" data-testid="calendar">
      <div className="calendar-head">
        <button
          type="button"
          className={classes('calendar-month', has('month', month) && 'has-note', isSelected('month', month) && 'is-selected')}
          onClick={() => onOpen('month', month)}
          title="Open this month's note"
          data-testid="calendar-month"
        >
          {formatDate(month, 'MMMM YYYY')}
        </button>
        <button type="button" className="icon-button calendar-open" onClick={onOpenCalendar} aria-label="Open the calendar" title="Open the calendar: time blocks and the timer" data-testid="calendar-open">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <rect x="2" y="3" width="12" height="11" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <rect x="5" y="8.5" width="3" height="2.5" rx="0.6" fill="currentColor" />
          </svg>
        </button>
        <button type="button" className="icon-button" onClick={() => onMonthChange(addMonths(month, -1))} aria-label="Previous month" data-testid="calendar-prev">
          ‹
        </button>
        <button type="button" className="icon-button" onClick={() => onMonthChange(addMonths(now, 0))} aria-label="This month" title="This month">
          •
        </button>
        <button type="button" className="icon-button" onClick={() => onMonthChange(addMonths(month, 1))} aria-label="Next month" data-testid="calendar-next">
          ›
        </button>
      </div>
      <table className="calendar-grid">
        <thead>
          <tr>
            <th className="calendar-week-head">W</th>
            {WEEKDAYS.map((name) => (
              <th key={name}>{name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthGrid(month).map((week) => {
            const monday = week[0] ?? month;
            const number = isoWeek(monday).week;
            return (
              <tr key={monday.getTime()}>
                <td>
                  <button
                    type="button"
                    className={classes('calendar-cell calendar-week', has('week', monday) && 'has-note', isSelected('week', monday) && 'is-selected')}
                    onClick={() => onOpen('week', monday)}
                    title={`Week ${number}`}
                    data-testid="calendar-week"
                    data-week={number}
                  >
                    {number}
                  </button>
                </td>
                {week.map((date) => (
                  <td key={date.getTime()}>
                    <button
                      type="button"
                      className={classes(
                        'calendar-cell',
                        date.getMonth() !== month.getMonth() && 'is-outside',
                        sameDay(date, now) && 'is-today',
                        has('day', date) && 'has-note',
                        isSelected('day', date) && 'is-selected',
                      )}
                      onClick={() => onOpen('day', date)}
                      title={formatDate(date, 'dddd, D MMMM YYYY')}
                      data-testid="calendar-day"
                      data-date={formatDate(date, 'YYYY-MM-DD')}
                    >
                      {date.getDate()}
                    </button>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
