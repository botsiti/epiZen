// @vitest-environment node
import type { VaultFile } from '../api';
import { describe, expect, it, vi } from 'vitest';
import { baseRows, groupRows, parseBase, queryBase, summarize } from './bases';
import { compileExpression } from './expression';
import { textValue } from './values';
import { patchBase, replaceBaseBlock, baseBlockOccurrence } from './document';
import { setBaseProperty } from './propertyEdits';
import { readFilterRule, writeFilterRule } from './filterRules';

const texts = new Map([
  ['Music/A.md', '---\nArtist: Alice\nrating: 90\nlistened: 2026-02-01\ngenre: [ambient, electronic]\ncover: "[[cover.png]]"\n---\n#music/ambient [[B]] ![[cover.png]]'],
  ['Music/B.md', '---\nArtist: Bob\nrating: 60\nlistened: 2026-03-01\ngenre: [rock]\n---\n[[A]]'],
  ['Music/Collection.base', ''],
]);
const rows = baseRows([...texts.keys()].map((path): VaultFile => ({ path, kind: path.endsWith('.base') ? 'base' : 'note', created: Date.UTC(2026, 0, 1), modified: Date.UTC(2026, 2, 1), size: 100 })).concat([{ path: 'Music/cover.png', kind: 'image', created: 0, modified: 0, size: 32 }]), texts);
const base = `# Keep this comment\nfilters:\n  and:\n    - file.ext == "md"\n    - file.inFolder("Music")\nformulas:\n  stars: rating / 20\n  title: 'Artist + " · " + file.basename'\n  year: 'date(listened).year'\n  artwork: 'image(cover)'\nproperties:\n  formula.stars:\n    displayName: Stars\nviews:\n  - type: table\n    name: Albums\n    order: [file.name, Artist, formula.stars, formula.title, formula.year]\n    sort: [{property: rating, direction: DESC}]\n    summaries: {rating: Average}\n    customSetting: preserved\n  - type: cards\n    name: Covers\n    order: [file.name, rating]\n    image: formula.artwork\n    imageFit: contain\n    cardSize: 240\n  - type: list\n    name: Simple\n    order: [file.name, Artist]\n    listMarker: number\n    indent: true\n`;

