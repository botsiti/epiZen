// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MUSIC_BASE, MUSIC_DATAVIEW, GENRE_DATAVIEW } from '../../../test/fixtures/music-base';
import { appendBase, baseRows, lookupRow, parseBase, propertyValue, queryBase, tableSource, type BaseRow } from './bases';
import { compileExpression } from './expression';
import { parseDataview } from './dataview';

const row = (name: string, properties: Record<string, unknown>): BaseRow => ({ path: `Rating/music/${name}.md`, file: { path: `Rating/music/${name}.md`, kind: 'note', created: Date.UTC(2024, 0, 2) }, properties });
const rows = [row('Earlier', { Artist: 'Someone', rating: 99, listened: '2025-01-01', genre: ['post-punk'], Year: 1980 }), row('Latest', { artist: 'Else', rating: 70, listened: '2025-12-31', genre: ['ambient'], 'favorite tracks': ['One', 'Two'] }), row('Old', { rating: 80, listened: '2024-12-31', genre: ['post-punk'] }), row('Future', { rating: 90, listened: '2026-01-01' }), row('Undated', {}), row('00. Music MOC', {})];

describe('Obsidian-compatible vault tables', () => {
  it('renders the supplied nested year filters, property labels and named sort views', () => {
    const base = parseBase(MUSIC_BASE);
    expect(queryBase(rows, base.views[0]!).map((r) => r.path)).toEqual(['Rating/music/Latest.md', 'Rating/music/Earlier.md']);
    expect(queryBase(rows, base.views[1]!).map((r) => r.path)).toEqual(['Rating/music/Earlier.md', 'Rating/music/Latest.md']);
    expect(base.views[0]!.columns[0]!.label).toBe('Album name');
    expect(propertyValue(rows[1]!, 'Artist')).toBe('Else');
    expect(propertyValue(rows[1]!, 'favorite tracks')).toEqual(['One', 'Two']);
  });
  it('combines base-wide and per-view filters, honors limits, and leaves missing ratings last', () => {
    const view = parseBase('filters: \'file.inFolder("Rating")\'\nviews:\n  - type: table\n    filters:\n      not: [\'file.name.contains("MOC")\']\n    order: [file.name, rating]\n    limit: 2\n    sort: [{property: rating, direction: DESC}]').views[0]!;
    expect(queryBase(rows, view).map((r) => propertyValue(r, 'file.name'))).toEqual(['Earlier', 'Future']);
    expect(queryBase(rows, { ...view, limit: undefined }).at(-1)!.path).toContain('Undated');
    expect(queryBase(rows, { ...view, limit: 0 })).toEqual([]);
  });
  it('renders the legacy year, genre and created-date queries without executing plugins', () => {
    expect(queryBase(rows, parseDataview(MUSIC_DATAVIEW).views[0]!).map((r) => propertyValue(r, 'file.name'))).toEqual(['Old']);
    expect(queryBase(rows, parseDataview(GENRE_DATAVIEW).views[0]!).map((r) => propertyValue(r, 'file.name'))).toEqual(['Earlier', 'Old']);
    expect(propertyValue(rows[0]!, 'file.ctime')).toEqual({ $kind: 'date', iso: '2024-01-02T00:00:00.000Z' });
    expect(parseDataview(GENRE_DATAVIEW).views[0]!.columns.at(-1)!.label).toBe('Created');
  });
  it('queries real demo-vault music properties without modifying the fixture', () => {
    const folder = new URL('../../../demo-vault/Rating/music/', import.meta.url);
    const texts = new Map(readdirSync(folder).filter((name) => name.endsWith('.md')).map((name) => [`Rating/music/${name}`, readFileSync(new URL(name, folder), 'utf8')]));
    const actual = baseRows([...texts.keys()].map((path) => ({ path, kind: 'note' })), texts);
    const view = parseBase('filters: \'rating >= 80\'\nviews:\n  - type: table\n    order: [file.name, Artist, rating]\n    sort: [{property: rating, direction: DESC}]').views[0]!;
    const found = queryBase(actual, view);
    expect(found.length).toBeGreaterThan(3);
    expect(found.every((r) => Number(propertyValue(r, 'rating')) >= 80)).toBe(true);
    expect(found.map((r) => propertyValue(r, 'file.name'))).toContain('Glasshouse Weather');
    expect(readFileSync(join(folder.pathname, '00. Music 2026 MOC.md'), 'utf8')).toBe(texts.get('Rating/music/00. Music 2026 MOC.md'));
  });
  it('marks unreadable text and malformed properties instead of silently treating them as empty', () => {
    const indexed = baseRows([{ path: 'Missing.md', kind: 'note' }, { path: 'Broken.md', kind: 'note' }, { path: 'Blank.md', kind: 'note' }], new Map([['Broken.md', '---\nrating: [\n---\nStill here'], ['Blank.md', 'Hello']]));
    expect(indexed.filter((r) => r.error)).toHaveLength(2);
    expect(queryBase(indexed, parseBase('views: [{type: table}]').views[0]!).map((r) => r.path)).toEqual(['Blank.md']);
  });
  it('generates safe portable YAML including spaces, quotes and dates, then appends without touching prior text', () => {
    const source = tableSource({ name: 'My "albums" ```', folder: 'Rating/music', columns: ['file.name', 'note.favorite tracks'], filters: [{ property: 'note.favorite tracks', operator: 'contains', value: 'One' }, { property: 'listened', operator: '>=', value: '2025-01-01' }], sort: { property: 'rating', direction: 'DESC' } });
    expect(queryBase(rows, parseBase(source).views[0]!).map((r) => propertyValue(r, 'file.name'))).toEqual(['Latest']);
    const original = '---\r\nquoted: "да"\r\n---\r\n# Music\r\nKeep [[links]] and spaces  ';
    const next = appendBase(original, source);
    expect(next.startsWith(original + '\r\n\r\n````base\r\n')).toBe(true);
    expect(next.replaceAll('\r\n', '')).not.toContain('\n');
    expect(() => appendBase('a\r\nb\n', source)).toThrow(/mixes line endings/);
  });
  it.each(['views: [null]', 'views: [{type: table, order: [formula.total]}]', 'views: [{type: table, filters: {and: invalid}}]', 'views: [{type: table, groupBy: {property: rating}}]', 'views: [{type: table, sort: [{property: rating, direction: sideways}]}]', 'views: [{type: table, limit: -1}]', 'views: ['])('refuses unsupported or malformed definitions: %s', (source) => {
    expect(() => parseBase(source)).toThrow();
  });
  it.each(['TABLE rating\nFROM "Rating"\nGROUP BY genre', 'TABLE rating + 2\nFROM "Rating"', 'LIST\nFROM "Rating"', 'TABLE rating\nFROM "Rating"\nLIMIT Infinity'])('keeps unsupported Dataview queries as source: %s', (source) => {
    expect(() => parseDataview(source)).toThrow();
  });
});

describe('safe filter expressions', () => {
  it('supports nested booleans, note fields with spaces, lists, dates and empty checks', () => {
    const read = lookupRow(rows[1]!);
    expect(compileExpression('(rating >= 70 && note["favorite tracks"].contains("One")) || rating > 100')(read)).toBe(true);
    expect(compileExpression('!missing.isEmpty()')(read)).toBe(false);
    expect(compileExpression('listened >= date("2025-01-01")')(read)).toBe(true);
    expect(compileExpression('missing > "2020-01-01"')(read)).toBe(false);
    expect(compileExpression('file.name.startsWith("Lat")')(read)).toBe(true);
  });
  it.each(['globalThis.alert("bad")', 'note.constructor("bad")()', 'window.location = "bad"', 'rating; alert(1)', 'rating === 80', '('.repeat(100) + '1' + ')'.repeat(100), '!'.repeat(100) + 'true'])('rejects code and excessive nesting: %s', (expression) => {
    expect(() => compileExpression(expression)).toThrow();
  });
  it('does not inherit object prototype properties', () => {
    expect(propertyValue(row('Safe', {}), 'constructor')).toBeNull();
    expect(propertyValue(row('Safe', {}), '__proto__')).toBeNull();
  });
});
