import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { albumEditions, albumPages, lookupAlbumTracks, readableTrackTitle } from './albumTracks';

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

it('reads rendered fraction titles without template CSS or citation text', () => {
  const css = '.mw-parser-output .frac{white-space:nowrap}.mw-parser-output .frac .num,.mw-parser-output .frac .den{vertical-align:super}.mw-parser-output .sr-only{width:1px}';
  const fraction = '<span class="frac">8<span class="sr-only">+</span><span class="num">1</span>⁄<span class="den">2</span></span>';
  const text = `<table class="tracklist"><tr><th>No.</th><th>Title</th></tr><tr><th>11.</th><td>"<style>${css}</style>${fraction} Minutes"<sup class="reference">[43]</sup></td></tr></table>`;
  expect(albumEditions({ parse: { text } })[0]?.tracks).toEqual(['8 1⁄2 Minutes']);
  expect(readableTrackTitle(`${css}8+1⁄2 Minutes`)).toBe('8 1⁄2 Minutes');
  expect(readableTrackTitle('A+B {Reprise}')).toBe('A+B {Reprise}');
});

it('uses the selected Wikipedia page and skips bonus-only tables', async () => {
  const table = '<table class="tracklist"><tr><th>No.</th><th>Title</th></tr><tr><th>1.</th><td>Opening</td></tr></table>';
  const ask = vi.fn().mockResolvedValue({ parse: { text: table + table.replace('<tr>', '<caption>Bonus tracks</caption><tr>') } });
  const selected = { from: 'wikipedia' as const, id: 'wikipedia:42', title: 'Record', maker: 'Artist', genres: [] };
  expect(await lookupAlbumTracks('Record', 'Artist', selected, ask)).toEqual(['Opening']);
  expect(ask).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('pageid=42'));
});

it('requires one title and artist match when searching for tracks', async () => {
  const page = { pageid: 12, title: 'Record (album)', description: '1999 album by Artist' };
  const ask = vi.fn().mockResolvedValueOnce({ query: { pages: [page, { ...page, pageid: 13 }] } })
    .mockResolvedValueOnce({ query: { pages: [page] } });
  expect(await lookupAlbumTracks('Record', 'Artist', undefined, ask)).toEqual([]);
  expect(await lookupAlbumTracks('Record', 'Other Artist', undefined, ask)).toEqual([]);
  expect(await lookupAlbumTracks('Record', '', undefined, ask)).toEqual([]);
  expect(ask).toHaveBeenCalledTimes(2);
});
