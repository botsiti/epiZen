import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { addDays, sameDay, today } from '../../lib/dates';
import { parseDay } from '../../lib/day';
import { parseQuests } from '../../lib/quests';
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
  onQuestChange: vi.fn(() => Promise.resolve(undefined)),
  onAddQuest: vi.fn(() => Promise.resolve(undefined)),
  onSetSection: vi.fn(() => Promise.resolve(undefined)),
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
    expect(screen.getByTestId('composer-text')).toHaveFocus();
    await user.click(screen.getByRole('radio', { name: 'sport' }));
    expect(screen.getByTestId('composer-text')).toHaveFocus();
    await user.keyboard('evening run');
    // A new task has no minutes yet: they go on tasks already on the list.
    expect(screen.queryByTestId('composer-minutes')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('composer-add'));
    expect(act.onAddTask).toHaveBeenCalledWith('sport', 'evening run');
    expect(screen.getByTestId('composer-text')).toHaveFocus();
    await user.keyboard('morning run{Enter}');
    expect(act.onAddTask).toHaveBeenLastCalledWith('sport', 'morning run');

    const [first] = screen.getAllByTestId('task-minutes');
    await user.click(first as HTMLElement);
    const field = screen.getByTestId('task-minutes-field');
    await user.clear(field);
    await user.type(field, '75{Enter}');
    expect(act.onSetMinutes).toHaveBeenCalledWith(expect.objectContaining({ line: 19 }), 75);
  });

  it('offers every category and supports keyboard selection when adding a task', async () => {
    const user = userEvent.setup();
    const act = actions();
    const categories = ['code', 'business', 'sport', 'kaizen', 'meditation', 'leisure', 'book', 'english', 'biology', 'cinema', 'extra'];
    render(<PeriodicPage spec={{ ...spec('day'), categories }} path="d.md" text={DAY} actions={act} />);
    await user.click(screen.getByRole('tab', { name: 'Tasks' }));
    const last = screen.getByRole('radio', { name: 'extra' });
    await user.click(last);
    expect(last).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('composer-text')).toHaveFocus();
    // Tab still reaches the selected category; arrow navigation keeps focus in the group.
    await user.tab();
    expect(last).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'code' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(last).toHaveFocus();
    await user.type(screen.getByTestId('composer-text'), 'A new task{Enter}');
    expect(act.onAddTask).toHaveBeenCalledWith('extra', 'A new task');
    expect(screen.getByTestId('composer-text')).toHaveValue('');
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
    expect(screen.getAllByTestId('reflection-field').map((field) => (field as HTMLTextAreaElement).value)).toEqual(['- Shipped', '', '']);
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

// demo-vault/Calendar/2026/weeks/2026-W40 - 28.09.26.md, from its Quest XP heading: the week still
// running, as the vault's weekly template leaves one.
const WEEK = `### Quest XP
- [ ] #quest/weekly - Three deep-work mornings [xp::300] [spheres::Career/Work] [tier::rare] [target::3] [current::1]
    - 29.09.2026 :: Two hours before the phone.
    - 29.09.2026 :: Two hours before the phone.
- [ ] #quest/weekly - Two long runs [xp::300] [spheres::Health/Fitness] [tier::rare] [target::2] [current::0]
Add real weekly quests with the **+ New quest** button in the Quests tab.

#### Plus
Goals

#### Plus
-

#### Minus
-

#### Next
-


#### Statistics
`;
const W40 = 'Calendar/2026/weeks/2026-W40 - 28.09.26.md';
const MONDAY = new Date(2026, 8, 28);
const weekSpec = (): PeriodicSpec => ({
  ...spec('week', MONDAY),
  quests: parseQuests(W40, WEEK).map((quest) => ({ quest, period: { from: MONDAY, to: addDays(MONDAY, 7) } })),
});

describe('the week page writes', () => {
  it('has no Timeline tab', () => {
    render(<PeriodicPage spec={weekSpec()} path={W40} text={WEEK} actions={actions()} />);
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Overview', 'Days', 'Quests', 'Habits', 'Stats']);
  });

  it('saves Plus, Minus and Next from their cards, and only once something is typed', async () => {
    const user = userEvent.setup();
    const act = actions();
    render(<PeriodicPage spec={weekSpec()} path={W40} text={WEEK} actions={act} />);
    const [plus] = screen.getAllByTestId('reflection');
    if (!plus) throw new Error('no Plus card');
    // The template's "Goals" and lone "-" aren't words.
    expect(within(plus).getByTestId('reflection-field')).toHaveValue('');
    expect(within(plus).getByTestId('reflection-save')).toBeDisabled();
    await user.type(within(plus).getByTestId('reflection-field'), 'Two deep mornings');
    await user.click(within(plus).getByTestId('reflection-save'));
    expect(act.onSetSection).toHaveBeenCalledWith('Plus', 'Two deep mornings');
    expect(await within(plus).findByText('Saved')).toBeInTheDocument();
  });

  it('adds a quest from the composer: spheres, tier, XP and target, as one line', async () => {
    const user = userEvent.setup();
    const act = actions();
    render(<PeriodicPage spec={weekSpec()} path={W40} text={WEEK} actions={act} />);
    await user.click(screen.getByRole('tab', { name: 'Quests' }));
    await user.click(screen.getByTestId('quest-new'));
    await user.click(screen.getByTestId('quest-add'));
    expect(screen.getByTestId('quest-status')).toHaveTextContent('Add a title');
    await user.type(screen.getByTestId('quest-title'), 'Read 100 pages');
    await user.click(screen.getByTestId('quest-add'));
    expect(screen.getByTestId('quest-status')).toHaveTextContent('Pick a life sphere');
    expect(act.onAddQuest).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /^Personal Growth/ }));
    await user.click(screen.getByRole('button', { name: /^Spiritual/ }));
    await user.click(screen.getByTestId('quest-weight-up'));
    await user.click(screen.getByRole('radio', { name: /epic/i }));
    expect(screen.getByTestId('quest-xp')).toHaveValue(1000);
    expect(screen.getByTestId('quest-total')).toHaveTextContent('Personal Growth 1000 · bonus +400 · 1400 XP in all once done');
    await user.clear(screen.getByTestId('quest-target'));
    await user.type(screen.getByTestId('quest-target'), '100{Enter}');
    expect(act.onAddQuest).toHaveBeenCalledWith(
      '- [ ] #quest/weekly - Read 100 pages [xp::1000] [spheres::Personal Growth, Spiritual:40] [tier::epic] [target::100] [current::0]',
    );
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(screen.getByTestId('quest-title')).toHaveValue('');
  });

  it('lights the tier a typed XP falls in, and keeps a monthly quest monthly', async () => {
    const user = userEvent.setup();
    const act = actions();
    render(<PeriodicPage spec={spec('month', new Date(2026, 8, 1))} path="Calendar/2026/months 2026/09.26 RPG.md" text="" actions={act} />);
    await user.click(screen.getByRole('tab', { name: 'Quests' }));
    await user.click(screen.getByTestId('quest-new'));
    expect(screen.getByTestId('quest-xp')).toHaveValue(500);
    await user.type(screen.getByTestId('quest-title'), 'Launch the beta');
    await user.click(screen.getByRole('button', { name: /^Career\/Work/ }));
    await user.clear(screen.getByTestId('quest-xp'));
    await user.type(screen.getByTestId('quest-xp'), '1600');
    expect(screen.getByRole('radio', { name: /legendary/i })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByTestId('quest-add'));
    expect(act.onAddQuest).toHaveBeenCalledWith('- [ ] #quest/monthly - Launch the beta [xp::1600] [spheres::Career/Work] [tier::legendary]');
  });

  it("opens a quest's detail from its art: a chapter added with ⌘ + Enter, one deleted after asking once", async () => {
    const user = userEvent.setup();
    const act = actions();
    render(<PeriodicPage spec={weekSpec()} path={W40} text={WEEK} actions={act} />);
    await user.click(screen.getByRole('tab', { name: 'Quests' }));
    await user.click(screen.getByRole('button', { name: 'Details of Three deep-work mornings' }));
    const detail = screen.getByRole('dialog', { name: 'Three deep-work mornings' });
    expect(within(detail).getByTestId('quest-detail-meta')).toHaveTextContent('Sunday, 4 Oct (end of its week)');
    expect(within(detail).getAllByTestId('chapter')).toHaveLength(2);
    await user.type(within(detail).getByTestId('chapter-field'), 'Third morning.');
    await user.keyboard('{Meta>}{Enter}{/Meta}');
    const [quest] = weekSpec().quests;
    expect(act.onQuestChange).toHaveBeenCalledWith(expect.objectContaining({ line: 1, title: 'Three deep-work mornings' }), { kind: 'add-chapter', words: 'Third morning.' });
    expect(within(detail).getByTestId('chapter-field')).toHaveValue('');

    // The second of the two chapters alike, by its own line.
    const second = within(detail).getAllByTestId('chapter-delete')[1] as HTMLElement;
    await user.click(second);
    expect(act.onQuestChange).toHaveBeenCalledTimes(1);
    expect(second).toHaveTextContent('Delete?');
    await user.click(second);
    expect(act.onQuestChange).toHaveBeenLastCalledWith(expect.objectContaining({ line: 1 }), { kind: 'delete-chapter', entry: quest?.quest.log[1] });

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('sets a deadline from the detail, and shows why a change was refused', async () => {
    const user = userEvent.setup();
    const act = actions();
    act.onQuestChange = vi.fn(() => Promise.resolve('That quest has changed in its note.'));
    render(<PeriodicPage spec={weekSpec()} path={W40} text={WEEK} actions={act} />);
    await user.click(screen.getByRole('tab', { name: 'Quests' }));
    await user.click(screen.getByRole('button', { name: 'Details of Two long runs' }));
    await user.click(screen.getByTestId('quest-deadline-edit'));
    fireEvent.change(screen.getByTestId('quest-deadline-field'), { target: { value: '2026-10-02' } });
    await user.click(screen.getByTestId('quest-deadline-save'));
    expect(act.onQuestChange).toHaveBeenCalledWith(expect.objectContaining({ title: 'Two long runs' }), { kind: 'deadline', date: '2026-10-02' });
    expect(await screen.findByTestId('quest-detail-problem')).toHaveTextContent('That quest has changed in its note.');
  });
});

