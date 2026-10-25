import { describe, expect, it } from 'vitest';
import type { VaultFile } from './api';
import { collectMedia } from './media';

const files: VaultFile[] = [
  { path: 'Rating/music/Glasshouse Weather.md', kind: 'note' },
  { path: 'Rating/music/Low Tide Hymns.md', kind: 'note' },
  { path: 'Rating/music/_attachments/glasshouse-weather.svg', kind: 'image' },
  { path: 'Rating/kino/The Lighthouse Accountant.md', kind: 'note' },
  { path: 'Calendar/2026/days 2026/14.08.2026.md', kind: 'note' },
];

// Real notes from demo-vault/, shortened.
const notes = [
  {
    path: 'Rating/music/Glasshouse Weather.md',
    text: '---\nArtist: Mira Okonkwo\nYear: 2021\nlistened: 2026-08-10\nrating: 88\n---\n[[00. Music 2026 MOC|music 2026]]\n\n![[glasshouse-weather.svg|240]]\n',
  },
  { path: 'Rating/music/Low Tide Hymns.md', text: '---\nArtist: Saltmarsh Choir\nlistened: 2026-08-21\nrating: 84\n---\nNo cover yet.\n' },
  { path: 'Rating/kino/The Lighthouse Accountant.md', text: '---\nYear: 2019\nWatched: 2026-08-10\nrating: 82\n---\n' },
  { path: 'Calendar/2026/days 2026/14.08.2026.md', text: '---\nmood: 9\n---\n' },
];

describe('collectMedia', () => {
  it('shelves every rated note by folder, newest first, with its cover and who made it', () => {
    const shelves = collectMedia(notes, files);
    expect(shelves.map((shelf) => shelf.folder)).toEqual(['Rating/music', 'Rating/kino']);
    expect(shelves[0]?.items).toEqual([
      { path: 'Rating/music/Low Tide Hymns.md', title: 'Low Tide Hymns', subtitle: 'Saltmarsh Choir', rating: 84, cover: undefined, date: '2026-08-21' },
      {
        path: 'Rating/music/Glasshouse Weather.md',
        title: 'Glasshouse Weather',
        subtitle: 'Mira Okonkwo',
        rating: 88,
        cover: 'Rating/music/_attachments/glasshouse-weather.svg',
        date: '2026-08-10',
      },
    ]);
    expect(shelves[1]?.items[0]?.subtitle).toBe('2019');
  });
});
