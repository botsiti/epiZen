import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { day } from '../lib/dates';
import { NoteView } from './NoteView';
import type { PeriodicSpec } from './periodic/types';

vi.mock('../lib/api', () => ({
  readNote: vi.fn(() => Promise.resolve('---\ndate: 2026-09-01\n---\n\n# My September\n\nA personal monthly note.\n')),
  writeNote: vi.fn(() => Promise.resolve()),
  readImage: vi.fn(() => Promise.resolve(new ArrayBuffer(0))),
}));

it('lets an older monthly prose note open its review and return to reading', async () => {
  const user = userEvent.setup();
  const periodic: PeriodicSpec = {
    period: 'month', date: day(2026, 8, 1), dayOf: (date) => ({ date }), weekOf: () => ({}),
    exists: () => false, scales: {}, media: new Map(), categories: [], quests: [], art: () => undefined,
  };
  render(<NoteView path="month.md" files={[]} periodic={periodic} editing={false} onEditingChange={vi.fn()} onRename={vi.fn()}
    onSaved={vi.fn()} onUnsaved={vi.fn()} linkTargets={[]} onOpenLink={vi.fn()} onOpenNote={vi.fn()} onOpenPeriod={vi.fn()}
    onQuestToggle={vi.fn()} onQuestProgress={vi.fn()} onQuestChange={vi.fn(() => Promise.resolve(undefined))}
    onStartTimer={vi.fn()} onTaskChanged={vi.fn()} />);
  expect(await screen.findByText('A personal monthly note.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Monthly review' }));
  expect(screen.getByTestId('periodic')).toHaveAttribute('data-period', 'month');
  expect(screen.getByRole('tab', { name: 'Reflection' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Read note' }));
  expect(screen.getByText('A personal monthly note.')).toBeInTheDocument();
});
