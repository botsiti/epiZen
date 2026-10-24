import type { VaultFile } from './api';

export interface Wikilink {
  /** Note name or path, without `#heading` or `|alias`. */
  target: string;
  heading?: string;
  alias?: string;
  /** `![[...]]`: show the file in place instead of linking to it. */
  embed: boolean;
}

export interface WikilinkMatch extends Wikilink {
  index: number;
  length: number;
}

// [[target]], [[target#heading]], [[target|alias]], and the same with a leading `!` for embeds.
const WIKILINK = /(!?)\[\[([^[\]|#\n]*)(?:#([^[\]|\n]*))?(?:\|([^[\]\n]*))?\]\]/g;

export function findWikilinks(text: string): WikilinkMatch[] {
  return Array.from(text.matchAll(WIKILINK), (match) => ({
    target: (match[2] ?? '').trim(),
    heading: match[3]?.trim() || undefined,
    alias: match[4]?.trim() || undefined,
    embed: match[1] === '!',
    index: match.index,
    length: match[0].length,
  }));
}

const KNOWN_EXTENSION = /\.(md|svg|png|jpe?g|gif|webp)$/i;

const normalize = (path: string) => path.normalize('NFC').toLowerCase();
const folderOf = (path: string) => path.slice(0, path.lastIndexOf('/') + 1);
const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/**
 * Finds the file a wikilink points at, the way Obsidian does: by file name anywhere in
 * the vault (or by path when the link has a `/`), case-insensitive, `.md` implied.
 * When several files match, the one in the linking note's folder wins, then the shortest path.
 */
export function resolveLink(target: string, files: VaultFile[], fromPath?: string): VaultFile | undefined {
  if (!target) return files.find((file) => file.path === fromPath);

  const wanted = normalize(KNOWN_EXTENSION.test(target) ? target : `${target}.md`);
  const byPath = wanted.includes('/');
  const matches = files.filter((file) => {
    const path = normalize(file.path);
    return byPath ? path === wanted || path.endsWith(`/${wanted}`) : baseName(path) === wanted;
  });
  if (matches.length <= 1) return matches[0];

  const home = fromPath === undefined ? undefined : normalize(folderOf(fromPath));
  return matches.toSorted((a, b) => {
    const aHome = normalize(folderOf(a.path)) === home ? 0 : 1;
    const bHome = normalize(folderOf(b.path)) === home ? 0 : 1;
    return aHome - bHome || a.path.length - b.path.length || a.path.localeCompare(b.path);
  })[0];
}

/** A note's title is its file name without `.md`, as in Obsidian. */
export function noteTitle(path: string): string {
  return baseName(path).replace(/\.md$/i, '');
}

export function noteFolder(path: string): string {
  return folderOf(path).replace(/\/$/, '');
}
