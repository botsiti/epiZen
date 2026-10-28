import { parse } from 'yaml';
import type { NoteText, VaultFile } from './api';
import { parseNote, type Properties } from './frontmatter';
import { findWikilinks, linkResolver, noteTitle, type WikilinkMatch } from './links';
import { noteNameProblem } from './text';

// The library: albums, films, books, podcasts and videos, each a note in its folder under
// Rating/, written the way the vault's own notes are. Everything here is pure; the components
// in src/components/library/ draw it, and src/lib/lookup.ts finds new ones.

export const LIBRARY_ROOT = 'Rating';

export type MediaKind = 'album' | 'film' | 'book' | 'podcast' | 'video';

export interface KindSpec {
  kind: MediaKind;
  /** Its folder under Rating/. */
  folder: string;
  /** The tab's name, and the word for one. */
  tab: string;
  one: string;
  /** Property keys, as a new note writes them. Read in any case: some notes say `rating`, others `Rating`. */
  keys: {
    maker: string;
    year?: string;
    genre?: string;
    rating: string;
    /** When it was listened to, watched or finished. */
    date: string;
    /** A book's first day. */
    started?: string;
    /** An album's favourite tracks. */
    tracks?: string;
  };
  /** What the maker and the date are called on its page. */
  makerLabel: string;
  dateLabel: string;
  /** A new note's properties, in the order the vault's notes have them. */
  order: (keyof KindSpec['keys'])[];
  /** Properties written only with a value: the vault's template leaves them out, some of its notes have them. */
  sparse?: (keyof KindSpec['keys'])[];
  /** The overview note a new one links to first: one per year ("00. Music 2026 MOC"), or one for all ("00. Books"). */
  moc: 'year' | 'single';
  /** The alias the link to a yearly overview carries, as the vault's albums do: `[[00. Music 2026 MOC|music 2026]]`. */
  mocAlias?: string;
  /** The width the cover is embedded at. */
  coverWidth: number;
  /** The shape of its covers, width over height. */
  aspect: number;
  /** Where "Add" looks things up (src/lib/lookup.ts); videos are only read. */
  source?: 'musicbrainz' | 'wikipedia-film' | 'wikipedia-openlibrary' | 'itunes-podcast';
}

/** The one place a folder under Rating/ becomes a kind of thing. */
export const KINDS: readonly KindSpec[] = [
  {
    kind: 'album',
    folder: 'music',
    tab: 'Albums',
    one: 'album',
    keys: { maker: 'Artist', year: 'Year', date: 'listened', genre: 'genre', rating: 'rating', tracks: 'favorite tracks' },
    makerLabel: 'Artist',
    dateLabel: 'Listened',
    order: ['maker', 'year', 'date', 'genre', 'rating', 'tracks'],
    moc: 'year',
    mocAlias: 'music',
    coverWidth: 240,
    aspect: 1,
    source: 'musicbrainz',
  },
  {
    kind: 'film',
    folder: 'kino',
    tab: 'Films',
    one: 'film',
    keys: { maker: 'Director', year: 'Year', date: 'Watched', genre: 'Genre', rating: 'Rating' },
    makerLabel: 'Director',
    dateLabel: 'Watched',
    order: ['maker', 'year', 'date', 'genre', 'rating'],
    moc: 'year',
    coverWidth: 200,
    aspect: 2 / 3,
    source: 'wikipedia-film',
  },
  {
    kind: 'book',
    folder: 'books',
    tab: 'Books',
    one: 'book',
    // "Finshed" is how the vault spells it; a note Epizen writes must match the others.
    keys: { maker: 'Author', year: 'Year', genre: 'Genre_book', rating: 'Rating', date: 'Finshed', started: 'Started' },
    makerLabel: 'Author',
    dateLabel: 'Finished',
    order: ['maker', 'year', 'genre', 'rating', 'date', 'started'],
    moc: 'single',
    coverWidth: 200,
    aspect: 2 / 3,
    source: 'wikipedia-openlibrary',
  },
  {
    kind: 'podcast',
    folder: 'podcasts',
    tab: 'Podcasts',
    one: 'podcast',
    // A note is one episode, named after it; Author is the show. The year it came out sits
    // between Rating and Genre, as the vault's notes that have one put it ("Ilya Sutskever").
    keys: { maker: 'Author', year: 'Year', genre: 'Genre', rating: 'Rating', date: 'Listened' },
    makerLabel: 'Author',
    dateLabel: 'Listened',
    order: ['maker', 'rating', 'year', 'genre', 'date'],
    sparse: ['year'],
    moc: 'year',
    coverWidth: 240,
    aspect: 1,
    source: 'itunes-podcast',
  },
  {
    kind: 'video',
    folder: 'youtube',
    tab: 'Videos',
    one: 'video',
    keys: { maker: 'Channel', date: 'Watched', rating: 'rating' },
    makerLabel: 'Channel',
    dateLabel: 'Watched',
    order: ['maker', 'date', 'rating'],
    moc: 'year',
    coverWidth: 320,
    aspect: 16 / 9,
  },
];

