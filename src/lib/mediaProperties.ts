import { isMap, isScalar, isSeq, parseDocument } from 'yaml';
import { field } from './library';
import { parseNote } from './frontmatter';
import { lineEnding } from './text';

export interface ListChange { key: string; before: string[]; after: string[] }
export const propertyList = (value: unknown): string[] => (Array.isArray(value) ? value : value == null ? [] : [value]).flatMap((item) => typeof item === 'string' || typeof item === 'number' ? [String(item).trim()].filter(Boolean) : []);

/** Replace only the selected YAML value, preserving the surrounding note and other properties. */
export function setMediaLists(text: string, changes: readonly ListChange[]): string {
  for (const change of changes) {
    if (!/^[\w -]+$/.test(change.key)) throw new Error('Invalid property name.');
    const eol = lineEnding(text);
    const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
    if (!eol || !match) throw new Error('This note needs valid frontmatter before its properties can be edited.');
    const source = match[1] ?? '';
    const doc = parseDocument(source);
    if (doc.errors.length || !isMap(doc.contents)) throw new Error('The note’s properties are not readable.');
    const current = propertyList(field(parseNote(text).properties, change.key));
    if (JSON.stringify(current) !== JSON.stringify(change.before)) throw new Error(`${change.key} changed while editing. Reopen the editor to use the latest values.`);
    const values = [...new Set(change.after.map((value) => value.trim()).filter(Boolean))];
    if (values.some((value) => /[\r\n]/.test(value))) throw new Error('Each value must be a single line.');
    if (JSON.stringify(current) === JSON.stringify(values)) continue;
    const pairs = doc.contents.items.filter((pair) => isScalar(pair.key) && String(pair.key.value).toLowerCase() === change.key.toLowerCase());
    if (pairs.length > 1) throw new Error(`More than one ${change.key} property exists. Resolve it in the note editor first.`);
    const pair = pairs[0];
    if (pair?.value && !isScalar(pair.value) && !(isSeq(pair.value) && pair.value.items.every((item) => isScalar(item) && (typeof item.value === 'string' || typeof item.value === 'number')))) throw new Error('This property contains structured data. Edit it in the note editor.');
    const offset = 3 + eol.length;
    if (!pair) {
      const close = offset + source.length;
      text = text.slice(0, close) + eol + `${change.key}: ${JSON.stringify(values)}` + text.slice(close);
    } else {
      const range = pair.value && 'range' in pair.value ? pair.value.range : undefined;
      if (!range) throw new Error('This property cannot be edited here.');
      const old = source.slice(range[0], range[1]);
      const prefix = range[0] > 0 && source[range[0] - 1] === ':' ? ' ' : '';
      const replacement = prefix + JSON.stringify(values) + (old.endsWith(eol) ? eol : '');
      text = text.slice(0, offset + range[0]) + replacement + text.slice(offset + range[1]);
    }
  }
  return text;
}
