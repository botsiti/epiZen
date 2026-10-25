import type { NoteText, VaultFile } from './api';
import { parseNote } from './frontmatter';
import { findWikilinks, linkResolver, noteFolder, noteTitle } from './links';

export interface MediaItem {
  path: string;
  title: string;
  /** Who made it, or when: the artist, channel, director or year. */
  subtitle?: string;
  rating: number;
  /** The cover image's vault path: the note's first embedded image. */
  cover?: string;
  /** When it was listened to or watched, for the order on the shelf. */
  date?: string;
}

export interface Shelf {
  folder: string;
  items: MediaItem[];
}

const SUBTITLE = ['Artist', 'artist', 'Author', 'author', 'Channel', 'channel', 'Director', 'director', 'Year', 'year'];
const WHEN = ['listened', 'Listened', 'watched', 'Watched', 'read', 'Read', 'date'];

const text = (value: unknown) => (typeof value === 'string' || typeof value === 'number' ? String(value) : undefined);

/**
 * Albums, films, videos and anything else rated: every note with a numeric `rating` property,
 * on a shelf per folder, the most recently listened to or watched first, then the best rated.
 */
export function collectMedia(notes: NoteText[], files: VaultFile[]): Shelf[] {
  const resolve = linkResolver(files);
  const shelves = new Map<string, MediaItem[]>();
  for (const { path, text: note } of notes) {
    const { properties, body } = parseNote(note);
    const rating = Number(properties.rating);
    if (properties.rating === undefined || properties.rating === null || properties.rating === '' || !Number.isFinite(rating)) continue;
    const cover = findWikilinks(body)
      .filter((link) => link.embed)
      .map((link) => resolve(link.target, path))
      .find((file) => file?.kind === 'image');
    const item: MediaItem = {
      path,
      title: noteTitle(path),
      subtitle: SUBTITLE.map((key) => text(properties[key])).find(Boolean),
      rating,
      cover: cover?.path,
      date: WHEN.map((key) => text(properties[key])).find(Boolean),
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
