// @vitest-environment node
// The day page's writes, run on every daily note of a copy of the demo vault: each changes the
// one line it means to (or adds one), in the one note it was given, and nothing else in the vault.
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addTask, setProperty } from '../src/lib/edits';

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
  copy = join(mkdtempSync(join(tmpdir(), 'epizen-edits-')), 'demo-vault');
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

describe('periodic page writes on a copy of the demo vault', () => {
  it('setting mood rewrites that one line of that one note', () => {
    for (const name of days()) {
      const path = `${DAYS}/${name}`;
      const { differ, old, now } = run(path, (text) => setProperty(text, 'mood', '1'));
      expect(differ).toEqual([path]);
      expect(now).toHaveLength(old.length);
      const lines = now.flatMap((line, i) => (line === old[i] ? [] : [line]));
      // The demo's moods run 4 to 9, so 1 is always a change.
      expect(lines).toEqual(['mood: 1']);
      cpSync(join(original, path), join(copy, path));
    }
  });

  it('adding a task adds that one line to that one note', () => {
    for (const name of days()) {
      const path = `${DAYS}/${name}`;
      const { differ, old, now } = run(path, (text) => addTask(text, 'sport', 'evening run', 30));
      expect(differ).toEqual([path]);
      const at = now.indexOf('- [ ] #daily/sport — evening run [minutes::30]');
      expect(at).toBeGreaterThan(0);
      expect(now.filter((_, i) => i !== at)).toEqual(old);
      // It lands right after the Tasks section's last task or time block.
      expect(old[at - 1]).toMatch(/^(- \[[ x]\] #daily\/| {4}- \d\d:\d\d–)/);
      cpSync(join(original, path), join(copy, path));
    }
  });
});
