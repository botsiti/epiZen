import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FOLDERS = ['Projects', 'Areas', 'Resources', 'Archive', 'Journal', 'People', 'Books', 'Ideas', 'Meetings', 'Recipes', 'Travel', 'Inbox'];

/**
 * A vault of `count` notes in twelve folders of uneven size, each linking to one to four
 * others, mostly to a few well-linked hubs, as real vaults do. Seeded, so it's the same each run.
 */
export function makeBigVault(dir: string, count = 2000) {
  let seed = 20261025;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const name = (i: number) => `Note ${String(i + 1).padStart(4, '0')}`;
  for (let i = 0; i < count; i += 1) {
    const folder = FOLDERS[Math.floor(rand() ** 1.6 * FOLDERS.length)] ?? 'Inbox';
    const links = Array.from({ length: 1 + Math.floor(rand() * 4) }, () => `[[${name(Math.floor(rand() ** 2.2 * count))}]]`);
    mkdirSync(join(dir, folder), { recursive: true });
    writeFileSync(join(dir, folder, `${name(i)}.md`), `# ${name(i)}\n\nSee ${links.join(', ')}.\n`);
  }
}
