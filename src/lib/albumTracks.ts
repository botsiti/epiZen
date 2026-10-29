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
/** Parse inert Wikipedia track tables; no HTML from the service is rendered in the app. */
export function albumEditions(answer: unknown): TrackEdition[] {
  const html = record(record(answer).parse).text;
  if (typeof html !== 'string') return [];
  const document = new DOMParser().parseFromString(html, 'text/html');
  return [...document.querySelectorAll('table.tracklist')].flatMap((table, i) => {
    const header = [...(table.querySelector('tr')?.children ?? [])].findIndex((cell) => cell.textContent?.trim().toLowerCase() === 'title');
    if (header < 0) return [];
    const tracks = [...table.querySelectorAll('tr')].flatMap((row) => {
      if (!/^\d+[.\s]*$/.test(row.children[0]?.textContent?.trim() ?? '')) return [];
      const cell = row.children[header]?.cloneNode(true) as HTMLElement | undefined;
      if (!cell) return [];
      cell.querySelectorAll('sup, .reference, .sortkey').forEach((element) => element.remove());
      const raw = cell.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      const title = raw.replace(/^[“"](.+?)[”"](?=\s|$)/, '$1');
      return title ? [title] : [];
    });
    return tracks.length ? [{ title: table.querySelector('caption')?.textContent?.trim() || (i === 0 ? 'Original track listing' : `Track listing ${i + 1}`), tracks: [...new Set(tracks)] }] : [];
  });
}
