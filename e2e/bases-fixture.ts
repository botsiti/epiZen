import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MUSIC_BASE, MUSIC_DATAVIEW, GENRE_DATAVIEW } from '../test/fixtures/music-base';
import { CINEMA_TEXT } from '../test/fixtures/cinema-base';

export const MUSIC_MOC = 'Rating/music/00. Live music tables.md';
export const MUSIC_FILE = 'Rating/music/Collection.base';
export const CINEMA_MOC = 'Rating/kino/Cinema base regression.md';
export const MUSIC_FILE_SOURCE = `# An existing Obsidian Base — retain this comment
filters:
  and:
    - file.ext == "md"
    - file.folder == "Rating/music"
    - rating != null
formulas:
  stars: rating / 20
  cover: image(file.embeds[0])
properties:
  file.name:
    displayName: Album
  formula.stars:
    displayName: Stars
views:
  - type: table
    name: Albums
    order: [file.name, Artist, rating, formula.stars, listened]
    sort: [{property: rating, direction: DESC}]
    summaries: {rating: Average}
    customSetting: retain-me
  - type: cards
    name: Covers
    order: [file.name, Artist, rating]
    image: formula.cover
    imageFit: contain
    cardSize: 200
  - type: list
    name: Listening list
    order: [file.name, Artist]
    listMarker: number
    indent: true
`;
export const MUSIC_TEXT = '# Music collection\n\nKeep this introduction and [[Glasshouse Weather]].\n\n```base\n' + MUSIC_BASE.replace(/202[456]/g, (year) => String(Number(year) + 1)) + '\n```\n\n## Legacy listened order\n\n```dataview\n' + MUSIC_DATAVIEW.replace('2024', '2026') + '\n```\n\n## Genre\n\n```dataview\n' + GENRE_DATAVIEW.replace('post-punk', 'ambient') + '\n```\n';
export function addBaseFixtures(root: string) {
  writeFileSync(join(root, CINEMA_MOC), CINEMA_TEXT, { flag: 'wx' });
  writeFileSync(join(root, MUSIC_MOC), MUSIC_TEXT, { flag: 'wx' });
  writeFileSync(join(root, MUSIC_FILE), MUSIC_FILE_SOURCE, { flag: 'wx' });
  writeFileSync(join(root, 'Base embeds.md'), '# My collection\n\n![[Collection.base#Covers]]\n\nThe source is a regular Obsidian Base.\n', { flag: 'wx' });
  writeFileSync(join(root, 'Unsupported table.md'), '# Source is preserved\n\n```base\nviews: [{type: map}]\n```\n\n[[Glasshouse Weather]]\n', { flag: 'wx' });
}
