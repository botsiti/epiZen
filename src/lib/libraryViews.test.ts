import { describe, expect, it } from 'vitest';
import type { MediaEntry } from './library';
import { filterLibrary, libraryYears, sortLibrary } from './libraryViews';
const entry = (title: string, date?: string, rating?: number): MediaEntry => ({ path: `${title}.md`, title, kind: 'album', genres: [], tracks: [], date, rating, year: '1994' });
const entries = [entry('B', '2026-10-10', 90), entry('A', '2025-10-10', 80), entry('C', '2026-10-10', 70), entry('D')];
describe('library views', () => {
  it('filters by the experience year rather than release year, intersecting with rating', () => {
    expect(libraryYears(entries)).toEqual(['2026', '2025']);
    expect(filterLibrary(entries, ['2026'], 80).map((entry) => entry.title)).toEqual(['B']);
    expect(filterLibrary(entries, ['1994'])).toEqual([]);
  });
  it('sorts both ways with missing dates last and a second rule for ties', () => {
    expect(sortLibrary(entries, [{ field: 'recent', direction: 'asc' }, { field: 'rating', direction: 'asc' }]).map((entry) => entry.title)).toEqual(['A', 'C', 'B', 'D']);
    expect(sortLibrary(entries, [{ field: 'recent', direction: 'desc' }, { field: 'rating', direction: 'desc' }]).map((entry) => entry.title)).toEqual(['B', 'C', 'A', 'D']);
  });
});
