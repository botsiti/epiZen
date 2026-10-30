// @vitest-environment node
// Rules the CSS has to keep that no linter knows: here, that nothing as big as the window blurs
// what is behind it. WebKit draws a backdrop-filter larger than 4096 device pixels (a full-screen
// window on a 5K display) black, and everything inside it with it.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = fileURLToPath(new URL('../src', import.meta.url));
const sheets = readdirSync(src, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.css'))
  .map((entry) => join(entry.parentPath, entry.name));

/** Each rule's selector and body, comments taken out. Nested at-rules are read as rules too. */
function rules(css: string) {
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...plain.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({ selector: (match[1] ?? '').trim(), body: match[2] ?? '' }));
}

describe('the CSS', () => {
  it('has style sheets to check', () => {
    expect(sheets.length).toBeGreaterThan(3);
  });

  // The small things that may blur what is behind them: a badge on a cover, a chip. A new one
  // goes here on purpose, never a backdrop, an overlay or anything else that can be window-sized.
  const SMALL = ['.cover-rating', '.quest-sphere', '.quest-tier', '.quest-when', '.quest-dialog-chip', '.quest-dialog-close', '.library-badge', '.media-kind-badge', '.media-genre'];

  it('blurs behind small things only, never behind something as big as the window', () => {
    const offenders = sheets.flatMap((file) =>
      rules(readFileSync(file, 'utf8'))
        .filter(({ selector, body }) => /backdrop-filter\s*:\s*(?!none)/.test(body) && !selector.split(',').every((part) => SMALL.includes(part.trim())))
        .map(({ selector }) => `${relative(src, file)}: ${selector}`),
    );
    expect(offenders).toEqual([]);
  });
});
