import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { day, sameDay } from '../../lib/dates';
import { parseDay } from '../../lib/day';
import { Summaries } from './Summaries';

it('averages three recorded focus days and omits focus entirely in an unrecorded month', () => {
  const days = [2, 4, 5].map((focus, index) => ({ date: day(2026, 10, index + 1), day: parseDay(`---\nfocus: ${focus}\n---\n`) }));
  days.push({ date: day(2026, 10, 20), day: parseDay('---\nmood: 4\n---\n') });
  render(<Summaries today={day(2026, 10, 30)} days={days} monthOf={() => ({})} onOpenPeriod={vi.fn()} />);
  const november = document.querySelector('[data-month="2026-11"]')!, december = document.querySelector('[data-month="2026-12"]')!;
  expect(november.querySelector('[data-metric="focus"]')).toHaveTextContent('Focus3.67');
  expect(november.querySelector('[data-metric="energy"]')).toBeNull();
  expect(december.querySelector('[data-metric="focus"]')).toBeNull();
});

it('shows monthly averages and reflections, handles missing data, and opens a chosen month', async () => {
  const user = userEvent.setup();
  const onOpenPeriod = vi.fn();
  const days = [
    { date: day(2026, 8, 1), day: parseDay('---\nmood: 3\nsleep: 6\nenergy: 4\n---\n- [x] #daily/code — Work [minutes::60]') },
    { date: day(2026, 8, 2), day: parseDay('---\nmood: 5\nsleep: 8\nenergy: 0\n---\n- [x] #daily/code — Work [minutes::30]') },
  ];
  render(<Summaries today={day(2026, 8, 30)} days={days} monthOf={(date) => sameDay(date, day(2026, 8, 1)) ? { path: 'September.md', text: '## Monthly reflection\nA good month.\n\n## Decisions\nMove to a quieter place.\n\n## Monthly spending\n**Amount:** 150000\n**Currency:** RUB\n' } : {}} onOpenPeriod={onOpenPeriod} />);
  const september = document.querySelector<HTMLElement>('[data-month="2026-09"]')!;
  expect(september).toHaveTextContent('A good month.');
  expect(september).toHaveTextContent('Move to a quieter place.');
  expect(september).toHaveTextContent('150,000 RUB');
  expect(september).toHaveTextContent('1h 30m');
  expect(september).toHaveTextContent('Mood4');
  expect(september).toHaveTextContent('Sleep7h');
  expect(september).toHaveTextContent('Energy4');
  expect(september.querySelector('[data-metric=focus]')).toBeNull();
  await user.click(within(september).getByRole('button', { name: 'Open month' }));
  expect(onOpenPeriod).toHaveBeenCalledWith('month', day(2026, 8, 1));
  await user.click(screen.getByRole('button', { name: 'Previous summary year' }));
  expect(screen.getByRole('heading', { name: '2025' })).toBeInTheDocument();
  expect(screen.getAllByText('No monthly note yet.')).toHaveLength(12);
});

it('offers to choose between duplicate monthly notes instead of creating another', async () => {
  const user = userEvent.setup();
  const onOpenPeriod = vi.fn();
  render(<Summaries today={day(2026, 8, 30)} days={[]} monthOf={(date) => sameDay(date, day(2026, 8, 1)) ? { ambiguous: true } : {}} onOpenPeriod={onOpenPeriod} />);
  const september = document.querySelector<HTMLElement>('[data-month="2026-09"]')!;
  expect(september).toHaveTextContent('Choose which note represents this month');
  await user.click(within(september).getByRole('button', { name: 'Choose month note' }));
  expect(onOpenPeriod).toHaveBeenCalledWith('month', day(2026, 8, 1));
});
