import type { VaultFile } from '../api';
import { parseNote } from '../frontmatter';
import { findWikilinks, noteFolder, noteTitle, resolveLink } from '../links';
import { dateValue, ownValue, plainValue, type Value } from './values';

export interface BaseRow { path: string; properties: Record<string, unknown>; file: VaultFile; metadata?: Record<string, Value>; error?: string }
export const FILE_PROPERTIES = ['file.name', 'file.basename', 'file.fullname', 'file.path', 'file.folder', 'file.ext', 'file.ctime', 'file.cday', 'file.mtime', 'file.size', 'file.tags', 'file.links', 'file.backlinks', 'file.embeds', 'file.properties', 'file.file'] as const;
export const PROPERTY_LABELS: Record<string, string> = { 'file.name': 'Name', 'file.basename': 'Base name', 'file.fullname': 'Full name', 'file.path': 'Path', 'file.folder': 'Folder', 'file.ext': 'Extension', 'file.ctime': 'Created', 'file.cday': 'Created date', 'file.mtime': 'Modified', 'file.size': 'Size', 'file.tags': 'Tags', 'file.links': 'Links', 'file.backlinks': 'Backlinks', 'file.embeds': 'Embeds', 'file.properties': 'All properties', 'file.file': 'File' };
export const canonicalProperty = (property: string) => /^(file|formula|note)\./.test(property) ? property : `note.${property}`;
const asLink = (path: string, label?: string): Value => ({ $kind: 'link', path, label: label ?? noteTitle(path) });
function noteValue(value: unknown, files: VaultFile[], path: string): Value {
  const data = plainValue(value);
  const convert = (item: Value, depth = 0): Value => {
    if (depth > 16) return null;
    if (Array.isArray(item)) return item.map((value) => convert(value, depth + 1));
    if (typeof item === 'string') {
      const link = /^\[\[([^|\]]+)(?:\|([^\]]+))?\]\]$/.exec(item);
      if (link) return asLink(resolveLink(link[1]!.split('#')[0]!, files, path)?.path ?? link[1]!, link[2]);
    }
    return item;
  };
  return convert(data);
}
export function fileValue(row: BaseRow): Value {
  const extension = row.path.split('.').at(-1) ?? '';
  const properties = plainValue(row.properties);
  return { $kind: 'file', name: noteTitle(row.path), basename: row.path.split('/').at(-1)!.replace(/\.[^.]+$/, ''), fullname: row.path.split('/').at(-1)!, path: row.path, folder: noteFolder(row.path), ext: extension, ctime: row.file.created === undefined ? null : dateValue(new Date(row.file.created).toISOString()), cday: row.file.created === undefined ? null : new Date(row.file.created).toISOString().slice(0, 10), mtime: row.file.modified === undefined ? null : dateValue(new Date(row.file.modified).toISOString()), size: row.file.size ?? null, tags: [], links: [], backlinks: [], embeds: [], properties, ...row.metadata };
}
/** One in-memory metadata index, derived exclusively from the vault's files. */
export function baseRows(files: VaultFile[], texts: ReadonlyMap<string, string>): BaseRow[] {
  const incoming = new Map<string, Value[]>();
  const rows = files.map((file): BaseRow => {
    const text = texts.get(file.path);
    const parsed = file.kind === 'note' ? text === undefined ? { properties: {}, body: '', error: 'This note could not be read.' } : parseNote(text) : { properties: {}, body: '' };
    const clean = (text ?? '').replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\1\s*$/gm, '').replace(/`[^`\n]+`/g, '').replace(/<!--[\s\S]*?-->/g, '');
    const links = findWikilinks(clean).map((link) => ({ ...link, path: resolveLink(link.target, files, file.path)?.path ?? link.target }));
    const properties = Object.fromEntries(Object.entries(parsed.properties).map(([key, value]) => [key, noteValue(value, files, file.path)]));
    const rawTags = parsed.properties.tags;
    const tags = [...new Set([...(Array.isArray(rawTags) ? rawTags : typeof rawTags === 'string' ? rawTags.split(/[,\s]+/) : []).filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.replace(/^#/, '')), ...[...parsed.body.replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\1\s*$/gm, '').replace(/`[^`\n]+`/g, '').matchAll(/(?:^|\s)#([\p{L}_][\p{L}\p{N}_/-]*)/gu)].map((match) => match[1]!)])];
    for (const target of new Set(links.map((link) => link.path))) incoming.set(target, [...incoming.get(target) ?? [], asLink(file.path)]);
    return { path: file.path, file, properties, error: parsed.error, metadata: { properties: plainValue(properties), tags, links: [...new Set(links.filter((link) => !link.embed).map((link) => link.path))].map((path) => asLink(path)), embeds: links.filter((link) => link.embed).map((link) => asLink(link.path)) } };
  });
  for (const row of rows) row.metadata = { ...row.metadata, backlinks: incoming.get(row.path) ?? [] };
  return rows;
}
export function propertyValue(row: BaseRow, property: string): Value {
  if (property === 'file' || property === 'file.file') return fileValue(row);
  if (property === 'note') return plainValue(row.properties);
  if (property.startsWith('file.')) return property.slice(5).split('.').reduce(ownValue, fileValue(row));
  const key = property.replace(/^note\./, '');
  if (Object.hasOwn(row.properties, key)) return plainValue(row.properties[key]);
  const matches = Object.keys(row.properties).filter((candidate) => candidate.toLowerCase() === key.toLowerCase());
  if (matches.length === 1) return plainValue(row.properties[matches[0]!]);
  if (key.includes('.')) { const [head, ...rest] = key.split('.'); return rest.reduce(ownValue, plainValue(row.properties[head!])); }
  return null;
}
