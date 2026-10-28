// @vitest-environment node
// Finding a cover writes two things: a new image in the kind's _attachments, and the note's embed
// (with the maker, year and genres it leaves empty). Run here on every album, film, book and
// podcast of a copy of the demo vault: each save changes that one note and adds that one image,
// and every other file in the vault stays byte for byte the same.
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { VaultFile } from '../src/lib/api';
import { addCover, coverFills, replaceCover } from '../src/lib/coverEdits';
import { parseNote } from '../src/lib/frontmatter';
import { coverEmbed, coverPath, kindOfPath, readEntry } from '../src/lib/library';
import { linkResolver } from '../src/lib/links';

const original = fileURLToPath(new URL('../demo-vault', import.meta.url));
// A real cover's bytes, as the backend would save them.
const IMAGE = readFileSync(fileURLToPath(new URL('fixtures/lookup/cover-1.png', import.meta.url)));
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

/** What changed between two snapshots: the files whose bytes differ, and those added. */
function changes(before: Map<string, Buffer>, after: Map<string, Buffer>) {
  expect([...before.keys()].filter((key) => !after.has(key)), 'nothing removed').toEqual([]);
  return {
    changed: [...after].filter(([key, bytes]) => before.has(key) && !bytes.equals(before.get(key) ?? Buffer.alloc(0))).map(([key]) => key),
    added: [...after.keys()].filter((key) => !before.has(key)),
  };
}

const vaultFiles = (root: string): VaultFile[] =>
  [...snapshot(root).keys()].flatMap((path): VaultFile[] => (/\.md$/i.test(path) ? [{ path, kind: 'note' }] : /\.(svg|png|jpe?g|gif|webp)$/i.test(path) ? [{ path, kind: 'image' }] : []));

/** Every rated note of the library's kinds in the demo vault. */
const library = () =>
  vaultFiles(original).filter((file) => {
    const spec = kindOfPath(file.path);
    return spec?.source && readEntry(file.path, readFileSync(join(original, file.path), 'utf8'), linkResolver(vaultFiles(original)));
  });

/** As the app saves a found cover: the image as a new file (never over one), then the note, changed from the text it read. */
function save(path: string, edit: (text: string, image: string) => string) {
  const spec = kindOfPath(path);
  if (!spec) throw new Error(`${path} isn't a library note`);
  const files = vaultFiles(copy);
  const text = readFileSync(join(copy, path), 'utf8');
  const image = coverPath(spec, readEntry(path, text, linkResolver(files))?.title ?? '', files);
  writeFileSync(join(copy, image), IMAGE, { flag: 'wx' });
  writeFileSync(join(copy, path), edit(text, image));
  return image;
}

beforeEach(() => {
  copy = join(mkdtempSync(join(tmpdir(), 'epizen-covers-')), 'demo-vault');
  cpSync(original, copy, { recursive: true });
});

afterEach(() => rmSync(join(copy, '..'), { recursive: true, force: true }));

describe('saving a found cover on a copy of the demo vault', () => {
  it('has albums, films, books and podcasts to run on', () => {
    const kinds = library().map((file) => kindOfPath(file.path)?.kind);
    for (const kind of ['album', 'film', 'book', 'podcast']) expect(kinds.filter((found) => found === kind).length).toBeGreaterThanOrEqual(4);
  });

  it("adds a cover to a note without one: that note and the new image change, nothing else", () => {
    for (const { path } of library()) {
      const spec = kindOfPath(path)!;
      const demo = readFileSync(join(original, path), 'utf8');
      const cover = coverEmbed(parseNote(demo).body, path, linkResolver(vaultFiles(original)));
      expect(cover, path).toBeDefined();
      // The note as the vault's real ones are: no cover. Its embed's paragraph taken out.
      const embed = demo.slice(demo.length - parseNote(demo).body.length + (cover?.link.index ?? 0)).split('\n')[0] ?? '';
      const bare = demo.replace(`\n\n${embed}\n`, '\n');
      expect(bare, path).not.toBe(demo);
      writeFileSync(join(copy, path), bare);

      const before = snapshot(copy);
      const image = save(path, (text, saved) => addCover(text, { spec, path, resolve: linkResolver(vaultFiles(copy)) }, saved));
      expect(changes(before, snapshot(copy)), path).toEqual({ changed: [path], added: [image] });
      // The embed comes back where the note had it, under the new image's name; every other byte is as it was.
      const name = image.slice(image.lastIndexOf('/') + 1);
      expect(readFileSync(join(copy, path), 'utf8'), path).toBe(demo.replace(/!\[\[[^|\]]+\|/, `![[${name}|`));
      expect(image).toMatch(new RegExp(`^Rating/${spec.folder}/_attachments/[^/]+-2\\.jpg$`));
      rmSync(join(copy, image));
      cpSync(join(original, path), join(copy, path));
    }
  });

  it('fills a director the note leaves out, above its year, and changes no value it has', () => {
    const path = 'Rating/kino/Static Bloom.md';
    const spec = kindOfPath(path)!;
    const demo = readFileSync(join(original, path), 'utf8');
    writeFileSync(join(copy, path), demo.replace('\n![[static-bloom.svg|200]]\n', ''));
    const before = snapshot(copy);
    const image = save(path, (text, saved) => addCover(text, { spec, path, resolve: linkResolver(vaultFiles(copy)) }, saved, coverFills(spec, parseNote(text).properties, { maker: 'Ines Taveira', year: '1999', genres: ['drama'] })));
    expect(changes(before, snapshot(copy))).toEqual({ changed: [path], added: [image] });
    expect(readFileSync(join(copy, path), 'utf8')).toBe(demo.replace('---\nYear: 2024', '---\nDirector: Ines Taveira\nYear: 2024').replace('static-bloom.svg', 'static-bloom-2.jpg'));
  });

  it('changes a cover: only the embed’s target in that note, the new image beside the old one', () => {
    for (const { path } of library()) {
      const before = snapshot(copy);
      const image = save(path, (text, saved) => replaceCover(text, path, linkResolver(vaultFiles(copy)), saved));
      const { changed, added } = changes(before, snapshot(copy));
      expect(changed, path).toEqual([path]);
      expect(added, path).toEqual([image]);
      const old = (before.get(path) ?? Buffer.alloc(0)).toString('utf8').split('\n');
      const now = readFileSync(join(copy, path), 'utf8').split('\n');
      expect(now).toHaveLength(old.length);
      const differ = now.flatMap((line, i) => (line === old[i] ? [] : [[old[i], line]]));
      expect(differ, path).toHaveLength(1);
      expect(differ[0]?.[1]).toBe(differ[0]?.[0]?.replace(/!\[\[[^|\]]+/, `![[${image.slice(image.lastIndexOf('/') + 1)}`));
      rmSync(join(copy, image));
      cpSync(join(original, path), join(copy, path));
    }
  });
});
