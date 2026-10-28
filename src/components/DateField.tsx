import { useEffect, useId, useLayoutEffect, useRef, useState, type InputHTMLAttributes, type KeyboardEvent, type RefObject } from 'react';
import { addDays, day, formatDate, sameDay, startOfMonth, today as currentDay } from '../lib/dates';
import { dayValue, moveDay, openingMonth, pickerWeeks, readDay, shiftMonths } from '../lib/datePicker';
import { Layer } from './Layer';
import { followPointer } from './periodic/effects';
import './periodic/periodic.css';
import './DateField.css';

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>;

interface Props {
  /** The field's text: YYYY-MM-DD, or whatever is being typed. */
  value: string;
  /** Every change typed. */
  onChange: (text: string) => void;
  /** A day picked in the calendar, as YYYY-MM-DD. Without it, a pick is a change like any other. */
  onPick?: (value: string) => void;
  /** What the date is ("Listened"), at the top of the calendar. */
  label: string;
  testId: string;
  /** Today, for its ring and the Today and Yesterday chips. */
  today?: Date;
  /** The rest of the input's props: its blur, its keys, its problem. */
  inputProps?: InputProps;
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * A date field that opens a small month calendar beside it when clicked or focused, and still
 * takes YYYY-MM-DD typed in. The calendar follows what is typed; a day picked in it writes the
 * field. The keys: ↓ goes from the field into the calendar, the arrows move a day or a week, Page
 * Up and Down a month (Shift: a year), Enter picks, Escape goes back to the field and closes it.
 */
export function DateField({ value, onChange, onPick, label, testId, today, inputProps }: Props) {
  const [open, setOpen] = useState(false);
  // Whether the keyboard is in the calendar rather than in the field.
  const [inside, setInside] = useState(false);
  const field = useRef<HTMLSpanElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // Focus coming back to the field from the calendar doesn't open it again.
  const quiet = useRef(false);
  const id = useId();

  const close = (refocus: boolean) => {
    setOpen(false);
    setInside(false);
    if (!refocus) return;
    quiet.current = true;
    input.current?.focus();
    quiet.current = false;
  };
  const pick = (next: string) => {
    (onPick ?? onChange)(next);
    close(true);
  };

  // A press anywhere but the field and its calendar closes it, and goes on to what was pressed;
  // so does focus going anywhere else (a Tab out, or a click that only moves focus).
  useEffect(() => {
    if (!open) return;
    const away = (event: Event) => {
      const target = event.target as Node;
      if (field.current?.contains(target) || panel.current?.contains(target)) return;
      setOpen(false);
      setInside(false);
    };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('focusin', away, true);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('focusin', away, true);
    };
  }, [open]);

  const keys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (open && event.key === 'Escape') {
      // The calendar closes; the sheet or page behind it stays as it is.
      event.preventDefault();
      event.stopPropagation();
      close(false);
      return;
    }
    if (event.key === 'ArrowDown' && !event.metaKey) {
      event.preventDefault();
      setOpen(true);
      setInside(true);
      return;
    }
    if (event.key === 'Tab' || event.key === 'Enter') close(false);
    inputProps?.onKeyDown?.(event);
  };

  return (
    <span className={open ? 'date-field is-open' : 'date-field'} ref={field}>
      <input
        placeholder="YYYY-MM-DD"
        {...inputProps}
        ref={input}
        type="text"
        className="date-field-input"
        value={value}
        autoComplete="off"
        spellCheck={false}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onChange={(event) => onChange(event.target.value)}
        onFocus={(event) => {
          inputProps?.onFocus?.(event);
          // Back in the field, typing is the field's: the calendar follows it, and keeps its hands off the focus.
          setInside(false);
          if (!quiet.current) setOpen(true);
        }}
        onClick={(event) => {
          inputProps?.onClick?.(event);
          setOpen(true);
        }}
        onKeyDown={keys}
        data-testid={testId}
      />
      <svg className="date-field-glyph" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2.25" y="3.25" width="11.5" height="10.5" rx="2.25" />
        <path d="M2.25 6.75h11.5M5.5 1.75v3M10.5 1.75v3" />
      </svg>
      {open && (
        <Calendar
          id={id}
          anchor={field}
          panelRef={panel}
          value={value}
          today={today}
          label={label}
          keyboard={inside}
          onPick={pick}
          onLeave={() => close(true)}
        />
      )}
    </span>
  );
}

interface CalendarProps {
  id: string;
  anchor: RefObject<HTMLSpanElement | null>;
  panelRef: RefObject<HTMLDivElement | null>;
  value: string;
  today?: Date;
  label: string;
  /** The keyboard is in the calendar: the day it is on takes focus. */
  keyboard: boolean;
  onPick: (value: string) => void;
  /** Escape or Tab in the calendar: back to the field. */
  onLeave: () => void;
}

