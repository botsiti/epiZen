import { LAST_MINUTE } from './timeblocks';

// How the calendar lays a day's events out: side by side where they overlap, cut to the hours on
// show, and where a drag or a resize lands them.

const DAY_END = 24 * 60;

export interface Placed<T> {
  item: T;
  /** Which of `lanes` side-by-side places it takes, from 0. */
  lane: number;
  lanes: number;
}

/**
 * Overlapping blocks side by side: each takes the first lane free at its start, and every block
 * in a run of overlaps shares that run's number of lanes, so they line up.
 */
export function lanes<T extends { start: number; end: number }>(items: T[]): Placed<T>[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const placed: Placed<T>[] = [];
  let group: Placed<T>[] = [];
  let ends: number[] = [];
  let groupEnd = -Infinity;
  const close = () => {
    for (const entry of group) entry.lanes = ends.length;
    group = [];
    ends = [];
  };
  for (const item of sorted) {
    // A block that starts after the run so far has ended begins a new run.
    if (item.start >= groupEnd) close();
    groupEnd = group.length ? Math.max(groupEnd, item.end) : item.end;
    let lane = ends.findIndex((end) => end <= item.start);
    if (lane < 0) lane = ends.length;
    ends[lane] = item.end;
    const entry = { item, lane, lanes: 1 };
    group.push(entry);
    placed.push(entry);
  }
  close();
  return placed;
}

/** The hours on show: 07–22 by default, with the night before and after folded away. */
export interface Hours {
  first: number;
  last: number;
}

export const DEFAULT_HOURS: Hours = { first: 7 * 60, last: 22 * 60 };

export function calendarHours(value: unknown): Hours {
  if (typeof value !== 'object' || value === null) return DEFAULT_HOURS;
  const { first, last } = value as Partial<Hours>;
  if (typeof first !== 'number' || typeof last !== 'number' || !Number.isInteger(first / 60)
      || !Number.isInteger(last / 60) || first < 0 || last > DAY_END || first >= last) return DEFAULT_HOURS;
  return { first, last };
}

export const shownHours = (early: boolean, late: boolean, bounds = DEFAULT_HOURS): Hours =>
  ({ first: early ? 0 : bounds.first, last: late ? DAY_END : bounds.last });

export const calendarHourLabel = (minute: number) => `${String(minute / 60).padStart(2, '0')}:00`;

/** The part of a block inside the hours on show, or `undefined` when it is all in a fold. */
export function clip(block: { start: number; end: number }, hours: Hours): { start: number; end: number } | undefined {
  const start = Math.max(block.start, hours.first);
  const end = Math.min(block.end, hours.last);
  return end > start ? { start, end } : undefined;
}

/** Minutes down to a 15-minute mark, and to the nearest one. */
export const snapDown = (minutes: number, step = 15) => Math.floor(minutes / step) * step;
export const snapNear = (minutes: number, step = 15) => Math.round(minutes / step) * step;

/**
 * The block a drag across empty time draws, between where it began and where it is now:
 * from the 15-minute mark at or before the earlier point to the nearest one after the later,
 * at least 15 minutes, inside the hours on show.
 */
export function drawn(from: number, to: number, hours: Hours): { start: number; end: number } {
  const low = Math.min(from, to);
  const high = Math.max(from, to);
  const start = Math.max(hours.first, Math.min(snapDown(low), hours.last - 15));
  const end = Math.min(hours.last, Math.max(start + 15, snapNear(high)));
  return { start, end };
}

export type DragEdge = 'move' | 'top' | 'bottom';

/**
 * Where a block lands after its body or an edge was dragged by `delta` minutes. The drag goes
 * in steps of 15 minutes, so a slip of the hand changes nothing and a block keeps its own
 * minutes (10:56 moves to 11:11). A moved block keeps its length; a resized one stays at
 * least 15 minutes (or as short as it was). Both stay inside the day.
 */
export function dragged(block: { start: number; end: number }, edge: DragEdge, delta: number): { start: number; end: number } {
  const step = snapNear(delta);
  const length = block.end - block.start;
  const least = Math.min(15, length);
  if (edge === 'move') {
    const start = Math.max(0, Math.min(block.start + step, LAST_MINUTE - length));
    return { start, end: start + length };
  }
  if (edge === 'top') return { start: Math.max(0, Math.min(block.start + step, block.end - least)), end: block.end };
  return { start: block.start, end: Math.min(LAST_MINUTE, Math.max(block.end + step, block.start + least)) };
}
