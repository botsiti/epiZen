// @vitest-environment node
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
const snapshotVault = (root: string) => new Map(readdirSync(root, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => {
  const path = join(entry.parentPath, entry.name);
  return [relative(root, path), readFileSync(path).toString('base64')];
}));
const diffSnapshots = (before: Map<string, string>, after: Map<string, string>) => [
  ...[...before].filter(([path, text]) => after.get(path) !== text).map(([path]) => `changed: ${path}`),
  ...[...after.keys()].filter((path) => !before.has(path)).map((path) => `added: ${path}`),
];
import { createStarterVault, starterNotes } from '../src/lib/vaultSetup';
import { day } from '../src/lib/dates';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'epizen-setup-')); });
afterEach(() => rmSync(root, { recursive: true, force: true }));

it('preflights an existing demo-vault copy without changing any bytes', async () => {
  const vault = join(root, 'vault');
  cpSync(new URL('../demo-vault', import.meta.url), vault, { recursive: true });
  const before = snapshotVault(vault);
  let writes = 0;
  await expect(createStarterVault(starterNotes(day(2026, 9, 30)), [...before.keys()].filter((path) => path.endsWith('.md')).map((path) => ({ path, text: readFileSync(join(vault, path), 'utf8') })), () => { writes++; return Promise.resolve(); })).rejects.toThrow('empty folder');
  expect(writes).toBe(0);
  expect(diffSnapshots(before, snapshotVault(vault))).toEqual([]);
});

it('resumes after a failed creation using create-only writes and refuses a changed collision', async () => {
  const notes = starterNotes(day(2026, 9, 30));
  const created: typeof notes = [];
  const create = (path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text, { flag: 'wx' });
    created.push({ path, text });
    return Promise.resolve();
  };
  await expect(createStarterVault(notes, [], async (path, text) => {
    if (created.length === 2) throw new Error('Disk full');
    await create(path, text);
  })).rejects.toThrow('Disk full');
  const partial = snapshotVault(root);
  await createStarterVault(notes, [...created], create);
  expect(created).toHaveLength(notes.length);
  for (const note of notes) expect(readFileSync(join(root, note.path), 'utf8')).toBe(note.text);
  const completed = snapshotVault(root);
  expect(diffSnapshots(partial, completed).every((change) => change.startsWith('added: '))).toBe(true);
  await createStarterVault(notes, created, create);
  expect(diffSnapshots(completed, snapshotVault(root))).toEqual([]);
  await expect(createStarterVault(notes, [{ path: notes[0]!.path, text: 'Outside edit' }], create)).rejects.toThrow('empty folder');
  expect(diffSnapshots(completed, snapshotVault(root))).toEqual([]);
});
