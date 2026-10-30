// @vitest-environment node
// Finding covers for notes the vault already has, held against what each note says. Real titles
// from the vault, and real answers recorded from each service (test/fixtures/covers/, indexed by
// the URL that asked; the Life 3.0 and Lex Fridman answers are Add's, in test/fixtures/lookup/).
// A URL no answer was recorded for fails the test, so the requests themselves are checked too.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { albumSearchUrl, describe as said, findCover, findEpisode, makerScore, searchTitle, titleLanguage, titleScore, wantedOf, yearScore, type Wanted } from './covers';
import { parseEpisodes, parseSearch } from './lookup';
import { allowedUrl } from './lookup';

const read = (path: string): unknown => JSON.parse(readFileSync(new URL(`../../test/fixtures/${path}`, import.meta.url), 'utf8'));
const index = read('covers/index.json') as Record<string, string>;

/** Answers a URL from the recordings, and keeps a list of what was asked. */
function recorded() {
  const asked: string[] = [];
  const ask = (url: string) => {
    asked.push(url);
    expect(allowedUrl(url), url).toBe(true);
    const file = index[url];
    if (file) return Promise.resolve(read(`covers/${file}`));
    if (url.includes('gsrsearch=') && url.includes('%20album&')) return Promise.resolve({ query: { pages: [] } });
    // Add's recordings: Life 3.0 on Wikipedia, Open Library and Wikidata; the Lex Fridman Podcast and its episodes on iTunes.
    if (url === 'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&generator=search&gsrsearch=Life%203.0%20book&gsrlimit=8&gsrnamespace=0&prop=pageimages|description|pageprops&piprop=thumbnail&pithumbsize=500&pilicense=any&ppprop=wikibase_item')
      return Promise.resolve(read('lookup/wikipedia-book.json'));
    if (url === 'https://openlibrary.org/search.json?q=Life%203.0&fields=key,title,author_name,first_publish_year,subject,cover_i&limit=10') return Promise.resolve(read('lookup/openlibrary-search.json'));
    if (url === 'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=Q48093278&props=claims') return Promise.resolve(read('lookup/wikidata-book-claims.json'));
    if (url.startsWith('https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=Q2076321')) return Promise.resolve(read('lookup/wikidata-book-labels.json'));
    if (url === 'https://itunes.apple.com/search?media=podcast&term=Lex%20Fridman&limit=12') return Promise.resolve(read('lookup/itunes-podcast.json'));
    if (url === 'https://itunes.apple.com/lookup?id=1434243584&media=podcast&entity=podcastEpisode&limit=200') return Promise.resolve(read('lookup/itunes-episodes.json'));
    return Promise.reject(new Error(`nothing recorded for ${url}`));
  };
  return { ask, asked };
}

const find = (wanted: Wanted, hasImage?: (url: string) => Promise<boolean>) => {
  const { ask, asked } = recorded();
  return findCover(wanted, { ask, hasImage }).then((found) => ({ found, asked }));
};

