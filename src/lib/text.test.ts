import { describe, expect, it } from 'vitest';
import { lineEnding, noteNameProblem } from './text';

describe('lineEnding', () => {
  it('keeps a note in the line ending it uses throughout', () => {
    expect(lineEnding('---\nmood: 7\n---\nДень')).toBe('\n');
    expect(lineEnding('---\r\nmood: 7\r\n---\r\nДень\r\n')).toBe('\r\n');
    expect(lineEnding('one line')).toBe('\n');
  });

  it('gives up on mixed or bare \\r endings', () => {
    expect(lineEnding('a\r\nb\nc')).toBeUndefined();
    expect(lineEnding('a\rb')).toBeUndefined();
  });
});

describe('noteNameProblem', () => {
  it('accepts names Obsidian accepts, Cyrillic and dates included', () => {
    for (const name of ['Idea', '24.10.2026', 'Заметка дня', '2026-W43 - 19.10.26']) {
      expect(noteNameProblem(name)).toBeUndefined();
    }
  });

  it('refuses empty, hidden and link-breaking names', () => {
    for (const name of ['', '   ', '.hidden', 'a/b', 'what?', 'x#y', '[[x]]', 'a|b']) {
      expect(noteNameProblem(name)).toBeDefined();
    }
  });
});
