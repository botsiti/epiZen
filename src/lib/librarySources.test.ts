import { expect, it } from 'vitest';
import { DEFAULT_SOURCES, librarySources } from './librarySources';
import { allowedUrl, parseSearch, searchRequests } from './lookup';

it('validates source choices separately for each media kind', () => {
  expect(librarySources({ album: 'wikipedia-album', book: 'itunes-podcast', film: 'https://other.test', podcast: null })).toEqual({ ...DEFAULT_SOURCES, album: 'wikipedia-album' });
});
it('uses only the chosen book service and retains the normalized card shape', () => {
  for (const source of ['wikipedia-book', 'openlibrary'] as const) {
    const requests = searchRequests(source, 'Life 3.0');
    expect(requests).toHaveLength(1);
    expect(requests[0]?.service).toBe(source === 'openlibrary' ? 'openlibrary' : 'wikipedia');
    expect(allowedUrl(requests[0]!.url)).toBe(true);
  }
  expect(parseSearch('wikipedia-book', { wikipedia: { query: { pages: [{ pageid: 1, title: 'Life 3.0', description: '2017 book by Max Tegmark' }] } } })[0]).toMatchObject({ title: 'Life 3.0', maker: 'Max Tegmark', year: '2017', from: 'wikipedia' });
  expect(parseSearch('openlibrary', { openlibrary: { docs: [{ key: '/works/a', title: 'Life 3.0', author_name: ['Max Tegmark'] }] } })[0]).toMatchObject({ title: 'Life 3.0', maker: 'Max Tegmark', from: 'openlibrary' });
});
it('finds Wikipedia podcast shows without pretending they have an episode feed', () => {
  const request = searchRequests('wikipedia-podcast', 'A show')[0]!;
  expect(new URL(request.url).searchParams.get('gsrsearch')).toBe('A show podcast');
  const found = parseSearch('wikipedia-podcast', { wikipedia: { query: { pages: [
    { pageid: 1, title: 'A show (podcast)', description: 'Interview podcast', thumbnail: { source: 'https://upload.wikimedia.org/show.jpg' } },
    { pageid: 2, title: 'A network', description: 'Podcast network' },
  ] } } });
  expect(found).toHaveLength(1);
  expect(found[0]).toMatchObject({ title: 'A show', cover: 'https://upload.wikimedia.org/show.jpg', from: 'wikipedia' });
  expect(found[0]?.episodes).toBeUndefined();
  expect(parseSearch('wikipedia-podcast', { wikipedia: { unexpected: true } })).toEqual([]);
});
