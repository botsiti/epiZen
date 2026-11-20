import { markdownLanguage } from '@codemirror/lang-markdown';

export interface Span { from: number; to: number }

/** Source offsets from the existing Markdown parser; never reserialize the note. */
export function linkSpans(text: string) {
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

export function escaped(text: string, at: number) {
  let slashes = 0;
  while (at > 0 && text[--at] === '\\') slashes += 1;
  return slashes % 2 === 1;
}
