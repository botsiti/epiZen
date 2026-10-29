import { describe, expect, it } from 'vitest';
import { parseNote } from './frontmatter';
import { setMediaLists } from './mediaProperties';

describe('media property edits', () => {
  it.each(['\n', '\r\n'])('changes just selected lists, retaining the body and unrelated YAML with %j lines', (eol) => {
    const note = ['---', 'Artist: "Keep Me" # comment', 'genre:', '  - indie', '  - rock', 'rating: 80', 'favorite tracks:', '---', '[[00. Music]]', '', 'Thoughts stay exactly as typed.', ''].join(eol);
    const edited = setMediaLists(note, [{ key: 'genre', before: ['indie', 'rock'], after: ['art rock', 'tech: pop'] }, { key: 'favorite tracks', before: [], after: ['One', 'Two'] }, { key: 'tags', before: [], after: ['relisten'] }]);
    expect(parseNote(edited).properties).toEqual({ Artist: 'Keep Me', genre: ['art rock', 'tech: pop'], rating: 80, 'favorite tracks': ['One', 'Two'], tags: ['relisten'] });
    expect(edited).toContain('Artist: "Keep Me" # comment' + eol);
    expect(parseNote(edited).body).toBe(parseNote(note).body);
    expect(setMediaLists(edited, [{ key: 'tags', before: ['relisten'], after: ['relisten'] }])).toBe(edited);
  });
  it('preserves inline comments and spelling, and refuses conflicting or broken properties', () => {
    const note = '---\nGenre: [rock] # keep\nrating: 9\n---\n';
    expect(setMediaLists(note, [{ key: 'genre', before: ['rock'], after: [] }])).toBe('---\nGenre: [] # keep\nrating: 9\n---\n');
    expect(() => setMediaLists(note, [{ key: 'genre', before: [], after: ['jazz'] }])).toThrow('changed');
    expect(() => setMediaLists('---\ngenre: [broken\n---\n', [{ key: 'genre', before: [], after: [] }])).toThrow();
    expect(() => setMediaLists('---\ngenre: {nested: value}\n---\n', [{ key: 'genre', before: [], after: ['jazz'] }])).toThrow('structured data');
    expect(() => setMediaLists(note, [{ key: 'tags', before: [], after: ['a\nb'] }])).toThrow('single line');
  });
});
