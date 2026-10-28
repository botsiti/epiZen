import { describe, expect, it } from 'vitest';
import type { VaultFile } from './api';
import { parseNote } from './frontmatter';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEpisodes, parseSearch } from './lookup';
import {
  allEntries,
  bodyWithoutCover,
  calendarStart,
  collectLibrary,
  coverEmbed,
  coverPath,
  coverStem,
  draftProblem,
  field,
  findOverview,
  genreCounts,
  imageType,
  isLibraryTab,
  isMediaNote,
  keyIn,
  kindOfFolder,
  kindCounts,
  kindOfPath,
  kindSpec,
  libraryStats,
  mediaNoteText,
  monthCounts,
  monthCovers,
  noteFileName,
  notePath,
  sortEntries,
  toggleKind,
  withGenre,
  yamlText,
  type MediaDraft,
} from './library';
import { linkResolver } from './links';

const files: VaultFile[] = [
  { path: 'Rating/music/00. Music 2026 MOC.md', kind: 'note' },
  { path: 'Rating/music/00. Music 2025 MOC.md', kind: 'note' },
  { path: 'Rating/music/Glasshouse Weather.md', kind: 'note' },
  { path: 'Rating/music/Dog Man Star.md', kind: 'note' },
  { path: 'Rating/music/_attachments/glasshouse-weather.svg', kind: 'image' },
  { path: 'Rating/kino/00. Kino 2026.md', kind: 'note' },
  { path: 'Rating/kino/00. Series MOC.md', kind: 'note' },
  { path: 'Rating/kino/Election.md', kind: 'note' },
  { path: 'Rating/books/00. Books.md', kind: 'note' },
  { path: 'Rating/books/Life 3.0.md', kind: 'note' },
  { path: 'Rating/podcasts/00. Podcast 2026.md', kind: 'note' },
  { path: 'Rating/podcasts/Jensen Huang.md', kind: 'note' },
  { path: 'Rating/youtube/How I Plan a Week in Plain Text.md', kind: 'note' },
  { path: 'Calendar/2026/days 2026/14.08.2026.md', kind: 'note' },
];

// Notes as the owner's vault and the demo vault write them, shortened. Keys come in either case.
const notes = [
  {
    path: 'Rating/music/Glasshouse Weather.md',
    text: '---\nArtist: Mira Okonkwo\nYear: 2021\nlistened: 2026-08-10\ngenre:\n  - art pop\nrating: 88\nfavorite tracks:\n  - Condensation\n  - Greenhouse Effect\n---\n[[00. Music 2026 MOC|music 2026]]\n\n![[glasshouse-weather.svg|240]]\n\nFine in the background.\n',
  },
  {
    path: 'Rating/music/Dog Man Star.md',
    text: '---\nArtist: Suede\nYear: 1994\nlistened: 2026-10-07\ngenre:\n  - art-rock\n  - alternative rock\nrating:\nfavorite tracks:\n  - "4"\n  - "9"\n---\n[[00.Music 2026 MOC|music 2026]]\n',
  },
  { path: 'Rating/kino/Election.md', text: '---\nYear: 1999\ngenre:\n  - black comedy\n  - drama\nrating: 58\nWatched: 2026-09-09\n---\n[[00. Kino 2026]]\nJim McAllister…' },
  {
    path: 'Rating/books/Life 3.0.md',
    text: '---\nYear: 2017\nGenre_book:\n  - sci-fi\n  - self improvement \nRating: 88\nFinshed: 2025-05-17\nStarted: 2025-03-06\n---\n[[00. Books]]\n',
  },
  { path: 'Rating/podcasts/Jensen Huang.md', text: '---\nAuthor: Lex Fridman\nGenre:\n  - AI\n  - business\nRating: 77\nListened: 2026-07-04\n---\n[[00. Podcast 2026]]\n' },
  { path: 'Rating/youtube/How I Plan a Week in Plain Text.md', text: '---\nChannel: Slow Systems\nWatched: 2026-08-15\nrating: 81\n---\n' },
  { path: 'Rating/music/00. Music 2026 MOC.md', text: '# Music 2026\n' },
  { path: 'Calendar/2026/days 2026/14.08.2026.md', text: '---\nmood: 4\n---\n' },
];

