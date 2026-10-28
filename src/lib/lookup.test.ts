// @vitest-environment node
// Recorded answers from each service, trimmed (test/fixtures/lookup/). Tests never go on the network.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  allowedUrl,
  episodeLength,
  episodesUrl,
  episodeTitle,
  filterEpisodes,
  LOOKUP_HOST_SUFFIXES,
  LOOKUP_HOSTS,
  parseEpisodes,
  parseSearch,
  plainTitle,
  readDetails,
  sameBook,
  searchRequests,
  wikidataClaimsUrl,
  wikidataFacts,
  wikidataGenre,
  wikidataLabelsUrl,
  withDetails,
  withWikidata,
  type LookupResult,
} from './lookup';

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`../../test/fixtures/lookup/${name}`, import.meta.url), 'utf8'));

/** Wikidata as the e2e build answers it: Life 3.0's item and names for a book, American Fiction's for a film. */
const wikidata = (url: string): Promise<unknown> =>
  Promise.resolve(
    fixture(
      url.includes('props=claims')
        ? url.includes('Q48093278')
          ? 'wikidata-book-claims.json'
          : 'wikidata-film-claims.json'
        : url.includes('Q2076321')
          ? 'wikidata-book-labels.json'
          : 'wikidata-film-labels.json',
    ),
  );

const films = parseSearch('wikipedia-film', { wikipedia: fixture('wikipedia-film.json') });
const books = parseSearch('wikipedia-openlibrary', { wikipedia: fixture('wikipedia-book.json'), openlibrary: fixture('openlibrary-search.json') });

describe('searches', () => {
  it('asks each kind\'s services for what was typed, together, and nothing for a letter or less', () => {
    expect(searchRequests('musicbrainz', '  dog  man star ')).toEqual([
      { service: 'musicbrainz', url: 'https://musicbrainz.org/ws/2/release-group?query=dog%20man%20star&fmt=json&limit=12' },
    ]);
    expect(searchRequests('musicbrainz', 'AC/DC')[0]?.url).toBe('https://musicbrainz.org/ws/2/release-group?query=AC%5C%2FDC&fmt=json&limit=12');
    expect(searchRequests('wikipedia-film', 'American Fiction')).toEqual([
      {
        service: 'wikipedia',
        url: 'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&generator=search&gsrsearch=American%20Fiction%20film&gsrlimit=8&gsrnamespace=0&prop=pageimages|description|pageprops&piprop=thumbnail&pithumbsize=500&pilicense=any&ppprop=wikibase_item',
      },
    ]);
    expect(searchRequests('wikipedia-openlibrary', 'life 3.0').map((request) => [request.service, request.url])).toEqual([
      ['wikipedia', expect.stringContaining('gsrsearch=life%203.0%20book&')],
      ['openlibrary', 'https://openlibrary.org/search.json?q=life%203.0&fields=key,title,author_name,first_publish_year,subject,cover_i&limit=10'],
    ]);
    expect(searchRequests('itunes-podcast', 'lex fridman')[0]?.url).toBe('https://itunes.apple.com/search?media=podcast&term=lex%20fridman&limit=12');
    expect(searchRequests('wikipedia-openlibrary', 'a')).toEqual([]);
    expect(searchRequests('wikipedia-film', '   ')).toEqual([]);
  });

  it('skips answers that aren\'t results at all, from any service', () => {
    for (const odd of [null, 'text', 42, [], { results: 'x' }, { query: { pages: 'x' } }, { docs: [null, 1] }, { results: [null, 1, { kind: 'podcast' }] }]) {
      expect(parseSearch('musicbrainz', { musicbrainz: odd })).toEqual([]);
      expect(parseSearch('wikipedia-film', { wikipedia: odd })).toEqual([]);
      expect(parseSearch('wikipedia-openlibrary', { wikipedia: odd, openlibrary: odd })).toEqual([]);
      expect(parseSearch('itunes-podcast', { itunes: odd })).toEqual([]);
    }
    // A service that hasn't answered yet adds nothing.
    expect(parseSearch('wikipedia-film', {})).toEqual([]);
  });
});

