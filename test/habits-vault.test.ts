// @vitest-environment node
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { expect, it } from 'vitest';
import { changeHabit, newHabit, readHabit, setHabitCompletion } from '../src/lib/habits';
const snapshot = (root: string) => new Map(readdirSync(root, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => { const path = join(e.parentPath, e.name);return [relative(root, path), readFileSync(path).toString('base64')]; }));
it('keeps every other file byte-identical during creation, completion and archive/reactivation', () => {
  const root = mkdtempSync(join(tmpdir(), 'epizen-habits-'));
  try {
    cpSync(new URL('../demo-vault', import.meta.url), root, { recursive: true });
    const before = snapshot(root);const created = newHabit('No sweets', '2026-08-14', 'habit-sweets-001');
    mkdirSync(dirname(join(root, created.path)), { recursive: true });writeFileSync(join(root, created.path), created.text);
    const dayPath = 'Calendar/2026/days 2026/14.08.2026.md';const original = readFileSync(join(root, dayPath), 'utf8');
    const habit = readHabit(created.path, created.text)!;const completed = setHabitCompletion(original, habit, false, true);writeFileSync(join(root, dayPath), completed);
    const archivedText = changeHabit(created.text, habit, { kind: 'archive', date: '2026-09-01' });const archived = readHabit(created.path, archivedText)!;
    writeFileSync(join(root, created.path), changeHabit(archivedText, archived, { kind: 'resume', date: '2026-10-01', restart: false }));
    expect(readFileSync(join(root, dayPath), 'utf8')).toBe(completed);
    const after = snapshot(root);expect([...before].filter(([path, data]) => after.get(path) !== data).map(([path]) => path)).toEqual([dayPath]);
    expect([...after.keys()].filter((path) => !before.has(path))).toEqual([created.path]);
    expect(setHabitCompletion(completed, habit, true, true)).toBe(completed);
    expect(() => changeHabit(archivedText + '\nOutside edit.', archived, { kind: 'resume', date: '2026-10-01', restart: false })).toThrow('changed outside');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
