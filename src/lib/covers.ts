import type { MediaEntry, MediaKind } from './library';
import {
  parseEpisodes,
  parseSearch,
  readDetails,
  searchRequests,
  type EpisodeResult,
  type LookupResult,
  type Source,
} from './lookup';

// Finding a cover for a note the library already has: an album, film, book or podcast episode
// that was written without one. Each kind is searched on its usual source (src/lib/lookup.ts) by
// its title, maker and year, and every result is held against what the note says. A result is
// `sure` only when its title, its maker and its year agree with the note's, or, for a note that
// names no maker, its title and its year both do; anything less is offered unticked, with why.
// A wrong cover written silently is worse than none.

/** What a note says it is, for the search. */
export interface Wanted {
  kind: MediaKind;
  title: string;
  maker?: string;
  year?: string;
  /** When it was listened to, watched or finished, YYYY-MM-DD: nothing that came out later can be it. */
  date?: string;
}

export const wantedOf = (entry: Pick<MediaEntry, 'kind' | 'title' | 'maker' | 'year' | 'date'>): Wanted => ({
  kind: entry.kind,
  title: entry.title,
  maker: entry.maker,
  year: entry.year,
  date: entry.date,
});

/** A result that came out after the note says it was listened to, watched or finished can't be it. */
const tooLate = (wanted: Wanted, year: string | undefined) => Boolean(wanted.date && year && /^\d{4}$/.test(year) && year > wanted.date.slice(0, 4));

/** A result held against the note. */
export interface Candidate {
  result: LookupResult;
  /** Its title, maker and year agree with the note's: ticked to be saved. */
  sure: boolean;
  /** Why it isn't sure, in a few words: "from 1961", "by Aleksandr Ptushko", "no year to check". */
  doubt?: string;
  /** A podcast's episode, found among its show's latest by the note's title: the year it came out. */
  episode?: EpisodeResult;
  score: number;
}

/** Fetches a URL's JSON: the backend, paced, or a test's recorded answers. */
export type Ask = (url: string) => Promise<unknown>;

export interface FindOptions {
  ask: Ask;
  /** Whether an image is really there. Albums' covers are checked: the Cover Art Archive may have none. */
  hasImage?: (url: string) => Promise<boolean>;
}

// ---------------------------------------------------------------- comparing names

const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

const fold = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
/** A text's words, folded, with `&` read as "and". */
const words = (text: string) =>
  fold(text)
    .replaceAll('&', ' and ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
/** A name in Latin letters, so "Эллис" and "Ellis" can be told to be one. */
const latin = (word: string) => [...word].map((letter) => CYRILLIC[letter] ?? letter).join('');

/** A film's or book's title as searched: without what is in brackets ("Ikiru (Жить)" is searched as Ikiru), unless that is all of it. */
export const searchTitle = (title: string) => {
  // A note named after "The Creative Act: A Way of Being" says "The Creative Act - A Way of Being"; a search reads " - " as "not".
  const plain = title.replace(/\s+[-–—]\s+/g, ' ');
  return plain.replace(/\s*[([][^)\]]*[)\]]\s*/g, ' ').replace(/\s+/g, ' ').trim() || plain.trim();
};

/** The language a title in another script is looked up in on Wikidata, by its letters; `undefined` for a title in Latin letters. */
export function titleLanguage(title: string): string | undefined {
  if (/\p{Script=Cyrillic}/u.test(title)) return 'ru';
  if (/\p{Script=Hangul}/u.test(title)) return 'ko';
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(title)) return 'ja';
  if (/\p{Script=Han}/u.test(title)) return 'zh';
  return undefined;
}

function distance(a: string, b: string): number {
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) row[j] = Math.min((previous[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = row;
  }
  return previous[b.length] ?? Math.max(a.length, b.length);
}

/** Two words that are one, allowing a slip in a long one: "immortel" and "immortal", "ferris" and "ferriss". */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const short = Math.min(a.length, b.length);
  if (short < 5) return false;
  if (distance(a, b) <= (short >= 8 ? 2 : 1)) return true;
  // "strugatsky" and "strugatskie": a long common start.
  let common = 0;
  while (common < short && a[common] === b[common]) common += 1;
  return short >= 7 && common >= short - 2;
}

const ARTICLE = new Set(['the', 'a', 'an']);
const MINOR = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'on', 'to', 'for', 'at', 'by', 'with']);