it('hides optional features on periodic pages without changing the note', async () => {
  const user = userEvent.setup();
  const act = actions();
  const hidden = { habits: false, thoughtRecords: false };
  const view = render(<PeriodicPage spec={{ ...spec('day'), features: hidden }} path="d.md" text={DAY} actions={act} />);
  expect(screen.queryByRole('tab', { name: 'Habits' })).not.toBeInTheDocument();
  expect(screen.queryByTestId('tile-habits')).not.toBeInTheDocument();
  expect(screen.queryByTestId('hero-record')).not.toBeInTheDocument();
  await user.click(screen.getByRole('tab', { name: 'Stream' }));
  expect(screen.queryByTestId('records')).not.toBeInTheDocument();
  expect(act.onToggle).not.toHaveBeenCalled();
  view.rerender(<PeriodicPage spec={{ ...spec('week'), features: hidden }} path="w.md" text="" actions={act} />);
  expect(screen.queryByRole('tab', { name: 'Habits' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('tab', { name: 'Overview' }));
  expect(within(screen.getByTestId('totals')).queryByText('Habits')).not.toBeInTheDocument();
});

it('omits hidden habits from yesterday’s reminders but keeps other missing fields', () => {
  const date = today();
  const yesterday = addDays(date, -1);
  const text = '---\nmood: 5\nenergy:\nfocus: 5\nsoc: 5\nsleep: 8\n---\n\n> [!habits] Habits\n> - [ ] no news\n';
  const dayOf = (value: Date): DayEntry => sameDay(value, yesterday) ? { date: value, path: 'yesterday.md', day: parseDay(text) } : { date: value };
  const hidden = { ...spec('day', date), dayOf, features: { habits: false, thoughtRecords: true } };
  const view = render(<PeriodicPage spec={hidden} path="today.md" text="" actions={actions()} />);
  expect(screen.getByTestId('yesterday-gaps')).toHaveTextContent('Yesterday is missing energy.');
  view.rerender(<PeriodicPage spec={{ ...hidden, features: { habits: true, thoughtRecords: true } }} path="today.md" text="" actions={actions()} />);
  expect(screen.getByTestId('yesterday-gaps')).toHaveTextContent('Yesterday is missing energy, habits.');
  const onlyHabits = (value: Date): DayEntry => sameDay(value, yesterday) ? { date: value, path: 'yesterday.md', day: parseDay(text.replace('energy:', 'energy: 5')) } : { date: value };
  view.rerender(<PeriodicPage spec={{ ...hidden, dayOf: onlyHabits }} path="today.md" text="" actions={actions()} />);
  expect(screen.queryByTestId('yesterday-gaps')).not.toBeInTheDocument();
});