describe('kinds', () => {
  it('maps each folder under Rating/ to one kind, and nothing else', () => {
    expect(['music', 'kino', 'books', 'podcasts', 'youtube'].map((folder) => kindOfFolder(`Rating/${folder}`)?.kind)).toEqual(['album', 'film', 'book', 'podcast', 'video']);
    expect(kindOfFolder('Rating/Music')?.kind).toBe('album');
    for (const folder of ['Rating', 'Rating/music/_attachments', 'Notes/music', 'music', 'Rating/games']) expect(kindOfFolder(folder)).toBeUndefined();
    expect(kindOfPath('Rating/books/Life 3.0.md')?.tab).toBe('Books');
    expect(kindOfPath('Rating/music/00. Music 2026 MOC.md')).toBeUndefined();
    expect(kindOfPath('Rating/music/_attachments/cover.png')).toBeUndefined();
    expect(kindOfPath('Rating/music/old/Album.md')).toBeUndefined();
  });

  it('reads a property whatever case its key is in, and finds the note\'s own spelling', () => {
    const { properties } = parseNote('---\nrating: 58\nGenre:\n  - drama\nWatched: 2026-09-09\nYear:\n---\n');
    expect(field(properties, 'Rating')).toBe(58);
    expect(field(properties, 'genre')).toEqual(['drama']);
    expect(keyIn(properties, 'Rating')).toBe('rating');
    expect(keyIn(properties, 'watched')).toBe('Watched');
    expect(keyIn(properties, 'Director')).toBeUndefined();
    // Both spellings in one note: the one with a value wins.
    expect(field(parseNote('---\nrating:\nRating: 70\n---\n').properties, 'rating')).toBe(70);
  });

  it('counts a note as rated when it has a rating property, even an empty one', () => {
    expect(isMediaNote('Rating/music/Dog Man Star.md', { rating: null })).toBe(true);
    expect(isMediaNote('Rating/music/Dog Man Star.md', { Artist: 'Suede' })).toBe(false);
    expect(isMediaNote('Notes/Dog Man Star.md', { rating: 80 })).toBe(false);
  });
});

describe('collectLibrary', () => {
  const library = collectLibrary(notes, files);

  it('reads every rated note in its kind, with its maker, year, date, genres and cover', () => {
    expect(library.get('album')).toEqual([
      {
        path: 'Rating/music/Glasshouse Weather.md',
        kind: 'album',
        title: 'Glasshouse Weather',
        maker: 'Mira Okonkwo',
        year: '2021',
        rating: 88,
        date: '2026-08-10',
        started: undefined,
        genres: ['art pop'],
        tracks: ['Condensation', 'Greenhouse Effect'],
        cover: 'Rating/music/_attachments/glasshouse-weather.svg',
      },
      {
        path: 'Rating/music/Dog Man Star.md',
        kind: 'album',
        title: 'Dog Man Star',
        maker: 'Suede',
        year: '1994',
        rating: undefined,
        date: '2026-10-07',
        started: undefined,
        genres: ['art-rock', 'alternative rock'],
        tracks: ['4', '9'],
        cover: undefined,
      },
    ]);
    expect(library.get('film')?.[0]).toMatchObject({ title: 'Election', rating: 58, date: '2026-09-09', genres: ['black comedy', 'drama'], maker: undefined });
    expect(library.get('book')?.[0]).toMatchObject({ rating: 88, date: '2025-05-17', started: '2025-03-06', genres: ['sci-fi', 'self improvement'] });
    expect(library.get('podcast')?.[0]).toMatchObject({ maker: 'Lex Fridman', rating: 77, date: '2026-07-04', genres: ['ai', 'business'], year: undefined });
    expect(library.get('video')?.[0]).toMatchObject({ maker: 'Slow Systems', rating: 81, date: '2026-08-15' });
  });

  it('works out the counts, the average and the spread of ratings', () => {
    const albums = library.get('album') ?? [];
    expect(libraryStats(albums, new Date(2026, 9, 27))).toEqual({
      total: 2,
      thisYear: 2,
      average: 88,
      rated: 1,
      histogram: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
    });
    expect(libraryStats([], new Date(2026, 9, 27))).toMatchObject({ total: 0, average: undefined });
    expect(libraryStats(library.get('book') ?? [], new Date(2026, 9, 27)).thisYear).toBe(0);
  });

  it('sorts by the latest, the best or the title, and filters by genre', () => {
    const all = [...(library.get('album') ?? []), ...(library.get('film') ?? [])];
    expect(sortEntries(all, 'recent').map((entry) => entry.title)).toEqual(['Dog Man Star', 'Election', 'Glasshouse Weather']);
    expect(sortEntries(all, 'rating').map((entry) => entry.title)).toEqual(['Glasshouse Weather', 'Election', 'Dog Man Star']);
    expect(sortEntries(all, 'title').map((entry) => entry.title)).toEqual(['Dog Man Star', 'Election', 'Glasshouse Weather']);
    expect(genreCounts(all)[0]).toEqual(['alternative rock', 1]);
    expect(withGenre(all, 'drama').map((entry) => entry.title)).toEqual(['Election']);
    expect(withGenre(all)).toHaveLength(3);
  });

  it('lays a month out by day for the calendar of covers, and opens on the latest month', () => {
    const albums = library.get('album') ?? [];
    expect(monthCounts(albums, 2026)).toEqual([0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0]);
    expect([...monthCovers(albums, 2026, 7)].map(([date, entries]) => [date, entries.map((entry) => entry.title)])).toEqual([[10, ['Glasshouse Weather']]]);
    expect(calendarStart(albums, new Date(2026, 9, 27))).toEqual({ year: 2026, month: 9 });
    expect(calendarStart(albums, new Date(2026, 11, 1))).toEqual({ year: 2026, month: 9 });
    expect(calendarStart(albums, new Date(2026, 8, 1))).toEqual({ year: 2026, month: 7 });
    expect(calendarStart([], new Date(2026, 8, 1))).toEqual({ year: 2026, month: 8 });
  });
});