export const kindSpec = (kind: MediaKind): KindSpec => KINDS.find((spec) => spec.kind === kind) ?? (KINDS[0] as KindSpec);

/** The kind of a folder like `Rating/music`, if it is one of the library's. */
export function kindOfFolder(folder: string): KindSpec | undefined {
  const [root, name, ...rest] = folder.split('/');
  if (root !== LIBRARY_ROOT || !name || rest.length) return undefined;
  return KINDS.find((spec) => spec.folder.toLowerCase() === name.toLowerCase());
}

/** The kind of a note directly inside one of the library's folders (not its overview, "00. …"). */
export function kindOfPath(path: string): KindSpec | undefined {
  if (!/\.md$/i.test(path) || noteTitle(path).startsWith('00.')) return undefined;
  return kindOfFolder(path.slice(0, path.lastIndexOf('/')));
}

/** The note's own spelling of a property, matched without regard to case, if it has it. */
export function keyIn(properties: Properties, key: string): string | undefined {
  const wanted = key.toLowerCase();
  return Object.keys(properties).find((name) => name.toLowerCase() === wanted);
}

/** A property's value, whatever case the note writes its key in. The first one that has a value wins. */
export function field(properties: Properties, key: string): unknown {
  const wanted = key.toLowerCase();
  const values = Object.entries(properties).filter(([name]) => name.toLowerCase() === wanted).map(([, value]) => value);
  return values.find((value) => value !== null && value !== undefined && value !== '') ?? values[0];
}

/** A rated note: in a library folder, with a rating property (even an empty one, for "not rated yet"). */
export function isMediaNote(path: string, properties: Properties): boolean {
  return Boolean(kindOfPath(path)) && keyIn(properties, 'rating') !== undefined;
}

export interface MediaEntry {
  path: string;
  kind: MediaKind;
  title: string;
  maker?: string;
  year?: string;
  /** 0–100, when it has been rated. */
  rating?: number;
  /** YYYY-MM-DD: listened, watched or finished. */
  date?: string;
  started?: string;
  genres: string[];
  tracks: string[];
  /** The cover's vault path: the note's first embedded image. */
  cover?: string;
}

const text = (value: unknown) => (typeof value === 'string' || typeof value === 'number' ? String(value).trim() || undefined : undefined);
const list = (value: unknown): string[] => {
  const items = Array.isArray(value) ? value : value === null || value === undefined ? [] : [value];
  return items.map(text).filter((item): item is string => Boolean(item));
};
const dateOf = (value: unknown) => /^\d{4}-\d{2}-\d{2}/.exec(text(value) ?? '')?.[0];

/** Reads one note as a library entry, or `undefined` when it isn't one. */
export function readEntry(path: string, note: string, resolve: (target: string, from: string) => VaultFile | undefined): MediaEntry | undefined {
  const spec = kindOfPath(path);
  if (!spec) return undefined;
  const { properties, body } = parseNote(note);
  if (keyIn(properties, 'rating') === undefined) return undefined;
  const { keys } = spec;
  const rating = Number(text(field(properties, keys.rating)));
  const cover = coverEmbed(body, path, resolve)?.file;
  return {
    path,
    kind: spec.kind,
    title: noteTitle(path),
    maker: text(field(properties, keys.maker)),
    year: keys.year ? text(field(properties, keys.year)) : undefined,
    rating: text(field(properties, keys.rating)) !== undefined && Number.isFinite(rating) ? rating : undefined,
    date: dateOf(field(properties, keys.date)),
    started: keys.started ? dateOf(field(properties, keys.started)) : undefined,
    genres: keys.genre ? [...new Set(list(field(properties, keys.genre)).map(genreName))] : [],
    tracks: keys.tracks ? list(field(properties, keys.tracks)) : [],
    cover: cover?.path,
  };
}

