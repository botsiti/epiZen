import type { VaultFile } from './api';
import { addCover, coverFills, replaceCover, type Found } from './coverEdits';
import { findCover, SERVICE_GAP, wantedOf, type Ask, type Candidate } from './covers';
import { parseNote } from './frontmatter';
import { coverPath, kindSpec, readEntry, type MediaEntry, type MediaKind } from './library';
import { linkResolver } from './links';

// Finding covers for many notes at once, and saving them: the run behind the library's "Find
// covers" sheet, and the save behind a media page's "Find cover". Searches go one note at a time
// per kind, each kind beside the others, and every request waits its turn at its service (MusicBrainz
// one a second, iTunes about twenty a minute). The disk and the network come in as `RunIO`, so all
// of it runs in tests on recorded answers.

/** The pause for a busy service before asking again: 2, 4, then 8 seconds. */
const RETRIES = [2000, 4000, 8000];

export interface Clock {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

const realClock: Clock = { now: () => Date.now(), sleep: (ms) => new Promise((done) => setTimeout(done, ms)) };

/** Keeps the requests to one host apart: each waits its turn, at least `gap` after the one before it started. */
export function pacer(gap: number, clock: Clock = realClock): () => Promise<void> {
  let next = 0;
  return async () => {
    const now = clock.now();
    const at = Math.max(now, next);
    next = at + gap;
    if (at > now) await clock.sleep(at - now);
  };
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};

const reason = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * An ask that waits its turn at each service, asks a service that says it is busy again after a
 * pause, and asks for each URL once (a show's episodes serve every note from that show).
 */
export function pacedAsk(ask: Ask, pacers: Map<string, () => Promise<void>>, clock: Clock = realClock): Ask {
  const asked = new Map<string, Promise<unknown>>();
  const cooling = new Map<string, number>();
  const turn = (host: string) => {
    let wait = pacers.get(host);
    if (!wait) {
      wait = pacer(SERVICE_GAP[host] ?? 0, clock);
      pacers.set(host, wait);
    }
    return wait();
  };
  const once = async (url: string): Promise<unknown> => {
    const host = hostOf(url);
    const until = cooling.get(host) ?? 0;
    if (until > clock.now()) throw new Error(`the service is cooling down; retry in ${Math.ceil((until - clock.now()) / 1000)} seconds`);
    for (let attempt = 0; ; attempt += 1) {
      await turn(host);
      try {
        return await ask(url);
      } catch (err) {
        // The backend says "the service is busy" for a 503: MusicBrainz's word for "slower".
        const pause = RETRIES[attempt];
        const transient = /busy|rate limit|too many requests|took too long|answered (?:429|502|503|504)/i.test(reason(err));
        if (!transient) throw err;
        if (pause === undefined) {
          cooling.set(host, clock.now() + 30_000);
          throw new Error(`${reason(err)}; retry in 30 seconds`, { cause: err });
        }
        await clock.sleep(pause);
      }
    }
  };
  return (url) => {
    let answer = asked.get(url);
    if (!answer) {
      answer = once(url);
      // A failure isn't kept: the next note asks again.
      answer.catch(() => asked.delete(url));
      asked.set(url, answer);
    }
    return answer;
  };
}

// ---------------------------------------------------------------- saving one

/** What saving needs from the backend (src/lib/api.ts). */
export interface SaveIO {
  readNote: (path: string) => Promise<string>;
  fetchImageIntoVault: (url: string, path: string) => Promise<string>;
  writeNote: (path: string, text: string, expected: string) => Promise<void>;
}

/** What a candidate brings to the note besides its cover: its maker, its year (a podcast's from its episode), its genres. */
export const foundOf = (candidate: Candidate, kind: MediaKind): Found => ({
  maker: candidate.result.maker,
  year: kind === 'podcast' ? candidate.episode?.year : candidate.result.year,
  genres: candidate.result.genres,
});

export interface SaveJob {
  path: string;
  /** The note's text as it was when the cover was looked for: it is written over only while it still holds this. */
  expected: string;
  candidate: Candidate;
  /** The vault's files, and images saved since they were listed, so a new cover's name is one no image has. */
  files: VaultFile[];
  /** Point the existing cover's embed at the new image, rather than add one. */
  change?: boolean;
}

/**
 * Saves a found cover: checks the note still holds what it held, downloads the image as a new
 * file in the kind's _attachments, then writes the note over exactly that text. A note that
 * changed meanwhile is left as it is, before anything is downloaded; one that changes in the last
 * instant is left too, and its image stays, named in the error. Returns the image's vault path.
 */
export async function saveFound(job: SaveJob, io: SaveIO): Promise<string> {
  const { path, expected, candidate, files, change } = job;
  const resolve = linkResolver(files);
  const entry = readEntry(path, expected, resolve);
  const url = candidate.result.cover;
  if (!entry || !url) throw new Error('there is no cover to save');
  const spec = kindSpec(entry.kind);
  const edit = (image: string) =>
    change ? replaceCover(expected, path, resolve, image) : addCover(expected, { spec, path, resolve }, image, coverFills(spec, parseNote(expected).properties, foundOf(candidate, entry.kind)));
  // Anything that would refuse the note refuses it now, before an image is downloaded for it.
  edit(coverPath(spec, entry.title, files));
  if ((await io.readNote(path)) !== expected) throw new Error('the note changed since its cover was looked for, so it was left as it is');
  const image = await io.fetchImageIntoVault(url, coverPath(spec, entry.title, files));
  try {
    await io.writeNote(path, edit(image), expected);
  } catch (err) {
    throw new Error(`${reason(err)}. Its cover was saved as ${image}, and the note left as it is`, { cause: err });
  }
  return image;
}

// ---------------------------------------------------------------- the run

export type RowStatus = 'waiting' | 'searching' | 'found' | 'none' | 'failed' | 'skipped' | 'saving' | 'saved' | 'unsaved';

export interface Row {
  entry: MediaEntry;
  status: RowStatus;
  candidates: Candidate[];
  /** The candidate to save: the first, unless another was chosen. */
  pick: number;
  /** To be saved: a sure match is ticked when it is found; anything can be ticked or unticked. */
  ticked: boolean;
  /** The note's text when it was searched. */
  text?: string;
  /** Why it failed, or why it wasn't saved. */
  message?: string;
  /** The cover saved for it. */
  image?: string;
}

export interface RunState {
  rows: Row[];
  /** Searching: not stopped, and something is still waiting. */
  running: boolean;
  saving: boolean;
  /** Seconds left at the pace so far, roughly. */
  secondsLeft: number;
}

export interface RunIO extends SaveIO {
  ask: Ask;
  hasImage: (url: string) => Promise<boolean>;
}

/** Roughly how long one note takes before any has: requests a note makes, at its service's pace. */
const FIRST_GUESS: Record<MediaKind, number> = { album: 1.5, film: 1.5, book: 2.5, podcast: 4, video: 0 };

/** The search for many notes' covers: their rows, which a sheet draws and changes. */
export class CoverRun {
  private state: RunState;
  private readonly listeners = new Set<() => void>();
  private generation = 0;
  private stopped = true;
  private readonly took = new Map<MediaKind, { seconds: number; count: number }>();

  constructor(
    entries: MediaEntry[],
    /** The vault's files, for naming each new cover so no image has its name. */
    private files: VaultFile[],
    private readonly io: RunIO,
    private readonly clock: Clock = realClock,
  ) {
    this.state = { rows: entries.map((entry) => ({ entry, status: 'waiting', candidates: [], pick: 0, ticked: false })), running: false, saving: false, secondsLeft: 0 };
    this.state.secondsLeft = this.estimate();
  }

  /** The vault's files as they are now, after it was read again. */
  setFiles(files: VaultFile[]) {
    this.files = files;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  snapshot = () => this.state;

  private set(change: Partial<RunState>) {
    this.state = { ...this.state, ...change };
    this.state = { ...this.state, running: !this.stopped && this.state.rows.some((row) => row.status === 'waiting' || row.status === 'searching'), secondsLeft: this.estimate() };
    for (const listener of this.listeners) listener();
  }

  private update(path: string, change: (row: Row) => Partial<Row>) {
    this.set({ rows: this.state.rows.map((row) => (row.entry.path === path ? { ...row, ...change(row) } : row)) });
  }

  /** The kind that will take longest decides: what is left of it, at its pace so far. */
  private estimate(): number {
    const left = new Map<MediaKind, number>();
    for (const row of this.state.rows) if (row.status === 'waiting' || row.status === 'searching') left.set(row.entry.kind, (left.get(row.entry.kind) ?? 0) + 1);
    let most = 0;
    for (const [kind, count] of left) {
      const took = this.took.get(kind);
      const each = took && took.count ? took.seconds / took.count : FIRST_GUESS[kind];
      most = Math.max(most, count * each);
    }
    return Math.round(most);
  }

  /** Starts searching, or goes on after a stop: each kind's notes one at a time, the kinds side by side. */
  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.generation += 1;
    const generation = this.generation;
    const kinds = [...new Set(this.state.rows.map((row) => row.entry.kind))];
    for (const kind of kinds) void this.work(kind, generation);
    this.set({});
  }

  /** Stops after the notes being searched now; those waiting stay waiting. */
  stop() {
    this.stopped = true;
    this.set({});
  }

  private async work(kind: MediaKind, generation: number) {
    for (;;) {
      if (this.stopped || generation !== this.generation) return;
      const row = this.state.rows.find((candidate) => candidate.entry.kind === kind && candidate.status === 'waiting');
      if (!row) return this.set({});
      const { path } = row.entry;
      this.update(path, () => ({ status: 'searching' }));
      const started = this.clock.now();
      try {
        const text = await this.io.readNote(path);
        const candidates = await findCover(wantedOf(row.entry), { ask: this.io.ask, hasImage: this.io.hasImage });
        // Skipped while it was being searched: it stays skipped.
        this.update(path, (now) =>
          now.status === 'skipped' ? {} : { status: candidates.length ? 'found' : 'none', candidates, pick: 0, ticked: Boolean(candidates[0]?.sure), text },
        );
      } catch (err) {
        this.update(path, (now) => (now.status === 'skipped' ? {} : { status: 'failed', message: reason(err) }));
      }
      const took = this.took.get(kind) ?? { seconds: 0, count: 0 };
      this.took.set(kind, { seconds: took.seconds + (this.clock.now() - started) / 1000, count: took.count + 1 });
    }
  }

  /** Leaves a note out: not searched if it is waiting, not saved if it was found. */
  skip(path: string) {
    this.update(path, (row) => (row.status === 'saved' || row.status === 'saving' ? {} : { status: 'skipped', ticked: false }));
  }

  /** Brings a skipped note back: found again if it was, or waiting to be searched. */
  unskip(path: string) {
    this.update(path, (row) => (row.status !== 'skipped' ? {} : { status: row.candidates.length ? 'found' : row.text === undefined ? 'waiting' : 'none' }));
    if (!this.stopped) {
      // A note brought back while its kind's searches had finished starts them again.
      this.stopped = true;
      this.start();
    }
  }

  tick(path: string, ticked: boolean) {
    this.update(path, (row) => (row.status === 'found' || row.status === 'unsaved' ? { ticked } : {}));
  }

  /** Retry a failed search without touching found or saved rows. */
  retry(path: string) {
    if (this.state.saving || !this.state.rows.some((row) => row.entry.path === path && row.status === 'failed')) return;
    this.update(path, () => ({ status: 'waiting', message: undefined }));
    this.stopped = true;
    this.start();
  }

  /** Shows the next match the search found for a note, round to the first again. */
  next(path: string) {
    this.update(path, (row) => {
      if (row.candidates.length < 2 || (row.status !== 'found' && row.status !== 'unsaved')) return {};
      const pick = (row.pick + 1) % row.candidates.length;
      // Ticked only if the match it shows now is sure: another one is for the user to tick.
      return { pick, ticked: Boolean(row.candidates[pick]?.sure) };
    });
  }

  /** How many are ticked to be saved. */
  get ticked(): number {
    return this.state.rows.filter((row) => row.ticked && (row.status === 'found' || row.status === 'unsaved')).length;
  }

  /**
   * Stops the search and saves every ticked cover, one note at a time. Returns how many were saved.
   * Each note is written only while it still holds the text it had when it was searched.
   */
  async save(): Promise<number> {
    this.stop();
    this.set({ saving: true });
    const saved: VaultFile[] = [];
    let count = 0;
    for (const { entry } of this.state.rows) {
      const { path } = entry;
      // The row as it is now: one unticked, skipped or stepped to another match while the others saved is taken as it is.
      const row = this.state.rows.find((now) => now.entry.path === path);
      const candidate = row?.candidates[row.pick];
      if (!row?.ticked || !candidate || row.text === undefined || (row.status !== 'found' && row.status !== 'unsaved')) continue;
      this.update(path, () => ({ status: 'saving', message: undefined }));
      try {
        const image = await saveFound({ path, expected: row.text, candidate, files: [...this.files, ...saved] }, this.io);
        saved.push({ path: image, kind: 'image' });
        count += 1;
        this.update(path, () => ({ status: 'saved', ticked: false, image }));
      } catch (err) {
        this.update(path, () => ({ status: 'unsaved', ticked: false, message: reason(err) }));
      }
    }
    this.set({ saving: false });
    return count;
  }
}