/** A title's forms worth comparing, each with how much an exact match of it counts. */
function titleForms(title: string): { key: string; weight: number }[] {
  const forms: { text: string; weight: number }[] = [{ text: title, weight: 1 }];
  // "Ikiru (Жить)", "Immortel (ad vitam)": the title without what is in brackets.
  const plain = title.replace(/\s*[([][^)\]]*[)\]]\s*/g, ' ').trim();
  if (plain && plain !== title) forms.push({ text: plain, weight: 0.95 });
  // "Range - Why Generalists Triumph…", "Life 3.0: Being Human…": the title before its subtitle.
  const main = /^(.+?)(?:\s+[-–—]\s+|:\s+)/u.exec(plain || title)?.[1];
  if (main && words(main).some((word) => !MINOR.has(word))) forms.push({ text: main, weight: 0.85 });
  // "F1 The Movie", "The Simpsons Movie" stays: only "the movie" or "the film" after a title.
  const bare = (plain || title).replace(/[\s:–—-]+the\s+(movie|film)$/iu, '');
  if (bare && bare !== (plain || title)) forms.push({ text: bare, weight: 0.95 });
  return forms.map(({ text, weight }) => {
    const list = words(text);
    return { key: (ARTICLE.has(list[0] ?? '') && list.length > 1 ? list.slice(1) : list).join(' '), weight };
  });
}

/** How alike two titles are, 0–1: 1 for the same words, a little less for one read without its subtitle or its brackets. */
export function titleScore(a: string, b: string): number {
  let best = 0;
  for (const x of titleForms(a)) {
    for (const y of titleForms(b)) {
      if (!x.key || !y.key) continue;
      const weight = Math.min(x.weight, y.weight);
      if (x.key === y.key) best = Math.max(best, weight);
      // "Neverending story" and "The NeverEnding Story".
      else if (x.key.replaceAll(' ', '') === y.key.replaceAll(' ', '')) best = Math.max(best, 0.97 * weight);
      else best = Math.max(best, 0.9 * weight * overlap(x.key.split(' '), y.key.split(' ')));
    }
  }
  return best;
}

/**
 * How many words two titles share in the same order (Dice over their longest common run), the
 * small words left out when there are others: "Dog Star Man" is not "Dog Man Star".
 */
function overlap(a: string[], b: string[]): number {
  const keep = (list: string[]) => (list.some((word) => !MINOR.has(word)) ? list.filter((word) => !MINOR.has(word)) : list);
  const [x, y] = [keep(a), keep(b)];
  if (!x.length || !y.length) return 0;
  let previous = Array.from({ length: y.length + 1 }, () => 0);
  for (const word of x) {
    const row = [0];
    for (let j = 1; j <= y.length; j += 1) row[j] = sameWord(word, y[j - 1] ?? '') ? (previous[j - 1] ?? 0) + 1 : Math.max(previous[j] ?? 0, row[j - 1] ?? 0);
    previous = row;
  }
  return (2 * (previous[y.length] ?? 0)) / (x.length + y.length);
}

/** The people in a credit: "Fripp & Eno", "Arkady and Boris Strugatsky", "Bach; The Netherlands Bach Society". */
const people = (credit: string) =>
  credit
    .split(/\s*(?:&|,|;|\/|\+|\band\b|\bfeat\.?(?=\s)|\bfeaturing\b|\bwith\b|\bx\b)\s*/iu)
    .map((person) => words(person).map(latin))
    .filter((person) => person.length > 0);

/**
 * How well the note's maker agrees with a result's, 0–1, or `undefined` when either names none.
 * 0 means they disagree: someone else made it.
 */
export function makerScore(note: string | undefined, result: string | undefined): number | undefined {
  if (!note?.trim() || !result?.trim()) return undefined;
  const a = words(note).map(latin);
  const b = words(result).map(latin);
  if (a.join(' ') === b.join(' ')) return 1;
  // One named inside the other: "Lex Fridman" in "Lex Fridman Podcast", "Tarkovsky" in "Andrei Tarkovsky".
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const inside = short.every((word) => long.some((other) => sameWord(word, other)));
  if (inside) return short.length >= 2 || (short[0]?.length ?? 0) >= 5 ? 0.9 : 0.7;
  // A shared surname among the people credited: "Стругацкие" and "Arkady and Boris Strugatsky".
  const surnames = (credit: string) => people(credit).map((person) => person.at(-1) ?? '');
  if (surnames(note).some((x) => surnames(result).some((y) => x.length >= 3 && sameWord(x, y)))) return 0.85;
  return 0;
}

