// @vitest-environment node
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
const snapshotVault = (root: string) => new Map(readdirSync(root, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => { const path = join(entry.parentPath, entry.name); return [relative(root, path), readFileSync(path).toString('base64')]; }));
const diffSnapshots = (a: Map<string, string>, b: Map<string, string>) => [...new Set([...a.keys(), ...b.keys()])].filter((path) => a.get(path) !== b.get(path)).map((path) => `changed: ${path}`);
import { field, kindOfPath } from '../src/lib/library';
import { parseNote } from '../src/lib/frontmatter';
import { propertyList, setMediaLists } from '../src/lib/mediaProperties';

describe('editing media properties on a demo vault copy', () => {
  it('changes only the requested fields in each note and keeps every other file identical', () => {
    const temporary = mkdtempSync(join(tmpdir(), 'epizen-media-properties-'));
    const copy = join(temporary, 'vault');
    try {
      cpSync('demo-vault', copy, { recursive: true });
      const paths = [...snapshotVault(copy).keys()].filter((path) => kindOfPath(path)?.keys.genre);
      expect(paths.length).toBeGreaterThan(20);
      for (const path of paths) {
        const spec = kindOfPath(path)!;
        const before = snapshotVault(copy);
        const note = readFileSync(join(copy, path), 'utf8');
        const parsed = parseNote(note);
        const key = spec.keys.genre!;
        const change = { key, before: propertyList(field(parsed.properties, key)), after: ['test genre', 'test: quoted'] };
        const edited = setMediaLists(note, [change, { key: 'tags', before: propertyList(parsed.properties.tags), after: ['relisten'] }]);
        writeFileSync(join(copy, path), edited);
        expect(diffSnapshots(before, snapshotVault(copy))).toEqual([`changed: ${path}`]);
        expect(parseNote(edited).body).toBe(parsed.body);
        expect(setMediaLists(edited, [{ ...change, before: change.after }])).toBe(edited);
        writeFileSync(join(copy, path), note);
      }
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  });
});
