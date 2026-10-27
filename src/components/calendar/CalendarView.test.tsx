import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { addDays, sameDay, startOfWeek, today } from '../../lib/dates';
import { parseDay } from '../../lib/day';
import type { DayEntry } from '../../lib/rollup';
import { addBlock, addTaskWithBlock, deleteBlock, moveBlock } from '../../lib/timeblocks';
import { dayKey, initialTimer } from '../../lib/timer';
import { CalendarView } from './CalendarView';
import type { TimerApi } from './useTimer';

beforeAll(() => {
  document.documentElement.dataset.motion = 'off';
});

// A day of last week, so it is never today.
const DAY = addDays(startOfWeek(today()), -5);
const TEXT = `### Tasks
- [ ] #daily/code — refactor the settings screen [minutes::58]
    - 09:26–10:24
- [x] #daily/sport — gym [minutes::30]
    - 12:30–13:00
`;
const dayOf = (date: Date): DayEntry => (sameDay(date, DAY) ? { date, path: 'day.md', day: parseDay(TEXT) } : { date });
const textOf = (path: string) => (path === 'day.md' ? TEXT : undefined);
const timer = (): TimerApi => ({
  state: initialTimer(),
  failures: new Map(),
  start: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  stop: vi.fn(),
  startRest: vi.fn(),
  endRest: vi.fn(),
  setRest: vi.fn(),
  setPrefs: vi.fn(),
  retry: vi.fn(),
  retryAll: vi.fn(),
  discard: vi.fn(),
});

// jsdom lays nothing out: the grid's top is at 0, so a time's place is its minutes past 07:00.
const HOUR = 44;
const y = (h: number, m = 0) => ((h * 60 + m - 7 * 60) / 60) * HOUR;

function setup() {
  const onWrite = vi.fn<(date: Date, edit: (text: string) => string, failed: string) => Promise<void>>(() => Promise.resolve());
  const onStartTimer = vi.fn();
  const onOpenDay = vi.fn();
  render(<CalendarView dayOf={dayOf} textOf={textOf} categories={['code', 'sport', 'book']} timer={timer()} onStartTimer={onStartTimer} onOpenDay={onOpenDay} onWrite={onWrite} />);
  // The calendar remembers where it was; start from this week and go back one.
  const back = screen.queryByTestId('cal-today');
  if (back) fireEvent.click(back);
  fireEvent.click(screen.getByTestId('cal-prev'));
  const column = document.querySelector<HTMLElement>(`[data-testid="cal-col"][data-date="${dayKey(DAY)}"]`);
  if (!column) throw new Error('no column for the day');
  /** The edit the last write asked for, run on the day's text. */
  const written = () => {
    const call = onWrite.mock.calls.at(-1);
    expect(call?.[0]).toEqual(DAY);
    return call?.[1](TEXT);
  };
  return { onWrite, onStartTimer, onOpenDay, column, written };
}

describe('the calendar', () => {
  it('shows the week with each day’s blocks, coloured by category', () => {
    const { column } = setup();
    expect(screen.getAllByTestId('cal-day-head')).toHaveLength(7);
    const blocks = within(column).getAllByTestId('cal-block');
    expect(blocks.map((block) => block.textContent)).toEqual([expect.stringContaining('refactor the settings screen'), expect.stringContaining('gym')]);
    expect(blocks[0]?.style.getPropertyValue('--tone')).toBe('#6fa5e6');
    expect(screen.getByTestId('cal-view')).toHaveTextContent('1h 28m logged in 2 blocks');
  });

  it('draws a block and writes it under the task picked', async () => {
    const { column, written } = setup();
    fireEvent.pointerDown(column, { button: 0, clientY: y(19, 5) });
    fireEvent.pointerMove(window, { clientY: y(20, 0) });
    fireEvent.pointerUp(window, { clientY: y(20, 0) });
    const popover = screen.getByTestId('block-popover');
    expect(popover).toHaveTextContent('19:00–20:00');
    await userEvent.click(within(popover).getAllByTestId('pick-task')[0]!);
    await userEvent.click(within(popover).getByTestId('block-save'));
    expect(written()).toBe(addBlock(TEXT, { line: 1, text: '- [ ] #daily/code — refactor the settings screen [minutes::58]' }, 19 * 60, 20 * 60));
  });

  it('draws half an hour on a click, and adds a new task with the block', async () => {
    const { column, written } = setup();
    fireEvent.pointerDown(column, { button: 0, clientY: y(18, 10) });
    fireEvent.pointerUp(window, { clientY: y(18, 10) });
    const popover = screen.getByTestId('block-popover');
    expect(popover).toHaveTextContent('18:00–18:30');
    await userEvent.type(within(popover).getByTestId('pick-new'), 'evening run');
    await userEvent.click(within(popover).getByRole('radio', { name: 'sport' }));
    await userEvent.click(within(popover).getByTestId('block-save'));
    expect(written()).toBe(addTaskWithBlock(TEXT, 'sport', 'evening run', 18 * 60, 18 * 60 + 30));
  });

  it('moves a block by dragging it, in 15-minute steps', () => {
    const { column, written } = setup();
    const block = within(column).getAllByTestId('cal-block')[0]!;
    fireEvent.pointerDown(block, { button: 0, clientY: y(10) });
    fireEvent.pointerMove(window, { clientY: y(11) });
    fireEvent.pointerUp(window, { clientY: y(11) });
    const ref = (line: number) => ({ line, text: TEXT.split('\n')[line] ?? '' });
    expect(written()).toBe(moveBlock(TEXT, ref(1), ref(2), 10 * 60 + 26, 11 * 60 + 24));
  });

  it('deletes a block after asking once, and opens the day from a title', async () => {
    const { column, written, onWrite, onOpenDay } = setup();
    await userEvent.click(within(column).getAllByTestId('cal-block-delete')[1]!);
    expect(onWrite).not.toHaveBeenCalled();
    expect(screen.getByTestId('delete-popover')).toHaveTextContent('Delete 12:30–13:00 from “gym”?');
    await userEvent.click(screen.getByTestId('block-delete-confirm'));
    const ref = (line: number) => ({ line, text: TEXT.split('\n')[line] ?? '' });
    expect(written()).toBe(deleteBlock(TEXT, ref(3), ref(4)));
    await userEvent.click(within(column).getByRole('button', { name: 'gym' }));
    expect(onOpenDay).toHaveBeenCalledWith(DAY);
  });

  it('starts the timer on a new task for today', async () => {
    const { onStartTimer } = setup();
    await userEvent.click(screen.getByTestId('timer-start'));
    const setup_ = screen.getByTestId('timer-setup');
    await userEvent.type(within(setup_).getByTestId('pick-new'), 'deep work');
    await userEvent.click(within(setup_).getByRole('radio', { name: 'book' }));
    await userEvent.click(within(setup_).getByTestId('timer-go'));
    expect(onStartTimer).toHaveBeenCalledWith({ kind: 'new', category: 'book', words: 'deep work' });
  });

  it('shows a day with its tasks beside it', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^\\w+${DAY.getDate()}`) }));
    expect(screen.getByTestId('cal-view')).toHaveAttribute('data-mode', 'day');
    const side = screen.getByTestId('cal-day-tasks');
    expect(within(side).getAllByTestId('cal-day-task').map((row) => row.textContent)).toEqual([expect.stringContaining('58m'), expect.stringContaining('30m')]);
    await userEvent.click(screen.getByTestId('cal-mode-week'));
  });
});
