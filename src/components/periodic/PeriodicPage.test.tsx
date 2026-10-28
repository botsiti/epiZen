import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { addDays, sameDay } from '../../lib/dates';
import { parseDay } from '../../lib/day';
import type { DayEntry } from '../../lib/rollup';
import { PeriodicPage } from './PeriodicPage';
import type { PeriodicActions, PeriodicSpec } from './types';

vi.mock('../../lib/api', () => ({ readImage: vi.fn(() => Promise.resolve(new ArrayBuffer(0))) }));

// Numbers show their value at once, as in the e2e run.
beforeAll(() => {
  document.documentElement.dataset.motion = 'off';
});

// demo-vault/Calendar/2026/days 2026/14.08.2026.md, shortened.
const DAY = `---
done: 60
sleep: 6.1
focus: 9
energy: 7
mood: 9
soc: 5
---

> [!tldr]+ **Summary of the day:**
> Busy but calm.

>[!habits]- Habits
> - [ ] no sweet
> - [x] no news

## Friday, August 14th, 2026

### Tasks
- [ ] #daily/code — refactor the settings screen [minutes::58]
    - 09:26–10:24
- [x] #daily/sport — gym: upper body [minutes::61]
    - 12:35–13:06
    - 13:43–14:13

**Gratitude practice:** a good book
`;

const DATE = new Date(2026, 7, 14);
const dayOf = (date: Date): DayEntry => (sameDay(date, DATE) ? { date, path: 'd.md', day: parseDay(DAY) } : { date });
const spec = (period: PeriodicSpec['period'], date = DATE): PeriodicSpec => ({
  period,
  date,
  dayOf,
  weekOf: () => ({}),
  exists: () => false,
  scales: { mood: 10, energy: 10, focus: 10, soc: 10, done: 100, sleep: 10 },
  media: new Map(),
  categories: ['code', 'sport'],
  quests: [],
  art: () => undefined,
});
const actions = (): PeriodicActions => ({
  onOpenPeriod: vi.fn(),
  onOpenNote: vi.fn(),
  onEdit: vi.fn(),
  onToggle: vi.fn(),
  onSetProperty: vi.fn(),
  onAddTask: vi.fn(),
  onSetSummary: vi.fn(),
  onSetMinutes: vi.fn(),
  onEditTask: vi.fn(),
  onDeleteTask: vi.fn(),
  onFocus: vi.fn(),
  onAddRecord: vi.fn(),
  onUpdateRecord: vi.fn(),
  onDeleteRecord: vi.fn(),
  onQuestToggle: vi.fn(),
  onQuestProgress: vi.fn(),
});

