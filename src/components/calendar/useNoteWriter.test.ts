import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readNote, writeNoteScoped } from '../../lib/api';
import { useNoteWriter } from './useNoteWriter';

vi.mock('../../lib/api', () => ({ readNote: vi.fn(), writeNoteScoped: vi.fn() }));
const read = vi.mocked(readNote);
const write = vi.mocked(writeNoteScoped);

beforeEach(() => {
  read.mockReset();
  write.mockReset();
});

describe('the calendar’s writes', () => {
  it('write one at a time, each over the text the last one left, checked against it', async () => {
    write.mockResolvedValue(undefined);
    const onSaved = vi.fn();
    const { result } = renderHook(() => useNoteWriter('/demo', new Map([['d.md', 'a\n']]), onSaved));
    const first = result.current('d.md', (text) => `${text}b\n`);
    const second = result.current('d.md', (text) => `${text}c\n`);
    await expect(first).resolves.toBe('a\nb\n');
    await expect(second).resolves.toBe('a\nb\nc\n');
    expect(write.mock.calls).toEqual([
      ['/demo', 'd.md', 'a\nb\n', 'a\n'],
      ['/demo', 'd.md', 'a\nb\nc\n', 'a\nb\n'],
    ]);
    expect(onSaved.mock.calls).toEqual([
      ['d.md', 'a\nb\n'],
      ['d.md', 'a\nb\nc\n'],
    ]);
    expect(read).not.toHaveBeenCalled();
  });

  it('write nothing when there is nothing to change, and read a note the app has no text for', async () => {
    read.mockResolvedValue('fresh\n');
    const { result } = renderHook(() => useNoteWriter('/demo', new Map(), vi.fn()));
    await expect(result.current('new.md', () => undefined)).resolves.toBe('fresh\n');
    expect(write).not.toHaveBeenCalled();
  });

  it('when the note changed on disk: write nothing, read it again, tell the app, and say why', async () => {
    write.mockRejectedValue('The note changed on disk since it was read');
    read.mockResolvedValue('changed\n');
    const onSaved = vi.fn();
    const { result } = renderHook(() => useNoteWriter('/demo', new Map([['d.md', 'a\n']]), onSaved));
    await expect(result.current('d.md', (text) => `${text}b\n`)).rejects.toThrow('changed on disk');
    expect(onSaved).toHaveBeenCalledWith('d.md', 'changed\n');
    // The next change builds on the note as it is now.
    write.mockResolvedValue(undefined);
    await result.current('d.md', (text) => `${text}c\n`);
    expect(write).toHaveBeenLastCalledWith('/demo', 'd.md', 'changed\nc\n', 'changed\n');
  });

  it('when the edit refuses, write nothing', async () => {
    read.mockResolvedValue('a\n');
    const { result } = renderHook(() => useNoteWriter('/demo', new Map([['d.md', 'a\n']]), vi.fn()));
    await expect(
      result.current('d.md', () => {
        throw new Error('That task has changed in the note');
      }),
    ).rejects.toThrow('That task has changed');
    expect(write).not.toHaveBeenCalled();
  });
});

it('drops queued edits from an old vault and keeps late results out of the new vault', async () => {
  let finish!: () => void;
  write.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const saved = vi.fn(), files = new Map([['day.md', 'same starting text']]);
  const { result, rerender } = renderHook(({ root }) => useNoteWriter(root, files, saved), { initialProps: { root: '/first/Demo' } });
  const first = result.current('day.md', () => 'first change');
  const second = result.current('day.md', () => 'queued change');
  await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
  rerender({ root: '/second/Demo' });
  finish();
  await expect(first).resolves.toBe('first change');
  await expect(second).rejects.toThrow('vault changed');
  expect(write).toHaveBeenCalledExactlyOnceWith('/first/Demo', 'day.md', 'first change', 'same starting text');
  expect(saved).not.toHaveBeenCalled();
});
