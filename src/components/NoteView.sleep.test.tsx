import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { readNote, writeNote } from '../lib/api';
import { day } from '../lib/dates';
import { builtInPeriodicText } from '../lib/periodic';
import { NoteView } from './NoteView';
import type { PeriodicSpec } from './periodic/types';

vi.mock('../lib/api', () => ({ readNote: vi.fn(), writeNote: vi.fn(), readImage: vi.fn(() => Promise.resolve(new ArrayBuffer(0))) }));

it('retains a failed sleep draft, lets another property save, then retries against fresh note text', async () => {
  const user = userEvent.setup(); const date = day(2026, 7, 14);
  let disk = builtInPeriodicText('day', date);
  vi.mocked(readNote).mockImplementation(() => Promise.resolve(disk));
  vi.mocked(writeNote).mockRejectedValueOnce(new Error('The note changed outside Epizen.')).mockImplementation((_path, text, expected) => {
    expect(expected).toBe(disk); disk = text; return Promise.resolve();
  });
  const periodic: PeriodicSpec = { period: 'day', date, dayOf: (date) => ({ date }), weekOf: () => ({}), exists: () => true, scales: {}, media: new Map(), categories: [], quests: [], art: () => undefined };
  render(<NoteView path="day.md" files={[]} periodic={periodic} editing={false} onEditingChange={vi.fn()} onRename={vi.fn()}
    onSaved={vi.fn()} onUnsaved={vi.fn()} linkTargets={[]} onOpenLink={vi.fn()} onOpenNote={vi.fn()} onOpenPeriod={vi.fn()}
    onQuestToggle={vi.fn()} onQuestProgress={vi.fn()} onQuestChange={vi.fn(() => Promise.resolve(undefined))} onStartTimer={vi.fn()} onTaskChanged={vi.fn()} />);
  const hours = await screen.findByLabelText('Sleep hours'); const minutes = screen.getByLabelText('Sleep minutes');
  await user.clear(hours); await user.type(hours, '7'); await user.clear(minutes); await user.type(minutes, '30{Enter}');
  const sleep = within(screen.getByRole('group', { name: 'Sleep duration' }));
  expect(await sleep.findByRole('alert')).toHaveTextContent('The note changed outside Epizen');
  expect(hours).toHaveValue('7'); expect(minutes).toHaveValue('30');
  await user.click(screen.getByRole('radio', { name: 'Mood 4' }));
  expect(disk).toContain('mood: 4');
  await user.click(minutes); await user.keyboard('{Enter}');
  expect(disk).toContain('sleep: 7.5'); expect(disk).toContain('mood: 4');
  expect(sleep.queryByRole('alert')).not.toBeInTheDocument();
});
