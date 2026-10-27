// @vitest-environment node
// Recorded answers from each source, trimmed (test/fixtures/lookup/). Tests never go on the network.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allowedUrl, LOOKUP_HOST_SUFFIXES, LOOKUP_HOSTS, parseResults, searchUrl, withDetails } from './lookup';

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`../../test/fixtures/lookup/${name}`, import.meta.url), 'utf8'));

describe('search URLs', () => {
  it('asks each source for what was typed, and nothing for a letter or less', () => {
    expect(searchUrl('musicbrainz', '  dog  man star ')).toBe('https://musicbrainz.org/ws/2/release-group?query=dog%20man%20star&fmt=json&limit=12');
    expect(searchUrl('musicbrainz', 'AC/DC')).toBe('https://musicbrainz.org/ws/2/release-group?query=AC%5C%2FDC&fmt=json&limit=12');
    expect(searchUrl('itunes-movie', 'American Fiction')).toBe('https://itunes.apple.com/search?media=movie&entity=movie&term=American%20Fiction&limit=12');
    expect(searchUrl('itunes-podcast', 'lex fridman')).toBe('https://itunes.apple.com/search?media=podcast&term=lex%20fridman&limit=12');
    expect(searchUrl('openlibrary', 'life 3.0')).toBe(
      'https://openlibrary.org/search.json?q=life%203.0&fields=key,title,author_name,first_publish_year,subject,cover_i&limit=10',
    );
    expect(searchUrl('openlibrary', 'a')).toBeUndefined();
    expect(searchUrl('openlibrary', '   ')).toBeUndefined();
  });
});

describe('MusicBrainz', () => {
  const results = parseResults('musicbrainz', fixture('musicbrainz-search.json'));

  it('lists release groups, the best and best-known match first, with Cover Art Archive covers', () => {
    expect(results).toHaveLength(6);
    expect(results[0]).toEqual({
      id: 'da15737e-3eb3-31e4-97f0-fe46299f75fb',
      title: 'Dog Man Star',
      maker: 'Suede',
      year: '1994',
      genres: ['britpop', 'glam rock', 'art rock'],
      thumb: 'https://coverartarchive.org/release-group/da15737e-3eb3-31e4-97f0-fe46299f75fb/front-250',
      cover: 'https://coverartarchive.org/release-group/da15737e-3eb3-31e4-97f0-fe46299f75fb/front-500',
      note: 'Album',
      details: 'https://musicbrainz.org/ws/2/release-group/da15737e-3eb3-31e4-97f0-fe46299f75fb?inc=genres+tags+artist-credits&fmt=json',
    });
    expect(results[1]).toMatchObject({ title: 'Dog Man Star', maker: 'NERVE', year: '2026', genres: [] });
    expect(results.find((result) => result.title.startsWith('ICA'))?.note).toBe('Album · Live');
  });

  it('takes the genres from the picked album\'s own page', () => {
    const picked = withDetails(results[0]!, fixture('musicbrainz-release-group.json'));
    expect(picked).toMatchObject({ title: 'Dog Man Star', maker: 'Suede', year: '1994', genres: ['britpop', 'glam rock', 'art rock'] });
    expect(withDetails(results[1]!, {}).genres).toEqual([]);
  });
});

