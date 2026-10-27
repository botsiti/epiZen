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
import { findOverview, kindSpec, mediaNoteText } from '../src/lib/library';
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
  it('has 60 daily notes named DD.MM.YYYY with the six tracked numbers', () => {
    const days = notesIn('Calendar/2026/days 2026');
    expect(days).toHaveLength(60);
    for (const day of days) {
      expect(noteTitle(day.path)).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
      const { properties, error } = parseNote(read(day.path));
      expect(error).toBeUndefined();
      expect(properties.tags).toEqual(['Daily']);
      expect(properties.done).toBeGreaterThanOrEqual(0);
      expect(properties.done).toBeLessThanOrEqual(100);
      for (const key of ['sleep', 'focus', 'energy', 'mood', 'soc']) expect(typeof properties[key]).toBe('number');
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

  it('logs each task\'s time under it as "    - HH:MM–HH:MM" stretches that add up to its minutes', () => {
    for (const day of notesIn('Calendar/2026/days 2026')) {
      const lines = read(day.path).split('\n');
      lines.forEach((line, i) => {
        const minutes = /\[minutes::(\d+)\]$/.exec(line)?.[1];
        if (!line.includes('#daily/') || minutes === undefined) return;
        let logged = 0;
        for (let next = i + 1; /^ {4}- /.test(lines[next] ?? ''); next += 1) {
          const [, h1, m1, h2, m2] = /^ {4}- (\d{2}):(\d{2})–(\d{2}):(\d{2})$/.exec(lines[next] ?? '') ?? [];
          expect(h1).toBeDefined();
          logged += Number(h2) * 60 + Number(m2) - (Number(h1) * 60 + Number(m1));
        }
        expect(logged).toBe(Number(minutes));
      });
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

  it('has books with Author, Year, Genre_book, Rating, Finshed and Started, as the vault spells them, each with a cover', () => {
    const books = notesIn('Rating/books');
    expect(books).toHaveLength(6);
    for (const book of books) {
      const { properties, body } = parseNote(read(book.path));
      expect(Object.keys(properties)).toEqual(['Author', 'Year', 'Genre_book', 'Rating', 'Finshed', 'Started']);
      expect(properties.Genre_book).toEqual(expect.arrayContaining([expect.any(String)]));
      expect(properties.Finshed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(String(properties.Started) < String(properties.Finshed)).toBe(true);
      expect(body.startsWith('[[00. Books]]\n\n![[')).toBe(true);
      const cover = findWikilinks(body).find((link) => link.embed);
      expect(resolveLink(cover?.target ?? '', files, book.path)?.path).toMatch(/^Rating\/books\/_attachments\/.+\.svg$/);
    }
  });

  it('has podcasts with Author, Rating, Genre and Listened, each with a cover', () => {
    const podcasts = notesIn('Rating/podcasts');
    expect(podcasts).toHaveLength(4);
    for (const podcast of podcasts) {
      const { properties, body } = parseNote(read(podcast.path));
      expect(Object.keys(properties)).toEqual(['Author', 'Rating', 'Genre', 'Listened']);
      expect(body.startsWith('[[00. Podcast 2026]]\n\n![[')).toBe(true);
    }
  });

  it("writes a new album, film, book and podcast exactly as the demo's own are written", () => {
    // The demo's notes end in a line of free text after the cover; a new note stops at the cover.
    const cases = [
      ['album', 'Rating/music/Copper Wire Sermons.md', { maker: 'Ostrava Signal', year: '2016', genres: ['post-rock'], rating: '71', date: '2026-08-07' }],
      ['film', 'Rating/kino/Static Bloom.md', { maker: '', year: '2024', genres: ['sci-fi'], rating: '68', date: '2026-09-21' }],
      ['book', 'Rating/books/Thinking in Seasons.md', { maker: 'Ada Morrow', year: '2023', genres: ['philosophy', 'self improvement'], rating: '81', date: '2026-09-19', started: '2026-08-26' }],
      ['podcast', 'Rating/podcasts/Why Dogs Dream.md', { maker: 'Field Notes Weekly', year: '', genres: ['science', 'animals'], rating: '85', date: '2026-08-21' }],
    ] as const;
    for (const [kind, path, values] of cases) {
      const spec = kindSpec(kind);
      const text = read(path);
      const cover = findWikilinks(text).find((link) => link.embed)?.target ?? '';
      const written = mediaNoteText(
        spec,
        { title: noteTitle(path), started: '', ...values, genres: [...values.genres] },
        { overview: findOverview(spec, files, 2026), cover: `${spec.folder}/_attachments/${cover}` },
      );
      // Films in the demo predate the Director key and write `genre` and `rating` in lower case.
      const expected = kind === 'film' ? text.replace('---\nYear', '---\nDirector:\nYear').replace('genre:', 'Genre:').replace('rating:', 'Rating:') : text;
      expect(expected.startsWith(written), `${path}:\n${written}`).toBe(true);
      expect(expected.slice(written.length)).toMatch(/^\n\S[^\n]*\n$/);
    }
  });

  it('has a template for each kind of periodic note', () => {
    expect(notesIn('Templates').map((file) => noteTitle(file.path)).sort()).toEqual(['Daily', 'Monthly', 'Weekly']);
    expect(read('Templates/Daily.md')).toContain('[[{{date-1d:DD.MM.YYYY}}|← Yesterday]]');
  });

  it('links resolve, except the days and weeks just outside the 60 days', () => {
    const broken = new Set<string>();
    // Templates link to dates that only exist once the template is filled in.
    for (const note of files.filter((file) => file.kind === 'note' && !file.path.startsWith('Templates/'))) {
      for (const link of findWikilinks(read(note.path))) {
        if (!resolveLink(link.target, files, note.path)) broken.add(link.target);
      }
    }
    expect([...broken].sort()).toEqual(['2026-W30 - 20.07.26', '2026-W41 - 05.10.26', '30.09.2026', '31.07.2026']);
  });
});
