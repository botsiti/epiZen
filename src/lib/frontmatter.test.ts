import { describe, expect, it } from 'vitest';
import { formatValue, parseNote } from './frontmatter';

describe('parseNote', () => {
  it('splits Obsidian frontmatter from the body', () => {
    const note = parseNote('---\nmood: 7\ngenre:\n  - ambient\nlistened: 2025-10-15\n---\n# Day\n');
    expect(note.properties).toEqual({ mood: 7, genre: ['ambient'], listened: '2025-10-15' });
    expect(note.body).toBe('# Day\n');
    expect(note.error).toBeUndefined();
  });

  it('handles Windows line endings and empty frontmatter', () => {
    expect(parseNote('---\r\nmood: 7\r\n---\r\nbody').properties).toEqual({ mood: 7 });
    expect(parseNote('---\r\nmood: 7\r\n---\r\nbody').body).toBe('body');
    expect(parseNote('---\n---\nbody')).toEqual({ properties: {}, body: 'body' });
  });

  it('leaves a note without frontmatter alone', () => {
    const text = 'Just text\n---\nnot: frontmatter\n---\n';
    expect(parseNote(text)).toEqual({ properties: {}, body: text });
  });

  it('shows the whole note when the YAML is broken, instead of hiding it', () => {
    const text = '---\nmood: [7\n---\nbody';
    const note = parseNote(text);
    expect(note.error).toBeTruthy();
    expect(note.body).toBe(text);
  });
});

describe('formatValue', () => {
  it('reads like the Obsidian properties panel', () => {
    expect(formatValue(['ambient', 'world'])).toBe('ambient, world');
    expect(formatValue(null)).toBe('—');
    expect(formatValue([])).toBe('—');
    expect(formatValue(71)).toBe('71');
  });
});
