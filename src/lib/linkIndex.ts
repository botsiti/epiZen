import type { NoteText, VaultFile } from './api';
import { findWikilinks, linkResolver } from './links';

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

/** Every [[link]] and ![[embed]] between notes. Links to images and to missing notes are left out. */
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
    for (const link of findWikilinks(source)) {
      while (link.index > lineEnd && line < lines.length - 1) {
        line += 1;
        lineEnd += 1 + (lines[line] ?? '').length;
      }
      const file = resolve(link.target, path);
      if (file?.kind !== 'note' || file.path === path || targets.has(file.path)) continue;
      targets.add(file.path);
      const context = (originalLines[line] ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
      backlinks.set(file.path, [...(backlinks.get(file.path) ?? []), { from: path, context }]);
    }
    outgoing.set(path, [...targets]);
  }
  return { outgoing, backlinks };
}
