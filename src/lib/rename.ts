import { markdownLanguage } from '@codemirror/lang-markdown';
import type { NoteEdit, NoteText, VaultFile } from './api';
import { findWikilinks, noteFolder, noteTitle, resolveLink } from './links';

interface Span { from: number; to: number }
interface Replacement extends Span { text: string }
const normalized = (path: string) => path.normalize('NFC').toLowerCase();
const samePath = (a: string | undefined, b: string) => a !== undefined && normalized(a) === normalized(b);
const covered = (at: number, spans: Span[]) => spans.some(({ from, to }) => at >= from && at < to);

function relativePath(folder: string, target: string): string {
  const from = folder ? folder.split('/') : [];
  const to = target.split('/');
  while (from.length && to.length && normalized(from[0]!) === normalized(to[0]!)) { from.shift(); to.shift(); }
  return [...from.map(() => '..'), ...to].join('/');
}

function joined(folder: string, target: string): string | undefined {
  const parts = target.startsWith('/') ? [] : folder.split('/').filter(Boolean);
  for (const part of target.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!parts.length) return undefined; parts.pop(); }
    else parts.push(part);
  }
  return parts.join('/');
}

function resolveTarget(target: string, from: string, files: VaultFile[], markdown: boolean) {
  if (!target) return undefined;
  if (markdown || /^(?:\.?\.\/|\/)/.test(target)) {
    const path = joined(noteFolder(from), target);
    const exact = path ? files.find((file) => samePath(file.path, /\.md$/i.test(path) ? path : `${path}.md`)) : undefined;
    if (exact || /^(?:\.?\.\/|\/)/.test(target)) return exact;
  }
  return resolveLink(target, files, from);
}

/** Source offsets from the existing Markdown parser; never reserialize the note. */
function linkSpans(text: string) {
  const blocked: Span[] = [];
  const wikiBlocked: Span[] = [];
  const urls: Span[] = [];
  // Frontmatter can contain linked properties; it is not Markdown code.
  const front = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)?.[0].length ?? 0;
  const body = text.slice(front);
  markdownLanguage.parser.parse(body).iterate({ enter(node) {
    const span = { from: front + node.from, to: front + node.to };
    if (['FencedCode', 'CodeBlock', 'InlineCode', 'Comment', 'CommentBlock', 'HTMLBlock'].includes(node.name)) { blocked.push(span); return false; }
    if ((node.name === 'Link' || node.name === 'Image') && node.node.getChild('URL')) wikiBlocked.push(span);
    if (node.name === 'URL') {
      urls.push(span);
      // Nested bracket labels can leave their URL directly under a paragraph in Lezer.
      const labelEnd = /\]\([ \t]*$/.exec(text.slice(0, span.from));
      if (labelEnd) {
        let depth = 0;
        for (let at = labelEnd.index; at >= front; at -= 1) {
          if (escaped(text, at)) continue;
          if (text[at] === ']') depth += 1;
          else if (text[at] === '[' && --depth === 0) { wikiBlocked.push({ from: at, to: span.from }); break; }
        }
      }
    }
  } });
  return { blocked, wikiBlocked, urls };
}

function escaped(text: string, at: number) {
  let slashes = 0;
  while (at > 0 && text[--at] === '\\') slashes += 1;
  return slashes % 2 === 1;
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
    if (found?.kind !== 'note') continue;
    const renamed = samePath(found.path, oldPath);
    const wanted = renamed ? newPath : found.path;
    if (!renamed && samePath(resolveTarget(link.target, nextFrom, after, false)?.path, wanted)) continue;
    const extension = /\.md$/i.exec(link.target)?.[0] ?? '';
    let target = renamed ? link.target.replace(/[^/]+$/, `${noteTitle(newPath)}${extension}`) : link.target;
    if (!samePath(resolveTarget(target, nextFrom, after, false)?.path, wanted)) target = wanted.replace(/\.md$/i, extension);
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
    if (found?.kind !== 'note') continue;
    const renamed = samePath(found.path, oldPath);
    const wanted = renamed ? newPath : found.path;
    if (!renamed && samePath(resolveTarget(decoded, nextFrom, after, true)?.path, wanted)) continue;
    let target = relativePath(noteFolder(nextFrom), wanted);
    if (!/\.md$/i.test(decoded)) target = target.replace(/\.md$/i, '');
    if (decoded.startsWith('/') && !decoded.startsWith('//')) target = `/${wanted}`;
    else if (decoded.startsWith('./') && !target.startsWith('../')) target = `./${target}`;
    if (!angle || /%[\da-f]{2}/i.test(path)) target = target.split('/').map((part) => encodeURIComponent(part).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');
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
