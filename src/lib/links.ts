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

const KNOWN_EXTENSION = /\.(md|base|svg|png|jpe?g|gif|webp)$/i;

const normalize = (path: string) => path.normalize('NFC').toLowerCase();
const folderOf = (path: string) => path.slice(0, path.lastIndexOf('/') + 1);
const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** Resolve an explicit vault-root or note-relative path without escaping the vault. */
export function vaultLinkPath(target: string, fromPath: string): string | undefined {
  const parts = target.startsWith('/') ? [] : noteFolder(fromPath).split('/').filter(Boolean);
  for (const part of target.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) return undefined;
      parts.pop();
    } else parts.push(part);
  }
  return parts.join('/');
}

export function relativeLinkPath(fromPath: string, target: string): string {
  const from = noteFolder(fromPath).split('/').filter(Boolean);
  const to = target.split('/');
  while (from[0] && to[0] && normalize(from[0]) === normalize(to[0])) {
    from.shift();
    to.shift();
  }
  return [...from.map(() => '..'), ...to].join('/');
}

export const encodeLinkPath = (path: string) => path.split('/').map((part) =>
  encodeURIComponent(part).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
).join('/');

const explicit = /^(?:\.{1,2}\/|\/)/;
const withExtension = (target: string, exact: boolean) => normalize(KNOWN_EXTENSION.test(target) || exact ? target : `${target}.md`);

/**
 * Finds the file a wikilink points at, the way Obsidian does: by file name anywhere in
 * the vault (or by path when the link has a `/`), case-insensitive, `.md` implied.
 * When several files match, the one in the linking note's folder wins, then the shortest path.
 */
export function resolveLink(target: string, files: VaultFile[], fromPath?: string): VaultFile | undefined {
  if (!target) return files.find((file) => file.path === fromPath);
  if (explicit.test(target)) {
    const path = vaultLinkPath(target, fromPath ?? '');
    if (!path) return undefined;
    return files.find((file) => normalize(file.path) === normalize(path))
      ?? files.find((file) => normalize(file.path) === withExtension(path, false));
  }

  const exactFile = files.some((file) => normalize(file.path) === normalize(target) || normalize(baseName(file.path)) === normalize(target));
  const wanted = normalize(KNOWN_EXTENSION.test(target) || exactFile ? target : `${target}.md`);
  const byPath = wanted.includes('/');
  const matches = files.filter((file) => {
    const path = normalize(file.path);
    return byPath ? path === wanted || path.endsWith(`/${wanted}`) : baseName(path) === wanted;
  });
  // An explicit vault path wins over an identically named suffix elsewhere.
  if (byPath) { const exact = matches.find((file) => normalize(file.path) === wanted); if (exact) return exact; }
  if (matches.length <= 1) return matches[0];

  const home = fromPath === undefined ? undefined : normalize(folderOf(fromPath));
  return matches.toSorted((a, b) => {
    const aHome = normalize(folderOf(a.path)) === home ? 0 : 1;
    const bHome = normalize(folderOf(b.path)) === home ? 0 : 1;
    return aHome - bHome || a.path.length - b.path.length || a.path.localeCompare(b.path);
  })[0];
}

/**
 * `resolveLink` for many links at once: the same rules, with notes looked up by name instead
 * of scanning every file per link. For backlinks and the graph.
 */
export function linkResolver(files: VaultFile[]): (target: string, fromPath: string) => VaultFile | undefined {
  const byName = new Map<string, VaultFile[]>(), bySuffix = new Map<string, VaultFile[]>();
  const byPath = new Map<string, VaultFile>(), original = new Map<string, VaultFile>();
  const add = (index: Map<string, VaultFile[]>, key: string, file: VaultFile) => {
    const entries = index.get(key);
    if (entries) entries.push(file); else index.set(key, [file]);
  };
  for (const file of files) {
    const path = normalize(file.path);
    if (!byPath.has(path)) byPath.set(path, file);
    if (!original.has(file.path)) original.set(file.path, file);
    add(byName, baseName(path), file);
    // Index folder suffixes too: [[2026/Plan]] should not scan the entire vault.
    let suffix = path;
    while (suffix.includes('/')) { add(bySuffix, suffix, file); suffix = suffix.slice(suffix.indexOf('/') + 1); }
  }
  return (target, fromPath) => {
    if (!target) return original.get(fromPath);
    if (explicit.test(target)) {
      const path = vaultLinkPath(target, fromPath);
      return path ? byPath.get(normalize(path)) ?? byPath.get(withExtension(path, false)) : undefined;
    }
    const normalized = normalize(target);
    const wanted = KNOWN_EXTENSION.test(target) || byPath.has(normalized) || byName.has(normalized) ? normalized : `${normalized}.md`;
    if (wanted.includes('/') && byPath.has(wanted)) return byPath.get(wanted);
    const candidates = (wanted.includes('/') ? bySuffix : byName).get(wanted) ?? [];
    if (candidates.length <= 1) return candidates[0];
    const home = normalize(folderOf(fromPath));
    // Pick without sorting or altering the shared candidates.
    return candidates.reduce((best, candidate) => {
      const order = Number(normalize(folderOf(candidate.path)) !== home) - Number(normalize(folderOf(best.path)) !== home)
        || candidate.path.length - best.path.length || candidate.path.localeCompare(best.path);
      return order < 0 ? candidate : best;
    });
  };
}

/** A regular Markdown URL is relative to the note with a leading slash for the vault root. */
export function markdownLinkTarget(href: string | undefined, fromPath: string): string | undefined {
  if (!href || /^(?:[a-z][a-z\d+.-]*:|\/\/|#|\?)/i.test(href)) return undefined;
  const raw = href.split(/[?#]/, 1)[0] ?? '';
  try {
    const path = vaultLinkPath(decodeURIComponent(raw), fromPath);
    return path ? `/${path}` : undefined;
  } catch {
    return undefined;
  }
}

/** A note's title is its file name without `.md`, as in Obsidian. */
export function noteTitle(path: string): string {
  return baseName(path).replace(/\.(md|base)$/i, '');
}

export function noteFolder(path: string): string {
  return folderOf(path).replace(/\/$/, '');
}
