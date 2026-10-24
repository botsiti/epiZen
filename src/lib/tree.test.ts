import { describe, expect, it } from 'vitest';
import { buildTree, countFolders } from './tree';

describe('buildTree', () => {
  it('puts folders first, sorts numbers naturally, and hides image-only folders', () => {
    const tree = buildTree([
      { path: 'b.md', kind: 'note' },
      { path: 'Rating/music/Album 10.md', kind: 'note' },
      { path: 'Rating/music/Album 9.md', kind: 'note' },
      { path: 'Rating/music/_attachments/cover.svg', kind: 'image' },
      { path: 'a.md', kind: 'note' },
    ]);
    expect(tree.map((node) => node.name)).toEqual(['Rating', 'a', 'b']);
    const music = tree[0]?.kind === 'folder' ? tree[0].children[0] : undefined;
    expect(music?.kind === 'folder' && music.children.map((node) => node.name)).toEqual(['Album 9', 'Album 10']);
    expect(countFolders(tree)).toBe(2);
  });
});