/** 1 for the same year, 0.6 a year apart (a release date, a festival), 0 further; `undefined` when either has none. */
export function yearScore(note: string | undefined, result: string | undefined): number | undefined {
  const [a, b] = [Number(note), Number(result)];
  if (!note || !result || !Number.isFinite(a) || !Number.isFinite(b)) return undefined;
  const apart = Math.abs(a - b);
  return apart === 0 ? 1 : apart === 1 ? 0.6 : 0;
}

const MAKER_WORD: Record<MediaKind, string> = { album: 'artist', film: 'director', book: 'author', podcast: 'show', video: 'channel' };

/**
 * Holds one result against the note: `undefined` when it is plainly something else (another
 * title; another maker and another year), or a candidate, sure or not, with why not.
 */
export function assess(wanted: Wanted, result: LookupResult, options: { rank: number; titleMatched?: boolean }): Candidate | undefined {
  const title = options.titleMatched ? 1 : titleScore(wanted.title, result.title);
  const maker = makerScore(wanted.maker, result.maker);
  const year = yearScore(wanted.year, result.year);
  if (title < 0.55 || tooLate(wanted, result.year)) return undefined;
  if (maker === 0 && (year === 0 || title < 0.9)) return undefined;
  if (year === 0 && maker === undefined && title < 0.9) return undefined;
  const cover = Boolean(result.cover);
  const score = title * 3 + (maker ?? 0.4) * 2 + (year ?? 0.4) * 1.5 + (cover ? 0.3 : 0) - options.rank * 0.02;
  const doubt = !cover
    ? 'no cover there'
    : title < 0.9
      ? 'the title differs'
      : maker === 0
        ? `by ${result.maker ?? 'someone else'}`
        : maker !== undefined && maker < 0.85
          ? `by ${result.maker ?? 'someone else'}?`
          : year === 0
            ? `from ${result.year ?? 'another year'}`
            : wanted.maker && maker === undefined
              ? `no ${MAKER_WORD[wanted.kind]} to check`
              : !wanted.maker && year === undefined
                ? wanted.year
                  ? 'no year to check'
                  : `no ${MAKER_WORD[wanted.kind]} or year to check`
                : !wanted.maker && year !== 1
                  ? `from ${result.year ?? 'another year'}`
                  : undefined;
  // Two strong signals settle a title that differs a little: "F1 The Movie" is F1, Joseph Kosinski's of 2025.
  const settledByMaker = cover && title >= 0.65 && maker !== undefined && maker >= 0.85 && year === 1;
  return settledByMaker ? { result, sure: true, score } : { result, sure: !doubt, doubt, score };
}

/**
 * The candidates best first. A sure one stops being sure when another result fits as well: the
 * same title by someone else, or, for a note that gives no year, the same title by the same
 * maker from another year (an artist's albums named after themselves).
 */
function ranked(wanted: Wanted, candidates: Candidate[]): Candidate[] {
  const sorted = candidates.toSorted((a, b) => b.score - a.score);
  const [best, ...rest] = sorted;
  if (!best?.sure) return sorted;
  const rival = rest.find((other) => {
    if (!other.result.cover || other.score < best.score - 1.5 || titleScore(best.result.title, other.result.title) < 0.9) return false;
    // One from a year the note rules out is no rival.
    if (yearScore(wanted.year, other.result.year) === 0) return false;
    // Open Library lists summaries and study guides under a book's own title; Wikipedia's books are the books.
    if (best.result.from === 'wikipedia' && other.result.from === 'openlibrary') return false;
    const maker = makerScore(best.result.maker, other.result.maker);
    if (maker === 0) return true;
    // The same title exactly: "Older (Live in Concert)" is another record, not another "Older".
    return !wanted.year && maker !== undefined && maker >= 0.85 && Boolean(other.result.year) && other.result.year !== best.result.year && titleScore(best.result.title, other.result.title) === 1;
  });
  if (!rival) return sorted;
  return [{ ...best, sure: false, doubt: `or ${[rival.result.title, rival.result.maker, rival.result.year].filter(Boolean).join(' · ')}` }, ...rest];
}