describe('Obsidian Base compatibility', () => {
  it('reads all three layouts, formula properties, file metadata and linked-note properties', () => {
    const parsed = parseBase(base, { rows, path: 'Music/Collection.base' });
    expect(parsed.views.map((view) => view.type)).toEqual(['table', 'cards', 'list']);
    const view = parsed.views[0]!, found = queryBase(rows, view);
    expect(found.map((row) => row.path)).toEqual(['Music/A.md', 'Music/B.md']);
    expect(view.value(found[0]!, 'formula.stars')).toBe(4.5);
    expect(view.value(found[0]!, 'formula.title')).toBe('Alice · A');
    expect(view.value(found[0]!, 'formula.year')).toBe(2026);
    expect(view.value(found[0]!, 'file.backlinks')).toEqual([{ $kind: 'link', path: 'Music/B.md', label: 'B' }]);
    expect(view.value(found[0]!, 'file.embeds')).toEqual([{ $kind: 'link', path: 'Music/cover.png', label: 'cover.png' }]);
    expect(view.value(found[0]!, 'file.size')).toBe(100);
    expect(parsed.views[1]!.image).toBe('formula.artwork');
    expect(parsed.views[2]!.indent).toBe(true);
  });
  it('evaluates nested property, tag, link and this-file filters without code execution', () => {
    const source = base.replace('file.ext == "md"', 'file.hasTag("music") && file.hasLink("B") && this.file.folder == "Music"');
    expect(queryBase(rows, parseBase(source, { rows, path: 'Music/Collection.base' }).views[0]!).map((row) => row.path)).toEqual(['Music/A.md']);
  });
  it('sorts and groups results and honors explicit group order', () => {
    const source = patchBase(base, { view: 0, changes: { groupBy: { property: 'Artist', direction: 'DESC' } } });
    const view = parseBase(source, { rows }).views[0]!, found = queryBase(rows, view);
    expect(groupRows(found, view).map((group) => group.label)).toEqual(['Bob', 'Alice']);
    expect(groupRows(found, { ...view, groupOrder: ['Alice'] }).map((group) => group.label)).toEqual(['Alice']);
    expect(summarize([90, null, 60], 'Average')).toBe(75);
    expect(summarize([null, null], 'Average')).toBeNull();
    expect(summarize([1, 1, 2, null], 'Unique')).toBe(2);
    expect(summarize([90, 60], 'custom', { custom: 'values.mean().round(1)' })).toBe(75);
  });
  it('preserves unknown YAML and other views while editing configuration', () => {
    const modified = patchBase(base, { view: 1, changes: { name: 'Artwork', imageFit: 'cover' } });
    expect(modified).toContain('# Keep this comment'); expect(modified).toContain('customSetting: preserved');
    const parsed = parseBase(modified, { rows });
    expect(parsed.views[0]!.name).toBe('Albums'); expect(parsed.views[2]!.name).toBe('Simple');
    expect(parsed.views[1]!.name).toBe('Artwork');
    const added = patchBase(modified, { view: 0, addView: { name: 'Another', type: 'list' } });
    expect(parseBase(added).views).toHaveLength(4);
    expect(() => patchBase('views: [{type: table}]', { view: 0, deleteView: true })).toThrow(/at least one/);
  });
  it('preserves byte-for-byte text around one of two identical embedded bases', () => {
    const source = 'views:\n  - type: table\n    name: Music';
    const block = `\`\`\`base\r\n${source.replaceAll('\n', '\r\n')}\r\n\`\`\``;
    const text = `---\r\ntitle: 'kept'\r\n---\r\nBefore  \r\n\r\n${block}\r\n\r\nMiddle\r\n\r\n${block}\r\nAfter\r\n`;
    const next = replaceBaseBlock(text, source, source.replace('Music', 'Albums'), 1);
    expect(next).toBe(text.slice(0, text.lastIndexOf(block)) + block.replace('Music', 'Albums') + '\r\nAfter\r\n');
    expect(baseBlockOccurrence(`${block}\r\n${block}`, source, block.length + 2)).toBe(1);
    expect(() => replaceBaseBlock(text, 'changed', source, 0)).toThrow(/changed/);
  });
  it('replaces only the requested property and detects a concurrent value edit', () => {
    const text = '---\r\nArtist: "Alice" # keep\r\n"favorite tracks":\r\n  - First\r\n  - Second\r\nrating: 90 # score\r\n---\r\n\r\nBody [[B]]  \r\n';
    const next = setBaseProperty(text, 'rating', 90, 95);
    expect(next).toBe(text.replace('rating: 90', 'rating: 95'));
    expect(setBaseProperty(text, 'rating', 90, 90)).toBe(text);
    expect(() => setBaseProperty(text, 'rating', 80, 95)).toThrow(/changed/);
    const changed = setBaseProperty(text, 'favorite tracks', ['First', 'Second'], ['Third']);
    expect(changed).toContain('Artist: "Alice" # keep'); expect(changed).toContain('rating: 90 # score'); expect(changed.endsWith('Body [[B]]  \r\n')).toBe(true);
    expect(setBaseProperty('---\n---\nText', 'new key', null, true)).toBe('---\n"new key": true\n---\nText');
  });
  it('round-trips visual filter rules including property names with spaces, dates and types', () => {
    for (const rule of [{ property: 'note.favorite tracks', operator: 'contains', value: 'One', type: 'text' as const }, { property: 'listened', operator: '>=', value: '2026-01-01', type: 'date' as const }, { property: 'rating', operator: '>', value: '80', type: 'number' as const }]) {
      expect(readFilterRule(writeFilterRule(rule))).toEqual({ ...rule, property: rule.property.startsWith('note.') ? rule.property : `note.${rule.property}` });
    }
  });
});
describe('formula language', () => {
  const evaluate = (text: string) => compileExpression(text)(() => null);
  it('supports arithmetic, conditions, objects, arrays and list expressions', () => {
    expect(evaluate('if(2 + 3 * 4 == 14, "yes", "no")')).toBe('yes');
    expect(evaluate('[1, 2, 3].filter(value > 1).map(value * 2).sum()')).toBe(10);
    expect(evaluate('[1, 2, 3].reduce(acc + value, 0)')).toBe(6);
    expect(evaluate('"  hello world ".trim().title()')).toBe('Hello World');
    expect(evaluate('(12.345).toFixed(2)')).toBe('12.35');
    expect(evaluate('"76" / 20')).toBe(3.8);
    expect(summarize([90, '76', null], 'Average')).toBe(83);
    expect(evaluate('"abc".containsAny("x", "b")')).toBe(true);
  });
  it('supports dates, durations and year filters', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-05T12:00:00Z'));
    try {
      expect(evaluate('date("2026-01-01").year')).toBe(2026);
      expect(textValue(evaluate('date("2026-01-01") + "1M"'))).toBe('2026-02-01T00:00:00.000Z');
      expect(evaluate('date("2026-01-02").format("YYYY-MM-DD")')).toBe('2026-01-02');
      expect(evaluate('today() > date("2026-01-01")')).toBe(true);
    } finally { vi.useRealTimers(); }
  });
  it('contains circular formulas and rejects host code and dangerous regex patterns', () => {
    const doc = parseBase('formulas: {a: formula.b, b: formula.a}\nviews: [{type: table, order: [formula.a]}]');
    expect(() => doc.views[0]!.value(rows[0]!, 'formula.a')).toThrow(/Circular/);
    for (const source of ['window.alert(1)', 'globalThis.process.exit()', 'file.constructor("return globalThis")()', '/(a+)+$/.matches("aaaa")']) expect(() => evaluate(source)).toThrow();
    expect(evaluate('/^a+$/.matches("aaa")')).toBe(true);
    expect(evaluate('/[A-Z]\\d{4}/.matches("A2026")')).toBe(true);
    expect(() => evaluate('/a+a+a+$/.matches("aaaa")')).toThrow(/complex/);
  });
});
