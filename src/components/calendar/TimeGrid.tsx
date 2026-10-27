import { useRef, useState, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { category } from '../../lib/categories';
import { formatDate } from '../../lib/dates';
import { clock, formatMinutes } from '../../lib/day';
import { clip, dragged, drawn, lanes, snapDown, type DragEdge, type GridBlock, type Hours } from '../../lib/schedule';
import { dayKey, openStretch, type Session } from '../../lib/timer';
import { TaskPicker } from './TaskPicker';
import type { DayTaskRef, TaskChoice } from './types';
import { useEscape } from './useEscape';
import { useNow } from './useNow';

export interface Column {
  date: Date;
  /** `YYYY-MM-DD`. */
  key: string;
  blocks: GridBlock[];
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
  onAdd: (date: Date, start: number, end: number, choice: TaskChoice) => Promise<void>;
  onMove: (date: Date, block: GridBlock, start: number, end: number) => Promise<void>;
  onDelete: (date: Date, block: GridBlock) => Promise<void>;
  /** A block's title: opens the day's page. */
  onOpenDay: (date: Date) => void;
  /** A day's name above its column. */
  onHead: (date: Date) => void;
}

type Popover =
  | { kind: 'new'; col: number; start: number; end: number; x: number; y: number }
  | { kind: 'delete'; col: number; block: GridBlock; x: number; y: number };

const GUTTER = 56;
const POPOVER_WIDTH = 300;
const minuteOfDay = (time: number) => {
  const date = new Date(time);
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
};

/** Days side by side, hours down: the time blocks of each, drawn, moved, resized and deleted in place. */
export function TimeGrid(props: Props) {
  const { columns, hours, early, late, onFold, hourHeight, categories, session, wide, highlight, onAdd, onMove, onDelete, onOpenDay, onHead } = props;
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

  // Moving and resizing: the body moves the block, its top and bottom edges resize it.
  const blockDown = (event: ReactPointerEvent<HTMLDivElement>, col: number, block: GridBlock) => {
    if (event.button !== 0 || (event.target as Element).closest('.cal-block-x')) return;
    event.stopPropagation();
    if (popover) close();
    // A block that runs past midnight can't be said inside one day: it stays where it is.
    if (block.realEnd > 24 * 60) return;
    const edge = ((event.target as HTMLElement).dataset.edge as DragEdge | undefined) ?? 'move';
    const y0 = event.clientY;
    let moved = false;
    const land = (e: PointerEvent) => dragged(block, edge, ((e.clientY - y0) / hourHeight) * 60);
    const move = (e: PointerEvent) => {
      if (Math.abs(e.clientY - y0) > 3) moved = true;
      if (moved) setDrag({ key: block.key, ...land(e) });
    };
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(undefined);
      if (!moved) return;
      // The click that ends a drag on the title isn't a click on the title.
      clicked.current = true;
      setTimeout(() => (clicked.current = false), 0);
      const next = land(e);
      if (next.start === block.start && next.end === block.end) return;
      setHeld((prev) => new Map(prev).set(block.key, next));
      void onMove(columns[col]?.date ?? new Date(), block, next.start, next.end).finally(() =>
        setHeld((prev) => {
          const rest = new Map(prev);
          rest.delete(block.key);
          return rest;
        }),
      );
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const askDelete = (col: number, block: GridBlock) => setPopover({ kind: 'delete', col, block, ...placeAt(col, block.start) });

  const save = (choice: TaskChoice) => {
    if (popover?.kind !== 'new') return;
    const { col, start, end } = popover;
    setPopover(undefined);
    setDraft({ col, start, end, saving: true });
    void onAdd(columns[col]?.date ?? new Date(), start, end, choice).finally(() => setDraft(undefined));
  };

  const hourMarks = Array.from({ length: (hours.last - hours.first) / 60 + 1 }, (_, i) => hours.first + i * 60);
  const foldCounts = (edge: 'early' | 'late') => columns.map((col) => col.blocks.filter((block) => (edge === 'early' ? block.start < hours.first : block.end > hours.last)));

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
            const shown = col.blocks.map((block) => ({ block, range: (drag?.key === block.key ? drag : held.get(block.key)) ?? block }));
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
                  const { block, range } = item;
                  const visible = clip(range, hours);
                  if (!visible) return null;
                  const top = y(visible.start);
                  const tall = y(visible.end) - top;
                  const past = col.key < todayKey || (col.key === todayKey && range.end <= nowMinute);
                  const tone = block.task.category?.color ?? category('other').color;
                  const classes = ['cal-block'];
                  if (past) classes.push('is-past');
                  if (drag?.key === block.key) classes.push('is-dragging');
                  if (held.has(block.key)) classes.push('is-saving');
                  if (highlight !== undefined && block.task.line === highlight) classes.push('is-lit');
                  if (tall < 30) classes.push('is-thin');
                  const overnight = block.realEnd > 24 * 60;
                  if (overnight) classes.push('is-fixed');
                  return (
                    <div
                      key={block.key}
                      className={classes.join(' ')}
                      style={{ top, height: Math.max(4, tall - 2), '--lane': lane, '--lanes': count, '--tone': tone } as CSSProperties}
                      onPointerDown={(event) => blockDown(event, c, block)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        askDelete(c, block);
                      }}
                      title={`${clock(range.start)}–${clock(overnight ? block.realEnd : range.end)} · ${block.task.label}${block.task.category ? ` · ${block.task.category.name}` : ''}${overnight ? ' · runs past midnight, so it is changed in the note' : ''}`}
                      data-testid="cal-block"
                      data-start={range.start}
                      data-end={range.end}
                    >
                      {!overnight && <span className="cal-edge is-top" data-edge="top" />}
                      {tall >= 16 && (
                        <button
                          type="button"
                          className="cal-block-title"
                          onClick={() => {
                            if (!clicked.current) onOpenDay(col.date);
                          }}
                        >
                          {block.task.label || 'untitled'}
                        </button>
                      )}
                      {tall >= 40 && (
                        <span className="cal-block-time">
                          {clock(range.start)}–{clock(range.end)}
                          {wide && block.task.category ? <span className="cal-block-cat"> · {block.task.category.name}</span> : null}
                        </span>
                      )}
                      {tall >= 22 && (
                        <button type="button" className="cal-block-x" aria-label="Delete this block" title="Delete this block" onClick={() => askDelete(c, block)} data-testid="cal-block-delete">
                          ×
                        </button>
                      )}
                      {!overnight && <span className="cal-edge is-bottom" data-edge="bottom" />}
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
                {session && <LiveBlock session={session} dayKey={col.key} hours={hours} hourHeight={hourHeight} />}
                {col.key === todayKey && <NowLine hours={hours} hourHeight={hourHeight} />}
              </div>
            );
          })}
        </div>
        {popover?.kind === 'new' && (
          <NewBlock
            key={`${popover.col}-${popover.start}-${popover.end}`}
            at={popover}
            date={columns[popover.col]?.date ?? new Date()}
            tasks={columns[popover.col]?.tasks ?? []}
            categories={categories}
            onCancel={close}
            onSave={save}
          />
        )}
        {popover?.kind === 'delete' && (
          <ConfirmDelete
            at={popover}
            block={popover.block}
            onCancel={close}
            onConfirm={() => {
              const { col, block } = popover;
              setPopover(undefined);
              void onDelete(columns[col]?.date ?? new Date(), block);
            }}
          />
        )}
      </div>

      <Fold edge="late" open={late} from={hours.last === 24 * 60 ? 22 * 60 : hours.last} to={24 * 60} hidden={late ? [] : foldCounts('late')} onToggle={() => onFold('late')} />
    </div>
  );
}