const assessAll = (wanted: Wanted, results: LookupResult[], matched: ReadonlySet<string> = new Set()) =>
  results.flatMap((result, rank) => assess(wanted, result, { rank, titleMatched: matched.has(result.id) }) ?? []);

/** Whether a search found the note for sure, so no second, plainer one is needed. */
const settled = (candidates: Candidate[]) => candidates.some((candidate) => candidate.sure);

// ---------------------------------------------------------------- the searches

/** Lucene's special characters, escaped; words in lower case so none reads as AND, OR or NOT. */
const lucene = (text: string) =>
  text
    .toLowerCase()
    .replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** An album's search: its title's words among a release group's, and its artist's among the credit's. */
export function albumSearchUrl(wanted: Wanted): string | undefined {
  const title = lucene(wanted.title);
  if (!title) return undefined;
  const maker = wanted.maker ? lucene(wanted.maker) : '';
  const query = maker ? `releasegroup:(${title}) AND artist:(${maker})` : `releasegroup:(${title})`;
  return `https://musicbrainz.org/ws/2/release-group?query=${encodeURIComponent(query)}&fmt=json&limit=10`;
}

const WIKIPEDIA_PAGES = '&prop=pageimages|description|pageprops&piprop=thumbnail&pithumbsize=500&pilicense=any&ppprop=wikibase_item';

/** Wikidata's search of labels in the title's own language, described in English. */
export const wikidataSearchUrl = (title: string, language: string) =>
  `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&search=${encodeURIComponent(title)}&language=${language}&uselang=en&type=item&limit=10`;
/** The English Wikipedia pages of some Wikidata items. */
export const sitelinksUrl = (items: string[]) => `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=${items.map(encodeURIComponent).join('|')}&props=sitelinks&sitefilter=enwiki`;
/** Some English Wikipedia pages by title, with what a search gives of each. */
export const wikipediaPagesUrl = (titles: string[]) =>
  `https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1&titles=${titles.map(encodeURIComponent).join('|')}${WIKIPEDIA_PAGES}`;
/** Episodes whose titles have these words, across every show. */
export const episodeSearchUrl = (title: string) => `https://itunes.apple.com/search?media=podcast&entity=podcastEpisode&term=${encodeURIComponent(title)}&limit=10`;

type Json = Record<string, unknown>;
const object = (value: unknown): Json => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {});
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

/** The items whose label or alias, in the title's language, is the note's title exactly. */
export function labelMatches(answer: unknown, title: string): string[] {
  const wanted = titleForms(title).filter((form) => form.weight >= 0.95).map((form) => form.key);
  return array(object(answer).search)
    .map(object)
    .filter((hit) => {
      const said = text(object(hit.match).text) ?? text(hit.label) ?? '';
      return titleForms(said).some((form) => form.weight === 1 && wanted.includes(form.key));
    })
    .flatMap((hit) => (/^Q\d+$/.test(text(hit.id) ?? '') ? [text(hit.id) as string] : []));
}

/** The English Wikipedia title of each item that has one. */
export function enwikiTitles(answer: unknown, items: string[]): string[] {
  const entities = object(object(answer).entities);
  return items.flatMap((item) => text(object(object(object(entities[item]).sitelinks).enwiki).title) ?? []);
}

/** A title in another script, found by its label on Wikidata, then its English page: "Скромное обаяние буржуазии" is The Discreet Charm of the Bourgeoisie. */
async function byLabel(wanted: Wanted, source: 'wikipedia-film' | 'wikipedia-openlibrary', ask: Ask): Promise<LookupResult[]> {
  const title = searchTitle(wanted.title);
  const language = titleLanguage(title);
  if (!language) return [];
  const items = labelMatches(await ask(wikidataSearchUrl(title, language)), title).slice(0, 3);
  if (!items.length) return [];
  const titles = enwikiTitles(await ask(sitelinksUrl(items)), items);
  if (!titles.length) return [];
  return parseSearch(source, { wikipedia: await ask(wikipediaPagesUrl(titles)) });
}

const joined = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' ');
const requestOf = (source: Source, query: string, service: string) => searchRequests(source, query).find((request) => request.service === service)?.url;