describe('MusicBrainz', () => {
  const results = parseSearch('musicbrainz', { musicbrainz: fixture('musicbrainz-search.json') });

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
      from: 'musicbrainz',
      details: 'https://musicbrainz.org/ws/2/release-group/da15737e-3eb3-31e4-97f0-fe46299f75fb?inc=genres+tags+artist-credits&fmt=json',
    });
    expect(results[1]).toMatchObject({ title: 'Dog Man Star', maker: 'NERVE', year: '2026', genres: [] });
    expect(results.find((result) => result.title.startsWith('ICA'))?.note).toBe('Album · Live');
  });

  it('takes the genres from the picked album\'s own page', async () => {
    const picked = withDetails(results[0]!, fixture('musicbrainz-release-group.json'));
    expect(picked).toMatchObject({ title: 'Dog Man Star', maker: 'Suede', year: '1994', genres: ['britpop', 'glam rock', 'art rock'] });
    expect(withDetails(results[1]!, {}).genres).toEqual([]);
    const asked: string[] = [];
    await readDetails(results[0]!, (url) => {
      asked.push(url);
      return Promise.resolve(fixture('musicbrainz-release-group.json'));
    });
    expect(asked).toEqual([results[0]?.details]);
  });
});

describe('Wikipedia films', () => {
  it('lists the films the search found, by its order, with the description, the year and director it gives and the poster', () => {
    // The answer also has a disambiguation page, "Science fiction film" (a genre), a soundtrack,
    // "Science fiction" and a list: none of them a film.
    expect(films.map((film) => [film.title, film.maker, film.year, film.about])).toEqual([
      ['American Fiction', 'Cord Jefferson', '2023', '2023 film by Cord Jefferson'],
      ['Pulp Fiction', 'Quentin Tarantino', '1994', '1994 film by Quentin Tarantino'],
      ['I, Robot', 'Alex Proyas', '2004', '2004 film by Alex Proyas'],
    ]);
    expect(films[0]).toMatchObject({
      id: 'wikipedia:72713326',
      genres: [],
      from: 'wikipedia',
      wikidata: { item: 'Q116413183', maker: 'P57' },
      // The poster, without the tracking Wikipedia adds to its URL.
      cover: 'https://upload.wikimedia.org/wikipedia/en/d/d7/American_fiction_xxlg.jpg',
      thumb: 'https://upload.wikimedia.org/wikipedia/en/d/d7/American_fiction_xxlg.jpg',
    });
  });

  it('names a film or a book without Wikipedia\'s disambiguation', () => {
    expect(plainTitle('American Fiction (film)')).toBe('American Fiction');
    expect(plainTitle('Dune (2021 film)')).toBe('Dune');
    expect(plainTitle('Piranesi (novel)')).toBe('Piranesi');
    expect(plainTitle('Range (Epstein book)')).toBe('Range');
    expect(plainTitle('Fleabag (TV series)')).toBe('Fleabag');
    expect(plainTitle('(No Pussyfooting)')).toBe('(No Pussyfooting)');
    expect(plainTitle('Monsters (Ltd.)')).toBe('Monsters (Ltd.)');
  });

  it('reads the director, the year and the genres from Wikidata once a film is picked', async () => {
    const facts = wikidataFacts(fixture('wikidata-film-claims.json'), { item: 'Q116413183', maker: 'P57' });
    // Two release dates, a festival premiere and the opening: the first year counts.
    expect(facts).toEqual({ makers: ['Q100146356'], genres: ['Q130232'], year: '2023' });
    expect(withWikidata(films[0]!, facts, fixture('wikidata-film-labels.json'))).toMatchObject({ maker: 'Cord Jefferson', year: '2023', genres: ['drama'] });
    const asked: string[] = [];
    const picked = await readDetails(films[0]!, (url) => {
      asked.push(url);
      return wikidata(url);
    });
    expect(asked).toEqual([wikidataClaimsUrl('Q116413183'), wikidataLabelsUrl(['Q100146356', 'Q130232'])]);
    expect(asked[1]).toBe('https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=Q100146356|Q130232&props=labels&languages=en');
    expect(picked).toMatchObject({ title: 'American Fiction', maker: 'Cord Jefferson', year: '2023', genres: ['drama'] });
  });

  it('keeps what the search said when Wikidata has nothing, or something odd', () => {
    const film = films[0]!;
    expect(withWikidata(film, { makers: [], genres: [] }, {})).toEqual(film);
    expect(wikidataFacts({ entities: { Q116413183: { claims: { P57: [{ rank: 'deprecated', mainsnak: { datavalue: { value: { id: 'Q1' } } } }], P577: 'x' } } } }, { item: 'Q116413183', maker: 'P57' })).toEqual({
      makers: [],
      genres: [],
      year: undefined,
    });
    for (const odd of [null, 'text', [], { entities: [] }]) expect(wikidataFacts(odd, { item: 'Q1', maker: 'P57' })).toEqual({ makers: [], genres: [], year: undefined });
  });

  it('writes a Wikidata genre as the vault writes one', () => {
    expect(wikidataGenre('drama film')).toBe('drama');
    expect(wikidataGenre('science fiction film')).toBe('sci-fi');
    expect(wikidataGenre('fantasy novel')).toBe('fantasy');
    expect(wikidataGenre('popular science literature')).toBe('popular science');
    expect(wikidataGenre('black comedy')).toBe('black comedy');
    expect(wikidataGenre('film based on literature')).toBeUndefined();
  });
});