/** Every library entry in the vault, by kind. */
export function collectLibrary(notes: NoteText[], files: VaultFile[]): Map<MediaKind, MediaEntry[]> {
  const resolve = linkResolver(files);
  const library = new Map<MediaKind, MediaEntry[]>(KINDS.map((spec) => [spec.kind, []]));
  for (const { path, text: note } of notes) {
    const entry = readEntry(path, note, resolve);
    if (entry) library.get(entry.kind)?.push(entry);
  }
  return library;
}

/** A genre as the library groups it: trimmed and lower case ("self improvement " and "Self improvement" are one). */
export const genreName = (genre: string) => genre.trim().toLowerCase();

export interface LibraryStats {
  total: number;
  /** Listened to, watched or finished this calendar year. */
  thisYear: number;
  /** The mean rating of those rated, rounded. */
  average?: number;
  rated: number;
  /** How many ratings fall in each tenth: 0–9, 10–19 … 90–100. */
  histogram: number[];
}

export function libraryStats(entries: MediaEntry[], today: Date): LibraryStats {
  const ratings = entries.flatMap((entry) => (entry.rating === undefined ? [] : [entry.rating]));
  const histogram = Array.from({ length: 10 }, () => 0);
  for (const rating of ratings) {
    const bucket = Math.max(0, Math.min(9, Math.floor(rating / 10)));
    histogram[bucket] = (histogram[bucket] ?? 0) + 1;
  }
  return {
    total: entries.length,
    thisYear: entries.filter((entry) => entry.date?.startsWith(`${today.getFullYear()}-`)).length,
    average: ratings.length ? Math.round(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) : undefined,
    rated: ratings.length,
    histogram,
  };
}

/** Recent, Rating and Title are the chips; the list's headers sort by those and by maker and year too. */
export type SortOrder = 'recent' | 'rating' | 'title' | 'maker' | 'year';

const words = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
const byTitle = (a: MediaEntry, b: MediaEntry) => words(a.title, b.title);
const byDate = (a: MediaEntry, b: MediaEntry) => (b.date ?? '').localeCompare(a.date ?? '');
const byRating = (a: MediaEntry, b: MediaEntry) => (b.rating ?? -1) - (a.rating ?? -1);
// Those without a maker or a year go last, as the unrated and undated do.
const byMaker = (a: MediaEntry, b: MediaEntry) => Number(!a.maker) - Number(!b.maker) || words(a.maker ?? '', b.maker ?? '');
const yearOf = (entry: MediaEntry) => (entry.year && /^\d{1,4}$/.test(entry.year) ? Number(entry.year) : -1);
const byYear = (a: MediaEntry, b: MediaEntry) => yearOf(b) - yearOf(a);

/**
 * Recent: the latest listened, watched or finished first. Rating: the best first. Title and maker:
 * A to Z. Year: the newest first. Unrated, undated, nameless and yearless go last.
 */
export function sortEntries(entries: MediaEntry[], order: SortOrder): MediaEntry[] {
  const compare = {
    recent: (a: MediaEntry, b: MediaEntry) => byDate(a, b) || byRating(a, b) || byTitle(a, b),
    rating: (a: MediaEntry, b: MediaEntry) => byRating(a, b) || byDate(a, b) || byTitle(a, b),
    title: byTitle,
    maker: (a: MediaEntry, b: MediaEntry) => byMaker(a, b) || byYear(a, b) || byTitle(a, b),
    year: (a: MediaEntry, b: MediaEntry) => byYear(a, b) || byDate(a, b) || byTitle(a, b),
  }[order];
  return entries.toSorted(compare);
}

/** How the library shows what is in view: the latest as covers, or all of it as a list. Kept in the app's settings. */
export type LibraryLayout = 'covers' | 'list';

export const isLibraryLayout = (value: unknown): value is LibraryLayout => value === 'covers' || value === 'list';

/** How many the covers show: the latest listened to, watched or finished. The list has the rest. */
export const LATEST = 15;

/** The list's columns that can be hidden; the title always shows. */
export const LIST_COLUMNS = ['cover', 'maker', 'year', 'kind', 'genres', 'rating', 'date'] as const;
export type ListColumn = (typeof LIST_COLUMNS)[number];

