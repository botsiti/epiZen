import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { readNote, writeNote } from '../lib/api';
import { NoteView } from './NoteView';
import { BasesProvider } from './bases/context';

vi.mock('../lib/api', () => ({ readNote: vi.fn(), writeNote: vi.fn(), readImage: vi.fn() }));

it('adds only the requested block over fresh text, keeps a rejected draft, and retries conditionally', async () => {
  const user = userEvent.setup(), onSaved = vi.fn();
  const initial = '---\r\ntitle: "My music"\r\n---\r\nKeep [[links]]  \r\n';
  const outside = initial + '\r\nAn outside edit.\r\n';
  vi.mocked(readNote).mockResolvedValue(initial);
  vi.mocked(writeNote).mockRejectedValueOnce('File changed on disk').mockResolvedValueOnce(undefined);
  render(<BasesProvider files={[{ path: 'music.md', kind: 'note' }]} texts={new Map([['music.md', initial]])} onRefresh={vi.fn()}>
    <NoteView path="music.md" files={[]} editing={false} onEditingChange={vi.fn()} onRename={vi.fn()} onSaved={onSaved} onUnsaved={vi.fn()} linkTargets={[]} onOpenLink={vi.fn()} onOpenNote={vi.fn()} onOpenPeriod={vi.fn()} onQuestToggle={vi.fn()} onQuestProgress={vi.fn()} onQuestChange={vi.fn().mockResolvedValue(undefined)} onStartTimer={vi.fn()} onTaskChanged={vi.fn()} />
  </BasesProvider>);
  await screen.findByTestId('note');
  await user.click(screen.getByRole('button', { name: 'Add table' }));
  vi.mocked(readNote).mockResolvedValue(outside);
  await user.click(screen.getByRole('button', { name: 'Add to note' }));
  expect(screen.getByRole('alert')).toHaveTextContent('File changed on disk');
  expect(screen.getByLabelText('View name')).toHaveValue('Table');
  expect(onSaved).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Add to note' }));
  expect(screen.queryByTestId('table-builder')).toBeNull();
  const [path, next, expected] = vi.mocked(writeNote).mock.calls[1]!;
  expect(path).toBe('music.md'); expect(expected).toBe(outside);
  expect(next.startsWith(outside + '\r\n```base\r\n')).toBe(true);
  expect(next.replaceAll('\r\n', '')).not.toContain('\n');
  expect(onSaved).toHaveBeenCalledWith('music.md', next);
});