describe('books from Wikipedia and Open Library', () => {
  it('lists Wikipedia\'s books first, then Open Library\'s, each saying where it is from, a book both have once', () => {
    expect(books.map((book) => [book.from, book.title, book.maker, book.year])).toEqual([
      ['wikipedia', 'Life 3.0', 'Max Tegmark', '2017'],
      ['openlibrary', 'Summary and Analysis of Life 3. 0', 'Acesprint', '2021'],
      ['openlibrary', "Summary of Max Tegmark's Life 3.0", 'Irb Media', '2022'],
      // Another author's "Life 3.0" is another book.
      ['openlibrary', 'Life 3.0', 'Mr. Ellis Katsof', '2017'],
      ['openlibrary', 'Life 3.0：人工智慧時代，人類的蛻變與重生', undefined, undefined],
    ]);
    // The search for "life 3.0 book" also found an EP, a PC and a film: none of them books.
    expect(books[0]).toMatchObject({ about: '2017 book by Max Tegmark on artificial intelligence', wikidata: { item: 'Q48093278', maker: 'P50' } });
    expect(books[0]?.cover).toMatch(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/en\/.+\.png$/);
  });

  it('shows each service\'s books as soon as its answer lands', () => {
    expect(parseSearch('wikipedia-openlibrary', { openlibrary: fixture('openlibrary-search.json') }).map((book) => book.from)).toEqual(Array(5).fill('openlibrary'));
    expect(parseSearch('wikipedia-openlibrary', { wikipedia: fixture('wikipedia-book.json') }).map((book) => book.title)).toEqual(['Life 3.0']);
  });

  it('tells the same book from two services by its title and its author\'s surname', () => {
    const book = (title: string, maker?: string): LookupResult => ({ id: title, title, maker, genres: [] });
    expect(sameBook(book('Life 3.0', 'Max Tegmark'), book('LIFE 3.0', 'Tegmark, Max'.split(', ').reverse().join(' ')))).toBe(true);
    expect(sameBook(book('Piranesi', 'Susanna Clarke'), book('Piranesi'))).toBe(true);
    expect(sameBook(book('Range', 'David Epstein'), book('Range', 'Ion Idriess'))).toBe(false);
    expect(sameBook(book('Life 3.0'), book('Life 2.0'))).toBe(false);
  });

  it('reads the author, the year and the genre from Wikidata once a book is picked', async () => {
    expect(await readDetails(books[0]!, wikidata)).toMatchObject({ title: 'Life 3.0', maker: 'Max Tegmark', year: '2017', genres: ['popular science'] });
    // An Open Library book is read from its own search: nothing more to ask.
    const asked: string[] = [];
    await readDetails(books[1]!, (url) => {
      asked.push(url);
      return Promise.resolve({});
    });
    expect(asked).toEqual([]);
  });
});

