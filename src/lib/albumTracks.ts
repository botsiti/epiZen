import { parseSearch, searchRequests, type LookupResult } from './lookup';
import { textIdentity } from './text';

const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export interface AlbumPage { id: number; title: string; description: string }
export interface TrackEdition { title: string; tracks: string[] }
export const albumSearchUrl = (query: string) => `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=8&format=json&formatversion=2`;
export const albumTracksUrl = (id: number) => `https://en.wikipedia.org/w/api.php?action=parse&pageid=${id}&prop=text&format=json&formatversion=2`;
const plain = (html: string) => new DOMParser().parseFromString(html, 'text/html').body.textContent?.replace(/\s+/g, ' ').trim() ?? '';
export function albumPages(answer: unknown): AlbumPage[] {
  const results = record(record(answer).query).search;
  if (!Array.isArray(results)) return [];
  return results.flatMap((value) => {
    const item = record(value);
    return typeof item.pageid === 'number' && Number.isSafeInteger(item.pageid) && item.pageid > 0 && typeof item.title === 'string'
      ? [{ id: item.pageid, title: item.title, description: typeof item.snippet === 'string' ? plain(item.snippet) : '' }] : [];
  });
}
/** Older imports copied the fraction template's stylesheet into the track title. */
export function readableTrackTitle(title: string): string {
  if (!title.includes('.mw-parser-output')) return title;
  const cleaned = title.replace(/\.mw-parser-output\s+\.(?:frac|sr-only)\b[^{}]*\{[^{}]*\}/g, '');
  return cleaned === title ? title : cleaned.replace(/(\d)\+(\d+[⁄/]\d+)/g, '$1 $2').trim();
}

/** Parse inert Wikipedia track tables; no HTML from the service is rendered in the app. */
export function albumEditions(answer: unknown): TrackEdition[] {
  const html = record(record(answer).parse).text;
  if (typeof html !== 'string') return [];
  const document = new DOMParser().parseFromString(html, 'text/html');
  document.querySelectorAll('style, script, template, .reference, .mw-ref, .sortkey, [hidden], [aria-hidden="true"]:not(.frac *)').forEach((node) => node.remove());
  // Mixed numbers sometimes include a screen-reader-only plus between the whole and numerator.
  document.querySelectorAll('.frac .sr-only').forEach((node) => node.replaceWith(' '));
  document.querySelectorAll('sup').forEach((node) => {
    if (/^\[.*\]$/.test(node.textContent.trim())) node.remove();
  });
  return [...document.querySelectorAll('table.tracklist')].flatMap((table, i) => {
    const header = [...(table.querySelector('tr')?.children ?? [])].findIndex((cell) => cell.textContent?.trim().toLowerCase() === 'title');
    if (header < 0) return [];
    const tracks = [...table.querySelectorAll('tr')].flatMap((row) => {
      if (!/^\d+[.\s]*$/.test(row.children[0]?.textContent?.trim() ?? '')) return [];
      const cell = row.children[header];
      if (!cell) return [];
      const raw = cell.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      const title = raw.replace(/^[“"](.+?)[”"](?=\s|$)/, '$1');
      return title ? [title] : [];
    });
    return tracks.length ? [{ title: table.querySelector('caption')?.textContent?.trim() || (i === 0 ? 'Original track listing' : `Track listing ${i + 1}`), tracks }] : [];
  });
}

/** Use the chosen Wikipedia page, or an unambiguous match on both album and credited artist. */
export async function lookupAlbumTracks(title: string, artist: string, picked: LookupResult | undefined, ask: (url: string) => Promise<unknown>): Promise<string[]> {
  const matches = (album: LookupResult) => textIdentity(album.title) === textIdentity(title)
    && textIdentity(album.maker ?? '') === textIdentity(artist);
  let album = picked?.from === 'wikipedia' && matches(picked) ? picked : undefined;
  if (!album) {
    if (!artist.trim()) return [];
    const [search] = searchRequests('wikipedia-album', `${title} ${artist}`);
    if (!search) return [];
    const candidates = parseSearch('wikipedia-album', { wikipedia: await ask(search.url) }).filter(matches);
    if (candidates.length !== 1) return [];
    [album] = candidates;
  }
  const page = /^wikipedia:([1-9]\d*)$/.exec(album?.id ?? '');
  if (!page) return [];
  const editions = albumEditions(await ask(albumTracksUrl(Number(page[1]))));
  const standard = editions.filter((edition) => !/\b(?:bonus|deluxe|reissue|remaster(?:ed)?)\b/i.test(edition.title));
  return standard.length === 1 ? standard[0]!.tracks : [];
}