describe('everything together', () => {
  const library = collectLibrary(notes, files);

  it('puts every shelved kind together, or only the kinds chosen, and counts each', () => {
    const counts = kindCounts(library);
    expect(counts.map(([kind]) => kind)).toEqual(['album', 'film', 'book', 'podcast']);
    expect(allEntries(library)).toHaveLength(counts.reduce((sum, [, count]) => sum + count, 0));
    expect(allEntries(library).some((entry) => entry.kind === 'video')).toBe(false);
    expect(allEntries(library, new Set(['podcast'])).map((entry) => entry.kind)).toEqual(['podcast']);
    expect(allEntries(library, new Set(['film', 'book'])).every((entry) => entry.kind === 'film' || entry.kind === 'book')).toBe(true);
  });

  it('turns kinds on and off, and every kind on is none: everything shows', () => {
    let kinds = toggleKind(new Set(), 'album');
    expect([...kinds]).toEqual(['album']);
    kinds = toggleKind(toggleKind(kinds, 'film'), 'album');
    expect([...kinds]).toEqual(['film']);
    for (const kind of ['album', 'book', 'podcast'] as const) kinds = toggleKind(kinds, kind);
    expect(kinds.size).toBe(0);
  });

  it('knows its tabs', () => {
    expect(['all', 'album', 'podcast', 'video'].every(isLibraryTab)).toBe(true);
    expect([undefined, 'games', 'toString', 1].some(isLibraryTab)).toBe(false);
  });
});

