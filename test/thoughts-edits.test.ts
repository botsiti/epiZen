// @vitest-environment node
// The media page's writing, run on a copy of the demo vault: every album, film, book and podcast
// note has its text rewritten, cleared and written anew. Each write changes only that note's
// text, never its properties, its overview link or its cover, and nothing else in the vault.
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KINDS, LIBRARY_ROOT, kindOfPath } from '../src/lib/library';
import { replaceThoughts, splitThoughts } from '../src/lib/thoughts';

const original = fileURLToPath(new URL('../demo-vault', import.meta.url));
let copy: string;

const snapshot = (root: string) =>
  new Map(
    readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const full = join(entry.parentPath, entry.name);
        return [relative(root, full).split(sep).join('/'), readFileSync(full)] as const;
      }),
  );

beforeEach(() => {
  copy = join(mkdtempSync(join(tmpdir(), 'epizen-thoughts-')), 'demo-vault');
  cpSync(original, copy, { recursive: true });
});

afterEach(() => rmSync(join(copy, '..'), { recursive: true, force: true }));

/** Every rated note in the demo vault's library folders. */
const mediaNotes = () =>
  KINDS.flatMap((spec) => {
    const folder = `${LIBRARY_ROOT}/${spec.folder}`;
    if (!existsSync(join(original, folder))) return [];
    return readdirSync(join(original, folder)).map((name) => `${folder}/${name}`).filter((path) => kindOfPath(path));
  });

/** Writes the change into one note of the copy, then names every file of the vault that differs from the original. */
function run(path: string, change: (text: string) => string) {
  const file = join(copy, path);
  const before = readFileSync(file, 'utf8');
  const after = change(before);
  writeFileSync(file, after);
  const was = snapshot(original);
  const now = snapshot(copy);
  expect([...now.keys()].sort()).toEqual([...was.keys()].sort());
  return { before, after, differ: [...now].filter(([key, bytes]) => !bytes.equals(was.get(key) ?? Buffer.alloc(0))).map(([key]) => key) };
}

const headOf = (text: string) => {
  const { properties, links } = splitThoughts(text);
  return properties + links;
};

describe('thoughts written on a copy of the demo vault', () => {
  it('has notes of every kind with text to run on', () => {
    const notes = mediaNotes();
    expect(new Set(notes.map((path) => kindOfPath(path)?.kind))).toEqual(new Set(['album', 'film', 'book', 'podcast', 'video']));
    expect(notes.filter((path) => splitThoughts(readFileSync(join(original, path), 'utf8')).thoughts).length).toBeGreaterThan(20);
  });

  it("rewrites each note's text and changes nothing else", () => {
    for (const path of mediaNotes()) {
      const { before, after, differ } = run(path, (text) => replaceThoughts(text, splitThoughts(text).thoughts, 'Better the second time.\nThe [[Static Orchard]] of films.\n'));
      expect(differ, path).toEqual(splitThoughts(before).thoughts === 'Better the second time.\nThe [[Static Orchard]] of films.\n' ? [] : [path]);
      expect(headOf(after), path).toBe(headOf(before));
      expect(after.endsWith('Better the second time.\nThe [[Static Orchard]] of films.\n'), path).toBe(true);
      cpSync(join(original, path), join(copy, path));
    }
  });

  it('clears the text and then writes a first thought, keeping the link and the cover', () => {
    for (const path of mediaNotes()) {
      const cleared = run(path, (text) => replaceThoughts(text, splitThoughts(text).thoughts, ''));
      expect(splitThoughts(cleared.after).thoughts, path).toBe('');
      expect(headOf(cleared.after), path).toBe(headOf(cleared.before));
      const written = run(path, (text) => replaceThoughts(text, '', 'Weird and lovely.'));
      expect(written.differ, path).toEqual([path]);
      expect(written.after.startsWith(cleared.after), path).toBe(true);
      expect(splitThoughts(written.after).thoughts, path).toBe('Weird and lovely.');
      cpSync(join(original, path), join(copy, path));
    }
  });
});