describe('comparing a note with a result', () => {
  it('reads titles as the vault and the services write them', () => {
    expect(titleScore('Neverending story', 'The NeverEnding Story')).toBe(1);
    expect(titleScore('Range - Why Generalists Triumph in a Specialized World', 'Range: Why Generalists Triumph in a Specialized World')).toBe(1);
    expect(titleScore('Once Upon A Time... In Shropshire', 'Once Upon a Time... In Shropshire')).toBe(1);
    expect(titleScore('пролетая над землей', 'пролетая над землёй')).toBe(1);
    // Brackets and subtitles count a little less; a slipped letter or a missing "the" a little less again.
    expect(titleScore('Ikiru (Жить)', 'Ikiru')).toBe(0.95);
    expect(titleScore('F1 The Movie', 'F1')).toBe(0.95);
    expect(titleScore('Range - Why Generalists Triumph in a Specialized World', 'Range')).toBe(0.85);
    expect(titleScore('Time of gypsies', 'Time of the Gypsies')).toBeCloseTo(0.9);
    // Another work that shares a word is not this one.
    expect(titleScore('Nausicaa', 'Nausicaä of the Valley of the Wind')).toBeLessThan(0.55);
    expect(titleScore('Mononoke', 'Princess Mononoke')).toBeLessThan(0.9);
    expect(titleScore('Dog Man Star', 'Dog Star Man')).toBeLessThan(0.65);
  });

  it('reads makers across spellings, credits and scripts, and tells another maker apart', () => {
    expect(makerScore('Tarkovsky', 'Andrei Tarkovsky')).toBe(0.9);
    expect(makerScore('Agustus Pablo', 'Augustus Pablo')).toBe(0.9);
    expect(makerScore('坂本龍一 [Ryuichi Sakamoto]', 'Ryuichi Sakamoto')).toBe(0.9);
    expect(makerScore('Fripp and Eno', 'Fripp & Eno')).toBe(1);
    expect(makerScore('Jim Abrahams', 'Jerry Zucker, Jim Abrahams & David Zucker')).toBe(0.9);
    expect(makerScore('Эллис', 'Albert Ellis')).toBe(0.9);
    expect(makerScore('Стругацкие', 'Arkady and Boris Strugatsky')).toBe(0.9);
    expect(makerScore('Bach', 'Johann Sebastian Bach; The Netherlands Bach Society & Jos van Veldhoven')).toBe(0.7);
    expect(makerScore('Field', 'The Field')).toBe(0.9);
    expect(makerScore('Tim Ferris', 'The Tim Ferriss Show')).toBe(0.9);
    expect(makerScore('Pietro Marcello', 'Aleksandr Ptushko')).toBe(0);
    expect(makerScore('Agnès Varda', 'Hayao Miyazaki')).toBe(0);
    expect(makerScore(undefined, 'Suede')).toBeUndefined();
    expect(yearScore('1952', '1952')).toBe(1);
    expect(yearScore('1977', '1976')).toBe(0.6);
    expect(yearScore('1988', '1983')).toBe(0);
    expect(yearScore(undefined, '1983')).toBeUndefined();
  });

  it('searches a title in another script by its label, and one in brackets without them', () => {
    expect(titleLanguage('Скромное обаяние буржуазии')).toBe('ru');
    expect(titleLanguage('무너지기 Crumbling')).toBe('ko');
    expect(titleLanguage('Ikiru')).toBeUndefined();
    expect(searchTitle('Ikiru (Жить)')).toBe('Ikiru');
    expect(searchTitle('The Creative Act - A Way of Being')).toBe('The Creative Act A Way of Being');
    expect(searchTitle('(No Pussyfooting)')).toBe('(No Pussyfooting)');
    // Lucene's words, in lower case so a title never reads as AND, OR or NOT.
    expect(albumSearchUrl({ kind: 'album', title: 'Bring It On!', maker: 'Horrorpops' })).toBe(
      'https://musicbrainz.org/ws/2/release-group?query=releasegroup%3A(bring%20it%20on)%20AND%20artist%3A(horrorpops)&fmt=json&limit=10',
    );
    expect(albumSearchUrl({ kind: 'album', title: 'NOT', maker: 'AND' })).toContain('releasegroup%3A(not)%20AND%20artist%3A(and)');
  });
});