/** The folded night above or below the hours: its hours, and a mark in each day for every block it hides. */
function Fold({ edge, open, from, to, hidden, onToggle }: { edge: 'early' | 'late'; open: boolean; from: number; to: number; hidden: GridBlock[][]; onToggle: () => void }) {
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
            <span key={block.key} className="cal-fold-mark" style={{ '--tone': block.task.category?.color ?? 'var(--accent)' } as CSSProperties} />
          ))}
        </span>
      ))}
    </button>
  );
}

/** The session's open stretch, growing on its day's column. */
function LiveBlock({ session, dayKey: key, hours, hourHeight }: { session: Session; dayKey: string; hours: Hours; hourHeight: number }) {
  const now = useNow(session.pausedAt === undefined, 5000);
  const stretch = openStretch(session, now);
  if (stretch.day !== key) return null;
  const shown = clip({ start: stretch.start, end: Math.max(stretch.end, stretch.start + 1) }, hours);
  if (!shown) return null;
  const top = ((shown.start - hours.first) / 60) * hourHeight;
  const tall = Math.max(8, ((shown.end - shown.start) / 60) * hourHeight - 2);
  const tone = session.task.category ? category(session.task.category).color : 'var(--accent)';
  return (
    <div className={session.pausedAt === undefined ? 'cal-block is-live' : 'cal-block is-live is-paused'} style={{ top, height: tall, '--tone': tone } as CSSProperties} data-testid="cal-live" aria-label={`Now: ${session.task.label}`}>
      {tall >= 16 && <span className="cal-block-title">{session.task.label}</span>}
      {tall >= 40 && (
        <span className="cal-block-time">
          {clock(stretch.start)}–{session.pausedAt === undefined ? 'now' : clock(stretch.end)}
        </span>
      )}
    </div>
  );
}

