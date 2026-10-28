// @vitest-environment node
// The run behind "Find covers": paced per service, busy services asked again, each note searched
// once, and saving that writes a note only while it holds what it held when it was searched.
// The network and the disk are fakes here, answering from recordings (test/fixtures/covers/).
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { VaultFile } from './api';
import { CoverRun, pacedAsk, pacer, saveFound, type Clock, type RunIO, type SaveIO } from './coverRun';
import { findCover } from './covers';
import type { MediaEntry } from './library';

const read = (path: string): unknown => JSON.parse(readFileSync(new URL(`../../test/fixtures/${path}`, import.meta.url), 'utf8'));
const ANTICS_SEARCH = 'https://musicbrainz.org/ws/2/release-group?query=releasegroup%3A(antics)%20AND%20artist%3A(interpol)&fmt=json&limit=10';

/** A clock that moves only when something sleeps, and remembers how long each sleep was. */
function fakeClock(): Clock & { slept: number[] } {
  let now = 1_000_000;
  const slept: number[] = [];
  return {
    slept,
    now: () => now,
    sleep: (ms) => {
      slept.push(ms);
      now += ms;
      return Promise.resolve();
    },
  };
}

describe('pacing', () => {
  it('keeps the requests to one service apart', async () => {
    // Three asked at one instant: the second waits a second, the third two.
    const slept: number[] = [];
    const turn = pacer(1000, { now: () => 5000, sleep: (ms) => Promise.resolve(void slept.push(ms)) });
    await Promise.all([turn(), turn(), turn()]);
    expect(slept).toEqual([1000, 2000]);
  });

  it('waits its turn per service, asks a busy one again, and asks each URL once', async () => {
    const clock = fakeClock();
    let busy = 2;
    const ask = vi.fn((url: string) => {
      if (url.includes('musicbrainz') && busy-- > 0) return Promise.reject(new Error('the service is busy; try again in a moment'));
      if (url.includes('broken')) return Promise.reject(new Error('not found'));
      return Promise.resolve({ url });
    });
    const paced = pacedAsk(ask, new Map(), clock);
    await expect(paced('https://musicbrainz.org/ws/2/release-group?query=a')).resolves.toEqual({ url: 'https://musicbrainz.org/ws/2/release-group?query=a' });
    // Two answers of "busy", each followed by a pause and a turn a second and a fifth apart.
    expect(ask).toHaveBeenCalledTimes(3);
    expect(clock.slept).toEqual([2000, 4000]);
    // The same URL again: the same answer, not asked again. iTunes: about twenty a minute.
    await paced('https://musicbrainz.org/ws/2/release-group?query=a');
    await Promise.all([paced('https://itunes.apple.com/search?term=a'), paced('https://itunes.apple.com/search?term=b')]);
    expect(ask).toHaveBeenCalledTimes(5);
    expect(clock.slept.at(-1)).toBe(3100);
    // Another failure goes straight back, and isn't kept.
    await expect(paced('https://en.wikipedia.org/broken')).rejects.toThrow('not found');
    await expect(paced('https://en.wikipedia.org/broken')).rejects.toThrow('not found');
    expect(ask).toHaveBeenCalledTimes(7);
  });

  it('gives up on a service that stays busy', async () => {
    const clock = fakeClock();
    const paced = pacedAsk(() => Promise.reject(new Error('the service is busy; try again in a moment')), new Map(), clock);
    await expect(paced('https://musicbrainz.org/x')).rejects.toThrow(/busy/);
    expect(clock.slept.filter((ms) => ms >= 2000)).toEqual([2000, 4000, 8000]);
  });
});

const NOTE = '---\nArtist: Interpol\nYear:\nlistened: 2026-10-07\ngenre:\nrating: 77\nfavorite tracks:\n---\n[[00. Music 2026 MOC|music 2026]]\n';
const files: VaultFile[] = [
  { path: 'Rating/music/Antics.md', kind: 'note' },
  { path: 'Rating/music/_attachments/antics.svg', kind: 'image' },
];

async function antics() {
  const [found] = await findCover({ kind: 'album', title: 'Antics', maker: 'Interpol' }, { ask: () => Promise.resolve(read('covers/musicbrainz-antics.json')) });
  if (!found) throw new Error('Antics was not found');
  return found;
}

function disk(text = NOTE): SaveIO & { notes: Map<string, string>; images: string[] } {
  const notes = new Map([['Rating/music/Antics.md', text]]);
  const images: string[] = [];
  return {
    notes,
    images,
    readNote: (path) => Promise.resolve(notes.get(path) ?? ''),
    fetchImageIntoVault: (_url, path) => {
      // The backend names it after what the bytes are.
      const saved = path.replace(/\.jpg$/, '.png');
      images.push(saved);
      return Promise.resolve(saved);
    },
    writeNote: (path, next, expected) => {
      if (notes.get(path) !== expected) return Promise.reject(new Error('the note changed on disk since it was opened'));
      notes.set(path, next);
      return Promise.resolve();
    },
  };
}

