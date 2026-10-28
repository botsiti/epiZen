import { genreName, type KindSpec } from './library';

// Where "Add" finds an album, film, book or podcast episode: public services that need no account,
// asked only when the user types a search or picks a show. The backend (src-tauri/src/net.rs) refuses any
// other host. Each source has a search URL and a parser for its answer; tests feed the parsers
// recorded answers from test/fixtures/lookup/.

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
  /** A faint line about it: "Album · Live", a book's first author's others. */
  note?: string;
  /** MusicBrainz: the page with its genres, read once it is picked. */
  details?: string;
  /** iTunes: a podcast's episodes, listed once the show is picked. */
  episodes?: string;
}

/** One episode of a show, with what the list of them shows besides the card. */
export interface EpisodeResult extends LookupResult {
  /** The day it came out, YYYY-MM-DD. */
  released?: string;
  /** How long it runs, in whole minutes. */
  minutes?: number;
  /** The show's words about it, as plain text. */
  about?: string;
}

/** The hosts a lookup may reach. The backend's list (HOSTS in src-tauri/src/net.rs) is the one enforced; a test keeps the two the same. */
export const LOOKUP_HOSTS = ['musicbrainz.org', 'coverartarchive.org', 'archive.org', 'itunes.apple.com', 'openlibrary.org', 'covers.openlibrary.org'];
/** Subdomains allowed as a family: archive.org's mirrors (the Cover Art Archive redirects there) and iTunes artwork. */
export const LOOKUP_HOST_SUFFIXES = ['.archive.org', '.mzstatic.com'];

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

/** Where each kind is looked up, by name, for the search box. */
export const SOURCE_NAMES: Record<NonNullable<KindSpec['source']>, string> = {
  musicbrainz: 'MusicBrainz',
  'itunes-movie': 'iTunes',
  openlibrary: 'Open Library',
  'itunes-podcast': 'iTunes',
};

// Lucene's special characters, so "AC/DC" or "Sunn O)))" are searched as words.
const LUCENE = /[+\-&|!(){}[\]^"~*?:\\/]/g;

/** The search URL for what the user typed, or `undefined` when there is nothing to search yet. */
export function searchUrl(source: NonNullable<KindSpec['source']>, query: string): string | undefined {
  const words = query.trim().replace(/\s+/g, ' ');
  if (words.length < 2) return undefined;
  const term = encodeURIComponent(words);
  switch (source) {
    case 'musicbrainz':
      return `https://musicbrainz.org/ws/2/release-group?query=${encodeURIComponent(words.replace(LUCENE, '\\$&'))}&fmt=json&limit=12`;
    case 'itunes-movie':
      return `https://itunes.apple.com/search?media=movie&entity=movie&term=${term}&limit=12`;
    case 'itunes-podcast':
      return `https://itunes.apple.com/search?media=podcast&term=${term}&limit=12`;
    case 'openlibrary':
      return `https://openlibrary.org/search.json?q=${term}&fields=key,title,author_name,first_publish_year,subject,cover_i&limit=10`;
  }
}

type Json = Record<string, unknown>;
const object = (value: unknown): Json => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {});
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const string = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : typeof value === 'number' ? String(value) : undefined);
const yearOf = (value: unknown) => /^\d{4}/.exec(string(value) ?? '')?.[0];
const unique = (items: string[]) => [...new Set(items.map(genreName).filter(Boolean))];

/** Parses a search's answer into result cards. Anything missing or odd in it is skipped, never thrown. */
export function parseResults(source: NonNullable<KindSpec['source']>, answer: unknown): LookupResult[] {
  switch (source) {
    case 'musicbrainz':
      return musicBrainz(answer);
    case 'itunes-movie':
      return iTunes(answer, 'feature-movie');
    case 'itunes-podcast':
      return iTunes(answer, 'podcast');
    case 'openlibrary':
      return openLibrary(answer);
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

function iTunes(answer: unknown, kind: 'feature-movie' | 'podcast'): LookupResult[] {
  return array(object(answer).results).flatMap((value) => {
    const item = object(value);
    if (item.kind !== kind) return [];
    const id = string(item.trackId) ?? string(item.collectionId);
    const title = kind === 'podcast' ? (string(item.collectionName) ?? string(item.trackName)) : string(item.trackName);
    if (!id || !title) return [];
    const art = string(item.artworkUrl100) ?? string(item.artworkUrl600);
    const genre = string(item.primaryGenreName);
    const show = kind === 'podcast' ? string(item.collectionId) : undefined;
    return [
      {
        id,
        title,
        maker: string(item.artistName),
        year: kind === 'podcast' ? undefined : yearOf(item.releaseDate),
        genres: genre ? unique([genre]) : [],
        thumb: artwork(art, 200),
        cover: artwork(art, 600),
        note: kind === 'podcast' ? (string(item.trackCount) ? `${string(item.trackCount)} episodes` : undefined) : genre,
        episodes: show && /^\d+$/.test(show) ? episodesUrl(show) : undefined,
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
 * episode's own artwork, or the show's. Anything that isn't an episode is skipped, never thrown.
 */
export function parseEpisodes(answer: unknown, show: LookupResult): EpisodeResult[] {
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
        thumb: artwork(art, 200) ?? show.thumb,
        cover: artwork(art, 600) ?? show.cover,
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
      },
    ];
  });
}
