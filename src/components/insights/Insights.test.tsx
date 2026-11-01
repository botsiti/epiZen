import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { day, sameDay } from '../../lib/dates';
import { parseDay } from '../../lib/day';
import { parseQuests } from '../../lib/quests';
import type { DayEntry } from '../../lib/rollup';
import { QuestPage, StatisticsPage } from './Insights';

const today = day(2026, 9, 30);
const entries: DayEntry[] = [
  { date: day(2026, 9, 1), day: parseDay('> [!todo] Tasks\n> - [x] #daily/code — Build [minutes::60]\n> - [ ] #daily/code — Review\n\n> [!habits]\n> - [x] Exercise\n') },
  { date: day(2026, 9, 2), day: parseDay('### Tasks\n- [ ] #daily/business — Plan [minutes::30]\n> [!habits]\n> - [ ] Exercise\n') },
  { date: day(2026, 8, 1), day: parseDay('### Tasks\n- [x] #daily/code — Earlier [minutes::120]\n') },
];
const dayOf = (date: Date) => entries.find((entry) => sameDay(entry.date, date)) ?? { date };

describe('statistics', () => {
  it('reveals a day, changes focus periods, and fills habits by calendar days', async () => {
    const user = userEvent.setup();
    render(<StatisticsPage days={entries} dayOf={dayOf} today={today} showHabits />);
    await user.hover(screen.getByRole('button', { name: 'Oct 1, 2026: 1h 0m' }));
    expect(screen.getByTestId('activity-detail')).toHaveTextContent('Build');
    expect(screen.getByTestId('activity-detail')).toHaveTextContent('Review');
    expect(screen.getByTestId('activity-detail')).toHaveTextContent('code');
    expect(screen.getByText('1h 30m')).toBeInTheDocument();
    const habit = screen.getByRole('img', { name: 'Exercise · October 2026: 1/31 days (3%)' });
    expect(habit.firstElementChild).toHaveStyle({ width: `${100 / 31}%` });
    expect(screen.queryByRole('img', { name: /Build.*days/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Review.*days/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous focus period' }));
    expect(screen.getByText('2h 0m')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Yearly' }));
    expect(screen.getByText('3h 30m')).toBeInTheDocument();
  });

  it('keeps the selected day marked through hover, keyboard focus and click, including empty days', async () => {
    const user = userEvent.setup();
    render(<StatisticsPage days={entries} dayOf={dayOf} today={today} showHabits />);
    const first = screen.getByRole('button', { name: 'Oct 1, 2026: 1h 0m' });
    const second = screen.getByRole('button', { name: 'Oct 2, 2026: 30m' });
    await user.hover(first);
    expect(first).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('activity-detail')).toHaveTextContent('2 tasks');
    await user.click(second);
    expect(first).toHaveAttribute('aria-pressed', 'false');
    expect(second).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('activity-detail')).toHaveTextContent('1 task');
    await user.tab();
    expect(screen.getByRole('button', { name: 'Oct 3, 2026: 0m' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('activity-detail')).toHaveTextContent('No daily note for this day.');
    expect(screen.getByRole('region', { name: 'Selected day details' })).toHaveAttribute('tabindex', '0');
  });

  it('keeps every task in long days available and distinguishes a note without tasks', async () => {
    const user = userEvent.setup();
    const busy = { date: day(2026, 9, 1), day: parseDay(Array.from({ length: 30 }, (_, i) => `- [ ] #daily/code — Work ${i + 1}`).join('\n')) };
    const empty = { date: day(2026, 9, 2), day: parseDay('> [!habits]\n> - [x] Exercise') };
    const days = [busy, empty];
    render(<StatisticsPage days={days} dayOf={(date) => days.find((entry) => sameDay(entry.date, date)) ?? { date }} today={today} showHabits />);
    await user.hover(screen.getByRole('button', { name: 'Oct 1, 2026: 0m' }));
    expect(within(screen.getByTestId('activity-detail')).getAllByRole('listitem')).toHaveLength(30);
    await user.hover(screen.getByRole('button', { name: 'Oct 2, 2026: 0m' }));
    expect(screen.getByTestId('activity-detail')).toHaveTextContent('No tasks recorded for this day.');
  });

  it('shows empty states and respects disabled habits', () => {
    render(<StatisticsPage days={[]} dayOf={(date) => ({ date })} today={today} showHabits={false} />);
    expect(screen.getByText('No daily note for this day.')).toBeInTheDocument();
    expect(screen.getByText('No time logged in this period.')).toBeInTheDocument();
    expect(screen.queryByText('Habits')).not.toBeInTheDocument();
  });
});

describe('quests', () => {
  it('paginates the selected month and navigates to an earlier one', async () => {
    const user = userEvent.setup();
    const quests = parseQuests('oct.md', Array.from({ length: 10 }, (_, i) => `- [ ] #quest/monthly - Quest ${i + 1} [xp::100]`).join('\n')).map((quest) => ({ quest, period: { from: day(2026, 9, 1), to: day(2026, 10, 1) } }));
    render(<QuestPage quests={quests} today={today} art={() => undefined} onToggle={vi.fn()} onProgress={vi.fn()} onChange={vi.fn()} />);
    const page = screen.getByTestId('quests-page');
    expect(within(page).getAllByTestId('quest-card')).toHaveLength(8);
    await user.click(screen.getByRole('button', { name: 'See 8 more' }));
    expect(within(page).getAllByTestId('quest-card')).toHaveLength(10);
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(page).toHaveTextContent('September 2026');
    expect(page).toHaveTextContent('No quests here');
  });
});

it('shows earned, overdue and net XP for quests active in the selected month', async () => {
  const user = userEvent.setup();
  const entries = parseQuests('month.md', [
    '- [x] #quest/monthly - Completed [xp::500] [tier::rare] [done::2026-09-20]',
    '- [ ] #quest/monthly - Missed [xp::1000] [tier::epic]',
  ].join('\n')).map((quest) => ({ quest, period: { from: day(2026, 8, 1), to: day(2026, 9, 1) } }));
  render(<QuestPage quests={entries} today={today} art={() => undefined} onToggle={vi.fn()} onProgress={vi.fn()} onChange={vi.fn()} />);
  await user.click(screen.getByRole('button', { name: 'Previous month' }));
  const summary = screen.getByTestId('quest-xp-summary');
  expect(summary).toHaveTextContent('Earned+500 XP');
  expect(summary).toHaveTextContent('Overdue penalty−225 XP');
  expect(summary).toHaveTextContent('Net275 XP');
  expect(within(summary).getByText('Missed')).toBeInTheDocument();
  expect(summary).toHaveTextContent('−225 XP');
});