describe('the day page', () => {
  it("shows the day's totals and words", () => {
    render(<PeriodicPage spec={spec('day')} path="Calendar/14.08.2026.md" text={DAY} actions={actions()} />);
    expect(screen.getByTestId('hero-title')).toHaveTextContent('14 August');
    expect(screen.getByTestId('note-title')).toHaveTextContent('14.08.2026');
    // One of the two tasks is ticked: plan done is worked out, not typed.
    expect(screen.getByTestId('tile-plan')).toHaveTextContent('50%');
    expect(screen.getByTestId('tile-plan')).toHaveTextContent('1 of 2 tasks');
    expect(screen.getByTestId('tile-time')).toHaveTextContent('1h 59m');
    expect(screen.getByTestId('tile-habits')).toHaveTextContent('1 / 2');
    expect(screen.getByTestId('hero')).toHaveTextContent('Busy but calm.');
  });

  it('sets a number from a tap, a typed number, and refuses one out of range', async () => {
    const user = userEvent.setup();
    const act = actions();
    render(<PeriodicPage spec={spec('day')} path="d.md" text={DAY} actions={act} />);
    const checkIn = screen.getByTestId('check-in');
    await user.click(within(checkIn).getByRole('radio', { name: 'Mood 3' }));
    expect(act.onSetProperty).toHaveBeenCalledWith('mood', '3');

    const sleep = within(checkIn).getByLabelText('Sleep');
    await user.clear(sleep);
    await user.type(sleep, '7,5{Enter}');
    expect(act.onSetProperty).toHaveBeenLastCalledWith('sleep', '7.5');

    await user.clear(sleep);
    await user.type(sleep, '30{Enter}');
    expect(act.onSetProperty).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('alert')).toHaveTextContent('Sleep is a number from 0 to 24.');
    expect(within(checkIn).queryByLabelText('Plan done')).not.toBeInTheDocument();
  });

  it('writes the summary in place: a click opens it, leaving the field saves it', async () => {
    const user = userEvent.setup();
    const act = actions();
    render(<PeriodicPage spec={spec('day')} path="d.md" text={DAY} actions={act} />);
    await user.click(screen.getByTestId('summary'));
    const field = screen.getByTestId('summary-field');
    expect(field).toHaveValue('Busy but calm.');
    await user.clear(field);
    await user.type(field, 'Shipped the page.');
    await user.tab();
    expect(act.onSetSummary).toHaveBeenCalledWith('Shipped the page.');
  });

  it('ticks a task, and adds one in the chosen category', async () => {
    const user = userEvent.setup();
    const act = actions();
    render(<PeriodicPage spec={spec('day')} path="d.md" text={DAY} actions={act} />);
    await user.click(screen.getAllByTestId('dash-task')[0] as HTMLElement);
    expect(act.onToggle).toHaveBeenCalledWith(expect.objectContaining({ line: 19, done: false }));

    await user.click(screen.getByRole('tab', { name: 'Tasks' }));
    await user.click(screen.getByRole('radio', { name: 'sport' }));
    await user.type(screen.getByTestId('composer-text'), 'evening run');
    // A new task has no minutes yet: they go on tasks already on the list.
    expect(screen.queryByTestId('composer-minutes')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('composer-add'));
    expect(act.onAddTask).toHaveBeenCalledWith('sport', 'evening run');

    const [first] = screen.getAllByTestId('task-minutes');
    await user.click(first as HTMLElement);
    const field = screen.getByTestId('task-minutes-field');
    await user.clear(field);
    await user.type(field, '75{Enter}');
    expect(act.onSetMinutes).toHaveBeenCalledWith(expect.objectContaining({ line: 19 }), 75);
  });

  it('shows a task card’s minutes, not its time blocks', async () => {
    const user = userEvent.setup();
    render(<PeriodicPage spec={spec('day')} path="d.md" text={DAY} actions={actions()} />);
    await user.click(screen.getByRole('tab', { name: 'Tasks' }));
    const card = screen.getAllByTestId('task-card')[1] as HTMLElement;
    expect(within(card).getByTestId('task-minutes')).toHaveTextContent('1h 1m');
    expect(card).not.toHaveTextContent('12:35');
  });

  it('edits and deletes a task from a right-click, on any day', async () => {
    const user = userEvent.setup();
    const act = actions();
    render(<PeriodicPage spec={spec('day')} path="d.md" text={DAY} actions={act} />);
    await user.click(screen.getByRole('tab', { name: 'Tasks' }));
    fireEvent.contextMenu(screen.getAllByTestId('task-card')[0] as HTMLElement);
    // Not today: focus isn't on offer, editing is.
    expect(screen.queryByTestId('focus-start')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('focus-menu-edit'));
    const words = screen.getByTestId('edit-task-text');
    expect(words).toHaveValue('refactor the settings screen');
    await user.clear(words);
    await user.type(words, 'refactor settings');
    await user.click(within(screen.getByTestId('edit-task')).getByRole('radio', { name: 'sport' }));
    const minutes = screen.getByTestId('edit-task-minutes');
    await user.clear(minutes);
    await user.type(minutes, '1.5');
    expect(screen.getByTestId('edit-task-save')).toBeDisabled();
    await user.clear(minutes);
    await user.type(minutes, '40');
    await user.click(screen.getByRole('button', { name: '+15' }));
    await user.click(screen.getByTestId('edit-task-save'));
    expect(act.onEditTask).toHaveBeenCalledWith(expect.objectContaining({ line: 19 }), { words: 'refactor settings', category: 'sport', minutes: 55 });
    expect(screen.queryByTestId('edit-task')).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getAllByTestId('task-card')[1] as HTMLElement);
    await user.click(screen.getByTestId('focus-menu-delete-task'));
    expect(screen.getByTestId('delete-task')).toHaveTextContent('with its 1h 1m and 2 time blocks');
    await user.click(screen.getByRole('button', { name: 'Keep' }));
    expect(act.onDeleteTask).not.toHaveBeenCalled();
    fireEvent.contextMenu(screen.getAllByTestId('task-card')[1] as HTMLElement);
    await user.click(screen.getByTestId('focus-menu-delete-task'));
    await user.click(screen.getByTestId('delete-task-confirm'));
    expect(act.onDeleteTask).toHaveBeenCalledWith(expect.objectContaining({ line: 21 }));
  });
});