describe('a new note', () => {
  const draft = (patch: Partial<MediaDraft>): MediaDraft => ({ title: '', maker: '', year: '', genres: [], rating: '', date: '', started: '', ...patch });

  it('writes an album as the vault does: Artist, Year, listened, genre, rating, favorite tracks, the year\'s overview, the cover', () => {
    const text = mediaNoteText(
      kindSpec('album'),
      draft({ title: 'Dog Man Star', maker: 'Suede', year: '1994', genres: ['britpop', 'glam rock', 'art rock'], rating: '86', date: '2026-10-07' }),
      { overview: '00. Music 2026 MOC', cover: 'Rating/music/_attachments/dog-man-star.png' },
    );
    expect(text).toBe(
      '---\nArtist: Suede\nYear: 1994\nlistened: 2026-10-07\ngenre:\n  - britpop\n  - glam rock\n  - art rock\nrating: 86\nfavorite tracks:\n---\n[[00. Music 2026 MOC|music 2026]]\n\n![[dog-man-star.png|240]]\n',
    );
  });

  it('writes a film: Director, Year, Watched, Genre, Rating', () => {
    expect(
      mediaNoteText(kindSpec('film'), draft({ title: 'American Fiction', maker: 'Cord Jefferson', year: '2023', genres: ['comedy'], rating: '77', date: '2026-10-20' }), {
        overview: '00. Kino 2026',
        cover: 'Rating/kino/_attachments/american-fiction.jpg',
      }),
    ).toBe('---\nDirector: Cord Jefferson\nYear: 2023\nWatched: 2026-10-20\nGenre:\n  - comedy\nRating: 77\n---\n[[00. Kino 2026]]\n\n![[american-fiction.jpg|200]]\n');
  });

  it('writes a book: Author, Year, Genre_book, Rating, Finshed (as the vault spells it), Started', () => {
    expect(
      mediaNoteText(
        kindSpec('book'),
        draft({ title: 'Life 3.0', maker: 'Max Tegmark', year: '2017', genres: ['sci-fi', 'self improvement'], rating: '88', date: '2025-05-17', started: '2025-03-06' }),
        { overview: '00. Books', cover: 'Rating/books/_attachments/life-3-0.jpg' },
      ),
    ).toBe('---\nAuthor: Max Tegmark\nYear: 2017\nGenre_book:\n  - sci-fi\n  - self improvement\nRating: 88\nFinshed: 2025-05-17\nStarted: 2025-03-06\n---\n[[00. Books]]\n\n![[life-3-0.jpg|200]]\n');
  });

  it('writes a podcast: Author, Rating, Genre, Listened', () => {
    expect(
      mediaNoteText(kindSpec('podcast'), draft({ title: 'Jensen Huang', maker: 'Lex Fridman', genres: ['AI', 'business'], rating: '77', date: '2026-07-04' }), { overview: '00. Podcast 2026' }),
    ).toBe('---\nAuthor: Lex Fridman\nRating: 77\nGenre:\n  - AI\n  - business\nListened: 2026-07-04\n---\n[[00. Podcast 2026]]\n');
  });

  it('writes a podcast episode with the year it came out where the vault\'s notes that have one put it, between Rating and Genre', () => {
    // As "Ilya Sutskever" is written in the owner's vault: Author, Rating, Year, Genre, Listened.
    expect(
      mediaNoteText(kindSpec('podcast'), draft({ title: 'Ilya Sutskever', maker: 'Dwarkesh', year: '2025', genres: ['AI', 'interview'], rating: '68', date: '2026-01-06' }), {
        overview: '00. Podcast 2025 MOC',
      }),
    ).toBe('---\nAuthor: Dwarkesh\nRating: 68\nYear: 2025\nGenre:\n  - AI\n  - interview\nListened: 2026-01-06\n---\n[[00. Podcast 2025 MOC]]\n');
    // Without a year it is left out, as the vault's template leaves it out; other empty ones stay.
    expect(mediaNoteText(kindSpec('podcast'), draft({ title: 'Tear' }), {})).toBe('---\nAuthor:\nRating:\nGenre:\nListened:\n---\n');
  });

  it('writes an episode picked from a show\'s episodes: its title for the name, the show as Author, its year, its artwork as the cover', () => {
    // The recorded iTunes answers (test/fixtures/lookup/), read from the project's root: this file runs in jsdom.
    const json = (name: string): unknown => JSON.parse(readFileSync(join(process.cwd(), 'test/fixtures/lookup', name), 'utf8'));
    const show = parseSearch('itunes-podcast', { itunes: json('itunes-podcast.json') })[0]!;
    const episode = parseEpisodes(json('itunes-episodes.json'), show).find((found) => found.title.startsWith('Jensen Huang'))!;
    const spec = kindSpec('podcast');
    const picked = draft({ title: episode.title, maker: episode.maker, year: episode.year, genres: episode.genres, rating: '77', date: '2026-09-21' });
    const cover = coverPath(spec, picked.title, files);
    expect(notePath(spec, picked.title, files).path).toBe('Rating/podcasts/Jensen Huang - NVIDIA – The $4 Trillion Company & the AI Revolution.md');
    expect(cover).toBe('Rating/podcasts/_attachments/jensen-huang-nvidia-the-4-trillion-company-and-the-ai-revolution.jpg');
    expect(mediaNoteText(spec, picked, { overview: findOverview(spec, files, 2026), cover: cover.replace(/\.jpg$/, '.png') })).toBe(
      '---\nAuthor: Lex Fridman Podcast\nRating: 77\nYear: 2026\nGenre:\n  - technology\nListened: 2026-09-21\n---\n[[00. Podcast 2026]]\n\n![[jensen-huang-nvidia-the-4-trillion-company-and-the-ai-revolution.png|240]]\n',
    );
  });

  it('leaves what the form left empty as an empty property, and quotes only what YAML would misread', () => {
    expect(mediaNoteText(kindSpec('film'), draft({ title: 'X', maker: 'Ed: Wood', year: '' }), {})).toBe('---\nDirector: "Ed: Wood"\nYear:\nWatched:\nGenre:\nRating:\n---\n');
    expect(yamlText('Nino & the Quiet Hours')).toBe('Nino & the Quiet Hours');
    expect(yamlText('Тбилиси')).toBe('Тбилиси');
    expect(yamlText('1999')).toBe('"1999"');
    expect(yamlText('true')).toBe('"true"');
    expect(yamlText('- dash')).toBe('"- dash"');
    expect(yamlText('Sunn O)))')).toBe('Sunn O)))');
    expect(yamlText('a #tag')).toBe('"a #tag"');
    expect(yamlText('"quoted"')).toBe('"\\"quoted\\""');
    expect(yamlText(' padded ')).toBe('" padded "');
  });

  it('finds the year\'s overview note, or the single one for books, and never a wrong one', () => {
    expect(findOverview(kindSpec('album'), files, 2026)).toBe('00. Music 2026 MOC');
    expect(findOverview(kindSpec('album'), files, 2025)).toBe('00. Music 2025 MOC');
    expect(findOverview(kindSpec('album'), files, 2027)).toBeUndefined();
    expect(findOverview(kindSpec('album'), [{ path: 'Rating/music/00.Music 2026 MOC.md', kind: 'note' }], 2026)).toBe('00.Music 2026 MOC');
    expect(findOverview(kindSpec('film'), files, 2026)).toBe('00. Kino 2026');
    // "00. Series MOC" names no year, and films are yearly: no link rather than a wrong one.
    expect(findOverview(kindSpec('film'), files, 2024)).toBeUndefined();
    expect(findOverview(kindSpec('book'), files, 2026)).toBe('00. Books');
    expect(findOverview(kindSpec('podcast'), files, 2026)).toBe('00. Podcast 2026');
  });

  it('names the note after the title, and the cover so no other image has its name', () => {
    expect(noteFileName('Range: Why Generalists Triumph in a Specialized World')).toBe('Range - Why Generalists Triumph in a Specialized World');
    expect(noteFileName('AC/DC [Live] #1?')).toBe('AC DC Live 1');
    expect(noteFileName('...Baby One More Time')).toBe('Baby One More Time');
    expect(noteFileName('Жить')).toBe('Жить');
    expect(noteFileName('???')).toBe('');
    expect(coverStem('Salt & Graphite')).toBe('salt-and-graphite');
    expect(coverStem('Икиру (Жить)')).toBe('икиру-жить');
    expect(coverStem('!!!')).toBe('cover');
    expect(coverPath(kindSpec('album'), 'Glasshouse Weather', files)).toBe('Rating/music/_attachments/glasshouse-weather-2.jpg');
    expect(coverPath(kindSpec('book'), 'Life 3.0', files)).toBe('Rating/books/_attachments/life-3-0.jpg');
    expect(notePath(kindSpec('album'), 'Dog Man Star', files)).toEqual({ path: 'Rating/music/Dog Man Star.md', taken: true });
    expect(notePath(kindSpec('album'), 'dog man star', files).taken).toBe(true);
    expect(notePath(kindSpec('book'), 'Feeling Good', files)).toEqual({ path: 'Rating/books/Feeling Good.md', taken: false });
  });

  it('checks the form before anything is written', () => {
    expect(draftProblem(draft({}))).toBe('Give it a title.');
    expect(draftProblem(draft({ title: 'X', rating: '101' }))).toMatch(/0 to 100/);
    expect(draftProblem(draft({ title: 'X', rating: '8.5' }))).toMatch(/whole number/);
    expect(draftProblem(draft({ title: 'X', date: '2026-02-30' }))).toMatch(/isn't a date/);
    expect(draftProblem(draft({ title: 'X', year: 'nineties' }))).toMatch(/year/);
    expect(draftProblem(draft({ title: 'X', rating: '0', date: '2026-10-27', year: '1994' }))).toBeUndefined();
  });
});

describe('the media page', () => {
  it('shows the note\'s text without the cover the hero already shows', () => {
    const body = '[[00. Music 2026 MOC|music 2026]]\n\n![[glasshouse-weather.svg|240]]\n\nFine in the background.\n';
    const cover = coverEmbed(body, 'Rating/music/Glasshouse Weather.md', linkResolver(files));
    expect(cover?.file.path).toBe('Rating/music/_attachments/glasshouse-weather.svg');
    expect(bodyWithoutCover(body, cover?.link)).toBe('[[00. Music 2026 MOC|music 2026]]\n\nFine in the background.\n');
    expect(bodyWithoutCover(body)).toBe(body);
  });

  it('tells a cover\'s image type by its bytes', () => {
    expect(imageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(imageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe('image/png');
    expect(imageType(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8'))).toBe('image/webp');
    expect(imageType(new TextEncoder().encode('<svg/>'))).toBeUndefined();
  });
});
