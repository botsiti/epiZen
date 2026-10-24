// @vitest-environment node
// The demo vault is the fixture every other test leans on, so check it is in the
// right format. Like every test, this reads a copy and never the vault itself.
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { VaultFile } from '../src/lib/api';
import { parseNote } from '../src/lib/frontmatter';
import { findWikilinks, noteTitle, resolveLink } from '../src/lib/links';

const original = fileURLToPath(new URL('../demo-vault', import.meta.url));
let copy: string;
let files: VaultFile[];

const read = (path: string) => readFileSync(join(copy, path), 'utf8');
const notesIn = (folder: string) =>
  files.filter((file) => file.kind === 'note' && file.path.startsWith(`${folder}/`) && !noteTitle(file.path).startsWith('00.'));

beforeAll(() => {
  copy = join(mkdtempSync(join(tmpdir(), 'epizen-vitest-')), 'demo-vault');
  cpSync(original, copy, { recursive: true });
  files = readdirSync(copy, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(copy, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .filter((path) => !path.split('/').some((part) => part.startsWith('.')) && /\.(md|svg)$/.test(path))
    .map((path) => ({ path, kind: path.endsWith('.md') ? ('note' as const) : ('image' as const) }));
});

afterAll(() => rmSync(join(copy, '..'), { recursive: true, force: true }));

describe('demo vault', () => {
  it('has 60 daily notes named DD.MM.YYYY with the five tracked numbers', () => {
    const days = notesIn('Calendar/2026/days 2026');
    expect(days).toHaveLength(60);
    for (const day of days) {
      expect(noteTitle(day.path)).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
      const { properties, error } = parseNote(read(day.path));
      expect(error).toBeUndefined();
      expect(properties.tags).toEqual(['Daily']);
      expect(properties.done).toBeGreaterThanOrEqual(0);
      expect(properties.done).toBeLessThanOrEqual(100);
      for (const key of ['sleep', 'focus', 'energy', 'mood']) expect(typeof properties[key]).toBe('number');
    }
  });

  it('writes tasks as "- [ ] #daily/tag — text [minutes::N]", and `done` is the share ticked', () => {
    for (const day of notesIn('Calendar/2026/days 2026')) {
      const text = read(day.path);
      const tasks = text.split('\n').filter((line) => line.includes('#daily/'));
      expect(tasks.length).toBeGreaterThan(0);
      for (const task of tasks) expect(task).toMatch(/^- \[[ x]\] #daily\/[a-z]+ — .+ \[minutes::\d+\]$/);
      const ticked = tasks.filter((task) => task.startsWith('- [x]')).length;
      expect(parseNote(text).properties.done).toBe(Math.round((ticked / tasks.length) * 100));
    }
  });

  it('has weekly and monthly notes', () => {
    expect(notesIn('Calendar/2026/weeks').map((file) => noteTitle(file.path))).toContain('2026-W33 - 10.08.26');
    expect(notesIn('Calendar/2026/weeks')).toHaveLength(10);
    expect(notesIn('Calendar/2026/months 2026').map((file) => noteTitle(file.path))).toEqual(['08.26 RPG', '09.26 RPG']);
  });

  it('has 20 albums with Artist, Year, genre, rating and listened, each with an SVG cover', () => {
    const albums = notesIn('Rating/music');
    expect(albums).toHaveLength(20);
    for (const album of albums) {
      const { properties, body } = parseNote(read(album.path));
      expect(properties.Artist).toEqual(expect.any(String));
      expect(properties.Year).toEqual(expect.any(Number));
      expect(properties.genre).toEqual(expect.arrayContaining([expect.any(String)]));
      expect(Number(properties.rating)).toBeGreaterThan(0);
      expect(properties.listened).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const cover = findWikilinks(body).find((link) => link.embed);
      const file = resolveLink(cover?.target ?? '', files, album.path);
      expect(file?.path).toMatch(/^Rating\/music\/_attachments\/.+\.svg$/);
      expect(read(file?.path ?? '')).toMatch(/^<svg /);
    }
  });

  it('has a few films and YouTube videos', () => {
    expect(notesIn('Rating/kino').length).toBeGreaterThanOrEqual(3);
    expect(notesIn('Rating/youtube').length).toBeGreaterThanOrEqual(3);
  });

  it('links resolve, except the days and weeks just outside the 60 days', () => {
    const broken = new Set<string>();
    for (const note of files.filter((file) => file.kind === 'note')) {
      for (const link of findWikilinks(read(note.path))) {
        if (!resolveLink(link.target, files, note.path)) broken.add(link.target);
      }
    }
    expect([...broken].sort()).toEqual(['2026-W30 - 20.07.26', '2026-W41 - 05.10.26', '30.09.2026', '31.07.2026']);
  });
});
