import { isMap, isScalar, parseDocument } from 'yaml';
import { parseNote } from '../frontmatter';
import { lineEnding } from '../text';

/** Edit one frontmatter value, leaving every other byte intact, including comments and body. */
export function setBaseProperty(text: string, key: string, before: unknown, after: unknown): string {
  if (!key.trim() || /[\r\n\0]/.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Choose a valid property name.');
  const newline = lineEnding(text); if (!newline) throw new Error('This note mixes line endings.');
  const parsed = parseNote(text); if (parsed.error) throw new Error('Fix this note’s properties in its editor first.');
  const exact = Object.hasOwn(parsed.properties, key) ? key : Object.keys(parsed.properties).find((candidate) => candidate.toLowerCase() === key.toLowerCase()) ?? key;
  const current = Object.hasOwn(parsed.properties, exact) ? parsed.properties[exact] : null;
  if (JSON.stringify(current ?? null) !== JSON.stringify(before ?? null)) throw new Error('This property changed outside the table. Reload the note before editing it again.');
  if (JSON.stringify(current ?? null) === JSON.stringify(after ?? null)) return text;
  const encoded = JSON.stringify(after ?? null);
  if (encoded === undefined || encoded.length > 100000) throw new Error('This property is too large.');
  const match = /^---\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!match) return `---${newline}${JSON.stringify(key)}: ${encoded}${newline}---${newline}${newline}${text}`;
  const yaml = match[1] ?? '', doc = parseDocument(yaml);
  if (!yaml.trim()) { const offset = 3 + newline.length; return text.slice(0, offset) + `${JSON.stringify(key)}: ${encoded}${newline}` + text.slice(offset); }
  if (doc.errors.length || !isMap(doc.contents)) throw new Error('This note needs a valid properties map.');
  const matches = doc.contents.items.filter((item) => isScalar(item.key) && item.key.value === exact);
  if (matches.length > 1) throw new Error('This property has duplicate definitions. Resolve them in the note editor.');
  const offset = 3 + newline.length, pair = matches[0];
  if (!pair) { const at = offset + yaml.length; return text.slice(0, at) + newline + JSON.stringify(key) + ': ' + encoded + text.slice(at); }
  const range = pair.value && 'range' in pair.value ? pair.value.range : undefined;
  if (!range) throw new Error('This value cannot be edited safely here. Use the note editor.');
  // An alias can be replaced locally; its anchor and all other references remain untouched.
  const original = yaml.slice(range[0], range[1]);
  const replacement = (yaml[range[0] - 1] === ':' ? ' ' : '') + encoded + (original.endsWith(newline) ? newline : '');
  return text.slice(0, offset + range[0]) + replacement + text.slice(offset + range[1]);
}
