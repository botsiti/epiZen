import { expect, it } from 'vitest';
import { discoverDailyNotes } from './dailyImport';
import { DEFAULT_PERIODIC, DEFAULT_RECOGNITION } from './periodic';

it('finds mixed daily names and metadata within a chosen folder without changing any text', () => {
  const texts = new Map([
    ['Journal/03-04-2026.md', '# A day\n'],
    ['Journal/2026/A special day.md', '---\ntype: daily\ndate: 2026-04-05\n---\nWords\n'],
    ['Journal/2026/2026-W15.md', '# A week\n'],
    ['Other/2026-04-06.md', '# Elsewhere\n'],
    ['Journal/excluded.md', '---\ntype: daily\ndate: 2026-04-07\n---\n'],
  ]);
  const before = [...texts];
  const files = [...texts.keys()].map((path) => ({ path, kind: 'note' as const }));
  const recognition = { ...DEFAULT_RECOGNITION, dates: { 'Journal/excluded.md': null } };
  expect(discoverDailyNotes(files, texts, 'Journal', DEFAULT_PERIODIC, recognition)).toEqual([
    { path: 'Journal/2026/A special day.md', date: '2026-04-05' },
    { path: 'Journal/03-04-2026.md', date: '2026-04-03' },
  ]);
  expect(discoverDailyNotes(files, texts, 'Journal', DEFAULT_PERIODIC, { ...recognition, dateOrder: 'mdy' }).at(-1)?.date).toBe('2026-03-04');
  expect([...texts]).toEqual(before);
});
