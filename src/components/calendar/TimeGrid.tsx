import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import type { CalendarEvent, CalendarInfo } from '../../lib/api';
import { formatDate } from '../../lib/dates';
import { clock, formatMinutes } from '../../lib/day';
import { clip, dragged, drawn, lanes, snapDown, type DragEdge, type Hours } from '../../lib/schedule';
import { planText, type PlanBlock } from '../../lib/plans';
import { dayKey, type Session } from '../../lib/timer';
import { FocusMenu, type FocusHow } from './FocusMenu';
import { TaskPicker } from './TaskPicker';
import type { DayTaskRef, TaskChoice } from './types';
import { useEscape } from './useEscape';
import { calendarMoment } from '../../lib/calendarZone';
import type { PlansApi } from './usePlans';

/** A plan on a day: its event in Calendar, and the task it is bound to, when Epizen finds it. */
export interface GridPlan extends PlanBlock {
  task?: DayTaskRef;
  /** The task's note is this day's, so the task can be timed from here. */
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
  zone: string;
  now: number;
  focusEnabled?: boolean;
  columns: Column[];
  hours: Hours;
  early: boolean;
  late: boolean;
  onFold: (edge: 'early' | 'late') => void;
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
  onMovePlan: (date: Date, plan: GridPlan, start: number, end: number, edge: DragEdge) => Promise<unknown>;
  onDeletePlan: (plan: GridPlan) => Promise<unknown>;
  /** A focus round on a plan's task, from the right-click menu. */
  onFocus: (date: Date, item: DayTaskRef, how: FocusHow) => void;
  onEditPlan: (plan: GridPlan) => void;
  /** A block's title: opens the day's page. */
  onOpenDay: (date: Date) => void;
  onOpenLinkedNote?: (path: string) => void;
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
const MIN_HOUR_HEIGHT = 28;
const MIN_EVENT_HEIGHT = 16;

const wordsOf = (plan: GridPlan) => plan.task
  ? planText(plan.task.task.category?.name, plan.task.task.label)
  : plan.event;

/**
 * Days side by side, hours down: Apple Calendar's events, as Calendar and Senioro draw them. A
 * plan is drawn on empty time; events are moved, resized and deleted in place, in Calendar.
 */
export function TimeGrid(props: Props) {
  const { columns, hours, early, late, onFold, categories, session, wide, highlight, plans, calendarFor, onPlan, onMovePlan, onDeletePlan, onFocus, onEditPlan, onOpenDay, onHead } = props;
  const body = useRef<HTMLDivElement>(null);
  const [measuredHeight, setMeasuredHeight] = useState(0);
  useLayoutEffect(() => {
    const element = body.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    setMeasuredHeight(element.clientHeight);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setMeasuredHeight(entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const clicked = useRef(false);
  const endGesture = useRef<() => void>(undefined);
  useEffect(() => () => endGesture.current?.(), []);
  const trackGesture = (move: (event: PointerEvent) => void, finish: (event: PointerEvent) => void) => {
    endGesture.current?.();
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      endGesture.current = undefined;
    };
    const up = (event: PointerEvent) => { stop(); finish(event); };
    const cancel = () => { stop(); setDraft(undefined); setDrag(undefined); };
    endGesture.current = stop;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };
  const [draft, setDraft] = useState<{ col: number; start: number; end: number; saving?: boolean }>();
  const [drag, setDrag] = useState<{ key: string; start: number; end: number }>();
  const [held, setHeld] = useState<ReadonlyMap<string, { start: number; end: number }>>(new Map());
  const [popover, setPopover] = useState<Popover>();
  const now = calendarMoment(props.now, props.zone);
  const todayKey = now.toPlainDate().toString();
  const timerDayKey = dayKey(new Date(props.now));
  const nowMinute = now.hour * 60 + now.minute + now.second / 60;

  const hourCount = (hours.last - hours.first) / 60;
  const hourHeight = measuredHeight ? Math.max(MIN_HOUR_HEIGHT, measuredHeight / hourCount) : wide ? 52 : 44;
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
      let range = drawn(from, minuteAt(e.clientY), hours);
      if (!moved) {
        const start = Math.min(snapDown(from), hours.last - 30);
        range = { start, end: start + 30 };
      }
      setDraft({ col, ...range });
      setPopover({ kind: 'new', col, ...range, ...placeAt(col, range.start) });
    };
    trackGesture(move, up);
  };

  // Moving and resizing: the body moves an event, its top and bottom edges resize it. `fixed`
  // keeps one where it is: one Calendar won't let change, or one running past this day.
  const itemDown = (event: ReactPointerEvent<HTMLDivElement>, item: { key: string; start: number; end: number }, fixed: boolean, land: (next: { start: number; end: number }, edge: DragEdge) => Promise<unknown>) => {
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
      setDrag(undefined);
      if (!moved) return;
      // The click that ends a drag on the title isn't a click on the title.
      clicked.current = true;
      setTimeout(() => (clicked.current = false), 0);
      const next = at(e);
      if (next.start === item.start && next.end === item.end) return;
      setHeld((prev) => new Map(prev).set(item.key, next));
      void land(next, edge).finally(() =>
        setHeld((prev) => {
          const rest = new Map(prev);
          rest.delete(item.key);
          return rest;
        }),
      );
    };
    trackGesture(move, up);
  };

