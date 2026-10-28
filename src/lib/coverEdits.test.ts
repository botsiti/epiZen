import { describe, expect, it } from 'vitest';
import type { VaultFile } from './api';
import { addCover, coverFills, replaceCover, type Fill } from './coverEdits';
import { parseNote } from './frontmatter';
import { coverEmbed, kindSpec, readEntry } from './library';
import { linkResolver } from './links';

// Notes in the vault's own shapes: an overview link with the text right under it, a blank line
// between, nothing after it, no overview at all, CRLF, an empty Director, a key in another case,
// a book that embeds its pages further down. The texts are the vault's format, not its words.
const files: VaultFile[] = [
  { path: 'Rating/kino/Ikiru (Жить).md', kind: 'note' },
  { path: 'Rating/books/Zero to One.md', kind: 'note' },
  { path: 'Rating/books/_attachments/1 challenge.png', kind: 'image' },
  { path: 'Rating/music/Dog Man Star.md', kind: 'note' },
  { path: 'Rating/music/_attachments/dog-man-star.png', kind: 'image' },
];
const resolve = linkResolver(files);
const film = { spec: kindSpec('film'), path: 'Rating/kino/Ikiru (Жить).md', resolve };
const album = { spec: kindSpec('album'), path: 'Rating/music/Antics.md', resolve };
const book = { spec: kindSpec('book'), path: 'Rating/books/Zero to One.md', resolve };
const podcast = { spec: kindSpec('podcast'), path: 'Rating/podcasts/Jensen Huang.md', resolve };

const IKIRU = '---\nrating: 90\nYear: 1952\ngenre:\n  - drama\nWatched: 2026-01-31\n---\n[[00. Kino 2026]]\nA clerk learns he is ill.\n\n    ❝ Жить. ❞\n';

/** The lines added, in order, and that every other line is as it was. */
function added(before: string, after: string): string[] {
  const old = before.split('\n');
  const now = after.split('\n');
  const extra: string[] = [];
  let i = 0;
  for (const line of now) {
    if (line === old[i]) i += 1;
    else extra.push(line);
  }
  expect(i, 'every line the note had is still there, in order').toBe(old.length);
  return extra;
}

describe('the fills a found cover brings', () => {
  it('fills only what the note leaves empty or lacks, under its own spelling of the key', () => {
    const found = { maker: 'Akira Kurosawa', year: '1952', genres: ['drama', 'social'] };
    // Ikiru has a year and a genre (as `genre`, though films write `Genre`), no director.
    expect(coverFills(kindSpec('film'), parseNote(IKIRU).properties, found)).toEqual([{ name: 'maker', key: 'Director', value: 'Akira Kurosawa' }]);
    // An empty Director, an empty genre list.
    const together = parseNote('---\ngenre: []\nYear: 2025\nDirector:\nRating: 55\n---\n').properties;
    expect(coverFills(kindSpec('film'), together, found)).toEqual([
      { name: 'maker', key: 'Director', value: 'Akira Kurosawa' },
      { name: 'genre', key: 'genre', value: ['drama', 'social'] },
    ]);
    // Nothing the find doesn't know, and no year that isn't one.
    expect(coverFills(kindSpec('film'), together, { genres: [], year: 'c. 1950' })).toEqual([]);
    // A podcast's year, sparse in its notes.
    expect(coverFills(kindSpec('podcast'), parseNote('---\nAuthor: Lex Fridman\nRating: 77\nListened: 2026-07-04\n---\n').properties, { maker: 'Lex Fridman Podcast', year: '2026', genres: ['technology'] })).toEqual([
      { name: 'year', key: 'Year', value: '2026' },
      { name: 'genre', key: 'Genre', value: ['technology'] },
    ]);
  });
});