/** Reads a Wikipedia result's Wikidata item when it would settle something: who made it, its year, its genres. */
async function withFacts(wanted: Wanted, candidate: Candidate, ask: Ask, matched: ReadonlySet<string>, rank: number): Promise<Candidate | undefined> {
  const { result } = candidate;
  if (!result.wikidata) return candidate;
  const read = await readDetails(result, ask).catch(() => result);
  // What Wikidata says may show it to be plainly something else: another director's, of another year.
  return assess(wanted, read, { rank, titleMatched: matched.has(result.id) });
}

async function films(wanted: Wanted, ask: Ask): Promise<Candidate[]> {
  const matched = new Set<string>();
  let results: LookupResult[];
  if (titleLanguage(searchTitle(wanted.title))) {
    results = await byLabel(wanted, 'wikipedia-film', ask);
    for (const result of results) matched.add(result.id);
  } else {
    const first = requestOf('wikipedia-film', joined(searchTitle(wanted.title), wanted.maker, wanted.year), 'wikipedia');
    results = first ? parseSearch('wikipedia-film', { wikipedia: await ask(first) }) : [];
    if (!settled(assessAll(wanted, results))) {
      const plain = requestOf('wikipedia-film', searchTitle(wanted.title), 'wikipedia');
      if (plain && plain !== first) results = unique([...results, ...parseSearch('wikipedia-film', { wikipedia: await ask(plain) })]);
    }
  }
  return detailed(wanted, assessAll(wanted, results, matched), ask, matched);
}

async function books(wanted: Wanted, ask: Ask): Promise<Candidate[]> {
  const matched = new Set<string>();
  const other = Boolean(titleLanguage(searchTitle(wanted.title)));
  // Wikipedia and Open Library together; a title in another script only on Open Library, and by its label on Wikidata.
  const search = async (query: string) => {
    const requests = searchRequests('wikipedia-openlibrary', query).filter((request) => !other || request.service === 'openlibrary');
    const answers = await Promise.all(requests.map(async ({ service, url }) => [service, await ask(url)] as const));
    return parseSearch('wikipedia-openlibrary', Object.fromEntries(answers));
  };
  let results = await search(other ? searchTitle(wanted.title) : joined(searchTitle(wanted.title), wanted.maker));
  if (other) {
    const labelled = await byLabel(wanted, 'wikipedia-openlibrary', ask);
    for (const result of labelled) matched.add(result.id);
    results = unique([...labelled, ...results]);
  } else if (wanted.maker && !settled(assessAll(wanted, withCovers(results)))) {
    results = unique([...results, ...(await search(searchTitle(wanted.title)))]);
  }
  return detailed(wanted, assessAll(wanted, withCovers(results), matched), ask, matched);
}

/** A Wikipedia book without a cover borrows Open Library's, when Open Library has the same book. */
function withCovers(results: LookupResult[]): LookupResult[] {
  return results.map((result) => {
    if (result.cover || result.from !== 'wikipedia') return result;
    const same = results.find((other) => other.from === 'openlibrary' && other.cover && titleScore(other.title, result.title) >= 0.9 && makerScore(result.maker, other.maker) !== 0);
    return same ? { ...result, thumb: same.thumb, cover: same.cover } : result;
  });
}

const unique = (results: LookupResult[]) => results.filter((result, i) => results.findIndex((other) => other.id === result.id) === i);

/** The best few with their Wikidata facts read, ranked again. */
async function detailed(wanted: Wanted, candidates: Candidate[], ask: Ask, matched: ReadonlySet<string>): Promise<Candidate[]> {
  const sorted = ranked(wanted, candidates);
  // The best one's facts, and the next one's too when the best isn't sure.
  const read = sorted[0]?.sure ? 1 : 2;
  const top = await Promise.all(sorted.slice(0, read).map((candidate, i) => withFacts(wanted, candidate, ask, matched, i)));
  return ranked(wanted, [...top.filter((candidate): candidate is Candidate => Boolean(candidate)), ...sorted.slice(read)]);
}

/** Keep available images even if another candidate's image service fails. */
async function availableAlbums(wanted: Wanted, candidates: Candidate[], hasImage?: FindOptions['hasImage']): Promise<Candidate[]> {
  if (!hasImage) return candidates;
  const checked: Candidate[] = [];
  let failed = false;
  let failure: unknown;
  for (const candidate of candidates.slice(0, 3)) {
    if (!candidate.result.thumb) continue;
    try {
      if (await hasImage(candidate.result.thumb)) checked.push(candidate);
    } catch (error) {
      failed = true;
      failure = error;
    }
  }
  if (!checked.length && failed) throw failure;
  return ranked(wanted, checked);
}

