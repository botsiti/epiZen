import { genreName, type KindSpec } from './library';
import type { PodcastArtwork } from './podcasts';

// Where "Add" finds an album, film, book or podcast episode: public services that need no account,
// asked only when the user types a search, picks a result or a show. The backend
// (src-tauri/src/net.rs) refuses any other host. A search asks one or more services together;
// each has a search URL and a parser for its answer, and tests feed the parsers recorded answers
// from test/fixtures/lookup/.

/** Where a kind is looked up: albums on MusicBrainz, films on Wikipedia, books on Wikipedia and Open Library, podcasts on iTunes. */
export type Source = NonNullable<KindSpec['source']>;
/** One service a search asks. */
export type Service = 'musicbrainz' | 'wikipedia' | 'openlibrary' | 'itunes';

export interface LookupResult {
  /** The source's id, unique among the results. */
  id: string;
  title: string;
  maker?: string;
  year?: string;
  genres: string[];
  /** A small cover for the results, and the full one saved with the note. */
  thumb?: string;
  cover?: string;
  /** A faint line about it: "Album · Live", "503 episodes". */
  note?: string;
  /** What its source says it is, in place of the maker and year on its card: Wikipedia's "2023 film by Cord Jefferson". */
  about?: string;
  /** The service it came from, named on its card when a search asks more than one. */
  from?: Service;
  /** MusicBrainz: the page with its genres, read once it is picked. */
  details?: string;
  /** Wikipedia: its Wikidata item, read once it is picked for who made it (director or author), its year and genres. */
  wikidata?: { item: string; maker: 'P57' | 'P50' };
  /** iTunes: a podcast's episodes, listed once the show is picked. */
  episodes?: string;
}

/** One episode of a show, with what the list of them shows besides the card. */
export interface EpisodeResult extends LookupResult {
  /** The day it came out, YYYY-MM-DD. */
  released?: string;
  /** How long it runs, in whole minutes. */
  minutes?: number;
}

/** The hosts a lookup may reach. The backend's list (HOSTS in src-tauri/src/net.rs) is the one enforced; a test keeps the two the same. */
export const LOOKUP_HOSTS = [
  'musicbrainz.org',
  'coverartarchive.org',
  'archive.org',
  'itunes.apple.com',
  'openlibrary.org',
  'covers.openlibrary.org',
  'en.wikipedia.org',
  'www.wikidata.org',
];
/** Subdomains allowed as a family: archive.org's mirrors (the Cover Art Archive redirects there), iTunes artwork, and Wikimedia's images (upload., thumb.). */
export const LOOKUP_HOST_SUFFIXES = ['.archive.org', '.mzstatic.com', '.wikimedia.org'];

/** The backend's rule, here so the URLs the sources build can be checked against it: https, the default port, no login, a listed host. */
export function allowedUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname;
  return (
    parsed.protocol === 'https:' &&
    !parsed.port &&
    !parsed.username &&
    !parsed.password &&
    (LOOKUP_HOSTS.includes(host) || LOOKUP_HOST_SUFFIXES.some((suffix) => host.length > suffix.length && host.endsWith(suffix)))
  );
}

export const SERVICE_NAMES: Record<Service, string> = {
  musicbrainz: 'MusicBrainz',
  wikipedia: 'Wikipedia',
  openlibrary: 'Open Library',
  itunes: 'iTunes',
};

/** The services each source asks, in the order their results are listed. */
export const SOURCE_SERVICES: Record<Source, Service[]> = {
  musicbrainz: ['musicbrainz'],
  'wikipedia-film': ['wikipedia'],
  'wikipedia-openlibrary': ['wikipedia', 'openlibrary'],
  'itunes-podcast': ['itunes'],
};

/** Where each kind is looked up, by name, for the search box. */
export const SOURCE_NAMES: Record<Source, string> = {
  musicbrainz: 'MusicBrainz',
  'wikipedia-film': 'Wikipedia',
  'wikipedia-openlibrary': 'Wikipedia and Open Library',
  'itunes-podcast': 'iTunes',
};