/** A glowing line at the time now, on today's column. */
function NowLine({ hours, hourHeight }: { hours: Hours; hourHeight: number }) {
  const now = useNow(true, 30_000);
  const minute = minuteOfDay(now);
  if (minute < hours.first || minute > hours.last) return null;
  return <div className="cal-now" style={{ top: ((minute - hours.first) / 60) * hourHeight }} aria-hidden="true" data-testid="cal-now" />;
}

function NewBlock({ at, date, tasks, categories, onCancel, onSave }: { at: { x: number; y: number; start: number; end: number }; date: Date; tasks: DayTaskRef[]; categories: string[]; onCancel: () => void; onSave: (choice: TaskChoice) => void }) {
  const [choice, setChoice] = useState<TaskChoice>();
  useEscape(onCancel);
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (choice) onSave(choice);
  };
  return (
    <form
      className="cal-popover glass"
      style={{ left: at.x, top: at.y }}
      onSubmit={submit}
      aria-label="New time block"
      data-testid="block-popover"
    >
      <p className="kicker">
        {formatDate(date, 'ddd D MMM')} · {clock(at.start)}–{clock(at.end)} · {formatMinutes(at.end - at.start)}
      </p>
      <TaskPicker tasks={tasks} categories={categories} value={choice} onChange={setChoice} onSubmit={() => submit()} autoFocus />
      <div className="popover-actions">
        <button type="button" className="quiet-chip" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary-button" disabled={!choice} data-testid="block-save">
          Save
        </button>
      </div>
    </form>
  );
}

function ConfirmDelete({ at, block, onCancel, onConfirm }: { at: { x: number; y: number }; block: GridBlock; onCancel: () => void; onConfirm: () => void }) {
  const length = block.realEnd - block.start;
  useEscape(onCancel);
  return (
    <div className="cal-popover glass is-small" style={{ left: at.x, top: at.y }} role="alertdialog" aria-label="Delete the block" data-testid="delete-popover">
      <p className="popover-words">
        Delete <strong>
          {clock(block.start)}–{clock(block.realEnd)}
        </strong>{' '}
        from “{block.task.label}”?
      </p>
      <p className="popover-note">{block.task.minutes ? `Its line goes, and ${formatMinutes(length)} come off the task’s minutes.` : 'Its line goes from the note.'}</p>
      <div className="popover-actions">
        <button type="button" className="quiet-chip" onClick={onCancel} autoFocus>
          Keep
        </button>
        <button type="button" className="primary-button" onClick={onConfirm} data-testid="block-delete-confirm">
          Delete
        </button>
      </div>
    </div>
  );
}
