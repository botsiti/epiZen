import type { Blockquote, Image, Link, Paragraph, PhrasingContent, Root, Text } from 'mdast';
// Brings in the `data.hName` / `data.hProperties` fields that remark-rehype reads.
import type {} from 'mdast-util-to-hast';
import { defaultUrlTransform } from 'react-markdown';
import { SKIP, visit } from 'unist-util-visit';
import { findWikilinks, type WikilinkMatch } from './links';

const LINK = 'wikilink:';
const EMBED = 'embed:';

export type VaultUrl = { kind: 'link' | 'embed'; target: string };

/**
 * Reads back the URLs that `remarkWikilinks` puts on link and image nodes. A note can also
 * spell one out by hand (`[x](wikilink:%E0)`); one that doesn't decode is not ours.
 */
export function parseVaultUrl(url: string | undefined): VaultUrl | undefined {
  const kind = url?.startsWith(LINK) ? 'link' : url?.startsWith(EMBED) ? 'embed' : undefined;
  if (!url || !kind) return undefined;
  try {
    return { kind, target: decodeURIComponent(url.slice(kind === 'link' ? LINK.length : EMBED.length)) };
  } catch {
    return undefined;
  }
}

/** react-markdown strips unknown URL schemes. Keep ours and sanitize the rest as usual. */
export function urlTransform(url: string): string {
  return parseVaultUrl(url) ? url : defaultUrlTransform(url);
}

/** Turns `[[links]]` and `![[embeds]]` in text into link and image nodes. Code stays as written. */
export function remarkWikilinks() {
  return (tree: Root) => {
    visit(tree, 'text', (node: Text, index, parent) => {
      if (!parent || index === undefined || parent.type === 'link') return;
      const links = findWikilinks(node.value);
      if (!links.length) return;

      const parts: PhrasingContent[] = [];
      let last = 0;
      for (const link of links) {
        if (link.index > last) parts.push({ type: 'text', value: node.value.slice(last, link.index) });
        parts.push(link.embed ? embedNode(link) : linkNode(link));
        last = link.index + link.length;
      }
      if (last < node.value.length) parts.push({ type: 'text', value: node.value.slice(last) });

      (parent.children as PhrasingContent[]).splice(index, 1, ...parts);
      return [SKIP, index + parts.length];
    });
  };
}

function linkNode(link: WikilinkMatch): Link {
  const label = link.alias ?? (link.heading ? [link.target, link.heading].filter(Boolean).join(' › ') : link.target);
  return { type: 'link', url: LINK + encodeURIComponent(link.target), children: [{ type: 'text', value: label }] };
}

function embedNode(link: WikilinkMatch): Image {
  // Obsidian sizes embeds with `![[cover.svg|240]]` or `|240x240`.
  const width = /^(\d+)(?:x\d+)?$/.exec(link.alias ?? '')?.[1];
  return {
    type: 'image',
    url: EMBED + encodeURIComponent(link.target),
    alt: link.target,
    data: width ? { hProperties: { width: Number(width) } } : undefined,
  };
}

const CALLOUT = /^\[!([\w-]+)\]([+-]?)[ \t]*/;

/** Obsidian callouts: a blockquote whose first line is `[!type] Title`. */
export function remarkCallouts() {
  return (tree: Root) => {
    visit(tree, 'blockquote', (node: Blockquote) => {
      const first = node.children[0];
      if (first?.type !== 'paragraph') return;
      const head = first.children[0];
      if (head?.type !== 'text') return;
      const match = CALLOUT.exec(head.value);
      if (!match) return;

      const type = (match[1] ?? 'note').toLowerCase();
      head.value = head.value.slice(match[0].length);
      const { title, rest } = splitFirstLine(first.children);
      const titleNode: Paragraph = {
        type: 'paragraph',
        children: hasText(title) ? title : [{ type: 'text', value: type[0]?.toUpperCase() + type.slice(1) }],
        data: { hName: 'div', hProperties: { className: ['callout-title'] } },
      };
      const restNodes: Paragraph[] = hasText(rest) ? [{ type: 'paragraph', children: rest }] : [];
      node.children.splice(0, 1, titleNode, ...restNodes);
      node.data = { hName: 'div', hProperties: { className: ['callout'], dataCallout: type } };
    });
  };
}

function splitFirstLine(children: PhrasingContent[]): { title: PhrasingContent[]; rest: PhrasingContent[] } {
  const title: PhrasingContent[] = [];
  for (const [i, child] of children.entries()) {
    if (child.type === 'break') return { title, rest: children.slice(i + 1) };
    if (child.type === 'text' && child.value.includes('\n')) {
      const at = child.value.indexOf('\n');
      title.push({ type: 'text', value: child.value.slice(0, at) });
      return { title, rest: [{ type: 'text', value: child.value.slice(at + 1) }, ...children.slice(i + 1)] };
    }
    title.push(child);
  }
  return { title, rest: [] };
}

const hasText = (nodes: PhrasingContent[]) => nodes.some((node) => node.type !== 'text' || node.value.trim());