describe('iTunes', () => {
  const podcasts = parseSearch('itunes-podcast', { itunes: fixture('itunes-podcast.json') });

  it('lists podcasts with the author, the genre and 600px artwork, and no year', () => {
    expect(podcasts[0]).toMatchObject({ title: 'Lex Fridman Podcast', maker: 'Lex Fridman', genres: ['technology'], from: 'itunes' });
    expect(podcasts[0]?.year).toBeUndefined();
    expect(podcasts[0]?.cover).toMatch(/\/600x600bb\.jpg$/);
    expect(podcasts).toHaveLength(4);
  });

  it('lists a show\'s episodes once it is picked', () => {
    expect(podcasts[0]?.episodes).toBe('https://itunes.apple.com/lookup?id=1434243584&media=podcast&entity=podcastEpisode&limit=200');
    expect(parseSearch('itunes-podcast', { itunes: fixture('itunes-episodes.json') }).map((show) => show.title)).toEqual(['Lex Fridman Podcast']);
  });
});

describe('a show\'s episodes', () => {
  // The Lex Fridman Podcast's own lookup (itunes-episodes.json): the show, then its latest episodes.
  const show = parseSearch('itunes-podcast', { itunes: fixture('itunes-podcast.json') })[0]!;
  const episodes = parseEpisodes(fixture('itunes-episodes.json'), show);

  it('reads each episode as a card: its title without its number, the show as its maker, its year, the show\'s genre and 600px artwork', () => {
    expect(episodes).toHaveLength(16);
    const jensen = episodes.find((episode) => episode.id === '1000756806357');
    expect(jensen).toMatchObject({
      title: 'Jensen Huang: NVIDIA – The $4 Trillion Company & the AI Revolution',
      maker: 'Lex Fridman Podcast',
      year: '2026',
      genres: ['technology'],
      released: '2026-03-23',
      minutes: 152,
    });
    expect(jensen?.cover).toMatch(/^https:\/\/is1-ssl\.mzstatic\.com\/image\/thumb\/.+\/600x600bb\.jpg$/);
    expect(jensen?.thumb).toMatch(/\/200x200bb\.jpg$/);
    expect(jensen?.about).toMatch(/^Jensen Huang is the co-founder and CEO of NVIDIA/);
    // Newest first, as the show lists them.
    expect(episodes.map((episode) => episode.released)).toEqual(episodes.map((episode) => episode.released).sort().reverse());
    expect(episodes[0]?.title).toBe('AI Crisis in Math: Navier-Stokes, Riemann Hypothesis & Complexity Theory');
  });

  it('takes an episode\'s number off either end of its title, as the vault\'s notes name them', () => {
    // Real titles: Lex Fridman puts the number first, Modern Wisdom last; the vault's notes have neither.
    expect(episodeTitle('#486 – Michael Levin: Hidden Reality of Alien Intelligence & Biological Life')).toBe('Michael Levin: Hidden Reality of Alien Intelligence & Biological Life');
    expect(episodeTitle('19 Uncomfortable Truths About Human Nature - Gurwinder Bhogal - #1073')).toBe('19 Uncomfortable Truths About Human Nature - Gurwinder Bhogal');
    expect(episodeTitle('Crypto Scams, Dopamine Websites, Tasteful Slop & Vape Shop Energy - Rabbit Hole #6 - #1168')).toBe(
      'Crypto Scams, Dopamine Websites, Tasteful Slop & Vape Shop Energy - Rabbit Hole #6',
    );
    expect(episodeTitle('Ep. 12: Sleep Is a Skill')).toBe('Sleep Is a Skill');
    expect(episodeTitle('Episode 3 | Why Dogs Dream')).toBe('Why Dogs Dream');
    // A title that is only a number, or starts with one that is part of it, stays as it is.
    expect(episodeTitle('#12')).toBe('#12');
    expect(episodeTitle('10 years result in 1 year')).toBe('10 years result in 1 year');
  });

  it('narrows the episodes by every typed word, in the title first, then in what they are about', () => {
    expect(filterEpisodes(episodes, 'jensen').map((episode) => episode.id)).toEqual(['1000756806357']);
    expect(filterEpisodes(episodes, '  NVIDIA  revolution ')).toHaveLength(1);
    expect(filterEpisodes(episodes, 'godel').map((episode) => episode.title)).toEqual([expect.stringContaining('Gödel')]);
    expect(filterEpisodes(episodes, '')).toBe(episodes);
    expect(filterEpisodes(episodes, 'zzzz')).toEqual([]);
    // Those with the word in their title come before those with it only in their description.
    const inTitle = filterEpisodes(episodes, 'ai').map((episode) => /ai/i.test(episode.title));
    expect(inTitle).toContain(true);
    expect(inTitle).toContain(false);
    expect(inTitle).toEqual(inTitle.toSorted((a, b) => Number(b) - Number(a)));
  });

  it('says how long an episode runs', () => {
    expect(episodeLength(52)).toBe('52 min');
    expect(episodeLength(152)).toBe('2 h 32 min');
    expect(episodeLength(120)).toBe('2 h');
  });

  it('skips what isn\'t an episode, and answers that aren\'t a lookup at all', () => {
    expect(parseEpisodes(fixture('itunes-podcast.json'), show)).toEqual([]);
    for (const odd of [null, 'text', 42, [], { results: 'x' }, { results: [null, 1, { kind: 'podcast-episode' }] }]) expect(parseEpisodes(odd, show)).toEqual([]);
    expect(episodesUrl('1434243584')).toBe(show.episodes);
  });
});

