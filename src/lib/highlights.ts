import type { PhrasingContent, Root, Text } from 'mdast';
import type {} from 'mdast-util-to-hast';
import { visit } from 'unist-util-visit';

// Only the colour-bearing tags used by Obsidian are interpreted. Other HTML remains text.
const color = '#(?:[\\da-f]{3}|[\\da-f]{4}|[\\da-f]{6}|[\\da-f]{8})';
const markOpen = new RegExp(`^<mark\\s+style\\s*=\\s*(["'])\\s*background(?:-color)?\\s*:\\s*(${color})\\s*;?\\s*\\1\\s*>$`, 'i');
const fontOpen = new RegExp(`^<font\\s+color\\s*=\\s*(["'])(${color})\\1\\s*>$`, 'i');
type Kind = 'mark' | 'font' | 'equals';
type Token = { node: PhrasingContent; open?: Kind; close?: Kind; color?: string };

function tokens(node: PhrasingContent, source: string): Token[] {
  if (node.type === 'html') {
    const mark = markOpen.exec(node.value);
    const font = fontOpen.exec(node.value);
    if (mark || /^<mark\s*>$/i.test(node.value)) return [{ node, open: 'mark', color: mark?.[2] }];
    if (font) return [{ node, open: 'font', color: font[2] }];
    if (/^<\/mark\s*>$/i.test(node.value)) return [{ node, close: 'mark' }];
    if (/^<\/font\s*>$/i.test(node.value)) return [{ node, close: 'font' }];
  }
  if (node.type !== 'text' || !node.value.includes('==')) return [{ node }];
  // An escaped equals sign is literal. Conservatively leave this text node alone.
  const raw = source.slice(node.position?.start.offset, node.position?.end.offset);
  if (/\\=/.test(raw)) return [{ node }];
  const parts = node.value.split('==');
  return parts.flatMap((part, index) => [
    ...(index ? [{ node: { type: 'text', value: '==' } as Text, open: 'equals' as const, close: 'equals' as const }] : []),
    ...(part ? [{ node: { type: 'text', value: part } as Text }] : []),
  ]);
}

/** Render a small, safe subset of Obsidian's inline markup without interpreting arbitrary HTML. */
export function remarkHighlights() {
  return (tree: Root, file: { value: string | Uint8Array }) => {
    const source = String(file.value);
    visit(tree, (node) => {
      if (!('children' in node) || !Array.isArray(node.children)) return;
      // Only phrasing parents can contain the inline tags, never code blocks or whole paragraphs.
      if (!['paragraph', 'heading', 'emphasis', 'strong', 'delete', 'link'].includes(node.type)) return;
      const input = (node.children as PhrasingContent[]).flatMap((child) => tokens(child, source));
      const output: PhrasingContent[] = [];
      const stack: { kind: Kind; token: Token; children: PhrasingContent[] }[] = [];
      const current = () => stack.at(-1)?.children ?? output;
      for (const token of input) {
        if (token.close && stack.at(-1)?.kind === token.close) {
          const frame = stack.pop()!;
          const isFont = frame.kind === 'font';
          const wrapped: PhrasingContent = {
            type: 'emphasis',
            children: frame.children,
            data: { hName: isFont ? 'span' : 'mark', hProperties: { className: [isFont ? 'note-colored-text' : 'note-highlight'], ...(frame.token.color ? { dataHighlightColor: frame.token.color } : {}) } },
          };
          current().push(wrapped);
        } else if (token.open) {
          stack.push({ kind: token.open, token, children: [] });
        } else current().push(token.node);
      }
      // An unfinished opening tag is ordinary text, along with everything after it.
      while (stack.length) {
        const frame = stack.pop()!;
        current().push(frame.token.node, ...frame.children);
      }
      (node.children as PhrasingContent[]) = output;
    });
  };
}

/** Choose readable ink after compositing an Obsidian highlight over the note's dark surface. */
export function highlightInk(hex: string): string {
  let digits = hex.slice(1);
  if (digits.length <= 4) digits = [...digits].map((digit) => digit + digit).join('');
  const alpha = digits.length === 8 ? parseInt(digits.slice(6), 16) / 255 : 1;
  const surface = [23, 26, 29];
  const rgb = surface.map((base, i) => (parseInt(digits.slice(i * 2, i * 2 + 2), 16) * alpha + base * (1 - alpha)) / 255);
  const luminance = rgb.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return (0.2126 * luminance[0]! + 0.7152 * luminance[1]! + 0.0722 * luminance[2]!) > 0.18 ? '#171a1d' : '#f3f1ec';
}