describe('finding a cover', () => {
  it('finds an album by its title and artist, and checks its art is there', async () => {
    const { found, asked } = await find({ kind: 'album', title: 'Antics', maker: 'Interpol' }, () => Promise.resolve(true));
    expect(asked[0]).toContain('gsrsearch=Antics%20Interpol%20album');
    expect(asked[1]).toContain('gsrsearch=Antics%20album');
    expect(asked[2]).toBe('https://musicbrainz.org/ws/2/release-group?query=releasegroup%3A(antics)%20AND%20artist%3A(interpol)&fmt=json&limit=10');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ sure: true, result: { id: 'bc7740e1-02c9-3ab7-9869-0e0c79acf941', cover: 'https://coverartarchive.org/release-group/bc7740e1-02c9-3ab7-9869-0e0c79acf941/front-500' } });
    expect(said(found[0]!)).toBe('Antics · Interpol · 2004');
    // An album the Cover Art Archive has no art for has no cover to give.
    expect((await find({ kind: 'album', title: 'Antics', maker: 'Interpol' }, () => Promise.resolve(false))).found).toEqual([]);
  });

  it('uses a matching Wikipedia album first and avoids MusicBrainz', async () => {
    const ask = vi.fn((url: string) => { expect(url).toContain('wikipedia'); return Promise.resolve(read('covers/wikipedia-album.json')); });
    const found = await findCover({ kind: 'album', title: 'Antics', maker: 'Interpol', year: '2004' }, { ask });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ sure: true, result: { title: 'Antics', maker: 'Interpol', year: '2004', from: 'wikipedia' } });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0]?.[0]).toContain('gsrsearch=Antics%20Interpol%20album');
  });

  it('falls back when a Wikipedia album image is missing or temporarily unavailable', async () => {
    const wanted = { kind: 'album' as const, title: 'Antics', maker: 'Interpol', year: '2004' };
    for (const failure of ['missing', 'offline'] as const) {
      const ask = vi.fn((url: string) => Promise.resolve(read(url.includes('wikipedia.org') ? 'covers/wikipedia-album.json' : 'covers/musicbrainz-antics.json')));
      const hasImage = vi.fn((url: string) => url.includes('wikimedia.org')
        ? failure === 'missing' ? Promise.resolve(false) : Promise.reject(new Error('offline'))
        : Promise.resolve(true));
      const found = await findCover(wanted, { ask, hasImage });
      expect(found[0]).toMatchObject({ sure: true, result: { from: 'musicbrainz' } });
      expect(hasImage).toHaveBeenCalledTimes(2);
      expect(ask.mock.calls.some(([url]) => url.includes('musicbrainz.org'))).toBe(true);
    }
  });

  it('keeps a verified MusicBrainz cover when another image request fails', async () => {
    const answer = structuredClone(read('covers/musicbrainz-antics.json')) as { 'release-groups': { id: string }[] };
    const first = answer['release-groups'][0]!;
    answer['release-groups'].push({ ...first, id: '11111111-1111-4111-8111-111111111111' });
    const ask = (url: string) => Promise.resolve(url.includes('wikipedia.org') ? { query: { pages: [] } } : answer);
    const hasImage = vi.fn().mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('the service is busy'));
    const found = await findCover({ kind: 'album', title: 'Antics', maker: 'Interpol', year: '2004' }, { ask, hasImage });
    expect(found).toHaveLength(1);
    expect(found[0]?.result.id).toBe(first.id);
    expect(hasImage).toHaveBeenCalledTimes(2);
  });

  it('reports a retryable failure when no album image was verified', async () => {
    const ask = (url: string) => Promise.resolve(url.includes('wikipedia.org') ? { query: { pages: [] } } : read('covers/musicbrainz-antics.json'));
    await expect(findCover({ kind: 'album', title: 'Antics', maker: 'Interpol' }, { ask, hasImage: () => Promise.reject(new Error('the service is busy')) })).rejects.toThrow('the service is busy');
  });

  it('tries the title alone on Wikipedia before falling back', async () => {
    const ask = vi.fn((url: string) => Promise.resolve(url.includes('Antics%20Interpol') ? { query: { pages: [] } } : read('covers/wikipedia-album.json')));
    const found = await findCover({ kind: 'album', title: 'Antics', maker: 'Interpol' }, { ask });
    expect(found[0]?.result.from).toBe('wikipedia');
    expect(ask).toHaveBeenCalledTimes(2);
    expect(ask.mock.calls[1]?.[0]).toContain('gsrsearch=Antics%20album');
  });

  it('uses MusicBrainz when Wikipedia is unavailable', async () => {
    const ask = vi.fn((url: string) => url.includes('wikipedia') ? Promise.reject(new Error('offline')) : Promise.resolve(read('covers/musicbrainz-antics.json')));
    const found = await findCover({ kind: 'album', title: 'Antics', maker: 'Interpol' }, { ask, hasImage: () => Promise.resolve(true) });
    expect(found[0]).toMatchObject({ sure: true, result: { from: 'musicbrainz', title: 'Antics' } });
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it('falls back on missing or uncertain Wikipedia results, and preserves partial results on fallback failure', async () => {
    const wiki = read('covers/wikipedia-album.json');
    const wanted = { kind: 'album' as const, title: 'Antics', maker: 'Someone Else', year: '2004' };
    const ask = vi.fn((url: string) => url.includes('wikipedia') ? Promise.resolve(wiki) : Promise.reject(new Error('the service is busy')));
    const found = await findCover(wanted, { ask });
    expect(found[0]?.sure).toBe(false);
    expect(found[0]?.doubt).toContain('MusicBrainz unavailable');
    expect(ask.mock.calls.some(([url]) => url.includes('musicbrainz'))).toBe(true);
    await expect(findCover({ ...wanted, title: 'No match' }, { ask: () => Promise.reject(new Error('offline')) })).rejects.toThrow('offline');
  });

  it("tells one album from another of the same name by who made it, and isn't sure without that", async () => {
    // Add's recorded search for "dog man star": Suede's of 1994, and NERVE's of 2026.
    const dogManStar = (wanted: Partial<Wanted>) =>
      findCover({ kind: 'album', title: 'Dog Man Star', ...wanted }, { ask: () => Promise.resolve(read('lookup/musicbrainz-search.json')) });
    const [suede] = await dogManStar({ maker: 'Suede', year: '1994' });
    expect(suede && said(suede)).toBe('Dog Man Star · Suede · 1994');
    expect(suede?.sure).toBe(true);
    // The year alone settles it here: NERVE's is from 2026.
    expect((await dogManStar({ year: '1994' }))[0]).toMatchObject({ sure: true, result: { maker: 'Suede' } });
    // Nothing to tell them apart by.
    expect((await dogManStar({}))[0]).toMatchObject({ sure: false, doubt: 'no artist or year to check' });
    // Listened to in 2020: NERVE's of 2026 can't be it, though Suede's isn't sure either.
    const found = await dogManStar({ date: '2020-05-01' });
    expect(found[0] && said(found[0])).toBe('Dog Man Star · Suede · 1994');
    expect(found[0]?.sure).toBe(false);
    expect(found.map(said).filter((line) => line.includes('NERVE'))).toEqual([]);
  });

  it("finds a film by its title and year, and fills in its director from Wikidata", async () => {
    const { found, asked } = await find(wantedOf({ kind: 'film', title: 'Ikiru (Жить)', year: '1952', date: '2026-01-31' }));
    expect(asked[0]).toContain('gsrsearch=Ikiru%201952%20film&');
    expect(found[0]).toMatchObject({ sure: true, result: { title: 'Ikiru', maker: 'Akira Kurosawa', year: '1952', genres: ['drama'] } });
    expect(found[0]?.result.cover).toBe('https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3a/Ikiru_poster.jpg/500px-Ikiru_poster.jpg');
  });

  it("offers nothing rather than another work: Varda's Nausicaa is not Miyazaki's", async () => {
    const { found, asked } = await find({ kind: 'film', title: 'Nausicaa', maker: 'Agnès Varda', year: '1971' });
    // Asked with the director and year, then plainly.
    expect(asked).toHaveLength(2);
    expect(found).toEqual([]);
  });

  it('finds a film named in Russian by its label on Wikidata, then its English page', async () => {
    const { found, asked } = await find({ kind: 'film', title: 'Скромное обаяние буржуазии', maker: 'Luis Buñuel', year: '1972' });
    expect(asked[0]).toMatch(/^https:\/\/www\.wikidata\.org\/w\/api\.php\?action=wbsearchentities&.*&language=ru&/);
    expect(found[0]).toMatchObject({ sure: true, result: { title: 'The Discreet Charm of the Bourgeoisie', maker: 'Luis Buñuel', year: '1972' } });
  });

  it("offers nothing when the only film of that Russian name is another director's, of another year", async () => {
    // "Алые паруса" is Pietro Marcello's Scarlet (2022) here, not Ptushko's Scarlet Sails (1961).
    const { found } = await find({ kind: 'film', title: 'Алые паруса', maker: 'Pietro Marcello', year: '2022' });
    expect(found).toEqual([]);
  });

  it("finds a book with no author in the note, by its title and year, over Open Library's summaries", async () => {
    const { found } = await find({ kind: 'book', title: 'Life 3.0', year: '2017' });
    expect(found[0]).toMatchObject({ sure: true, result: { title: 'Life 3.0', maker: 'Max Tegmark', year: '2017', from: 'wikipedia' } });
  });

  it("finds a podcast's show by its name, and is sure once the episode is among the show's", async () => {
    const { found } = await find({ kind: 'podcast', title: 'Jensen Huang', maker: 'Lex Fridman', date: '2026-07-04' });
    expect(found[0]).toMatchObject({ sure: true, result: { title: 'Lex Fridman Podcast', maker: 'Lex Fridman Podcast' }, episode: { year: '2026', released: '2026-03-23' } });
    expect(said(found[0]!)).toBe('Lex Fridman Podcast · 2026');
    // The show's artwork, not the episode's.
    expect(found[0]?.result.cover).toMatch(/600x600bb\.jpg$/);
    // Listened to before the episode came out: the show still, but not sure.
    const early = await find({ kind: 'podcast', title: 'Jensen Huang', maker: 'Lex Fridman', date: '2025-12-01' });
    expect(early.found[0]).toMatchObject({ sure: false, doubt: 'no episode of it matched' });
  });

  it('finds the episode a note is named after among a show’s, and says when several could be', () => {
    const show = parseSearch('itunes-podcast', { itunes: read('lookup/itunes-podcast.json') })[0]!;
    const episodes = parseEpisodes(read('lookup/itunes-episodes.json'), show);
    expect(findEpisode('Jensen Huang', episodes)).toMatchObject({ released: '2026-03-23' });
    expect(findEpisode('NVIDIA', episodes)).toMatchObject({ released: '2026-03-23' });
    expect(findEpisode('DDX', episodes)).toBeUndefined();
    expect(findEpisode('Jensen Huang', episodes, '2026-01-01')).toBeUndefined();
    const twice = [...episodes.slice(0, 1), { ...episodes[0]!, id: 'again', year: '2019', released: '2019-01-01' }];
    expect(findEpisode(episodes[0]!.title, twice)).toBe('several');
  });
});
