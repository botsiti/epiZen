import type { NoteText, VaultFile } from './api';
import { findWikilinks, linkResolver, markdownLinkTarget } from './links';
import { linkSpans } from './linkSpans';

export interface Backlink {
  /** The note that links. */
  from: string;
  /** The line the link sits on, for context. */
  context: string;
}

export interface LinkIndex {
  /** Each note's links to other notes that exist, each once. */
  outgoing: Map<string, string[]>;
  /** The notes that link to each note, each once, with the first line that does. */
  backlinks: Map<string, Backlink[]>;
}

// Code shows as written, so a [[link]] inside it (a Dataview query, say) isn't a link.
const FENCED = /^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm;
const INLINE = /`[^`\n]+`/g;
const blank = (match: string) => match.replace(/[^\n]/g, ' ');

/** A line as it reads: links by their label, without Markdown's marks. */
export function plainLine(line: string): string {
  return line
    .replace(/!?\[\[([^[\]|#]*)(?:#[^[\]|]*)?(?:\|([^[\]]*))?\]\]/g, (_, target: string, alias?: string) => (alias ?? target).trim())
    .replace(/!?\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*(?:>\s*)*(?:#{1,6}\s+|[-*+]\s+(?:\[.\]\s+)?|\d+[.)]\s+)?/, '')
    .replace(/(\*\*|__|~~|==)(.+?)\1/g, '$2')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Wikilinks and Markdown links between notes. Links to images and missing files are left out. */
export function buildLinkIndex(notes: NoteText[], files: VaultFile[]): LinkIndex {
  const resolve = linkResolver(files);
  const outgoing = new Map<string, string[]>();
  const backlinks = new Map<string, Backlink[]>();
  for (const { path, text } of notes) {
    const source = text.replace(FENCED, blank).replace(INLINE, blank);
    const lines = source.split('\n');
    const originalLines = text.split('\n');
    const targets = new Set<string>();
    // The line each link is on, found by walking line ends alongside the links.
    let line = 0;
    let lineEnd = (lines[0] ?? '').length;
    const links = findWikilinks(source);
    if (/\][ \t]*[:(]/.test(text)) {
      for (const { from, to } of linkSpans(text).urls) {
        const raw = text.slice(from, to);
        const target = markdownLinkTarget(raw.startsWith('<') && raw.endsWith('>') ? raw.slice(1, -1) : raw, path);
        if (target) links.push({ index: from, length: to - from, target, embed: false });
      }
      links.sort((a, b) => a.index - b.index);
    }
    for (const link of links) {
      while (link.index > lineEnd && line < lines.length - 1) {
        line += 1;
        lineEnd += 1 + (lines[line] ?? '').length;
      }
      const file = resolve(link.target, path);
      if (file?.kind !== 'note' || file.path === path || targets.has(file.path)) continue;
      targets.add(file.path);
      const context = plainLine(originalLines[line] ?? '').slice(0, 160);
      const incoming = backlinks.get(file.path);
      if (incoming) incoming.push({ from: path, context }); else backlinks.set(file.path, [{ from: path, context }]);
    }
    outgoing.set(path, [...targets]);
  }
  return { outgoing, backlinks };
}
