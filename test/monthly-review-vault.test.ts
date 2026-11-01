// @vitest-environment node
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { expect, it } from 'vitest';
import { readMonthlySection, sphereValue, writeMonthlySection } from '../src/lib/monthlyReview';

const snapshotVault = (root: string) => new Map(readdirSync(root, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => {
  const path = join(entry.parentPath, entry.name);
  return [relative(root, path), readFileSync(path).toString('base64')];
}));
const diffSnapshots = (before: Map<string, string>, after: Map<string, string>) => [
  ...[...before].filter(([path, text]) => after.get(path) !== text).map(([path]) => `changed: ${path}`),
  ...[...after.keys()].filter((path) => !before.has(path)).map((path) => `added: ${path}`),
];

it('changes only the selected monthly note on a demo-vault copy', () => {
  const root = mkdtempSync(join(tmpdir(), 'epizen-monthly-review-'));
  try {
    const vault = join(root, 'vault');
    cpSync(new URL('../demo-vault', import.meta.url), vault, { recursive: true });
    const path = 'Calendar/2026/months 2026/09.26 RPG.md';
    const full = join(vault, path);
    const before = snapshotVault(vault);
    const original = readFileSync(full, 'utf8');
    let text = writeMonthlySection(original, 'summary', 'A calm month.', '');
    text = writeMonthlySection(text, 'expenses', 'Rent and travel.', '');
    text = writeMonthlySection(text, 'sphere:Health/Fitness', sphereValue('7', 'Rested well.'), '');
    writeFileSync(full, text);
    expect(diffSnapshots(before, snapshotVault(vault))).toEqual([`changed: ${path}`]);
    expect(text.startsWith(original)).toBe(true);
    expect(writeMonthlySection(text, 'summary', 'A calm month.', readMonthlySection(text, 'summary').snapshot)).toBe(text);
    const shown = readMonthlySection(text, 'summary');
    const outside = text.replace('A calm month.', 'Outside edit.');
    expect(() => writeMonthlySection(outside, 'summary', 'My draft.', shown.snapshot)).toThrow('changed outside');
    expect(readFileSync(full, 'utf8')).toBe(text);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