describe('adding a cover', () => {
  it('puts the embed on its own paragraph after the overview link, the text right under it moved down a line', () => {
    const fills: Fill[] = [{ name: 'maker', key: 'Director', value: 'Akira Kurosawa' }];
    const next = addCover(IKIRU, film, 'Rating/kino/_attachments/ikiru.jpg', fills);
    expect(next).toBe(
      '---\nrating: 90\nDirector: Akira Kurosawa\nYear: 1952\ngenre:\n  - drama\nWatched: 2026-01-31\n---\n[[00. Kino 2026]]\n\n![[ikiru.jpg|200]]\n\nA clerk learns he is ill.\n\n    ❝ Жить. ❞\n',
    );
    expect(added(IKIRU, next)).toEqual(['Director: Akira Kurosawa', '', '![[ikiru.jpg|200]]', '']);
    // It is the note's cover now.
    expect(readEntry(film.path, next, linkResolver([...files, { path: 'Rating/kino/_attachments/ikiru.jpg', kind: 'image' }]))?.cover).toBe('Rating/kino/_attachments/ikiru.jpg');
  });

  it('writes the note as a new one would be, whatever comes after the overview link', () => {
    const top = '---\nArtist: Interpol\nYear: 2004\nrating: 77\n---\n';
    // Nothing after it: as Add writes a new note.
    expect(addCover(`${top}[[00. Music 2024 MOC]]\n`, album, 'antics.jpg')).toBe(`${top}[[00. Music 2024 MOC]]\n\n![[antics.jpg|240]]\n`);
    // A blank line after it, then text; an alias on the link; no space after "00.".
    expect(addCover(`${top}[[00.Music 2026 MOC|music 2026]]\n\nFavorite tracks: Evil\n`, album, 'antics.jpg')).toBe(`${top}[[00.Music 2026 MOC|music 2026]]\n\n![[antics.jpg|240]]\n\nFavorite tracks: Evil\n`);
    // Blank lines before it, and no newline at the end.
    expect(addCover(`${top}\n[[00. Music 2024 MOC]]`, album, 'antics.jpg')).toBe(`${top}\n[[00. Music 2024 MOC]]\n\n![[antics.jpg|240]]`);
    // No overview link: at the top of the body.
    expect(addCover(`${top}Favorite tracks: Evil\n`, album, 'antics.jpg')).toBe(`${top}![[antics.jpg|240]]\n\nFavorite tracks: Evil\n`);
    expect(addCover(`${top}\nFavorite tracks: Evil\n`, album, 'antics.jpg')).toBe(`${top}![[antics.jpg|240]]\n\nFavorite tracks: Evil\n`);
    expect(addCover(top, album, 'antics.jpg')).toBe(`${top}![[antics.jpg|240]]\n`);
    // A link that isn't an overview is the note's text.
    expect(addCover(`${top}[[Interpol]] at their best.\n`, album, 'antics.jpg')).toBe(`${top}![[antics.jpg|240]]\n\n[[Interpol]] at their best.\n`);
  });

  it('keeps CRLF and Cyrillic as they are', () => {
    const crlf = '---\r\nAuthor: Эллис\r\nYear: 1972\r\nRating: 82\r\n---\r\n[[00. Books]]\r\n# Ч1 - исследования\r\n';
    expect(addCover(crlf, book, 'психотренинг.jpg')).toBe('---\r\nAuthor: Эллис\r\nYear: 1972\r\nRating: 82\r\n---\r\n[[00. Books]]\r\n\r\n![[психотренинг.jpg|200]]\r\n\r\n# Ч1 - исследования\r\n');
  });

  it('fills an empty value in place and adds a missing one where the kind puts it, never touching one with a value', () => {
    const together = '---\ngenre: []\nYear: 2025\nWatched: 2025-09-20\nDirector:\nRating: 55\nSomething interesting:\n---\n[[00. Kino 2025 MOC]]\n';
    const fills: Fill[] = [
      { name: 'maker', key: 'Director', value: 'Michael Shanks' },
      { name: 'genre', key: 'genre', value: ['horror', 'romance'] },
      // Not empty: left as it is.
      { name: 'year', key: 'Year', value: '1999' },
    ];
    expect(addCover(together, film, 'together.jpg', fills)).toBe(
      '---\ngenre:\n  - horror\n  - romance\nYear: 2025\nWatched: 2025-09-20\nDirector: Michael Shanks\nRating: 55\nSomething interesting:\n---\n[[00. Kino 2025 MOC]]\n\n![[together.jpg|200]]\n',
    );
    // A podcast's Year goes after its Rating, as the vault's notes have it; a value that needs quotes gets them.
    const episode = '---\nAuthor: Lex Fridman\nRating: 77\nListened: 2026-07-04\n---\n[[00. Podcast 2026]]\n';
    expect(
      addCover(episode, podcast, 'lex.jpg', [
        { name: 'year', key: 'Year', value: '2026' },
        { name: 'genre', key: 'Genre', value: ['tech: AI'] },
      ]),
    ).toBe('---\nAuthor: Lex Fridman\nRating: 77\nYear: 2026\nGenre:\n  - "tech: AI"\nListened: 2026-07-04\n---\n[[00. Podcast 2026]]\n\n![[lex.jpg|240]]\n');
    // A list with items, a commented value, a list written flush: all have something, so none changes.
    for (const kept of ['genre:\n  - drama', 'genre: # later', 'genre:\n- drama']) {
      const text = `---\n${kept}\nrating: 90\n---\n[[00. Kino 2026]]\n`;
      expect(addCover(text, film, 'x.jpg', [{ name: 'genre', key: 'genre', value: ['comedy'] }])).toBe(`${text}\n![[x.jpg|200]]\n`);
    }
  });

  it('fills a key written in quotes under its own spelling, and refuses rather than write properties that read differently', () => {
    const quoted = `---\n"Director":\n'Year': 2000\nrating: 1\n---\n[[00. Kino 2026]]\n`;
    const fills = coverFills(kindSpec('film'), parseNote(quoted).properties, { maker: 'A B', year: '1999', genres: [] });
    expect(fills).toEqual([{ name: 'maker', key: 'Director', value: 'A B' }]);
    expect(addCover(quoted, film, 'x.jpg', fills)).toBe(`---\n"Director": A B\n'Year': 2000\nrating: 1\n---\n[[00. Kino 2026]]\n\n![[x.jpg|200]]\n`);
    expect(addCover('---\nDirector :\nrating: 1\n---\n', film, 'x.jpg', fills)).toBe('---\nDirector: A B\nrating: 1\n---\n![[x.jpg|200]]\n');
    // Properties written as one YAML map, which the line-by-line fill doesn't read: the result is read back, and refused.
    const flow = '---\n{Director: , rating: 1}\n---\n';
    expect(() => addCover(flow, film, 'x.jpg', coverFills(kindSpec('film'), parseNote(flow).properties, { maker: 'A B', genres: [] }))).toThrow(/without touching others/);
  });

  it('adds the cover above a book’s own page images, which are not its cover', () => {
    const zero = '---\nAuthor: Peter Thiel\nRating: 99\n---\n[[00. Books]]\n#### 1 The Challenge of the Future\n![[1 challenge.png]]\n';
    expect(coverEmbed(parseNote(zero).body, book.path, resolve)).toBeUndefined();
    const next = addCover(zero, book, 'zero-to-one.jpg');
    expect(next).toBe('---\nAuthor: Peter Thiel\nRating: 99\n---\n[[00. Books]]\n\n![[zero-to-one.jpg|200]]\n\n#### 1 The Challenge of the Future\n![[1 challenge.png]]\n');
  });

  it('refuses a note it could not change as it should, and changes nothing', () => {
    const cover = '---\nArtist: Suede\nrating: 86\n---\n[[00. Music 2026 MOC|music 2026]]\n\n![[dog-man-star.png|240]]\n';
    expect(() => addCover(cover, { ...album, path: 'Rating/music/Dog Man Star.md' }, 'x.jpg')).toThrow(/has a cover already/);
    // An embed of an image that isn't in the vault is no cover: the new one goes above it.
    const broken = cover.replace('dog-man-star.png', 'gone.png');
    expect(addCover(broken, album, 'x.jpg')).toBe('---\nArtist: Suede\nrating: 86\n---\n[[00. Music 2026 MOC|music 2026]]\n\n![[x.jpg|240]]\n\n![[gone.png|240]]\n');
    expect(() => addCover('---\nrating: 1\n---\r\nx\n', album, 'x.jpg')).toThrow(/mixes line endings/);
    expect(() => addCover('No properties.\n', album, 'x.jpg')).toThrow(/no properties/);
    expect(() => addCover('---\nrating: [1\n---\n', album, 'x.jpg')).toThrow(/aren't readable/);
    expect(() => addCover('---\nrating: 1\n', album, 'x.jpg')).toThrow(/never close/);
    for (const bad of ['a]]b.jpg', 'x|y.png', 'note.md', 'a#b.jpg']) expect(() => addCover(IKIRU, film, bad)).toThrow(/isn't an image name/);
  });
});

describe('changing a cover', () => {
  it('points the embed at the new image and keeps its width; nothing else changes', () => {
    const text = '---\nArtist: Suede\nrating: 86\n---\n[[00. Music 2026 MOC|music 2026]]\n\n![[dog-man-star.png|240]]\n\nBest with headphones.\n';
    const next = replaceCover(text, 'Rating/music/Dog Man Star.md', resolve, 'Rating/music/_attachments/dog-man-star-2.jpg');
    expect(next).toBe(text.replace('![[dog-man-star.png|240]]', '![[dog-man-star-2.jpg|240]]'));
    // Without a width too, and in a CRLF note.
    const crlf = '---\r\nrating: 86\r\n---\r\n![[dog-man-star.png]]\r\n';
    expect(replaceCover(crlf, 'Rating/music/Dog Man Star.md', resolve, 'new.webp')).toBe('---\r\nrating: 86\r\n---\r\n![[new.webp]]\r\n');
    expect(() => replaceCover(IKIRU, film.path, resolve, 'x.jpg')).toThrow(/no cover/);
  });
});