describe('saving a found cover', () => {
  it('downloads the cover beside the others, then writes the embed and fills what was empty', async () => {
    const io = disk();
    const fetch = vi.spyOn(io, 'fetchImageIntoVault');
    const image = await saveFound({ path: 'Rating/music/Antics.md', expected: NOTE, candidate: await antics(), files }, io);
    // "antics" is taken by an image already, in another extension.
    expect(fetch).toHaveBeenCalledWith('https://coverartarchive.org/release-group/bc7740e1-02c9-3ab7-9869-0e0c79acf941/front-500', 'Rating/music/_attachments/antics-2.jpg');
    expect(image).toBe('Rating/music/_attachments/antics-2.png');
    expect(io.notes.get('Rating/music/Antics.md')).toBe(
      '---\nArtist: Interpol\nYear: 2004\nlistened: 2026-10-07\ngenre:\n  - indie rock\n  - alternative rock\n  - indie\nrating: 77\nfavorite tracks:\n---\n[[00. Music 2026 MOC|music 2026]]\n\n![[antics-2.png|240]]\n',
    );
  });

  it('leaves a note that changed since it was searched, before anything is downloaded', async () => {
    const io = disk(`${NOTE}Edited in Obsidian.\n`);
    await expect(saveFound({ path: 'Rating/music/Antics.md', expected: NOTE, candidate: await antics(), files }, io)).rejects.toThrow(/changed since/);
    expect(io.images).toEqual([]);
    expect(io.notes.get('Rating/music/Antics.md')).toBe(`${NOTE}Edited in Obsidian.\n`);
  });

  it('says where the cover went when the note changed in the last instant', async () => {
    const io = disk();
    io.writeNote = () => Promise.reject(new Error('the note changed on disk since it was opened: Rating/music/Antics.md'));
    await expect(saveFound({ path: 'Rating/music/Antics.md', expected: NOTE, candidate: await antics(), files }, io)).rejects.toThrow(
      /changed on disk.*Its cover was saved as Rating\/music\/_attachments\/antics-2\.png, and the note left as it is/,
    );
  });

  it('refuses a note it couldn’t add to before downloading, and changes a cover by its target alone', async () => {
    const io = disk('---\r\nrating: 1\n---\n');
    await expect(saveFound({ path: 'Rating/music/Antics.md', expected: '---\r\nrating: 1\n---\n', candidate: await antics(), files }, io)).rejects.toThrow(/line endings/);
    expect(io.images).toEqual([]);
    const covered = `${NOTE}\n![[antics.svg|240]]\n`;
    const changing = disk(covered);
    await saveFound({ path: 'Rating/music/Antics.md', expected: covered, candidate: await antics(), files, change: true }, changing);
    expect(changing.notes.get('Rating/music/Antics.md')).toBe(covered.replace('antics.svg', 'antics-2.png'));
  });
});

const entry = (title: string, maker?: string): MediaEntry => ({ path: `Rating/music/${title}.md`, kind: 'album', title, maker, genres: [], tracks: [] });

const filesOf = (texts: Record<string, string>): VaultFile[] => Object.keys(texts).map((path) => ({ path, kind: 'note' }));

function runIO(texts: Record<string, string>): RunIO & { written: string[] } {
  const notes = new Map(Object.entries(texts));
  const written: string[] = [];
  return {
    written,
    ask: (url) => (url === ANTICS_SEARCH ? Promise.resolve(read('covers/musicbrainz-antics.json')) : Promise.resolve({ 'release-groups': [] })),
    hasImage: () => Promise.resolve(true),
    readNote: (path) => Promise.resolve(notes.get(path) ?? ''),
    fetchImageIntoVault: (_url, path) => Promise.resolve(path),
    writeNote: (path, next, expected) => {
      if (notes.get(path) !== expected) return Promise.reject(new Error('the note changed on disk since it was opened'));
      notes.set(path, next);
      written.push(path);
      return Promise.resolve();
    },
  };
}

const settled = (run: CoverRun) =>
  new Promise<void>((done) => {
    const check = () => {
      if (!run.snapshot().running) {
        stop();
        done();
      }
    };
    const stop = run.subscribe(check);
    check();
  });

