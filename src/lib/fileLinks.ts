import type { LinkTarget } from './completion';
import type { FilePreferences } from './filePreferences';
import { encodeLinkPath, noteFolder, noteTitle, relativeLinkPath } from './links';

export function noteLinkTargets(
  paths: readonly string[],
  from: string,
  settings: Pick<FilePreferences, 'linkFormat' | 'wikilinks'>,
  future: readonly { path: string; detail: string }[],
): LinkTarget[] {
  const identity = (path: string) => path.normalize('NFC').toLowerCase();
  const titles = new Map<string, number>();
  for (const path of paths) {
    const key = identity(noteTitle(path));
    titles.set(key, (titles.get(key) ?? 0) + 1);
  }
  const targets = [
    ...paths.map((path) => ({ path, detail: noteFolder(path) || undefined })),
    ...future.filter(({ path }) => !titles.has(identity(noteTitle(path)))),
  ];
  return targets.map(({ path, detail }) => {
    const label = noteTitle(path);
    const relative = relativeLinkPath(from, `${path}.md`);
    const relativeWiki = relative.slice(0, -3);
    const insert = settings.linkFormat === 'relative'
      ? relativeWiki.startsWith('../') ? relativeWiki : `./${relativeWiki}`
      : settings.linkFormat === 'vault' || (titles.get(identity(label)) ?? 0) > 1
        ? path.includes('/') ? path : `/${path}`
        : label;
    if (settings.wikilinks) return { label, detail, insert };
    const destination = settings.linkFormat === 'vault' ? `/${path}.md` : relative;
    return { label, detail, markdown: `[${label.replace(/[\\[\]]/g, '\\$&')}](${encodeLinkPath(destination)})` };
  });
}