/**
 * How long typing must pause before a search goes out, in milliseconds. MusicBrainz takes one
 * request a second (the backend queues the rest), so it waits for a longer pause.
 */
export const SEARCH_PAUSE: Record<Source, number> = {
  musicbrainz: 400,
  'wikipedia-film': 220,
  'wikipedia-openlibrary': 220,
  'itunes-podcast': 220,
};

// Lucene's special characters, so "AC/DC" or "Sunn O)))" are searched as words.
const LUCENE = /[+\-&|!(){}[\]^"~*?:\\/]/g;

/** Wikipedia's search, with each page's lead image (non-free posters and covers too), its one-line description and its Wikidata item. */
const wikipediaSearch = (words: string) =>
  `https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&generator=search&gsrsearch=${encodeURIComponent(words)}&gsrlimit=8&gsrnamespace=0&prop=pageimages|description|pageprops&piprop=thumbnail&pithumbsize=500&pilicense=any&ppprop=wikibase_item`;

/** The requests a search makes, one per service, asked together; none while there is nothing to search yet. */
export function searchRequests(source: Source, query: string): { service: Service; url: string }[] {
  const words = query.trim().replace(/\s+/g, ' ');
  if (words.length < 2) return [];
  const term = encodeURIComponent(words);
  switch (source) {
    case 'musicbrainz':
      return [{ service: 'musicbrainz', url: `https://musicbrainz.org/ws/2/release-group?query=${encodeURIComponent(words.replace(LUCENE, '\\$&'))}&fmt=json&limit=12` }];
    case 'wikipedia-film':
      return [{ service: 'wikipedia', url: wikipediaSearch(`${words} film`) }];
    case 'wikipedia-openlibrary':
      return [
        { service: 'wikipedia', url: wikipediaSearch(`${words} book`) },
        { service: 'openlibrary', url: `https://openlibrary.org/search.json?q=${term}&fields=key,title,author_name,first_publish_year,subject,cover_i&limit=10` },
      ];
    case 'itunes-podcast':
      return [{ service: 'itunes', url: `https://itunes.apple.com/search?media=podcast&term=${term}&limit=12` }];
  }
}

type Json = Record<string, unknown>;
const object = (value: unknown): Json => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {});
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const string = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : typeof value === 'number' ? String(value) : undefined);
const yearOf = (value: unknown) => /^\d{4}/.exec(string(value) ?? '')?.[0];
const unique = (items: string[]) => [...new Set(items.map(genreName).filter(Boolean))];

/**
 * The result cards from the answers that have come so far, by service (one not answered yet, or
 * that failed, is simply missing). Books list Wikipedia's books first, then Open Library's, with
 * a book both have shown once. Anything missing or odd in an answer is skipped, never thrown.
 */
export function parseSearch(source: Source, answers: Partial<Record<Service, unknown>>): LookupResult[] {
  const has = (service: Service) => answers[service] !== undefined;
  switch (source) {
    case 'musicbrainz':
      return has('musicbrainz') ? musicBrainz(answers.musicbrainz) : [];
    case 'wikipedia-film':
      return has('wikipedia') ? wikipedia(answers.wikipedia, 'film') : [];
    case 'wikipedia-openlibrary': {
      const wiki = has('wikipedia') ? wikipedia(answers.wikipedia, 'book') : [];
      const open = has('openlibrary') ? openLibrary(answers.openlibrary) : [];
      return [...wiki, ...open.filter((book) => !wiki.some((known) => sameBook(known, book)))];
    }
    case 'itunes-podcast':
      return has('itunes') ? podcasts(answers.itunes) : [];
  }
}

/** Artists as MusicBrainz credits them: "Kofi Mensah & Ines Taveira". */
function credited(value: unknown): string | undefined {
  const names = array(value).map((credit) => `${string(object(credit).name) ?? ''}${typeof object(credit).joinphrase === 'string' ? (object(credit).joinphrase as string) : ''}`);
  return names.join('').trim() || undefined;
}