async function musicBrainzAlbums(wanted: Wanted, { ask, hasImage }: FindOptions): Promise<Candidate[]> {
  const url = albumSearchUrl(wanted);
  let results = url ? parseSearch('musicbrainz', { musicbrainz: await ask(url) }) : [];
  if (!settled(assessAll(wanted, results))) {
    const plain = requestOf('musicbrainz', joined(wanted.title, wanted.maker), 'musicbrainz');
    if (plain) results = unique([...results, ...parseSearch('musicbrainz', { musicbrainz: await ask(plain) })]);
  }
  // An album over a single, an EP or a live recording of the same name.
  const candidates = assessAll(wanted, results).map((candidate) => {
    const note = candidate.result.note ?? '';
    return { ...candidate, score: candidate.score + (/^Album$/.test(note) ? 0.25 : /^Album/.test(note) ? 0.1 : 0) };
  });
  // The Cover Art Archive has art for most albums, not all: the best three are checked, and only those with some are kept.
  return availableAlbums(wanted, ranked(wanted, candidates), hasImage);
}

/** Prefer a confident Wikipedia cover; search MusicBrainz when Wikipedia is missing or uncertain. */
async function albums(wanted: Wanted, options: FindOptions): Promise<Candidate[]> {
  let wiki: Candidate[] = [];
  let wikiError: unknown;
  try {
    const query = joined(searchTitle(wanted.title), wanted.maker);
    const url = requestOf('wikipedia-album', query, 'wikipedia');
    let results = url ? parseSearch('wikipedia-album', { wikipedia: await options.ask(url) }) : [];
    if (!results.length && wanted.maker) {
      const plain = requestOf('wikipedia-album', searchTitle(wanted.title), 'wikipedia');
      if (plain && plain !== url) results = parseSearch('wikipedia-album', { wikipedia: await options.ask(plain) });
    }
    const candidates = (await detailed(wanted, assessAll(wanted, results), options.ask, new Set())).filter((candidate) => candidate.result.cover);
    wiki = await availableAlbums(wanted, candidates, options.hasImage);
    if (wiki[0]?.sure) return wiki;
  } catch (error) {
    wikiError = error;
  }
  try {
    const fallback = await musicBrainzAlbums(wanted, options);
    if (!fallback.length && !wiki.length && wikiError) throw new Error(wikiError instanceof Error ? wikiError.message : typeof wikiError === 'string' ? wikiError : 'Wikipedia could not be reached', { cause: wikiError });
    return ranked(wanted, [...wiki, ...fallback]);
  } catch (error) {
    if (!wiki.length) throw error;
    // Preserve an uncertain result but do not auto-select it if the fallback was unavailable.
    return wiki.map((candidate) => ({ ...candidate, sure: false, doubt: [candidate.doubt, 'MusicBrainz unavailable'].filter(Boolean).join(' · ') }));
  }
}

