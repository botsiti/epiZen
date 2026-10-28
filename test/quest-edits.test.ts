// @vitest-environment node
// The quest composer's, the quest detail's and the weekly page's writes, run on a copy of the demo
// vault: a new quest in every weekly and monthly note, a chapter added, rewritten and taken out and
// a deadline set on every quest, and Plus, Minus and Next on every weekly note. Each changes the
// lines it means to, in the one note it was given, and nothing else in the vault.
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addChapter, addQuest, deleteChapter, editChapter, parseQuests, questLine, setDeadline } from '../src/lib/quests';
import { readSection, WEEK_HEADINGS, writeSection } from '../src/lib/sections';

const original = fileURLToPath(new URL('../demo-vault', import.meta.url));
const WEEKS = 'Calendar/2026/weeks';
const MONTHS = 'Calendar/2026/months 2026';
const MYTHIC = 'Calendar/Custom Quests.md';
const DAY = new Date(2026, 8, 30);
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
  copy = join(mkdtempSync(join(tmpdir(), 'epizen-quests-')), 'demo-vault');
  cpSync(original, copy, { recursive: true });
});

afterEach(() => rmSync(join(copy, '..'), { recursive: true, force: true }));

/** Applies the change to one note of the copy, then compares the whole vault with the original. */
function run(path: string, change: (text: string) => string) {
  const file = join(copy, path);
  writeFileSync(file, change(readFileSync(file, 'utf8')));
  const before = snapshot(original);
  const after = snapshot(copy);
  expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
  const differ = [...after].filter(([key, bytes]) => !bytes.equals(before.get(key) ?? Buffer.alloc(0))).map(([key]) => key);
  return { differ, old: (before.get(path) ?? Buffer.alloc(0)).toString('utf8').split('\n'), now: (after.get(path) ?? Buffer.alloc(0)).toString('utf8').split('\n') };
}

const read = (path: string) => readFileSync(join(original, path), 'utf8');
const restore = (path: string) => cpSync(join(original, path), join(copy, path));
const notesIn = (folder: string) =>
  readdirSync(join(original, folder))
    .filter((name) => name.endsWith('.md'))
    .map((name) => `${folder}/${name}`);
/** Every weekly, monthly and mythic quest in the demo vault, with its note. */
const quests = () => [...notesIn(WEEKS), ...notesIn(MONTHS), MYTHIC].flatMap((path) => parseQuests(path, read(path)).map((quest) => ({ path, quest })));

