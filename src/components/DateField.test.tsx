import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DateField } from './DateField';

// "Listened: 2026-09-21", as the demo vault's podcasts write it; today is 28 October 2026.
const TODAY = new Date(2026, 9, 28);

function Field({ initial = '2026-09-21', onPick }: { initial?: string; onPick?: (value: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <DateField
        value={value}
        onChange={setValue}
        onPick={(picked) => {
          setValue(picked);
          onPick?.(picked);
        }}
        label="Listened"
        testId="date"
        today={TODAY}
      />
      <output data-testid="value">{value}</output>
    </>
  );
}

const picker = () => screen.queryByTestId('date-picker');
const month = () => screen.getByTestId('date-picker-month').textContent;
const dayButton = (date: string) => document.querySelector<HTMLButtonElement>(`[data-testid="date-picker-day"][data-date="${date}"]`);

describe('DateField', () => {
  it('opens on focus at the chosen day\'s month, Monday first, the day lit and today ringed', () => {
    render(<Field />);
    expect(picker()).toBeNull();
    fireEvent.focus(screen.getByTestId('date'));
    expect(picker()).not.toBeNull();
    expect(screen.getByRole('dialog', { name: 'Listened: pick a day' })).toBe(picker());
    expect(month()).toBe('September 2026');
    const days = screen.getAllByTestId('date-picker-day');
    expect(days).toHaveLength(42);
    // September 2026 begins on a Tuesday: the Monday before it comes first, faint.
    expect(days[0]).toHaveAttribute('data-date', '2026-08-31');
    expect(days[0]).toHaveClass('is-outside');
    expect(dayButton('2026-09-21')).toHaveAttribute('aria-pressed', 'true');
    expect(dayButton('2026-09-21')).toHaveClass('is-chosen');
    expect(screen.getByTestId('date-picker-chosen')).toHaveTextContent('Mon 21 Sep');
  });

  it('picks a day with a click, steps a month with ‹ ›, and has Today and Yesterday', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Field onPick={onPick} />);
    await user.click(screen.getByTestId('date'));
    await user.click(screen.getByTestId('date-picker-prev'));
    expect(month()).toBe('August 2026');
    await user.click(dayButton('2026-08-20')!);
    expect(onPick).toHaveBeenLastCalledWith('2026-08-20');
    expect(screen.getByTestId('value')).toHaveTextContent('2026-08-20');
    expect(picker()).toBeNull();
    // The field kept the focus all along; a click opens the calendar again.
    expect(screen.getByTestId('date')).toHaveFocus();

    await user.click(screen.getByTestId('date'));
    await user.click(screen.getByTestId('date-picker-next'));
    await user.click(screen.getByTestId('date-picker-next'));
    expect(month()).toBe('October 2026');
    expect(dayButton('2026-10-28')).toHaveClass('is-today');
    expect(dayButton('2026-10-28')).toHaveAttribute('aria-current', 'date');
    await user.click(screen.getByTestId('date-picker-yesterday'));
    expect(screen.getByTestId('value')).toHaveTextContent('2026-10-27');
    await user.click(screen.getByTestId('date'));
    await user.click(screen.getByTestId('date-picker-today'));
    expect(screen.getByTestId('value')).toHaveTextContent('2026-10-28');
  });

  it('still takes a date typed in, and the calendar follows it once it is whole', async () => {
    const user = userEvent.setup();
    render(<Field initial="" />);
    await user.click(screen.getByTestId('date'));
    // Nothing chosen yet: today's month.
    expect(month()).toBe('October 2026');
    expect(screen.getByTestId('date-picker-chosen')).toHaveTextContent('No day yet');
    await user.type(screen.getByTestId('date'), '2025-03-0');
    expect(month()).toBe('October 2026');
    await user.type(screen.getByTestId('date'), '4');
    expect(screen.getByTestId('value')).toHaveTextContent('2025-03-04');
    expect(month()).toBe('March 2025');
    expect(dayButton('2025-03-04')).toHaveClass('is-chosen');
  });

  it('goes into the calendar with ↓, moves by day, week and month, picks with Enter', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Field onPick={onPick} />);
    await user.click(screen.getByTestId('date'));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(dayButton('2026-09-21'));
    await user.keyboard('{ArrowRight}{ArrowDown}');
    expect(document.activeElement).toBe(dayButton('2026-09-29'));
    await user.keyboard('{PageDown}');
    expect(month()).toBe('October 2026');
    expect(document.activeElement).toBe(dayButton('2026-10-29'));
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(dayButton('2026-10-26'));
    await user.keyboard('{Enter}');
    expect(onPick).toHaveBeenLastCalledWith('2026-10-26');
    expect(picker()).toBeNull();
    expect(screen.getByTestId('date')).toHaveFocus();
  });

  it('closes with Escape, from the field or the calendar, and the Escape goes no further', async () => {
    const user = userEvent.setup();
    const behind = vi.fn();
    const listen = (event: KeyboardEvent) => {
      if (event.key === 'Escape') behind();
    };
    window.addEventListener('keydown', listen);
    try {
      render(<Field />);
      await user.click(screen.getByTestId('date'));
      await user.keyboard('{Escape}');
      expect(picker()).toBeNull();
      await user.click(screen.getByTestId('date'));
      await user.keyboard('{ArrowDown}{Escape}');
      expect(picker()).toBeNull();
      expect(screen.getByTestId('date')).toHaveFocus();
      expect(behind).not.toHaveBeenCalled();
      // Closed, an Escape is the page's again.
      await user.keyboard('{Escape}');
      expect(behind).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('keydown', listen);
    }
  });

  it('closes when anything else is pressed, and leaves the value as it was', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Field />
        <button type="button">elsewhere</button>
      </>,
    );
    await user.click(screen.getByTestId('date'));
    expect(picker()).not.toBeNull();
    await user.click(screen.getByText('elsewhere'));
    expect(picker()).toBeNull();
    expect(screen.getByTestId('value')).toHaveTextContent('2026-09-21');
  });
});