async function podcasts(wanted: Wanted, ask: Ask): Promise<Candidate[]> {
  if (!wanted.maker) {
    // No show named: the episode itself, across every show, or else a show of that name. Never sure.
    const episodes = parseEpisodes(await ask(episodeSearchUrl(wanted.title)), { id: '', title: '', genres: [] });
    const found = episodes.flatMap((episode, rank): Candidate[] => {
      const title = titleScore(wanted.title, episode.title);
      if (title < 0.6 || !episode.cover || (wanted.date && episode.released && episode.released > wanted.date)) return [];
      const show: LookupResult = { id: `episode-${episode.id}`, title: episode.maker || episode.title, maker: episode.maker, genres: episode.genres, thumb: episode.thumb, cover: episode.cover, from: 'itunes' };
      return [{ result: show, sure: false, doubt: 'no show to check', episode, score: title * 3 - rank * 0.02 }];
    });
    if (found.length) return found.sort((a, b) => b.score - a.score);
    const url = requestOf('itunes-podcast', wanted.title, 'itunes');
    const shows = url ? parseSearch('itunes-podcast', { itunes: await ask(url) }) : [];
    return shows
      .flatMap((show, rank): Candidate[] => (titleScore(wanted.title, show.title) >= 0.9 && show.cover ? [{ result: { ...show, maker: show.title }, sure: false, doubt: 'a show of that name', score: 3 - rank * 0.02 }] : []))
      .sort((a, b) => b.score - a.score);
  }
  const url = requestOf('itunes-podcast', wanted.maker, 'itunes');
  const shows = url ? parseSearch('itunes-podcast', { itunes: await ask(url) }) : [];
  const named = shows
    .map((show, rank) => ({ show, rank, named: Math.max(makerScore(wanted.maker, show.title) ?? 0, makerScore(wanted.maker, show.maker) ?? 0) }))
    .filter((found) => found.named >= 0.7)
    .map((found) => ({ ...found, score: found.named * 3 + (found.show.cover ? 0.3 : 0) - found.rank * 0.05 }))
    .sort((a, b) => b.score - a.score);
  // The best show's latest episodes, for the one the note is: finding it settles the show, and gives the year.
  return Promise.all(
    named.map(async ({ show, named: how, score }, i): Promise<Candidate> => {
      const result = { ...show, maker: show.title };
      if (i > 0 || !show.episodes || !show.cover) return { result, sure: false, doubt: show.cover ? 'not the best match' : 'no cover there', score };
      const episodes = parseEpisodes(await ask(show.episodes).catch(() => ({})), show);
      const episode = findEpisode(wanted.title, episodes, wanted.date);
      const sure = how >= 0.85 && episode !== undefined;
      return {
        result,
        sure,
        episode: episode === 'several' ? undefined : episode,
        doubt: sure ? undefined : how < 0.85 ? 'the show’s name differs' : 'no episode of it matched',
        score,
      };
    }),
  );
}

/** The episode a note is named after, among a show's: one whose title has every word of the note's. `'several'` when more than one does, from different years. */
export function findEpisode(title: string, episodes: EpisodeResult[], listened?: string): EpisodeResult | 'several' | undefined {
  const mine = words(title).filter((word) => !MINOR.has(word));
  if (!mine.length) return undefined;
  const found = episodes.filter((episode) => {
    if (listened && episode.released && episode.released > listened) return false;
    const theirs = words(episode.title);
    return titleScore(title, episode.title) >= 0.9 || mine.every((word) => theirs.some((other) => sameWord(word, other)));
  });
  if (!found.length) return undefined;
  const years = new Set(found.map((episode) => episode.year));
  return years.size === 1 ? found[0] : 'several';
}

/**
 * Searches for a note's cover and holds what comes back against the note: the candidates, best
 * first, the first sure one ticked to be saved. Empty when nothing found could be it.
 */
export async function findCover(wanted: Wanted, options: FindOptions): Promise<Candidate[]> {
  const usable = (candidates: Candidate[]) => candidates.filter((candidate) => candidate.result.cover);
  switch (wanted.kind) {
    case 'album':
      return usable(await albums(wanted, options));
    case 'film':
      return usable(await films(wanted, options.ask));
    case 'book':
      return usable(await books(wanted, options.ask));
    case 'podcast':
      return usable(await podcasts(wanted, options.ask));
    case 'video':
      return [];
  }
}

/**
 * What a search of other words found, held against the note, best first: those that could be it
 * as the search would have them, then the rest unsure, since the words were chosen. Only those
 * with a cover.
 */
export function rankResults(wanted: Wanted, results: LookupResult[]): Candidate[] {
  const withCover = results.filter((result) => result.cover);
  const fit = ranked(wanted, assessAll(wanted, withCover));
  const rest = withCover.filter((result) => !fit.some((candidate) => candidate.result.id === result.id)).map((result, rank): Candidate => ({ result, sure: false, doubt: 'not the note’s title', score: -rank }));
  return [...fit, ...rest];
}

/** "Dog Man Star · Suede · 1994": what a candidate is, in one line. */
export function describe(candidate: Candidate): string {
  const { result, episode } = candidate;
  return [result.title, result.maker && result.maker !== result.title ? result.maker : undefined, episode?.year ?? result.year].filter(Boolean).join(' · ');
}

/** The pause each service asks for between requests, in milliseconds: MusicBrainz one a second, iTunes about twenty a minute. */
export const SERVICE_GAP: Record<string, number> = {
  'musicbrainz.org': 1200,
  'itunes.apple.com': 3100,
  'openlibrary.org': 1000,
  'en.wikipedia.org': 200,
  'www.wikidata.org': 200,
};
