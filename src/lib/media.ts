import type { NoteText, VaultFile } from './api';
import { parseNote } from './frontmatter';
import { coverEmbed, field, kindOfFolder, kindSpec, LIBRARY_ROOT, type MediaKind } from './library';
import { linkResolver, noteFolder, noteTitle } from './links';

export interface MediaItem {
  path: string;
  title: string;
  /** Who made it, or when: the artist, channel, director or year. */
  subtitle?: string;
  rating: number;
  /** The cover image's vault path: the note's first embedded image, before its text (library.ts, `coverEmbed`). */
  cover?: string;
  /** When it was listened to or watched, for the order on the shelf. */
  date?: string;
}

export interface Shelf {
  folder: string;
  items: MediaItem[];
}

// Keys are read in any case: the vault writes `rating` in some notes and `Rating` in others.
const SUBTITLE = ['artist', 'author', 'channel', 'director', 'year'];
// "Finshed" is how the vault's books spell it.
const WHEN = ['listened', 'watched', 'finshed', 'finished', 'read', 'date'];

const text = (value: unknown) => (typeof value === 'string' || typeof value === 'number' ? String(value) : undefined);

/**
 * Albums, films, books, podcasts, videos and anything else rated: every note with a numeric
 * `rating` property (in any case), on a shelf per folder, the most recently listened to,
 * watched or finished first, then the best rated.
 */
export function collectMedia(notes: NoteText[], files: VaultFile[]): Shelf[] {
  const resolve = linkResolver(files);
  const shelves = new Map<string, MediaItem[]>();
  for (const { path, text: note } of notes) {
    const { properties, body } = parseNote(note);
    const value = field(properties, 'rating');
    const rating = Number(value);
    if (value === undefined || value === null || value === '' || typeof value === 'boolean' || !Number.isFinite(rating)) continue;
    const cover = coverEmbed(body, path, resolve)?.file;
    const item: MediaItem = {
      path,
      title: noteTitle(path),
      subtitle: SUBTITLE.map((key) => text(field(properties, key))).find(Boolean),
      rating,
      cover: cover?.path,
      date: WHEN.map((key) => text(field(properties, key))).find(Boolean),
    };
    const folder = noteFolder(path);
    shelves.set(folder, [...(shelves.get(folder) ?? []), item]);
  }
  return [...shelves]
    .map(([folder, items]) => ({
      folder,
      items: items.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.rating - a.rating || a.title.localeCompare(b.title)),
    }))
    .sort((a, b) => b.items.length - a.items.length || a.folder.localeCompare(b.folder));
}

/** The kinds the home screen keeps a shelf for, in this order. Videos are the library's to read, not the home's. */
export const SHELF_KINDS: readonly MediaKind[] = ['album', 'film', 'book', 'podcast'];

/**
 * The home screen's shelves: albums, films, books and podcasts, each its folder's rated notes,
 * and an empty one for a kind the vault has rated nothing of yet, so it can be started.
 */
export function homeShelves(shelves: Shelf[]): Shelf[] {
  return SHELF_KINDS.map((kind) => shelves.find((shelf) => kindOfFolder(shelf.folder)?.kind === kind) ?? { folder: `${LIBRARY_ROOT}/${kindSpec(kind).folder}`, items: [] });
}
