import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { albumEditions, albumPages } from './albumTracks';

describe('Wikipedia album tracks', () => {
  it('reads the original track table in order, decoding titles and removing quotes', () => {
    const result = albumEditions(JSON.parse(readFileSync('test/fixtures/lookup/wikipedia-album-tracks.json', 'utf8')));
    expect(result[0]?.tracks).toHaveLength(12);
    expect(result[0]?.tracks.slice(0, 2)).toEqual(['Introducing the Band', 'We Are the Pigs']);
    expect(result[0]?.tracks.at(-1)).toBe('Still Life');
  });
  it('ignores malformed responses and separates editions', () => {
    for (const value of [null, [], {}, { parse: { text: false } }]) expect(albumEditions(value)).toEqual([]);
    expect(albumPages({ query: { search: [null, { pageid: 'x', title: 'bad' }, { pageid: 1, title: 'Album', snippet: '<b>Artist</b>' }] } })).toEqual([{ id: 1, title: 'Album', description: 'Artist' }]);
    const table = '<table class="tracklist"><caption>Disc</caption><tr><th>No.</th><th>Title</th></tr><tr><th>1.</th><td>"A &amp; B"<sup>[1]</sup></td></tr></table>';
    expect(albumEditions({ parse: { text: table + table } }).map((edition) => edition.tracks)).toEqual([['A & B'], ['A & B']]);
  });
});