describe('the thought-record wizard', () => {
  it('walks the five steps, needs what the vault needs, and saves the record', async () => {
    const user = userEvent.setup();
    const act = actions();
    render(<PeriodicPage spec={spec('day')} path="d.md" text={DAY} actions={act} />);
    await user.click(screen.getByTestId('hero-record'));
    const next = () => user.click(screen.getByTestId('wizard-continue'));
    expect(screen.getByTestId('wizard-continue')).toBeDisabled();
    await user.type(screen.getByTestId('wizard-situation'), 'Reviewed the day | felt behind');
    await next();
    // Sad is open first; a shade must be picked before going on.
    expect(screen.getByTestId('wizard-continue')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Disappointed' }));
    await user.click(screen.getByRole('button', { name: 'Fear' }));
    await user.click(screen.getByRole('button', { name: 'Anxious' }));
    await next();
    await user.click(screen.getByRole('checkbox', { name: 'All-or-nothing' }));
    expect(screen.getByText('“If it\'s not perfect, it\'s worthless.”')).toBeInTheDocument();
    await next();
    await user.type(screen.getByTestId('wizard-balanced'), 'Partial still counts.');
    await next();
    await user.click(screen.getByRole('button', { name: 'Calm' }));
    await next();
    expect(screen.getByText('Nicely done.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save to my diary' }));
    expect(act.onAddRecord).toHaveBeenCalledWith({
      situation: 'Reviewed the day | felt behind',
      before: ['Disappointed', 'Anxious'],
      distortions: ['All-or-nothing'],
      balanced: 'Partial still counts.',
      after: ['Calm'],
    });
    expect(screen.queryByTestId('thought-wizard')).not.toBeInTheDocument();
  });

  it('asks before throwing away what was typed', async () => {
    const user = userEvent.setup();
    render(<PeriodicPage spec={spec('day')} path="d.md" text={DAY} actions={actions()} />);
    await user.click(screen.getByTestId('hero-record'));
    await user.type(screen.getByTestId('wizard-situation'), 'something');
    await user.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog', { name: 'Discard this entry?' })).toBeInTheDocument();
    await user.click(screen.getByTestId('wizard-discard'));
    expect(screen.queryByTestId('thought-wizard')).not.toBeInTheDocument();
  });
});

describe('the week and month pages', () => {
  it('lay out the days of a week, and open a day from its card', async () => {
    const user = userEvent.setup();
    const act = actions();
    const monday = addDays(DATE, -4);
    render(<PeriodicPage spec={spec('week', monday)} path="w.md" text={'#### Plus\n- Shipped\n'} actions={act} />);
    expect(screen.getAllByTestId('day-card')).toHaveLength(7);
    expect(screen.getByTestId('reflections')).toHaveTextContent('Shipped');
    expect(screen.getByTestId('tile-productive')).toHaveTextContent('1h 59m');
    await user.click(screen.getAllByTestId('day-card')[4] as HTMLElement);
    expect(act.onOpenPeriod).toHaveBeenCalledWith('day', DATE);
  });

  it('light a month day by day', () => {
    render(<PeriodicPage spec={spec('month', new Date(2026, 7, 1))} path="m.md" text="" actions={actions()} />);
    expect(screen.getAllByTestId('heatmap-day')).toHaveLength(31);
    expect(screen.getByTestId('hero-title')).toHaveTextContent('August 2026');
  });
});