describe('Open Library', () => {
  it('lists works with the first author, the first year, plain genres and a large cover', () => {
    const found = parseSearch('wikipedia-openlibrary', { openlibrary: fixture('openlibrary-search.json') });
    expect(found[0]).toEqual({
      id: '/works/OL19717530W',
      title: 'Life 3.0',
      maker: 'Max Tegmark',
      year: '2017',
      genres: ['technological forecasting', 'philosophy', 'artificial intelligence'],
      thumb: 'https://covers.openlibrary.org/b/id/10239283-M.jpg',
      cover: 'https://covers.openlibrary.org/b/id/10239283-L.jpg',
      note: undefined,
      from: 'openlibrary',
    });
    // A work without a cover has none to download.
    expect(found[1]).toMatchObject({ title: 'Summary and Analysis of Life 3. 0', cover: undefined, thumb: undefined });
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
    const show = parseSearch('itunes-podcast', { itunes: fixture('itunes-podcast.json') })[0]!;
    const urls = [
      ...(['musicbrainz', 'wikipedia-film', 'wikipedia-openlibrary', 'itunes-podcast'] as const).flatMap((source) => searchRequests(source, 'dog man star').map((request) => request.url)),
      ...parseSearch('musicbrainz', { musicbrainz: fixture('musicbrainz-search.json') }).flatMap((result) => [result.thumb, result.cover, result.details]),
      ...[...films, ...books].flatMap((result) => [result.thumb, result.cover]),
      wikidataClaimsUrl('Q116413183'),
      wikidataLabelsUrl(['Q100146356', 'Q130232']),
      ...parseSearch('itunes-podcast', { itunes: fixture('itunes-podcast.json') }).flatMap((result) => [result.thumb, result.cover, result.episodes]),
      ...parseEpisodes(fixture('itunes-episodes.json'), show).flatMap((episode) => [episode.thumb, episode.cover]),
      'https://dn710902.ca.archive.org/0/items/mbid-b71f964d/front.jpg',
      'https://thumb.wikimedia.org/wikipedia/en/thumb/9/97/Maschinenmensch.jpg/500px-Maschinenmensch.jpg',
    ].filter((url): url is string => Boolean(url));
    expect(urls.length).toBeGreaterThan(40);
    for (const url of urls) expect(allowedUrl(url), url).toBe(true);
  });

  it('refuses everything else', () => {
    for (const url of [
      'http://musicbrainz.org/ws/2/',
      'https://rateyourmusic.com/search?searchterm=x',
      'https://evilarchive.org/x.jpg',
      'https://archive.org.evil.com/x.jpg',
      'https://mzstatic.com/x.jpg',
      'https://wikimedia.org/x.jpg',
      'https://de.wikipedia.org/w/api.php',
      'https://en.wikipedia.org.evil.com/w/api.php',
      'https://wikidata.org/w/api.php',
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