/** The most-voted names in a MusicBrainz genre or tag list, at most three. */
function voted(value: unknown): string[] {
  const votes = array(value)
    .map((item) => ({ name: string(object(item).name), count: Number(object(item).count) }))
    .filter((item): item is { name: string; count: number } => Boolean(item.name) && item.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return unique(votes.map((item) => item.name)).slice(0, 3);
}

function musicBrainz(answer: unknown): LookupResult[] {
  const groups = array(object(answer)['release-groups']).map(object);
  // Best match first; among equal matches, the one with more releases (the well-known one).
  const ranked = groups
    .map((group, i) => ({ group, i, score: Number(group.score) || 0, count: Number(group.count) || 0 }))
    .sort((a, b) => b.score - a.score || b.count - a.count || a.i - b.i);
  return ranked.flatMap(({ group }) => {
    const id = string(group.id);
    const title = string(group.title);
    if (!id || !/^[0-9a-f-]{36}$/.test(id) || !title) return [];
    const kinds = [string(group['primary-type']), ...array(group['secondary-types']).map(string)].filter(Boolean);
    return [
      {
        id,
        title,
        maker: credited(group['artist-credit']),
        year: yearOf(group['first-release-date']),
        genres: voted(group.tags),
        thumb: `https://coverartarchive.org/release-group/${id}/front-250`,
        cover: `https://coverartarchive.org/release-group/${id}/front-500`,
        note: kinds.join(' · ') || undefined,
        from: 'musicbrainz' as const,
        details: `https://musicbrainz.org/ws/2/release-group/${id}?inc=genres+tags+artist-credits&fmt=json`,
      },
    ];
  });
}

/** A picked album with what its MusicBrainz page adds: its genres (or, without any, its tags). */
export function withDetails(result: LookupResult, answer: unknown): LookupResult {
  const page = object(answer);
  const genres = voted(page.genres);
  return {
    ...result,
    maker: credited(page['artist-credit']) ?? result.maker,
    year: yearOf(page['first-release-date']) ?? result.year,
    genres: genres.length ? genres : voted(page.tags).length ? voted(page.tags) : result.genres,
  };
}

/** iTunes artwork at another size: its URLs end in `100x100bb.jpg`. */
const artwork = (url: string | undefined, size: number) => url?.replace(/\/\d+x\d+bb\.(jpg|png)$/, `/${size}x${size}bb.$1`);

function podcasts(answer: unknown): LookupResult[] {
  return array(object(answer).results).flatMap((value) => {
    const item = object(value);
    if (item.kind !== 'podcast') return [];
    const id = string(item.collectionId) ?? string(item.trackId);
    const title = string(item.collectionName) ?? string(item.trackName);
    if (!id || !title) return [];
    const art = string(item.artworkUrl100) ?? string(item.artworkUrl600);
    const genre = string(item.primaryGenreName);
    return [
      {
        id,
        title,
        maker: string(item.artistName),
        genres: genre ? unique([genre]) : [],
        thumb: artwork(art, 200),
        cover: artwork(art, 600),
        note: string(item.trackCount) ? `${string(item.trackCount)} episodes` : undefined,
        from: 'itunes' as const,
        episodes: /^\d+$/.test(id) ? episodesUrl(id) : undefined,
      },
    ];
  });
}

/** A show's latest episodes, up to the 200 iTunes gives, newest first. */
export const episodesUrl = (show: string) => `https://itunes.apple.com/lookup?id=${encodeURIComponent(show)}&media=podcast&entity=podcastEpisode&limit=200`;

// An episode's number, as shows put it first ("#494 – ", "Ep. 12: ", "Episode 3 | ") or last
// (" - #1073"). The vault's notes leave it out: "19 Uncomfortable Truths About Human Nature - Gurwinder Bhogal".
const NUMBER_FIRST = /^\s*(?:#\s*|ep(?:isode)?\.?\s*#?\s*)\d+\s*(?:[-–—:|.]\s*)?/i;
const NUMBER_LAST = /\s*[-–—|:]\s*(?:#\s*|ep(?:isode)?\.?\s*#?\s*)\d+\s*$/i;

/** An episode's title as a note is named after it: without its number, at either end. */
export function episodeTitle(name: string): string {
  const plain = name.replace(NUMBER_FIRST, '').replace(NUMBER_LAST, '').trim();
  return plain || name.trim();
}

/**
 * A show's episodes from its iTunes lookup, newest first: each a card whose maker is the show (as
 * the vault's podcast notes name it), with the year it came out, the show's genre and the
 * preferred artwork (the show's by default), falling back to the other when missing.
 * Anything that isn't an episode is skipped, never thrown.
 */
export function parseEpisodes(answer: unknown, show: LookupResult, preferredArtwork: PodcastArtwork = 'show'): EpisodeResult[] {
  const results = array(object(answer).results).map(object);
  const own = results.find((item) => item.kind === 'podcast');
  const genre = string(own?.primaryGenreName);
  const genres = show.genres.length ? show.genres : genre ? unique([genre]) : [];
  const episodes = results.flatMap((item): EpisodeResult[] => {
    if (item.kind !== 'podcast-episode') return [];
    const id = string(item.trackId);
    const name = string(item.trackName);
    if (!id || !name) return [];
    const released = /^\d{4}-\d{2}-\d{2}/.exec(string(item.releaseDate) ?? '')?.[0];
    const millis = Number(item.trackTimeMillis);
    const art = string(item.artworkUrl600) ?? string(item.artworkUrl160) ?? string(item.artworkUrl60);
    const about = string(item.description) ?? string(item.shortDescription);
    return [
      {
        id,
        title: episodeTitle(name),
        maker: string(item.collectionName) ?? show.title,
        year: yearOf(released),
        // The show's genre, as its card had it; the episode's own only when the show has none.
        genres: genres.length ? genres : unique(array(item.genres).map((g) => string(object(g).name) ?? '')).slice(0, 1),
        thumb: preferredArtwork === 'show' ? show.thumb ?? artwork(art, 200) : artwork(art, 200) ?? show.thumb,
        cover: preferredArtwork === 'show' ? show.cover ?? artwork(art, 600) : artwork(art, 600) ?? show.cover,
        released,
        minutes: Number.isFinite(millis) && millis > 0 ? Math.round(millis / 60_000) : undefined,
        about: about?.replace(/\s+/g, ' ').trim(),
      },
    ];
  });
  return episodes.sort((a, b) => (b.released ?? '').localeCompare(a.released ?? ''));
}

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** The episodes that have every typed word in their title or their description, those with them in the title first. */
export function filterEpisodes(episodes: EpisodeResult[], query: string): EpisodeResult[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return episodes;
  const inTitle: EpisodeResult[] = [];
  const inAbout: EpisodeResult[] = [];
  for (const episode of episodes) {
    const title = fold(episode.title);
    const all = `${title} ${fold(episode.about ?? '')}`;
    if (!words.every((word) => all.includes(word))) continue;
    (words.every((word) => title.includes(word)) ? inTitle : inAbout).push(episode);
  }
  return [...inTitle, ...inAbout];
}

/** An episode's length: "52 min", "3 h 43 min", "2 h". */
export function episodeLength(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

// Open Library's subjects mix genres with shelving notes ("nyt:business-books=2017-09-10",
// "Accessible book"); a genre here is a short, plain one.
const SHELVING = /aspects|accessible book|protected daisy|in library|bestseller|large type|open library|staff picks|reading level/i;

function openLibrary(answer: unknown): LookupResult[] {
  return array(object(answer).docs).flatMap((value) => {
    const doc = object(value);
    const id = string(doc.key);
    const title = string(doc.title);
    if (!id || !title) return [];
    const cover = Number(doc.cover_i);
    const has = Number.isInteger(cover) && cover > 0;
    const genres = unique(
      array(doc.subject)
        .map(string)
        .filter((subject): subject is string => Boolean(subject) && !/[:=/,()]/.test(subject ?? '') && (subject?.length ?? 0) <= 28 && (subject?.split(' ').length ?? 0) <= 3 && !SHELVING.test(subject ?? '')),
    ).slice(0, 3);
    const authors = array(doc.author_name).map(string).filter(Boolean) as string[];
    return [
      {
        id,
        title,
        maker: authors[0],
        year: yearOf(doc.first_publish_year),
        genres,
        thumb: has ? `https://covers.openlibrary.org/b/id/${cover}-M.jpg` : undefined,
        cover: has ? `https://covers.openlibrary.org/b/id/${cover}-L.jpg` : undefined,
        note: authors.length > 1 ? `with ${authors.slice(1, 3).join(', ')}` : undefined,
        from: 'openlibrary' as const,
      },
    ];
  });
}

// ---------------------------------------------------------------- Wikipedia and Wikidata

// What a page's one-line description says it is, by the first word in it that names a kind of
// thing: "2023 film by Cord Jefferson" is a film, "2020 fantasy novel by Susanna Clarke" and "Book
// by David Lynch" books, "1999 novel adapted into a film" a book still. Genres, scores, lists and
// identifiers are neither ("Film genre", "2023 film score by Laura Karpman", "Unique numeric book
// identifier"), and a book needs an author or a year ("Self-help book" is a kind of book, not one).
const KIND_WORD =
  /\b(film series|book series|graphic novel|television series|tv series|web series|anime series|miniseries|film|movie|novella|novel|book|memoir|autobiography|biography|essay collection|short story collection|poetry collection|manga|play|album|song|EP|single|video game|genre|score|soundtrack)\b/i;
const FILM_WORDS = new Set(['film', 'movie', 'television series', 'tv series', 'web series', 'anime series', 'miniseries']);
const BOOK_WORDS = new Set(['graphic novel', 'novella', 'novel', 'book', 'memoir', 'autobiography', 'biography', 'essay collection', 'short story collection', 'poetry collection', 'manga', 'play']);
const NEITHER = /\b(genre|score|soundtrack|franchise|festival|studio|award|character|company|publisher|identifier)\b/i;

function isKind(description: string, title: string, kind: 'film' | 'book'): boolean {
  if (/^list of\b/i.test(title) || NEITHER.test(description)) return false;
  const head = KIND_WORD.exec(description)?.[1]?.toLowerCase() ?? '';
  if (kind === 'film') return FILM_WORDS.has(head);
  return BOOK_WORDS.has(head) && (/\bby\b/i.test(description) || /^\d{4}\b/.test(description));
}

/** A page's title as the thing is called: without Wikipedia's "(film)", "(2023 film)", "(novel)" or "(Epstein book)". */
export function plainTitle(title: string): string {
  return title.replace(/\s+\((?:[^()]*\s)?(?:film|movie|novel|novella|book|memoir|album|TV series|miniseries)\)$/i, '').trim() || title;
}

/** Who the description says made it: "2017 book by Max Tegmark on artificial intelligence" is Max Tegmark's. */
const byLine = (description: string) => /\bby\s+(.+?)(?:\s+(?:on|about|from|for|in|based)\s.*)?$/i.exec(description)?.[1]?.trim() || undefined;
const firstYear = (description: string) => /\b(1[5-9]\d\d|20\d\d)\b/.exec(description)?.[1];
/** A Wikimedia image's URL without the tracking Wikipedia adds to it. */
const imageUrl = (url: string | undefined) => url?.replace(/\?utm_[^#]*$/, '');

function wikipedia(answer: unknown, kind: 'film' | 'book'): LookupResult[] {
  const pages = array(object(object(answer).query).pages)
    .map(object)
    .sort((a, b) => (Number(a.index) || 0) - (Number(b.index) || 0));
  return pages.flatMap((page): LookupResult[] => {
    const title = string(page.title);
    const description = string(page.description) ?? '';
    const id = string(page.pageid) ?? title;
    if (!title || !id || !isKind(description, title, kind)) return [];
    const item = string(object(page.pageprops).wikibase_item);
    const image = imageUrl(string(object(page.thumbnail).source));
    return [
      {
        id: `wikipedia:${id}`,
        title: plainTitle(title),
        maker: byLine(description),
        year: firstYear(description),
        genres: [],
        thumb: image,
        cover: image,
        about: description || undefined,
        from: 'wikipedia',
        wikidata: item && /^Q\d+$/.test(item) ? { item, maker: kind === 'film' ? 'P57' : 'P50' } : undefined,
      },
    ];
  });
}

const bare = (text: string) => fold(text).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const surname = (name?: string) => (name ? bare(name).split(' ').at(-1) : undefined);

/** The same book from two services: one title, and the same author's surname when both name one. */
export function sameBook(a: LookupResult, b: LookupResult): boolean {
  if (bare(a.title) !== bare(b.title)) return false;
  const [x, y] = [surname(a.maker), surname(b.maker)];
  return !x || !y || x === y;
}

export const wikidataClaimsUrl = (item: string) => `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=${encodeURIComponent(item)}&props=claims`;
export const wikidataLabelsUrl = (ids: string[]) => `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=${ids.map(encodeURIComponent).join('|')}&props=labels&languages=en`;

/** What a Wikidata item says of a film or a book: who made it and its genres (as item ids, to be named), and its first year. */
export interface WikidataFacts {
  makers: string[];
  genres: string[];
  year?: string;
}

/** Reads an item's claims: the director (P57) or author (P50), the genres (P136), the earliest publication date (P577). Deprecated statements are left out. */
export function wikidataFacts(answer: unknown, wikidata: NonNullable<LookupResult['wikidata']>): WikidataFacts {
  const claims = object(object(object(object(answer).entities)[wikidata.item]).claims);
  const values = (property: string) =>
    array(claims[property])
      .map(object)
      .filter((statement) => statement.rank !== 'deprecated')
      .map((statement) => object(object(object(statement.mainsnak).datavalue).value));
  const ids = (property: string) => [...new Set(values(property).flatMap((value) => (/^Q\d+$/.test(string(value.id) ?? '') ? [string(value.id) as string] : [])))];
  const years = values('P577')
    .map((value) => /^[+]?(\d{4})-/.exec(string(value.time) ?? '')?.[1])
    .filter((year): year is string => Boolean(year))
    .sort();
  return { makers: ids(wikidata.maker).slice(0, 4), genres: ids('P136').slice(0, 6), year: years[0] };
}

/** A Wikidata genre as the vault writes one: "drama film" is drama, "science fiction novel" sci-fi, "popular science literature" popular science. */
export function wikidataGenre(label: string): string | undefined {
  if (/\bbased on\b/i.test(label)) return undefined;
  const plain = genreName(label.replace(/\s+(film|movie|novel|novella|book|literature|television series|series)$/i, ''));
  return { 'science fiction': 'sci-fi', 'science-fiction': 'sci-fi' }[plain] ?? (plain || undefined);
}

/** Names joined as the vault writes several: "Joel Coen & Ethan Coen", "A, B & C". */
const joinNames = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names.at(-1) ?? ''}` : names[0]);

/** A picked Wikipedia result with what Wikidata adds: who made it, its year and its genres, named from the labels answer. */
export function withWikidata(result: LookupResult, facts: WikidataFacts, labels: unknown): LookupResult {
  const entities = object(object(labels).entities);
  const name = (id: string) => string(object(object(object(entities[id]).labels).en).value);
  const makers = facts.makers.map(name).filter((found): found is string => Boolean(found));
  const genres = unique(facts.genres.map(name).flatMap((label) => (label ? [wikidataGenre(label)] : [])).filter((genre): genre is string => Boolean(genre))).slice(0, 3);
  return { ...result, maker: joinNames(makers) ?? result.maker, year: facts.year ?? result.year, genres: genres.length ? genres : result.genres };
}

/**
 * What picking a result reads before its form opens: an album's MusicBrainz page, or a Wikipedia
 * result's Wikidata item and then the names in it. `ask` fetches a URL's JSON (the backend, or a
 * test's recorded answers). A result that needs nothing comes back as it is.
 */
export async function readDetails(result: LookupResult, ask: (url: string) => Promise<unknown>): Promise<LookupResult> {
  if (result.details) return withDetails(result, await ask(result.details));
  if (!result.wikidata) return result;
  const facts = wikidataFacts(await ask(wikidataClaimsUrl(result.wikidata.item)), result.wikidata);
  const ids = [...facts.makers, ...facts.genres];
  return withWikidata(result, facts, ids.length ? await ask(wikidataLabelsUrl(ids)) : {});
}