describe('iTunes', () => {
  it('lists films with the director, the year, the genre and a 600px poster', () => {
    const films = parseResults('itunes-movie', fixture('itunes-movie.json'));
    expect(films.map((film) => [film.title, film.maker, film.year, film.genres])).toEqual([
      ['American Fiction', 'Cord Jefferson', '2023', ['comedy']],
      ['13 Miles', 'Helena Thom & Anthony Epp', '2022', ['drama']],
      ['Precious Little Things', 'Al Carretta', '2017', ['drama']],
    ]);
    expect(films[0]?.cover).toMatch(/^https:\/\/is1-ssl\.mzstatic\.com\/image\/thumb\/.+\/600x600bb\.jpg$/);
    expect(films[0]?.thumb).toMatch(/\/200x200bb\.jpg$/);
  });

  it('lists podcasts with the author, the genre and 600px artwork, and no year', () => {
    const podcasts = parseResults('itunes-podcast', fixture('itunes-podcast.json'));
    expect(podcasts[0]).toMatchObject({ title: 'Lex Fridman Podcast', maker: 'Lex Fridman', year: undefined, genres: ['technology'] });
    expect(podcasts[0]?.cover).toMatch(/\/600x600bb\.jpg$/);
    expect(podcasts).toHaveLength(4);
  });

  it('skips results of another kind, and answers that aren\'t results at all', () => {
    expect(parseResults('itunes-movie', fixture('itunes-podcast.json'))).toEqual([]);
    expect(parseResults('itunes-movie', { resultCount: 0, results: [] })).toEqual([]);
    for (const odd of [null, 'text', 42, [], { results: 'x' }, { results: [null, 1, { kind: 'feature-movie' }] }]) {
      expect(parseResults('itunes-movie', odd)).toEqual([]);
      expect(parseResults('musicbrainz', odd)).toEqual([]);
      expect(parseResults('openlibrary', odd)).toEqual([]);
    }
  });
});

describe('Open Library', () => {
  it('lists works with the first author, the first year, plain genres and a large cover', () => {
    const books = parseResults('openlibrary', fixture('openlibrary-search.json'));
    expect(books[0]).toEqual({
      id: '/works/OL19717530W',
      title: 'Life 3.0',
      maker: 'Max Tegmark',
      year: '2017',
      genres: ['technological forecasting', 'philosophy', 'artificial intelligence'],
      thumb: 'https://covers.openlibrary.org/b/id/10239283-M.jpg',
      cover: 'https://covers.openlibrary.org/b/id/10239283-L.jpg',
      note: undefined,
    });
    // A work without a cover has none to download.
    expect(books[1]).toMatchObject({ title: 'Summary and Analysis of Life 3. 0', cover: undefined, thumb: undefined });
  });
});

describe('the host allowlist', () => {
  it('is the same list the backend enforces', () => {
    const rust = readFileSync(new URL('../../src-tauri/src/net.rs', import.meta.url), 'utf8');
    const listed = (name: string) => [...(new RegExp(`pub const ${name}: &\\[&str\\] = &\\[([^\\]]*)\\]`).exec(rust)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    expect(listed('HOSTS')).toEqual(LOOKUP_HOSTS);
    expect(listed('HOST_SUFFIXES')).toEqual(LOOKUP_HOST_SUFFIXES);
  });

  it('covers every URL the sources build: searches, details, covers and their mirrors', () => {
    const urls = [
      ...(['musicbrainz', 'itunes-movie', 'itunes-podcast', 'openlibrary'] as const).map((source) => searchUrl(source, 'dog man star')),
      ...parseResults('musicbrainz', fixture('musicbrainz-search.json')).flatMap((result) => [result.thumb, result.cover, result.details]),
      ...parseResults('itunes-movie', fixture('itunes-movie.json')).flatMap((result) => [result.thumb, result.cover]),
      ...parseResults('itunes-podcast', fixture('itunes-podcast.json')).flatMap((result) => [result.thumb, result.cover]),
      ...parseResults('openlibrary', fixture('openlibrary-search.json')).flatMap((result) => [result.thumb, result.cover]),
      'https://dn710902.ca.archive.org/0/items/mbid-b71f964d/front.jpg',
    ].filter((url): url is string => Boolean(url));
    expect(urls.length).toBeGreaterThan(30);
    for (const url of urls) expect(allowedUrl(url), url).toBe(true);
  });

  it('refuses everything else', () => {
    for (const url of [
      'http://musicbrainz.org/ws/2/',
      'https://rateyourmusic.com/search?searchterm=x',
      'https://evilarchive.org/x.jpg',
      'https://archive.org.evil.com/x.jpg',
      'https://mzstatic.com/x.jpg',
      'https://musicbrainz.org:8443/',
      'https://user:pw@musicbrainz.org/',
      'https://93.184.216.34/',
      'file:///etc/hosts',
      'not a url',
    ]) {
      expect(allowedUrl(url), url).toBe(false);
    }
  });
});
