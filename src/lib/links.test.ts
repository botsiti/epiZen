import { describe, expect, it } from 'vitest';
import type { VaultFile } from './api';
import { findWikilinks, noteTitle, resolveLink } from './links';

const note = (path: string): VaultFile => ({ path, kind: 'note' });
const image = (path: string): VaultFile => ({ path, kind: 'image' });

describe('findWikilinks', () => {
  it('reads targets, headings, aliases and embeds', () => {
    const text = 'See [[13.08.2026|← Yesterday]], [[Plan#Next]] and ![[cover.svg|240]].';
    expect(findWikilinks(text).map(({ target, heading, alias, embed }) => ({ target, heading, alias, embed }))).toEqual([
      { target: '13.08.2026', heading: undefined, alias: '← Yesterday', embed: false },
      { target: 'Plan', heading: 'Next', alias: undefined, embed: false },
      { target: 'cover.svg', heading: undefined, alias: '240', embed: true },
    ]);
  });
});

describe('resolveLink', () => {
  const files = [
    note('Calendar/2026/days 2026/14.08.2026.md'),
    note('Rating/music/Salt & Graphite.md'),
    note('Inbox/Plan.md'),
    note('Projects/Plan.md'),
    note('Projects/Deep/Plan.md'),
    image('Rating/music/_attachments/salt-and-graphite.svg'),
  ];

  it('finds a note by name anywhere in the vault, ignoring case', () => {
    expect(resolveLink('14.08.2026', files)?.path).toBe('Calendar/2026/days 2026/14.08.2026.md');
    expect(resolveLink('salt & graphite', files)?.path).toBe('Rating/music/Salt & Graphite.md');
  });

  it('finds attachments by file name', () => {
    expect(resolveLink('salt-and-graphite.svg', files)?.kind).toBe('image');
  });

  it('prefers the linking note’s folder, then the shortest path', () => {
    expect(resolveLink('Plan', files, 'Projects/Deep/Index.md')?.path).toBe('Projects/Deep/Plan.md');
    expect(resolveLink('Plan', files, 'Rating/x.md')?.path).toBe('Inbox/Plan.md');
  });

  it('follows links that spell out a path', () => {
    expect(resolveLink('Projects/Plan', files)?.path).toBe('Projects/Plan.md');
  });

  it('prefers an explicit vault path to a same-folder suffix match', () => {
    const paths = [note('Notes/New.md'), note('Archive/Notes/New.md')];
    expect(resolveLink('Notes/New', paths, 'Archive/Notes/Index.md')?.path).toBe('Notes/New.md');
  });

  it('matches names whatever their Unicode normalization', () => {
    const decomposed = [note('Notes/Йога.md'.normalize('NFD'))];
    expect(resolveLink('Йога'.normalize('NFC'), decomposed)).toBeDefined();
  });

  it('returns nothing for a note that does not exist', () => {
    expect(resolveLink('31.07.2026', files)).toBeUndefined();
  });
});

describe('noteTitle', () => {
  it('is the file name without .md', () => {
    expect(noteTitle('Calendar/2026/weeks/2026-W33 - 10.08.26.md')).toBe('2026-W33 - 10.08.26');
  });
});
