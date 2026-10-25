import { describe, expect, it } from 'vitest';
import type { VaultFile } from './api';
import { buildLinkIndex } from './linkIndex';

const files: VaultFile[] = [
  { path: 'Calendar/2026/days 2026/10.08.2026.md', kind: 'note' },
  { path: 'Calendar/2026/months 2026/08.26 RPG.md', kind: 'note' },
  { path: 'Rating/music/Glasshouse Weather.md', kind: 'note' },
  { path: 'Rating/music/_attachments/glasshouse-weather.svg', kind: 'image' },
];

// Lines from demo-vault/.
const notes = [
  {
    path: 'Calendar/2026/days 2026/10.08.2026.md',
    text: '### Tasks\n- [x] #daily/dog — long walk [minutes::64]\n\n**Listened:** [[Glasshouse Weather]]\n',
  },
  {
    path: 'Calendar/2026/months 2026/08.26 RPG.md',
    text: '### Listened\n- [[Glasshouse Weather]] — Mira Okonkwo (88)\n- [[Glasshouse Weather|again]]\n\n```dataview\ntable mood from "[[Glasshouse Weather]]"\n```\nSee `[[08.26 RPG]]` and [[Missing note]].\n',
  },
  {
    path: 'Rating/music/Glasshouse Weather.md',
    text: '[[00. Music 2026 MOC|music 2026]]\n\n![[glasshouse-weather.svg|240]]\n\nListened on [[10.08.2026]].\n',
  },
];

describe('buildLinkIndex', () => {
  const index = buildLinkIndex(notes, files);

  it('lists who links to a note, once each, with the line that does', () => {
    expect(index.backlinks.get('Rating/music/Glasshouse Weather.md')).toEqual([
      { from: 'Calendar/2026/days 2026/10.08.2026.md', context: '**Listened:** [[Glasshouse Weather]]' },
      { from: 'Calendar/2026/months 2026/08.26 RPG.md', context: '- [[Glasshouse Weather]] — Mira Okonkwo (88)' },
    ]);
    expect(index.backlinks.get('Calendar/2026/days 2026/10.08.2026.md')).toEqual([
      { from: 'Rating/music/Glasshouse Weather.md', context: 'Listened on [[10.08.2026]].' },
    ]);
  });

  it('leaves out code, images, missing notes and links to itself', () => {
    expect(index.outgoing.get('Calendar/2026/months 2026/08.26 RPG.md')).toEqual(['Rating/music/Glasshouse Weather.md']);
    expect(index.outgoing.get('Rating/music/Glasshouse Weather.md')).toEqual(['Calendar/2026/days 2026/10.08.2026.md']);
    expect(index.backlinks.has('Calendar/2026/months 2026/08.26 RPG.md')).toBe(false);
  });
});
