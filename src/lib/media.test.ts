import { describe, expect, it } from 'vitest';
import type { VaultFile } from './api';
import { collectMedia, homeShelves, type Shelf } from './media';

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

  it('shelves a note that writes Rating, and dates a book by when it was finished', () => {
    const shelves = collectMedia(
      [
        { path: 'Rating/books/Thinking in Seasons.md', text: '---\nAuthor: Ada Morrow\nYear: 2023\nRating: 81\nFinshed: 2026-09-19\nStarted: 2026-08-26\n---\n' },
        { path: 'Rating/kino/Election.md', text: '---\nYear: 1999\nrating: 58\nWatched: 2026-09-09\n---\n' },
        { path: 'Rating/podcasts/Tear.md', text: '---\nAuthor:\nRating:\nListened: 2026-09-17\n---\n' },
      ],
      [],
    );
    expect(shelves.map((shelf) => [shelf.folder, shelf.items.map((item) => [item.title, item.rating, item.subtitle, item.date])])).toEqual([
      ['Rating/books', [['Thinking in Seasons', 81, 'Ada Morrow', '2026-09-19']]],
      ['Rating/kino', [['Election', 58, '1999', '2026-09-09']]],
    ]);
  });
});

describe('the home screen’s shelves', () => {
  const shelf = (folder: string, n: number): Shelf => ({ folder, items: Array.from({ length: n }, (_, i) => ({ path: `${folder}/${i}.md`, title: String(i), rating: 50, date: undefined })) });

  it('are albums, films, books and podcasts, in that order, without videos', () => {
    const shelves = homeShelves([shelf('Rating/youtube', 3), shelf('Rating/podcasts', 1), shelf('Rating/music', 9), shelf('Rating/kino', 4)]);
    expect(shelves.map((s) => [s.folder, s.items.length])).toEqual([
      ['Rating/music', 9],
      ['Rating/kino', 4],
      ['Rating/books', 0],
      ['Rating/podcasts', 1],
    ]);
  });

  it('keep a folder named in another case, and leave other folders out', () => {
    expect(homeShelves([shelf('Rating/Music', 2), shelf('Notes', 5)]).map((s) => [s.folder, s.items.length])[0]).toEqual(['Rating/Music', 2]);
  });
});