  const openLinkedDay = (col: number, plan: GridPlan) => {
    if (plan.task && plan.link && props.onOpenLinkedNote) props.onOpenLinkedNote(plan.link.note);
    else if (plan.here && columns[col]) onOpenDay(columns[col].date);
  };
  const openEditor = (plan: GridPlan) => {
    if (clicked.current || held.has(plan.key) || (!plan.task && !plan.event.writable)) return;
    close();
    onEditPlan(plan);
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
  const hourMarks = Array.from({ length: hourCount + 1 }, (_, i) => hours.first + i * 60);
  const foldCounts = (edge: 'early' | 'late') =>
    columns.map((col) => col.plans.filter((plan) => (edge === 'early' ? plan.start < hours.first : plan.end > hours.last)).map((plan) => ({ key: plan.key, tone: toneOf(plan.event) })));

  return (
    <div className={wide ? 'cal-grid is-day' : 'cal-grid'} style={{ '--cols': columns.length, '--gutter': `${GUTTER}px` } as CSSProperties} data-testid="cal-grid">
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

      <div className="cal-body" ref={body} style={{ minHeight: hourCount * MIN_HOUR_HEIGHT }}>
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
            // Place by the visible footprint so two short, adjacent labels both stay reachable.
            const placed = lanes(col.plans.flatMap((plan) => {
              const range = (drag?.key === plan.key ? drag : held.get(plan.key)) ?? plan;
              const visible = clip(range, hours);
              if (!visible) return [];
              const start = Math.min(y(visible.start), height - MIN_EVENT_HEIGHT);
              const end = Math.max(y(visible.end), start + MIN_EVENT_HEIGHT);
              return [{ plan, range, start, end }];
            }));
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
                  const top = item.start;
                  const tall = item.end - top;
                  const { start, end } = item.range;
                  const fixed = plan.cut || !plan.event.writable;
                  const words = wordsOf(plan);
                  const notes = words.notes?.split('\n')[0];
                  const calendar = plans.calendars.find((one) => one.id === plan.event.calendar)?.title;
                  const classes = ['cal-block'];
                  if (plan.event.end <= props.now) classes.push('is-past');
                  if (drag?.key === plan.key) classes.push('is-dragging');
                  if (held.has(plan.key)) classes.push('is-saving');
                  if (tall < 40) classes.push('is-thin');
                  if (plan.task?.task.done) classes.push('is-complete');
                  if (fixed) classes.push('is-fixed');
                  if (highlight !== undefined && plan.here && plan.task?.task.line === highlight) classes.push('is-lit');
                  return (
                    <div
                      key={plan.key}
                      className={classes.join(' ')}
                      style={{ top, height: tall - 1, '--lane': lane, '--lanes': count, '--tone': toneOf(plan.event) } as CSSProperties}
                      onPointerDown={(event) => itemDown(event, plan, fixed, (next, edge) => onMovePlan(col.date, plan, next.start, next.end, edge))}
                      onDoubleClick={(event) => {
                        if (!(event.target as Element).closest('.cal-block-x')) openEditor(plan);
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setPopover({ kind: 'plan-menu', col: c, plan, x: event.clientX, y: event.clientY });
                      }}
                      title={`${words.title} · ${clock(start)}–${clock(end)}${notes ? ` · ${notes}` : ''}${calendar ? ` · ${calendar}` : ''}${plan.event.writable ? '' : ' · read-only'}`}
                      data-testid="cal-plan"
                      data-start={start}
                      data-end={end}
                    >
                      {!fixed && <span className="cal-edge is-top" data-edge="top" />}
                      <span className="cal-block-head">
                        <button
                          type="button"
                          className="cal-block-title"
                          onClick={(event) => { if (event.detail === 0) openEditor(plan); }}
                        >
                          {plan.task?.task.done && <span aria-label="Completed" role="img">✓ </span>}
                          {words.title || 'untitled'}
                        </button>
                        <span className="cal-block-time">
                          {clock(start)}–{clock(end)}
                        </span>
                      </span>
                      {tall >= 28 && notes && <span className="cal-block-notes">{notes}</span>}
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
                {col.key === todayKey && <NowLine minute={nowMinute} hours={hours} hourHeight={hourHeight} />}
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
            focusEnabled={props.focusEnabled}
            at={popover}
            plan={popover.plan}
            today={columns[popover.col]?.key === timerDayKey}
            running={Boolean(session)}
            onFocus={(item, how) => onFocus(columns[popover.col]?.date ?? new Date(), item, how)}
            onOpenDay={popover.plan.here || (popover.plan.task && props.onOpenLinkedNote) ? () => openLinkedDay(popover.col, popover.plan) : undefined}
            onEdit={() => openEditor(popover.plan)}
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
                Delete <strong>{clock(popover.plan.start)}–{clock(popover.plan.end)}</strong> “{wordsOf(popover.plan).title}”{wordsOf(popover.plan).notes ? `, ${wordsOf(popover.plan).notes?.split('\n')[0]},` : ''} from Calendar?
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
          {blocks.length > 4 && <span className="cal-fold-more">+{blocks.length - 4}</span>}
        </span>
      ))}
    </button>
  );
}

/** A glowing line at the time now, on today's column. */
function NowLine({ hours, hourHeight, minute }: { hours: Hours; hourHeight: number; minute: number }) {
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

/** A plan's right-click menu, with focus restricted to tasks from the current day. */
function PlanMenu({
  focusEnabled,
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
  focusEnabled?: boolean;
  at: { x: number; y: number };
  plan: GridPlan;
  today: boolean;
  running: boolean;
  onFocus: (item: DayTaskRef, how: FocusHow) => void;
  onOpenDay?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const item = plan.here ? plan.task : undefined;
  const words = wordsOf(plan);
  const noFocus = !plan.task ? 'An event from Calendar, not one of your tasks.' : !item ? 'Its task is in another day’s note.' : today ? undefined : NO_FOCUS;
  return (
    <FocusMenu
      focusEnabled={focusEnabled}
      at={at}
      label={words.notes?.split('\n')[0] ?? words.title}
      noFocus={noFocus}
      running={running}
      onFocus={(how) => item && onFocus(item, how)}
      onOpenDay={onOpenDay}
      onEdit={plan.task || plan.event.writable ? onEdit : undefined}
      editLabel={plan.task ? undefined : 'Edit event…'}
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