/** The hidden columns kept in the settings, anything else in there left out. */
export const hiddenColumns = (value: unknown): ListColumn[] =>
  Array.isArray(value) ? LIST_COLUMNS.filter((column) => value.includes(column)) : [];

/** Those whose title, maker or a genre has the words searched for, in any case and either Unicode form. */
export function searchEntries(entries: MediaEntry[], query: string): MediaEntry[] {
  const fold = (text: string) => text.normalize('NFC').toLocaleLowerCase();
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return entries;
  return entries.filter((entry) => {
    const text = fold([entry.title, entry.maker ?? '', ...entry.genres].join(' '));
    return words.every((word) => text.includes(word));
  });
}

/** The genres in use, the most used first. */
export function genreCounts(entries: MediaEntry[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const entry of entries) for (const genre of entry.genres) counts.set(genre, (counts.get(genre) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export const withGenre = (entries: MediaEntry[], genre?: string) => (genre ? entries.filter((entry) => entry.genres.includes(genre)) : entries);

// ---------------------------------------------------------------- everything together

/** The kinds the library shelves and adds, in its tabs' order. Videos are read as pages, not shelved. */
export const SHELVED_KINDS: readonly MediaKind[] = ['album', 'film', 'book', 'podcast'];

/** A library tab: everything together ("all"), or one kind. */
export type LibraryTab = 'all' | MediaKind;

export const isLibraryTab = (value: unknown): value is LibraryTab => value === 'all' || KINDS.some((spec) => spec.kind === value);

/**
 * Every shelved entry together, in the kinds' order, or only the kinds chosen (none chosen is all
 * of them, as a filter that lets everything through).
 */
export function allEntries(library: ReadonlyMap<MediaKind, MediaEntry[]>, kinds: ReadonlySet<MediaKind> = new Set()): MediaEntry[] {
  return SHELVED_KINDS.filter((kind) => !kinds.size || kinds.has(kind)).flatMap((kind) => library.get(kind) ?? []);
}

/** How many of each shelved kind there are, for the kind chips. */
export function kindCounts(library: ReadonlyMap<MediaKind, MediaEntry[]>): [MediaKind, number][] {
  return SHELVED_KINDS.map((kind) => [kind, library.get(kind)?.length ?? 0]);
}

/** Turns a kind on or off among the chosen ones. Choosing every kind is choosing none: everything shows. */
export function toggleKind(kinds: ReadonlySet<MediaKind>, kind: MediaKind): Set<MediaKind> {
  const next = new Set(kinds);
  if (next.has(kind)) next.delete(kind);
  else next.add(kind);
  return SHELVED_KINDS.every((shelved) => next.has(shelved)) ? new Set() : next;
}

/** How many were listened to, watched or finished in each month of a year. */
export function monthCounts(entries: MediaEntry[], year: number): number[] {
  const counts = Array.from({ length: 12 }, () => 0);
  for (const entry of entries) {
    const [y, m] = (entry.date ?? '').split('-').map(Number);
    if (y === year && m && m >= 1 && m <= 12) counts[m - 1] = (counts[m - 1] ?? 0) + 1;
  }
  return counts;
}

/** The entries of one month by day of the month, for the calendar of covers. `month` is 0–11. */
export function monthCovers(entries: MediaEntry[], year: number, month: number): Map<number, MediaEntry[]> {
  const days = new Map<number, MediaEntry[]>();
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
  for (const entry of sortEntries(entries, 'rating')) {
    if (!entry.date?.startsWith(prefix)) continue;
    const date = Number(entry.date.slice(8, 10));
    days.set(date, [...(days.get(date) ?? []), entry]);
  }
  return days;
}

/** The month the calendar opens on: this month if something is in it, or else the latest month that has something. */
export function calendarStart(entries: MediaEntry[], today: Date): { year: number; month: number } {
  const now = { year: today.getFullYear(), month: today.getMonth() };
  const latest = entries.map((entry) => entry.date ?? '').filter((date) => date <= isoDate(today)).sort().at(-1);
  if (!latest || latest.startsWith(isoDate(today).slice(0, 8))) return now;
  return { year: Number(latest.slice(0, 4)), month: Number(latest.slice(5, 7)) - 1 };
}

export const isoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** True for a real calendar day written YYYY-MM-DD. */
export function isDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const real = new Date(year, month - 1, date);
  return real.getFullYear() === year && real.getMonth() === month - 1 && real.getDate() === date;
}

// ---------------------------------------------------------------- a new note

export interface MediaDraft {
  title: string;
  maker: string;
  year: string;
  genres: string[];
  /** 0–100, or '' for not rated yet. */
  rating: string;
  /** YYYY-MM-DD, or ''. */
  date: string;
  started: string;
}

/** Why a draft can't be saved yet, or `undefined` when it can. */
export function draftProblem(draft: MediaDraft): string | undefined {
  if (!draft.title.trim()) return 'Give it a title.';
  if (!noteFileName(draft.title)) return "That title has nothing left to name a note with. Try another.";
  if (draft.rating.trim()) {
    const rating = Number(draft.rating);
    if (!/^\d+$/.test(draft.rating.trim()) || rating > 100) return 'A rating is a whole number from 0 to 100.';
  }
  if (draft.year.trim() && !/^\d{1,4}$/.test(draft.year.trim())) return 'A year is a number, like 1994.';
  for (const date of [draft.date, draft.started]) if (date.trim() && !isDate(date.trim())) return `${date.trim()} isn't a date like 2026-10-27.`;
  return undefined;
}

/**
 * A title as a note's file name: what Obsidian refuses in a name or a [[link]] goes, a colon
 * becomes " - " as the vault's own book notes have it, and spaces close up. `''` if nothing is left.
 */
export function noteFileName(title: string): string {
  const name = title
    .normalize('NFC')
    .replace(/\s*:\s*/g, ' - ')
    .replace(/[\\/*?"<>|#^[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120)
    .trim();
  return name && !noteNameProblem(name) ? name : '';
}

/** A cover's file name stem: lower case words joined by hyphens ("dog-man-star"), in any script. */
export function coverStem(title: string): string {
  return (
    title
      .normalize('NFC')
      .toLowerCase()
      .replaceAll('&', 'and')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
      .replace(/-+$/, '') || 'cover'
  );
}

const IMAGE = /\.(svg|png|jpe?g|gif|webp)$/i;
const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/**
 * A cover path in the kind's `_attachments` folder whose name no image in the vault has yet, in
 * any extension, so `![[name]]` can only mean this file. The extension is `.jpg`; the backend
 * changes it if the image turns out to be another format.
 */
export function coverPath(spec: KindSpec, title: string, files: VaultFile[]): string {
  const taken = new Set(files.filter((file) => IMAGE.test(file.path)).map((file) => baseName(file.path).replace(IMAGE, '').normalize('NFC').toLowerCase()));
  const stem = coverStem(title);
  let name = stem;
  for (let n = 2; taken.has(name); n += 1) name = `${stem}-${n}`;
  return `${LIBRARY_ROOT}/${spec.folder}/_attachments/${name}.jpg`;
}

/** The new note's path, and whether a note with that name is in the folder already. */
export function notePath(spec: KindSpec, title: string, files: VaultFile[]): { path: string; taken: boolean } {
  const path = `${LIBRARY_ROOT}/${spec.folder}/${noteFileName(title)}.md`;
  const wanted = path.normalize('NFC').toLowerCase();
  return { path, taken: files.some((file) => file.path.normalize('NFC').toLowerCase() === wanted) };
}

/**
 * The overview note a new entry links to: for yearly ones, the "00." note in its folder that
 * names the year ("00. Music 2026 MOC", "00.Music 2026 MOC", "00. Kino 2026"); for books the one
 * "00." note that names no year ("00. Books"). `undefined` when the vault has none.
 */
export function findOverview(spec: KindSpec, files: VaultFile[], year: number): string | undefined {
  const folder = `${LIBRARY_ROOT}/${spec.folder}/`.toLowerCase();
  const titles = files
    .filter((file) => file.kind === 'note' && file.path.toLowerCase().startsWith(folder) && !file.path.slice(folder.length).includes('/'))
    .map((file) => noteTitle(file.path))
    .filter((title) => title.startsWith('00.'))
    .sort();
  if (spec.moc === 'single') {
    const plain = titles.filter((title) => !/\b(19|20)\d\d\b/.test(title));
    return plain.length === 1 ? plain[0] : undefined;
  }
  return titles.find((title) => new RegExp(`\\b${year}\\b`).test(title));
}

/** A YAML value written plain when that reads back as the same text, and in double quotes when it wouldn't. */
export function yamlText(value: string): string {
  const plain = value.trim() === value && value !== '' && !/[\r\n\t]/.test(value);
  if (plain) {
    try {
      const read: unknown = parse(`k: ${value}\n`);
      if (typeof read === 'object' && read !== null && (read as { k?: unknown }).k === value) return value;
    } catch {
      // Not plain YAML: quoted below.
    }
  }
  return JSON.stringify(value);
}

const BARE: Partial<Record<keyof KindSpec['keys'], RegExp>> = {
  year: /^\d{1,4}$/,
  rating: /^\d{1,3}$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
  started: /^\d{4}-\d{2}-\d{2}$/,
};

/**
 * A new note's text, in the vault's format for its kind: the properties in the order its notes
 * have them, then a link to the year's overview (if the vault has it), then the cover embed.
 * Values the form left empty are written as an empty property, as the vault's template does.
 */
export function mediaNoteText(spec: KindSpec, draft: MediaDraft, links: { overview?: string; cover?: string }): string {
  const values: Record<keyof KindSpec['keys'], string | string[]> = {
    maker: draft.maker.trim(),
    year: draft.year.trim(),
    genre: draft.genres.map((genre) => genre.trim()).filter(Boolean),
    rating: draft.rating.trim(),
    date: draft.date.trim(),
    started: draft.started.trim(),
    tracks: [],
  };
  const lines = ['---'];
  for (const name of spec.order) {
    const key = spec.keys[name];
    if (!key) continue;
    const value = values[name];
    if (!value.length && spec.sparse?.includes(name)) continue;
    if (Array.isArray(value)) {
      lines.push(`${key}:`, ...value.map((item) => `  - ${yamlText(item)}`));
    } else {
      // Years, ratings and dates are written bare, as the vault has them; the rest is text.
      const written = value && (BARE[name]?.test(value) ? value : yamlText(value));
      lines.push(written ? `${key}: ${written}` : `${key}:`);
    }
  }
  lines.push('---');
  const body: string[] = [];
  if (links.overview) {
    const year = /\b(19|20)\d\d\b/.exec(links.overview)?.[0];
    body.push(spec.mocAlias && year ? `[[${links.overview}|${spec.mocAlias} ${year}]]` : `[[${links.overview}]]`);
  }
  if (links.cover) body.push(`![[${baseName(links.cover)}|${spec.coverWidth}]]`);
  return `${lines.join('\n')}\n${body.length ? `${body.join('\n\n')}\n` : ''}`;
}

/**
 * The note's cover, and the file it shows: its first embedded image, when nothing but links (the
 * overview's), other images' embeds and blank lines come before it, as the vault's notes and new
 * ones have it. An image further down, after a heading or some text, is a page of the note, not
 * its cover: two of the vault's books embed their notes' pages so.
 */
export function coverEmbed(
  body: string,
  path: string,
  resolve: (target: string, from: string) => VaultFile | undefined,
): { link: WikilinkMatch; file: VaultFile } | undefined {
  let from = 0;
  for (const link of findWikilinks(body)) {
    if (body.slice(from, link.index).trim()) return undefined;
    from = link.index + link.length;
    if (!link.embed) continue;
    const file = resolve(link.target, path);
    if (file?.kind === 'image') return { link, file };
    // An image that isn't in the vault may come before the cover; anything else embedded is the note's own.
    if (!IMAGE.test(link.target)) return undefined;
  }
  return undefined;
}

/**
 * What a media page shows of the note's text: the body without the cover embed the hero already
 * shows. Only for drawing; the note itself is never changed.
 */
export function bodyWithoutCover(body: string, link?: WikilinkMatch): string {
  if (!link) return body;
  const before = body.slice(0, link.index).replace(/[ \t]*$/, '');
  const after = body.slice(link.index + link.length).replace(/^[ \t]*/, '');
  return `${before}${after}`.replace(/\n{3,}/g, '\n\n');
}

/** The image type of a cover's bytes, for showing it from a blob. */
export function imageType(bytes: Uint8Array): string | undefined {
  const starts = (...head: number[]) => head.every((byte, i) => bytes[i] === byte);
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (starts(0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return undefined;
}