describe('quest writes on a copy of the demo vault', () => {
  it('has quests with chapters to run on, two of them alike', () => {
    expect(quests().length).toBeGreaterThan(20);
    const chapters = quests().flatMap(({ quest }) => quest.log.filter((entry) => entry.xp === undefined));
    expect(chapters.length).toBeGreaterThanOrEqual(4);
    expect(chapters.filter((entry) => entry.text === 'Two hours before the phone.')).toHaveLength(2);
  });

  it('a new quest adds its one line to the Quest XP section of that one note', () => {
    for (const path of [...notesIn(WEEKS), ...notesIn(MONTHS)]) {
      const scope = path.startsWith(WEEKS) ? 'weekly' : 'monthly';
      const line = questLine({ scope, title: 'Read 100 pages', xp: 500, tier: 'rare', spheres: [{ name: 'Personal Growth', weight: 100 }, { name: 'Spiritual', weight: 30 }], target: 100 });
      const { differ, old, now } = run(path, (text) => addQuest(text, line));
      expect(differ).toEqual([path]);
      const at = now.indexOf(line);
      expect(at).toBeGreaterThan(0);
      expect(now.filter((_, i) => i !== at)).toEqual(old);
      // Under the Quest XP heading, after its quests and their logs.
      const heading = old.indexOf('### Quest XP');
      expect(heading).toBeGreaterThanOrEqual(0);
      expect(at).toBeGreaterThan(heading);
      expect(old[at - 1]).toMatch(/^(### Quest XP|- \[[ x]\] #quest\/| {4}- \d\d\.\d\d\.\d{4} :: )/);
      expect(parseQuests(path, now.join('\n')).find((quest) => quest.line === at)).toMatchObject({ scope, title: 'Read 100 pages', target: 100 });
      restore(path);
    }
  });

  it("a chapter added goes after the quest's log, one line, in the quest's own note", () => {
    for (const { path, quest } of quests()) {
      const { differ, old, now } = run(path, (text) => addChapter(text, quest, 'A step toward it.', DAY));
      expect(differ).toEqual([path]);
      const at = now.indexOf('    - 30.09.2026 :: A step toward it.');
      expect(at).toBe((quest.log.at(-1)?.line ?? quest.line) + 1);
      expect(now.filter((_, i) => i !== at)).toEqual(old);
      restore(path);
    }
  });

  it('a chapter rewritten changes its one line, and one taken out removes only that line', () => {
    let rewritten = 0;
    for (const { path, quest } of quests()) {
      for (const entry of quest.log.filter((item) => item.xp === undefined)) {
        const edited = run(path, (text) => editChapter(text, quest, entry, 'Said another way.'));
        expect(edited.differ).toEqual([path]);
        expect(edited.now.flatMap((line, i) => (line === edited.old[i] ? [] : [[i, line]]))).toEqual([[entry.line, `    - ${entry.date} :: Said another way.`]]);
        restore(path);
        const deleted = run(path, (text) => deleteChapter(text, quest, entry));
        expect(deleted.differ).toEqual([path]);
        expect(deleted.now).toEqual(deleted.old.filter((_, i) => i !== entry.line));
        restore(path);
        rewritten += 1;
      }
    }
    expect(rewritten).toBeGreaterThanOrEqual(4);
  });

  it("a deadline set or taken out changes the quest's one line", () => {
    for (const { path, quest } of quests()) {
      const { differ, old, now } = run(path, (text) => setDeadline(text, quest, '2026-12-24'));
      expect(differ).toEqual([path]);
      // One the quest has is rewritten where it is; a new one goes at the end of the line.
      const set = quest.deadline ? quest.raw.replace(/\[deadline::[^\]]*\]/, '[deadline::2026-12-24]') : `${quest.raw} [deadline::2026-12-24]`;
      expect(now.flatMap((line, i) => (line === old[i] ? [] : [[i, line]]))).toEqual([[quest.line, set]]);
      restore(path);
      if (!quest.deadline) continue;
      const cleared = run(path, (text) => setDeadline(text, quest));
      expect(cleared.differ).toEqual([path]);
      expect(cleared.now.flatMap((line, i) => (line === cleared.old[i] ? [] : [[i, line]]))).toEqual([[quest.line, quest.raw.replace(/\s*\[deadline::[^\]]*\]/, '')]]);
      restore(path);
    }
  });
});

describe('Plus, Minus and Next on a copy of the demo vault', () => {
  it('rewrite the lines of their own section of that one weekly note, and nothing else', () => {
    for (const path of notesIn(WEEKS)) {
      for (const heading of WEEK_HEADINGS) {
        const { differ, old, now } = run(path, (text) => writeSection(text, heading, 'Slept before midnight\nRan twice'));
        expect(differ).toEqual([path]);
        expect(readSection(now.join('\n'), heading)).toBe('Slept before midnight\nRan twice');
        // The lines before the section's words and from the next heading on are as they were.
        const start = now.indexOf('Slept before midnight');
        expect(now[start - 1]).toBe(`#### ${heading}`);
        const after = old.findIndex((line, i) => i >= start && /^#{1,6}\s/.test(line));
        expect(now.slice(0, start)).toEqual(old.slice(0, start));
        expect(now.slice(start + 2)).toEqual(old.slice(after));
        restore(path);
      }
    }
  });
});
