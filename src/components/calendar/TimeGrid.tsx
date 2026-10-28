import { useRef, useState, type CSSProperties, type FormEvent, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import type { CalendarEvent, CalendarInfo } from '../../lib/api';
import { formatDate } from '../../lib/dates';
import { clock, formatMinutes } from '../../lib/day';
import { clip, dragged, drawn, lanes, snapDown, type DragEdge, type Hours } from '../../lib/schedule';
import type { PlanBlock } from '../../lib/plans';
import { dayKey, type Session } from '../../lib/timer';
import { FocusMenu, type FocusHow } from './FocusMenu';
import { TaskPicker } from './TaskPicker';
import type { DayTaskRef, TaskChoice } from './types';
import { useEscape } from './useEscape';
import { useNow } from './useNow';
import type { PlansApi } from './usePlans';

/** A plan on a day: its event in Calendar, and the task it is bound to, when Epizen finds it. */
export interface GridPlan extends PlanBlock {
  task?: DayTaskRef;
  /** The task's note is this day's, so the task can be edited or timed from here. */
  here: boolean;
}

export interface Column {
  date: Date;
  /** `YYYY-MM-DD`. */
  key: string;
  /** Apple Calendar's timed events, and its all-day ones. */
  plans: GridPlan[];
  allDay: CalendarEvent[];
  tasks: DayTaskRef[];
  /** Minutes the day's note logs. */
  total: number;
}

interface Props {
  columns: Column[];
  hours: Hours;
  early: boolean;
  late: boolean;
  onFold: (edge: 'early' | 'late') => void;
  hourHeight: number;
  categories: string[];
  session?: Session;
  /** One wide day rather than a week. */
  wide?: boolean;
  /** A task line whose blocks stand out, in the day view. */
  highlight?: number;
  plans: Pick<PlansApi, 'access' | 'calendars' | 'ask'>;
  /** The calendar a plan of that category goes to, unless another is picked. */
  calendarFor: (category?: string) => CalendarInfo | undefined;
  /** Plans a task (new or the day's) from `start` to `end`, in that calendar. */
  onPlan: (date: Date, start: number, end: number, choice: TaskChoice, calendar: string) => Promise<unknown>;
  onMovePlan: (date: Date, plan: GridPlan, start: number, end: number) => Promise<unknown>;
  onDeletePlan: (plan: GridPlan) => Promise<unknown>;
  /** A focus round on a plan's task, from the right-click menu. */
  onFocus: (date: Date, item: DayTaskRef, how: FocusHow) => void;
  /** Edits a plan's task, from the right-click menu. */
  onEditTask: (date: Date, item: DayTaskRef) => void;
  /** A block's title: opens the day's page. */
  onOpenDay: (date: Date) => void;
  /** A day's name above its column. */
  onHead: (date: Date) => void;
}

type Popover =
  | { kind: 'new'; col: number; start: number; end: number; x: number; y: number }
  | { kind: 'delete-plan'; col: number; plan: GridPlan; x: number; y: number }
  | { kind: 'plan-menu'; col: number; plan: GridPlan; x: number; y: number };

const NO_FOCUS = 'Focus runs on today’s tasks: the timer logs into today’s note.';

const GUTTER = 56;
const POPOVER_WIDTH = 300;
const minuteOfDay = (time: number) => {
  const date = new Date(time);
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
};

/**
 * Days side by side, hours down: Apple Calendar's events, as Calendar and Senioro draw them. A
 * plan is drawn on empty time; events are moved, resized and deleted in place, in Calendar.
 */
export function TimeGrid(props: Props) {
  const { columns, hours, early, late, onFold, hourHeight, categories, session, wide, highlight, plans, calendarFor, onPlan, onMovePlan, onDeletePlan, onFocus, onEditTask, onOpenDay, onHead } = props;
  const body = useRef<HTMLDivElement>(null);
  const clicked = useRef(false);
  const [draft, setDraft] = useState<{ col: number; start: number; end: number; saving?: boolean }>();
  const [drag, setDrag] = useState<{ key: string; start: number; end: number }>();
  const [held, setHeld] = useState<ReadonlyMap<string, { start: number; end: number }>>(new Map());
  const [popover, setPopover] = useState<Popover>();
  const now = useNow(true, 60_000);
  const todayKey = dayKey(new Date(now));
  const nowMinute = minuteOfDay(now);

  const y = (minutes: number) => ((minutes - hours.first) / 60) * hourHeight;
  const height = y(hours.last);
  const minuteAt = (clientY: number) => {
    const top = body.current?.getBoundingClientRect().top ?? 0;
    return Math.max(hours.first, Math.min(hours.last, hours.first + ((clientY - top) / hourHeight) * 60));
  };
  /** Where a popover for that column and time sits: beside the column, inside the grid. */
  const placeAt = (col: number, start: number) => {
    const box = body.current?.getBoundingClientRect();
    const width = box?.width ?? 800;
    const column = (width - GUTTER) / Math.max(1, columns.length);
    let x = GUTTER + (col + 1) * column + 8;
    if (x + POPOVER_WIDTH > width) x = GUTTER + col * column - POPOVER_WIDTH - 8;
    if (x < 8) x = width - POPOVER_WIDTH - 16;
    return { x, y: Math.max(0, Math.min(y(start) - 8, height - 320)) };
  };
  const close = () => {
    setPopover(undefined);
    setDraft((current) => (current?.saving ? current : undefined));
  };

  // Drawing: press on empty time, drag down or up, let go; a click draws half an hour.
  const drawStart = (event: ReactPointerEvent<HTMLDivElement>, col: number) => {
    if (event.button !== 0 || (event.target as Element).closest('.cal-block, .cal-popover')) return;
    if (popover) {
      close();
      return;
    }
    event.preventDefault();
    const from = minuteAt(event.clientY);
    const y0 = event.clientY;
    let moved = false;
    setDraft({ col, ...drawn(from, from, hours) });
    const move = (e: PointerEvent) => {
      if (Math.abs(e.clientY - y0) > 4) moved = true;
      if (moved) setDraft({ col, ...drawn(from, minuteAt(e.clientY), hours) });
    };
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      let range = drawn(from, minuteAt(e.clientY), hours);
      if (!moved) {
        const start = Math.min(snapDown(from), hours.last - 30);
        range = { start, end: start + 30 };
      }
      setDraft({ col, ...range });
      setPopover({ kind: 'new', col, ...range, ...placeAt(col, range.start) });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Moving and resizing: the body moves an event, its top and bottom edges resize it. `fixed`
  // keeps one where it is: one Calendar won't let change, or one running past this day.
  const itemDown = (event: ReactPointerEvent<HTMLDivElement>, item: { key: string; start: number; end: number }, fixed: boolean, land: (next: { start: number; end: number }) => Promise<unknown>) => {
    if (event.button !== 0 || (event.target as Element).closest('.cal-block-x')) return;
    event.stopPropagation();
    if (popover) close();
    if (fixed) return;
    const edge = ((event.target as HTMLElement).dataset.edge as DragEdge | undefined) ?? 'move';
    const y0 = event.clientY;
    let moved = false;
    const at = (e: PointerEvent) => dragged(item, edge, ((e.clientY - y0) / hourHeight) * 60);
    const move = (e: PointerEvent) => {
      if (Math.abs(e.clientY - y0) > 3) moved = true;
      if (moved) setDrag({ key: item.key, ...at(e) });
    };
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(undefined);
      if (!moved) return;
      // The click that ends a drag on the title isn't a click on the title.
      clicked.current = true;
      setTimeout(() => (clicked.current = false), 0);
      const next = at(e);
      if (next.start === item.start && next.end === item.end) return;
      setHeld((prev) => new Map(prev).set(item.key, next));
      void land(next).finally(() =>
        setHeld((prev) => {
          const rest = new Map(prev);
          rest.delete(item.key);
          return rest;
        }),
      );
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const askDeletePlan = (col: number, plan: GridPlan) => setPopover({ kind: 'delete-plan', col, plan, ...placeAt(col, plan.start) });

  const save = (choice: TaskChoice, calendar: string) => {
    if (popover?.kind !== 'new') return;
    const { col, start, end } = popover;
    setPopover(undefined);
    setDraft({ col, start, end, saving: true });
    void onPlan(columns[col]?.date ?? new Date(), start, end, choice, calendar).finally(() => setDraft(undefined));
  };

  const colorOf = (id: string) => plans.calendars.find((calendar) => calendar.id === id)?.color;
  // Each event in its calendar's colour, as Calendar and Senioro draw it.
  const toneOf = (event: CalendarEvent) => colorOf(event.calendar) ?? 'var(--accent)';
  const hourMarks = Array.from({ length: (hours.last - hours.first) / 60 + 1 }, (_, i) => hours.first + i * 60);
  const foldCounts = (edge: 'early' | 'late') =>
    columns.map((col) => col.plans.filter((plan) => (edge === 'early' ? plan.start < hours.first : plan.end > hours.last)).map((plan) => ({ key: plan.key, tone: toneOf(plan.event) })));

  return (
    <div className={wide ? 'cal-grid glass rise is-day' : 'cal-grid glass rise'} style={{ '--hour': `${hourHeight}px`, '--cols': columns.length, '--gutter': `${GUTTER}px` } as CSSProperties} data-testid="cal-grid">
      <div className="cal-head">
        <span className="cal-gutter" />
        {columns.map((col) => {
          const weekend = col.date.getDay() === 0 || col.date.getDay() === 6;
          return (
            <button
              key={col.key}
              type="button"
              className={`cal-day-head${col.key === todayKey ? ' is-today' : ''}${weekend ? ' is-weekend' : ''}`}
              onClick={() => onHead(col.date)}
              title={wide ? 'Open the day’s page' : 'Show this day'}
              data-testid="cal-day-head"
              data-date={col.key}
            >
              <span className="cal-weekday">{formatDate(col.date, wide ? 'dddd' : 'ddd')}</span>
              <span className="cal-date">{col.date.getDate()}</span>
              <span className="cal-total">{col.total ? formatMinutes(col.total) : ''}</span>
            </button>
          );
        })}
      </div>

      {columns.some((col) => col.allDay.length > 0) && (
        <div className="cal-allday" data-testid="cal-allday">
          <span className="cal-allday-label">all-day</span>
          {columns.map((col) => (
            <div key={col.key} className="cal-allday-day">
              {col.allDay.map((event) => (
                <span key={`${event.id}@${event.start}`} className="cal-allday-event" style={{ '--tone': toneOf(event) } as CSSProperties} title={event.notes ? `${event.title} · ${event.notes}` : event.title}>
                  {event.title}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}

      <Fold edge="early" open={early} from={0} to={hours.first || 7 * 60} hidden={early ? [] : foldCounts('early')} onToggle={() => onFold('early')} />

      <div className="cal-body" ref={body} style={{ height }}>
        <div className="cal-hours" aria-hidden="true">
          {hourMarks.map((minute) => (
            <span key={minute} className={minute % 180 === 0 ? 'cal-hour is-third' : 'cal-hour'} style={{ top: y(minute) }}>
              {minute === 24 * 60 ? '24:00' : clock(minute)}
            </span>
          ))}
        </div>
        <div className="cal-lines" aria-hidden="true">
          {hourMarks.map((minute) => (
            <span key={minute} className={minute % 180 === 0 ? 'cal-line is-third' : 'cal-line'} style={{ top: y(minute) }} />
          ))}
        </div>
        <div className="cal-cols">
          {columns.map((col, c) => {
            const shown = col.plans.map((plan) => ({ plan, range: (drag?.key === plan.key ? drag : held.get(plan.key)) ?? plan }));
            const placed = lanes(shown.map((item) => ({ ...item, start: item.range.start, end: item.range.end })));
            return (
              <div
                key={col.key}
                className={col.key === todayKey ? 'cal-col is-today' : 'cal-col'}
                onPointerDown={(event) => drawStart(event, c)}
                data-testid="cal-col"
                data-date={col.key}
              >
                {placed.map(({ item, lane, lanes: count }) => {
                  const { plan } = item;
                  const visible = clip(item.range, hours);
                  if (!visible) return null;
                  const top = y(visible.start);
                  const tall = y(visible.end) - top;
                  const { start, end } = item.range;
                  const fixed = plan.cut || !plan.event.writable;
                  const notes = plan.event.notes?.split('\n')[0];
                  const calendar = plans.calendars.find((one) => one.id === plan.event.calendar)?.title;
                  const classes = ['cal-block'];
                  if (col.key < todayKey || (col.key === todayKey && end <= nowMinute)) classes.push('is-past');
                  if (drag?.key === plan.key) classes.push('is-dragging');
                  if (held.has(plan.key)) classes.push('is-saving');
                  if (tall < 30) classes.push('is-thin');
                  if (fixed) classes.push('is-fixed');
                  if (highlight !== undefined && plan.here && plan.task?.task.line === highlight) classes.push('is-lit');
                  return (
                    <div
                      key={plan.key}
                      className={classes.join(' ')}
                      style={{ top, height: Math.max(4, tall - 2), '--lane': lane, '--lanes': count, '--tone': toneOf(plan.event) } as CSSProperties}
                      onPointerDown={(event) => itemDown(event, plan, fixed, (next) => onMovePlan(col.date, plan, next.start, next.end))}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setPopover({ kind: 'plan-menu', col: c, plan, x: event.clientX, y: event.clientY });
                      }}
                      title={`${plan.event.title} · ${clock(start)}–${clock(end)}${notes ? ` · ${notes}` : ''}${calendar ? ` · ${calendar}` : ''}${plan.event.writable ? '' : ' · read-only'}`}
                      data-testid="cal-plan"
                      data-start={start}
                      data-end={end}
                    >
                      {!fixed && <span className="cal-edge is-top" data-edge="top" />}
                      {tall >= 16 && (
                        <span className="cal-block-head">
                          <button
                            type="button"
                            className="cal-block-title"
                            onClick={() => {
                              if (!clicked.current && plan.here) onOpenDay(col.date);
                            }}
                          >
                            {plan.event.title || 'untitled'}
                          </button>
                          <span className="cal-block-time">
                            {clock(start)}–{clock(end)}
                          </span>
                        </span>
                      )}
                      {tall >= 34 && notes && <span className="cal-block-notes">{notes}</span>}
                      {tall >= 22 && plan.event.writable && (
                        <button type="button" className="cal-block-x" aria-label="Delete this event" title="Delete this event from Calendar" onClick={() => askDeletePlan(c, plan)} data-testid="cal-plan-delete">
                          ×
                        </button>
                      )}
                      {!fixed && <span className="cal-edge is-bottom" data-edge="bottom" />}
                    </div>
                  );
                })}
                {draft?.col === c && (
                  <div className={draft.saving ? 'cal-block is-draft is-saving' : 'cal-block is-draft'} style={{ top: y(draft.start), height: Math.max(4, y(draft.end) - y(draft.start) - 2) }} data-testid="cal-draft">
                    <span className="cal-block-time">
                      {clock(draft.start)}–{clock(draft.end)}
                    </span>
                  </div>
                )}
                {col.key === todayKey && <NowLine hours={hours} hourHeight={hourHeight} />}
              </div>
            );
          })}
        </div>
        {popover?.kind === 'new' && (
          <NewPlan
            key={`${popover.col}-${popover.start}-${popover.end}`}
            at={popover}
            date={columns[popover.col]?.date ?? new Date()}
            tasks={columns[popover.col]?.tasks ?? []}
            categories={categories}
            plans={plans}
            calendarFor={calendarFor}
            onCancel={close}
            onSave={save}
          />
        )}
        {popover?.kind === 'plan-menu' && (
          <PlanMenu
            at={popover}
            plan={popover.plan}
            today={columns[popover.col]?.key === todayKey}
            running={Boolean(session)}
            onFocus={(item, how) => onFocus(columns[popover.col]?.date ?? new Date(), item, how)}
            onOpenDay={() => onOpenDay(columns[popover.col]?.date ?? new Date())}
            onEdit={(item) => onEditTask(columns[popover.col]?.date ?? new Date(), item)}
            onDelete={() => askDeletePlan(popover.col, popover.plan)}
            onClose={close}
          />
        )}
        {popover?.kind === 'delete-plan' && (
          <Confirm
            at={popover}
            label="Delete the plan"
            words={
              <>
                Delete <strong>{clock(popover.plan.start)}–{clock(popover.plan.end)}</strong> “{popover.plan.event.title}”{popover.plan.event.notes ? `, ${popover.plan.event.notes.split('\n')[0]},` : ''} from Calendar?
              </>
            }
            note={popover.plan.task ? 'The task stays in its note, with its minutes.' : 'It goes from Calendar on every device.'}
            onCancel={close}
            onConfirm={() => {
              const { plan } = popover;
              setPopover(undefined);
              void onDeletePlan(plan);
            }}
            testId="plan-delete"
          />
        )}
      </div>

      <Fold edge="late" open={late} from={hours.last === 24 * 60 ? 22 * 60 : hours.last} to={24 * 60} hidden={late ? [] : foldCounts('late')} onToggle={() => onFold('late')} />
    </div>
  );
}

/** The folded night above or below the hours: its hours, and a mark in each day for every block it hides. */
function Fold({ edge, open, from, to, hidden, onToggle }: { edge: 'early' | 'late'; open: boolean; from: number; to: number; hidden: { key: string; tone: string }[][]; onToggle: () => void }) {
  const count = hidden.reduce((sum, blocks) => sum + blocks.length, 0);
  const span = `${clock(from)}–${to === 24 * 60 ? '24:00' : clock(to)}`;
  const short = `${String(from / 60).padStart(2, '0')}–${String(to / 60).padStart(2, '0')}`;
  return (
    <button
      type="button"
      className={`cal-fold is-${edge}${open ? ' is-open' : ''}`}
      onClick={onToggle}
      title={open ? `Fold ${span} away` : `Show ${span}${count ? `: ${count} block${count === 1 ? '' : 's'}` : ''}`}
      aria-expanded={open}
      data-testid={`cal-fold-${edge}`}
    >
      <span className="cal-fold-label">
        <span className="cal-fold-chevron" aria-hidden="true" />
        {short}
      </span>
      {hidden.map((blocks, i) => (
        <span key={i} className="cal-fold-day">
          {blocks.slice(0, 4).map((block) => (
            <span key={block.key} className="cal-fold-mark" style={{ '--tone': block.tone } as CSSProperties} />
          ))}
        </span>
      ))}
    </button>
  );
}

/** A glowing line at the time now, on today's column. */
function NowLine({ hours, hourHeight }: { hours: Hours; hourHeight: number }) {
  const now = useNow(true, 30_000);
  const minute = minuteOfDay(now);
  if (minute < hours.first || minute > hours.last) return null;
  return <div className="cal-now" style={{ top: ((minute - hours.first) / 60) * hourHeight }} aria-hidden="true" data-testid="cal-now" />;
}

/**
 * A plan for the time drawn: one of the day's tasks or a new one, and the Apple Calendar it goes
 * to (the category's, unless another is picked). Without access to Calendar, it says how to give it.
 */
function NewPlan({
  at,
  date,
  tasks,
  categories,
  plans,
  calendarFor,
  onCancel,
  onSave,
}: {
  at: { x: number; y: number; start: number; end: number };
  date: Date;
  tasks: DayTaskRef[];
  categories: string[];
  plans: Pick<PlansApi, 'access' | 'calendars' | 'ask'>;
  calendarFor: (category?: string) => CalendarInfo | undefined;
  onCancel: () => void;
  onSave: (choice: TaskChoice, calendar: string) => void;
}) {
  const [choice, setChoice] = useState<TaskChoice>();
  const [picked, setPicked] = useState<string>();
  useEscape(onCancel);
  const calendar = picked ?? calendarFor(choice?.category)?.id;
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (choice && calendar) onSave(choice, calendar);
  };
  const allowed = plans.access === 'allowed';
  return (
    <form className="cal-popover glass" style={{ left: at.x, top: at.y }} onSubmit={submit} aria-label="New plan" data-testid="block-popover">
      <p className="kicker">
        {formatDate(date, 'ddd D MMM')} · {clock(at.start)}–{clock(at.end)} · {formatMinutes(at.end - at.start)}
      </p>
      {allowed ? (
        <>
          <TaskPicker tasks={tasks} categories={categories} value={choice} onChange={setChoice} onSubmit={() => submit()} autoFocus />
          <label className="plan-calendar">
            <span>Calendar</span>
            <select value={calendar ?? ''} onChange={(event) => setPicked(event.target.value)} data-testid="plan-calendar">
              {plans.calendars
                .filter((one) => one.writable)
                .map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.title}
                  </option>
                ))}
            </select>
          </label>
        </>
      ) : (
        <>
          <p className="popover-words">A plan goes to Apple Calendar: it shows here and in Calendar, and adds no minutes to the task.</p>
          <p className="popover-note">{plans.access === 'denied' ? 'Epizen isn’t allowed to use your calendars. System Settings can change that.' : 'Epizen asks once to use your calendars.'}</p>
        </>
      )}
      <div className="popover-actions">
        <button type="button" className="quiet-chip" onClick={onCancel}>
          Cancel
        </button>
        {allowed ? (
          <button type="submit" className="primary-button" disabled={!choice || !calendar} data-testid="block-save">
            Plan
          </button>
        ) : (
          <button type="button" className="primary-button" onClick={plans.ask} data-testid="plan-allow">
            {plans.access === 'denied' ? 'Open System Settings' : 'Allow Calendar'}
          </button>
        )}
      </div>
    </form>
  );
}

/** A plan's right-click menu: its task's focus and edit when the task is this day's, and deleting the event. */
function PlanMenu({
  at,
  plan,
  today,
  running,
  onFocus,
  onOpenDay,
  onEdit,
  onDelete,
  onClose,
}: {
  at: { x: number; y: number };
  plan: GridPlan;
  today: boolean;
  running: boolean;
  onFocus: (item: DayTaskRef, how: FocusHow) => void;
  onOpenDay: () => void;
  onEdit: (item: DayTaskRef) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const item = plan.here ? plan.task : undefined;
  const noFocus = !plan.task ? 'An event from Calendar, not one of your tasks.' : !item ? 'Its task is in another day’s note.' : today ? undefined : NO_FOCUS;
  return (
    <FocusMenu
      at={at}
      label={plan.event.notes?.split('\n')[0] ?? plan.event.title}
      noFocus={noFocus}
      running={running}
      onFocus={(how) => item && onFocus(item, how)}
      onOpenDay={item ? onOpenDay : undefined}
      onEdit={item ? () => onEdit(item) : undefined}
      onDelete={plan.event.writable ? onDelete : undefined}
      deleteLabel="Delete from Calendar…"
      onClose={onClose}
    />
  );
}

/** Asks before something goes: a block from its note, or a plan from Calendar. */
function Confirm({ at, label, words, note, onCancel, onConfirm, testId }: { at: { x: number; y: number }; label: string; words: ReactNode; note: string; onCancel: () => void; onConfirm: () => void; testId: string }) {
  useEscape(onCancel);
  return (
    <div className="cal-popover glass is-small" style={{ left: at.x, top: at.y }} role="alertdialog" aria-label={label} data-testid={`${testId}-popover`}>
      <p className="popover-words">{words}</p>
      <p className="popover-note">{note}</p>
      <div className="popover-actions">
        <button type="button" className="quiet-chip" onClick={onCancel} autoFocus>
          Keep
        </button>
        <button type="button" className="primary-button" onClick={onConfirm} data-testid={`${testId}-confirm`}>
          Delete
        </button>
      </div>
    </div>
  );
}