describe('the run', () => {
  it('searches each note, ticks the sure ones, and saves only those ticked', async () => {
    const texts = { 'Rating/music/Antics.md': NOTE, 'Rating/music/Untitled.md': '---\nrating: 50\n---\n', 'Rating/music/Older.md': '---\nrating: 60\n---\n' };
    const io = runIO(texts);
    const run = new CoverRun([entry('Antics', 'Interpol'), entry('Untitled'), entry('Older', 'Lizzy McAlpine')], filesOf(texts), io);
    run.skip('Rating/music/Older.md');
    run.start();
    await settled(run);
    expect(run.snapshot().rows.map((row) => [row.entry.title, row.status, row.ticked])).toEqual([
      ['Antics', 'found', true],
      ['Untitled', 'none', false],
      ['Older', 'skipped', false],
    ]);
    expect(run.ticked).toBe(1);
    expect(await run.save()).toBe(1);
    expect(io.written).toEqual(['Rating/music/Antics.md']);
    expect(run.snapshot().rows[0]).toMatchObject({ status: 'saved', image: 'Rating/music/_attachments/antics.jpg' });
  });

  it('stops after the note being searched, and goes on from where it stopped', async () => {
    const texts = { 'Rating/music/Antics.md': NOTE, 'Rating/music/Untitled.md': '---\nrating: 50\n---\n' };
    const io = runIO(texts);
    const run = new CoverRun([entry('Antics', 'Interpol'), entry('Untitled')], filesOf(texts), io);
    run.start();
    run.stop();
    await new Promise((done) => setTimeout(done, 10));
    expect(run.snapshot().rows.map((row) => row.status)).toEqual(['found', 'waiting']);
    expect(run.snapshot().running).toBe(false);
    run.start();
    await settled(run);
    expect(run.snapshot().rows.map((row) => row.status)).toEqual(['found', 'none']);
  });

  it('takes each row as it is when its turn to save comes: one unticked or skipped meanwhile is left as it is', async () => {
    const paths = ['Rating/music/Antics.md', 'Rating/music/Antics (again).md', 'Rating/music/Antics (third).md'];
    const texts = Object.fromEntries(paths.map((path) => [path, NOTE]));
    const io = runIO(texts);
    // The first cover downloads slowly, while the others are changed on the sheet.
    let release = () => {};
    const gate = new Promise<void>((done) => (release = done));
    const fetchImage = io.fetchImageIntoVault;
    io.fetchImageIntoVault = async (url, path) => {
      await gate;
      return fetchImage(url, path);
    };
    const run = new CoverRun(
      paths.map((path) => ({ ...entry('Antics', 'Interpol'), path })),
      filesOf(texts),
      io,
    );
    run.start();
    await settled(run);
    expect(run.ticked).toBe(3);
    const saving = run.save();
    await vi.waitFor(() => expect(run.snapshot().rows[0]?.status).toBe('saving'));
    run.tick(paths[1]!, false);
    run.skip(paths[2]!);
    release();
    expect(await saving).toBe(1);
    expect(io.written).toEqual([paths[0]]);
    expect(run.snapshot().rows.map((row) => [row.status, row.ticked])).toEqual([
      ['saved', false],
      ['found', false],
      ['skipped', false],
    ]);
  });

  it('ticks a row only for a sure match: stepping to an unsure one unticks it', async () => {
    const io = { ...runIO({ 'Rating/music/Dog Man Star.md': NOTE }), ask: () => Promise.resolve(read('lookup/musicbrainz-search.json')) };
    const run = new CoverRun([{ ...entry('Dog Man Star'), year: '1994' }], filesOf({ 'Rating/music/Dog Man Star.md': NOTE }), io);
    run.start();
    await settled(run);
    const row = () => run.snapshot().rows[0];
    expect(row()?.candidates.map((candidate) => [candidate.result.maker, candidate.sure])).toEqual([
      ['Suede', true],
      ['NERVE', false],
    ]);
    expect(row()?.ticked).toBe(true);
    run.next('Rating/music/Dog Man Star.md');
    expect(row()).toMatchObject({ pick: 1, ticked: false });
    run.next('Rating/music/Dog Man Star.md');
    expect(row()).toMatchObject({ pick: 0, ticked: true });
  });

  it('reports a note that changed after it was searched, and saves the rest', async () => {
    const io = runIO({ 'Rating/music/Antics.md': NOTE });
    const run = new CoverRun([entry('Antics', 'Interpol')], filesOf({ 'Rating/music/Antics.md': NOTE }), io);
    run.start();
    await settled(run);
    await io.writeNote('Rating/music/Antics.md', `${NOTE}Edited.\n`, NOTE);
    expect(await run.save()).toBe(0);
    expect(run.snapshot().rows[0]?.status).toBe('unsaved');
    expect(run.snapshot().rows[0]?.message).toMatch(/changed since/);
  });
});
