// @vitest-environment node
// The calendar's, the timer's and the task menu's writes, run on every daily note of a copy of
// the demo vault: each changes the lines it means to (a task's minutes, one block line, a new
// task and its block, a task's line, or a task with its blocks), in the one note it was given,
// and nothing else in the vault.
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseDay } from '../src/lib/day';
import { addBlock, addTaskWithBlock, deleteBlock, deleteTask, editTask, moveBlock, type LineRef } from '../src/lib/timeblocks';

const original = fileURLToPath(new URL('../demo-vault', import.meta.url));
const DAYS = 'Calendar/2026/days 2026';
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
  copy = join(mkdtempSync(join(tmpdir(), 'epizen-blocks-')), 'demo-vault');
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

const days = () => readdirSync(join(original, DAYS)).filter((name) => name.endsWith('.md'));
const read = (path: string) => readFileSync(join(original, path), 'utf8');
const ref = (text: string, line: number): LineRef => ({ line, text: text.split('\n')[line] ?? '' });
const restore = (path: string) => cpSync(join(original, path), join(copy, path));

/** Each daily note's first task that has a time block and a minutes field. */
function trackedTasks() {
  return days().flatMap((name) => {
    const path = `${DAYS}/${name}`;
    const text = read(path);
    const task = parseDay(text).tasks.find((t) => t.blocks.length && t.minutes);
    return task ? [{ path, text, task }] : [];
  });
}

describe('time block writes on a copy of the demo vault', () => {
  it('has daily notes with time blocks to run on', () => {
    expect(trackedTasks().length).toBeGreaterThan(40);
  });

  it('adding a block changes the task’s minutes and adds one line, in that one note', () => {
    for (const { path, text, task } of trackedTasks()) {
      const last = task.blocks.at(-1);
      if (!last) continue;
      const { differ, old, now } = run(path, (t) => addBlock(t, ref(text, task.line), 23 * 60, 23 * 60 + 30));
      expect(differ).toEqual([path]);
      expect(now[last.line + 1]).toBe('    - 23:00–23:30');
      expect(now[task.line]).toBe((old[task.line] ?? '').replace(/\[minutes::\d+\]/, `[minutes::${(task.minutes ?? 0) + 30}]`));
      expect(now.filter((_, i) => i !== last.line + 1 && i !== task.line)).toEqual(old.filter((_, i) => i !== task.line));
      restore(path);
    }
  });

  it('moving a block rewrites that block line only: the task keeps its minutes', () => {
    for (const { path, text, task } of trackedTasks()) {
      const block = task.blocks[0];
      if (!block) continue;
      const { differ, old, now } = run(path, (t) => moveBlock(t, ref(text, task.line), ref(text, block.line), 22 * 60, 22 * 60 + 15));
      expect(differ).toEqual([path]);
      expect(now).toHaveLength(old.length);
      expect(now.flatMap((line, i) => (line === old[i] ? [] : [[i, line]]))).toEqual([[block.line, '    - 22:00–22:15']]);
      restore(path);
    }
  });

  it('deleting a block removes that line only: the task keeps its minutes', () => {
    for (const { path, text, task } of trackedTasks()) {
      const block = task.blocks[0];
      if (!block) continue;
      const { differ, old, now } = run(path, (t) => deleteBlock(t, ref(text, task.line), ref(text, block.line)));
      expect(differ).toEqual([path]);
      expect(now).toEqual(old.filter((_, i) => i !== block.line));
      restore(path);
    }
  });

  it('editing a task rewrites its line only', () => {
    for (const { path, text, task } of trackedTasks()) {
      const { differ, old, now } = run(path, (t) => editTask(t, ref(text, task.line), { words: 'renamed', category: 'study', minutes: 5 }));
      expect(differ).toEqual([path]);
      const box = (old[task.line] ?? '').slice(0, 6);
      expect(now.flatMap((line, i) => (line === old[i] ? [] : [[i, line]]))).toEqual([[task.line, `${box}#daily/study — renamed [minutes::5]`]]);
      restore(path);
    }
  });

  it('deleting a task removes its line and its blocks only', () => {
    for (const { path, text, task } of trackedTasks()) {
      const { differ, old, now } = run(path, (t) => deleteTask(t, ref(text, task.line)));
      expect(differ).toEqual([path]);
      const gone = new Set([task.line, ...task.blocks.map((block) => block.line)]);
      expect(now).toEqual(old.filter((_, i) => !gone.has(i)));
      restore(path);
    }
  });

  it('a new task with a block adds those two lines to that one note', () => {
    for (const name of days()) {
      const path = `${DAYS}/${name}`;
      const { differ, old, now } = run(path, (t) => addTaskWithBlock(t, 'sport', 'evening run', 19 * 60, 19 * 60 + 45));
      expect(differ).toEqual([path]);
      const at = now.indexOf('- [ ] #daily/sport — evening run [minutes::45]');
      expect(at).toBeGreaterThan(0);
      expect(now[at + 1]).toBe('    - 19:00–19:45');
      expect(now.filter((_, i) => i !== at && i !== at + 1)).toEqual(old);
      restore(path);
    }
  });
});
