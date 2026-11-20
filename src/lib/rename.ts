import { escaped, linkSpans, type Span } from './linkSpans';
import type { NoteEdit, NoteText, VaultFile } from './api';
import { encodeLinkPath, findWikilinks, noteTitle, relativeLinkPath, resolveLink } from './links';

interface Replacement extends Span { text: string }
const normalized = (path: string) => path.normalize('NFC').toLowerCase();
const samePath = (a: string | undefined, b: string) => a !== undefined && normalized(a) === normalized(b);
const covered = (at: number, spans: Span[]) => spans.some(({ from, to }) => at >= from && at < to);

function resolveTarget(target: string, from: string, files: VaultFile[], markdown: boolean) {
  if (!target) return undefined;
  if (markdown && !/^(?:\.{1,2}\/|\/)/.test(target)) return resolveLink(`./${target}`, files, from);
  return resolveLink(target, files, from);
}

/** Updates only link destinations. Labels, fragments, formatting, code and line endings stay intact. */
export function renameLinks(text: string, from: string, oldPath: string, newPath: string, files: VaultFile[]): string {
  const after = files.map((file) => samePath(file.path, oldPath) ? { ...file, path: newPath } : file);
  const nextFrom = samePath(from, oldPath) ? newPath : from;
  const { blocked, wikiBlocked, urls } = linkSpans(text);
  const replacements: Replacement[] = [];
  for (const link of findWikilinks(text)) {
    const bracket = link.index + (link.embed ? 1 : 0);
    if (!link.target || escaped(text, bracket) || covered(link.index, blocked) || covered(link.index, wikiBlocked)) continue;
    const found = resolveTarget(link.target, from, files, false);
    if (!found) continue;
    const renamed = samePath(found.path, oldPath);
    const wanted = renamed ? newPath : found.path;
    if (!renamed && samePath(resolveTarget(link.target, nextFrom, after, false)?.path, wanted)) continue;
    const extension = /\.md$/i.exec(link.target)?.[0] ?? '';
    let target = renamed ? link.target.replace(/[^/]+$/, `${noteTitle(newPath)}${extension}`) : link.target;
    if (!samePath(resolveTarget(target, nextFrom, after, false)?.path, wanted)) {
      const full = wanted.replace(/\.md$/i, extension);
      if (/^\.{1,2}\//.test(link.target)) {
        const relative = relativeLinkPath(nextFrom, full);
        target = relative.startsWith('../') ? relative : `./${relative}`;
      } else target = link.target.startsWith('/') || !full.includes('/') ? `/${full}` : full;
    }
    // Preserve whitespace within the brackets and every byte of the alias/fragment.
    const start = bracket + 2;
    const raw = /^[^#|\]]*/.exec(text.slice(start))?.[0] ?? '';
    const leading = raw.length - raw.trimStart().length;
    replacements.push({ from: start + leading, to: start + raw.trimEnd().length, text: target });
  }
  for (const span of urls) {
    if (covered(span.from, blocked)) continue;
    const raw = text.slice(span.from, span.to);
    const angle = raw.startsWith('<') && raw.endsWith('>');
    const url = angle ? raw.slice(1, -1) : raw;
    if (!url || /^[a-z][a-z\d+.-]*:|^\/\/|^#/i.test(url)) continue;
    const split = url.search(/[?#]/);
    const path = split < 0 ? url : url.slice(0, split);
    const fragment = split < 0 ? '' : url.slice(split);
    let decoded: string;
    try { decoded = decodeURIComponent(path.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, '$1').replace(/&amp;/g, '&')); }
    catch { continue; }
    const found = resolveTarget(decoded, from, files, true);
    if (!found) continue;
    const renamed = samePath(found.path, oldPath);
    const wanted = renamed ? newPath : found.path;
    if (!renamed && samePath(resolveTarget(decoded, nextFrom, after, true)?.path, wanted)) continue;
    let target = decoded.startsWith('/') ? `/${wanted}` : relativeLinkPath(nextFrom, wanted);
    if (!/\.md$/i.test(decoded)) target = target.replace(/\.md$/i, '');
    else if (decoded.startsWith('./') && !target.startsWith('../')) target = `./${target}`;
    if (!angle || /%[\da-f]{2}/i.test(path)) target = encodeLinkPath(target);
    replacements.push({ ...span, text: `${angle ? '<' : ''}${target}${fragment}${angle ? '>' : ''}` });
  }
  return replacements.sort((a, b) => b.from - a.from).reduce((value, change) => value.slice(0, change.from) + change.text + value.slice(change.to), text);
}

/** A fresh vault snapshot becomes conditional, minimal edits for the native rename operation. */
export function renameLinkEdits(notes: NoteText[], files: VaultFile[], from: string, to: string): NoteEdit[] {
  return notes.flatMap(({ path, text: expected }) => {
    const text = renameLinks(expected, path, from, to, files);
    return text === expected ? [] : [{ path, expected, text }];
  });
}
