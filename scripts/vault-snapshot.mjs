// Fingerprints every file in a vault so a test can prove nothing changed.
// Skips what other apps write on their own: Obsidian's settings folder, which it rewrites
// whenever the vault is open, and Finder's .DS_Store.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * @param {string} root
 * @returns {Map<string, string>} vault-relative path -> sha256 of the bytes
 */
export function snapshotVault(root) {
  /** @type {Map<string, string>} */
  const files = new Map();
  /** @param {string} dir */
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '.obsidian') walk(full);
      } else if (entry.name !== '.DS_Store') {
        const hash = createHash('sha256').update(readFileSync(full)).digest('hex');
        files.set(relative(root, full).split(sep).join('/'), hash);
      }
    }
  };
  walk(root);
  return files;
}

/**
 * @param {Map<string, string>} before
 * @param {Map<string, string>} after
 * @returns {string[]} one line per added, removed or changed file; empty when identical
 */
export function diffSnapshots(before, after) {
  const lines = [];
  for (const [path, hash] of before) {
    if (!after.has(path)) lines.push(`removed: ${path}`);
    else if (after.get(path) !== hash) lines.push(`changed: ${path}`);
  }
  for (const path of after.keys()) if (!before.has(path)) lines.push(`added: ${path}`);
  return lines.sort();
}