/** The popover: the month in the serif with ‹ ›, weekday initials from Monday, six weeks of days, Today and Yesterday. */
function Calendar({ id, anchor, panelRef, value, today, label, keyboard, onPick, onLeave }: CalendarProps) {
  const now = today ? day(today.getFullYear(), today.getMonth(), today.getDate()) : currentDay();
  const chosen = readDay(value);
  const [month, setMonth] = useState(() => openingMonth(chosen, now));
  const [focus, setFocus] = useState(() => chosen ?? now);
  const grid = useRef<HTMLDivElement>(null);
  // A whole date typed in brings its month into view, and lights it.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (chosen) {
      setMonth(startOfMonth(chosen));
      setFocus(chosen);
    }
  }
  const go = (next: Date) => {
    setFocus(next);
    if (next.getMonth() !== month.getMonth() || next.getFullYear() !== month.getFullYear()) setMonth(startOfMonth(next));
  };
  const step = (by: number) => {
    setMonth((shown) => startOfMonth(shiftMonths(shown, by)));
    setFocus((at) => shiftMonths(at, by));
  };

  // Under the field, or over it when there is no room below; kept inside the window, and with
  // the field as the page or the sheet scrolls.
  useLayoutEffect(() => {
    const place = () => {
      const panel = panelRef.current;
      const box = anchor.current?.getBoundingClientRect();
      if (!panel || !box) return;
      const size = panel.getBoundingClientRect();
      const below = box.bottom + 8;
      const above = below + size.height > window.innerHeight - 8 && box.top - size.height - 8 >= 8;
      panel.style.top = `${above ? box.top - size.height - 8 : below}px`;
      panel.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - size.width - 8))}px`;
      panel.dataset.side = above ? 'above' : 'below';
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor, panelRef]);

  // The keyboard's day takes focus as it moves.
  useEffect(() => {
    if (keyboard) grid.current?.querySelector<HTMLButtonElement>('button[tabindex="0"]')?.focus();
  }, [keyboard, focus, month]);

  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      onLeave();
      return;
    }
    const next = moveDay(focus, event.key, event.shiftKey);
    if (!next) return;
    event.preventDefault();
    event.stopPropagation();
    go(next);
  };

  const shown = month.getMonth();
  const todayColumn = now.getMonth() === shown && now.getFullYear() === month.getFullYear() ? (now.getDay() + 6) % 7 : -1;
  const yesterday = addDays(now, -1);
  return (
    <Layer>
      <div
        ref={panelRef}
        id={id}
        className="periodic-layer date-picker glass"
        role="dialog"
        aria-label={`${label}: pick a day`}
        // The field keeps the focus while the calendar is pressed, so typing goes on there.
        onMouseDown={(event) => event.preventDefault()}
        onPointerMove={followPointer}
        onKeyDown={keys}
        data-testid="date-picker"
      >
        <div className="date-picker-top">
          <div>
            <p className="date-picker-label">{label}</p>
            <p className="date-picker-month" data-testid="date-picker-month">
              {formatDate(month, 'MMMM')} <span className="faint">{month.getFullYear()}</span>
            </p>
          </div>
          <div className="date-picker-steps">
            <button type="button" className="date-picker-step" tabIndex={-1} onClick={() => step(-1)} aria-label="Previous month" data-testid="date-picker-prev">
              ‹
            </button>
            <button type="button" className="date-picker-step" tabIndex={-1} onClick={() => step(1)} aria-label="Next month" data-testid="date-picker-next">
              ›
            </button>
          </div>
        </div>
        <div className="date-picker-weekdays" aria-hidden="true">
          {WEEKDAYS.map((letter, i) => (
            <span key={i} className={i === todayColumn ? 'is-today' : undefined}>
              {letter}
            </span>
          ))}
        </div>
        <div className="date-picker-days" ref={grid} role="group" aria-label={formatDate(month, 'MMMM YYYY')}>
          {pickerWeeks(month)
            .flat()
            .map((date) => {
              const classes = ['date-picker-day'];
              if (date.getMonth() !== shown) classes.push('is-outside');
              if (sameDay(date, now)) classes.push('is-today');
              if (chosen && sameDay(date, chosen)) classes.push('is-chosen');
              return (
                <button
                  key={date.getTime()}
                  type="button"
                  className={classes.join(' ')}
                  tabIndex={sameDay(date, focus) ? 0 : -1}
                  aria-pressed={Boolean(chosen && sameDay(date, chosen))}
                  aria-current={sameDay(date, now) ? 'date' : undefined}
                  aria-label={formatDate(date, 'dddd D MMMM YYYY')}
                  onClick={() => onPick(dayValue(date))}
                  data-testid="date-picker-day"
                  data-date={dayValue(date)}
                >
                  {date.getDate()}
                </button>
              );
            })}
        </div>
        <div className="date-picker-foot">
          <button type="button" className="date-picker-quick" tabIndex={-1} onClick={() => onPick(dayValue(now))} data-testid="date-picker-today">
            Today
          </button>
          <button type="button" className="date-picker-quick" tabIndex={-1} onClick={() => onPick(dayValue(yesterday))} data-testid="date-picker-yesterday">
            Yesterday
          </button>
          <span className="date-picker-chosen" data-testid="date-picker-chosen">
            {chosen ? formatDate(chosen, 'ddd D MMM') : 'No day yet'}
          </span>
        </div>
      </div>
    </Layer>
  );
}
