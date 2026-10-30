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
  { date: day(2026, 9, 1), day: parseDay('### Tasks\n- [x] #daily/code — Build [minutes::60]\n- [ ] #daily/code — Review\n> - [x] Exercise\n') },
  { date: day(2026, 9, 2), day: parseDay('### Tasks\n- [ ] #daily/business — Plan [minutes::30]\n> - [ ] Exercise\n') },
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
    await user.click(screen.getByRole('button', { name: 'Previous focus period' }));
    expect(screen.getByText('2h 0m')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Yearly' }));
    expect(screen.getByText('3h 30m')).toBeInTheDocument();
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
