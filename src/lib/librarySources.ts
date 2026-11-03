/** Supported public catalogues. Saved values are validated before a lookup is built. */
export type Source = 'musicbrainz' | 'wikipedia-album' | 'wikipedia-film' | 'wikipedia-book' | 'openlibrary' | 'wikipedia-openlibrary' | 'itunes-podcast' | 'wikipedia-podcast';
export type SearchKind = 'album' | 'film' | 'book' | 'podcast';
export type LibrarySources = Record<SearchKind, Source>;
export const SOURCE_OPTIONS: Record<SearchKind, readonly Source[]> = {
  album: ['musicbrainz', 'wikipedia-album'],
  film: ['wikipedia-film'],
  book: ['wikipedia-openlibrary', 'wikipedia-book', 'openlibrary'],
  podcast: ['itunes-podcast', 'wikipedia-podcast'],
};
export const DEFAULT_SOURCES: LibrarySources = { album: 'musicbrainz', film: 'wikipedia-film', book: 'wikipedia-openlibrary', podcast: 'itunes-podcast' };
export function librarySources(value: unknown): LibrarySources {
  const stored = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(SOURCE_OPTIONS).map(([kind, options]) => [kind, options.includes(stored[kind] as Source) ? stored[kind] : DEFAULT_SOURCES[kind as SearchKind]])) as LibrarySources;
}
