import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { parseDay } from '../lib/day';
import { initialTimer, pause, start, startRest, type TimerState } from '../lib/timer';
import { panelView } from '../lib/tray';
import { TrayPanel } from './TrayPanel';

// Two tasks of demo-vault/Calendar/2026/days 2026/01.09.2026.md, as they are.
const TEXT = `### Tasks
- [x] #daily/code — refactor the settings screen [minutes::30]
    - 12:12–12:42
- [ ] #daily/kaizen — draft the weekly review [minutes::33]
    - 13:02–13:35
`;
const PATH = 'Calendar/2026/days 2026/01.09.2026.md';
const AT = new Date(2026, 8, 1, 14, 30).getTime();
const REVIEW = { path: PATH, day: '2026-09-01', line: 3, label: 'draft the weekly review', category: 'kaizen' };

function setup(timer: TimerState = initialTimer(), now = AT) {
  const view = panelView({ vault: 'demo', today: new Date(2026, 8, 1), path: PATH, text: TEXT, day: parseDay(TEXT), timer, unwritten: 0 });
  const send = vi.fn();
  const onOpen = vi.fn();
  const onQuit = vi.fn();
  render(<TrayPanel view={view} now={now} send={send} onOpen={onOpen} onQuit={onQuit} />);
  return { send, onOpen, onQuit, user: userEvent.setup() };
}

const cards = () => screen.getAllByTestId('tray-task');

describe('the menu bar’s panel', () => {
  it('shows today, the day gone, the day’s focus and today’s tasks', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByText('Tuesday, 1 September')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '14:30, 60% of the day gone' })).toBeInTheDocument();
    expect(screen.getByText('1h 3m')).toBeInTheDocument();
    expect(screen.getByTestId('tray-now')).toHaveAttribute('data-state', 'idle');
    expect(screen.getByText('Nothing running')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 done')).toBeInTheDocument();
    expect(cards().map((card) => card.querySelector('.tray-task-label')?.textContent)).toEqual(['refactor the settings screen', 'draft the weekly review']);
    // A done task takes no round.
    expect(within(cards()[0] as HTMLElement).queryByTestId('tray-start-25')).toBeNull();
  });

  it('starts 25 or 42 minutes, Custom or Live on a task, as commands to the main window', async () => {
    const { send, user } = setup();
    const review = cards()[1] as HTMLElement;
    const task = { line: 3, text: '- [ ] #daily/kaizen — draft the weekly review [minutes::33]', label: 'draft the weekly review', category: 'kaizen' };
    await user.click(within(review).getByTestId('tray-start-25'));
    expect(send).toHaveBeenLastCalledWith({ kind: 'start', day: '2026-09-01', task, mode: 'pomodoro', minutes: 25 });
    await user.click(within(review).getByTestId('tray-start-42'));
    expect(send).toHaveBeenLastCalledWith({ kind: 'start', day: '2026-09-01', task, mode: 'pomodoro', minutes: 42 });
    await user.click(within(review).getByTestId('tray-start-live'));
    expect(send).toHaveBeenLastCalledWith({ kind: 'start', day: '2026-09-01', task, mode: 'stopwatch' });
    await user.click(within(review).getByTestId('tray-start-custom'));
    expect(within(review).getByTestId('tray-custom-start')).toBeDisabled();
    await user.type(within(review).getByTestId('tray-custom-minutes'), '50{Enter}');
    expect(send).toHaveBeenLastCalledWith({ kind: 'start', day: '2026-09-01', task, mode: 'pomodoro', minutes: 50 });
    expect(send).toHaveBeenCalledTimes(4);
  });

  it('shows the round under way on its task, with pause and stop there', async () => {
    const timer = start(initialTimer(), AT, { id: 's', task: REVIEW, mode: 'pomodoro', minutes: 25 });
    const { send, user } = setup(timer, AT + 65_000);
    expect(screen.getByTestId('tray-now')).toHaveAttribute('data-state', 'running');
    expect(screen.getByTestId('tray-time')).toHaveTextContent('23:55');
    const review = cards()[1] as HTMLElement;
    expect(review).toHaveClass('is-current');
    await user.click(within(review).getByTestId('tray-pause'));
    expect(send).toHaveBeenLastCalledWith({ kind: 'pause' });
    await user.click(within(review).getByTestId('tray-stop'));
    expect(send).toHaveBeenLastCalledWith({ kind: 'stop' });
    // Not twice: the round's own card has its buttons.
    expect(screen.getAllByTestId('tray-pause')).toHaveLength(1);
  });

  it('holds a paused round still, and resumes it', async () => {
    const paused = pause(start(initialTimer(), AT, { id: 's', task: REVIEW, mode: 'stopwatch' }), AT + 5000);
    const { send, user } = setup(paused, AT + 60_000);
    expect(screen.getByTestId('tray-now')).toHaveAttribute('data-state', 'paused');
    expect(screen.getByTestId('tray-time')).toHaveTextContent('0:05');
    await user.click(screen.getByTestId('tray-resume'));
    expect(send).toHaveBeenLastCalledWith({ kind: 'resume' });
  });

  it('counts a rest down, and skips it', async () => {
    const rest = setup(startRest(initialTimer(), AT, 367), AT + 7000);
    expect(screen.getByTestId('tray-time')).toHaveTextContent('6:00');
    await rest.user.click(screen.getByTestId('tray-skip-rest'));
    expect(rest.send).toHaveBeenLastCalledWith({ kind: 'skip-rest' });
  });

  it('starts a rest when nothing runs', async () => {
    const { send, user } = setup();
    await user.click(screen.getByTestId('tray-rest'));
    expect(send).toHaveBeenLastCalledWith({ kind: 'rest' });
  });

  it('opens Epizen and quits', async () => {
    const { onOpen, onQuit, user } = setup();
    await user.click(screen.getByTestId('tray-open'));
    await user.click(screen.getByTestId('tray-quit'));
    expect([onOpen.mock.calls.length, onQuit.mock.calls.length]).toEqual([1, 1]);
  });

  it('waits for the main window before it shows anything', () => {
    render(<TrayPanel now={AT} send={vi.fn()} onOpen={vi.fn()} onQuit={vi.fn()} />);
    expect(screen.getByText('Epizen is opening…')).toBeInTheDocument();
    expect(screen.getByTestId('tray-open')).toBeInTheDocument();
  });
});
