import { parseDocument, isMap, isSeq, type YAMLMap } from 'yaml';
import { lineEnding } from '../text';
import type { BaseSort, Filter } from './bases';
import { parseNote } from '../frontmatter';

export interface ViewPatch { name?: string; type?: 'table' | 'cards' | 'list'; order?: string[]; filters?: Filter | null; sort?: BaseSort[]; groupBy?: BaseSort | null; image?: string | null; cardSize?: number; imageFit?: string; imageAspectRatio?: number; indent?: boolean; listMarker?: string; listSeparator?: string; limit?: number | null }
export interface BasePatch { view: number; changes?: ViewPatch; allFilters?: Filter | null; addView?: { name: string; type: 'table' | 'cards' | 'list' }; deleteView?: boolean; renameProperty?: { property: string; label: string }; formula?: { name: string; expression: string }; summaries?: Record<string, string>; }
/** Only requested YAML nodes change. Unknown keys, comments, other views and quoting survive. */
export function patchBase(source: string, patch: BasePatch): string {
  const doc = parseDocument(source, { keepSourceTokens: true });
  if (doc.errors.length || !isMap(doc.contents)) throw new Error('Fix the YAML source before changing this base.');
  const views = doc.get('views', true);
  if (!isSeq(views)) throw new Error('This base needs a views list.');
  const selected = views.items[patch.view];
  if (!isMap(selected)) throw new Error('The selected view is no longer available.');
  const name = patch.addView?.name ?? patch.changes?.name;
  if (name !== undefined && (!name.trim() || views.items.some((view, index) => (Boolean(patch.addView) || index !== patch.view) && isMap(view) && view.get('name') === name.trim()))) throw new Error('Choose a unique view name.');
  const order = selected.get('order', true);
  if (patch.addView) views.add(doc.createNode({ type: patch.addView.type, name: patch.addView.name.trim() || 'Untitled view', order: isSeq(order) ? order.toJSON() as unknown : ['file.name'] }));
  if (patch.deleteView) { if (views.items.length < 2) throw new Error('Keep at least one view.'); views.delete(patch.view); }
  if (patch.allFilters !== undefined) { if (patch.allFilters === null) doc.delete('filters'); else doc.set('filters', doc.createNode(patch.allFilters)); }
  if (patch.changes) for (const [key, value] of Object.entries(patch.changes)) { if (value === null || Array.isArray(value) && !value.length && key !== 'order') selected.delete(key); else selected.set(key, doc.createNode(value)); }
  const mapping = (name: string): YAMLMap => { let value = doc.get(name, true); if (!isMap(value)) { value = doc.createNode({}); doc.set(name, value); } return value as YAMLMap; };
  if (patch.renameProperty) {
    const properties = mapping('properties'); const existing = properties.get(patch.renameProperty.property, true);
    if (isMap(existing)) existing.set('displayName', patch.renameProperty.label);
    else properties.set(patch.renameProperty.property, doc.createNode({ displayName: patch.renameProperty.label }));
  }
  if (patch.formula) { if (!patch.formula.name.trim()) throw new Error('Give the formula a name.'); mapping('formulas').set(patch.formula.name, patch.formula.expression); }
  if (patch.summaries) selected.set('summaries', doc.createNode(patch.summaries));
  const separator = lineEnding(source); if (!separator) throw new Error('This base mixes line endings. Save a consistent source before changing its views.');
  let result = doc.toString({ lineWidth: 0 }).replace(/\r?\n/g, separator);
  if (!source.endsWith('\n')) result = result.replace(/\r?\n$/, '');
  return result;
}
/** Replaces only the fenced block the user edited, requiring the original block to still match. */
function matchingBlocks(text: string, before: string) {
  return [...text.matchAll(/^([ \t]*)(`{3,}|~{3,})base[^\r\n]*\r?\n([\s\S]*?)^\1\2[ \t]*(?=\r?$)/gm)].filter((match) => match[3]!.replace(/\r?\n$/, '').replaceAll('\r\n', '\n') === before.replaceAll('\r\n', '\n'));
}
export function baseBlockOccurrence(body: string, before: string, offset: number): number {
  return matchingBlocks(body, before).filter((match) => match.index < offset).length;
}
export function replaceBaseBlock(text: string, before: string, after: string, occurrence: number): string {
  const { body } = parseNote(text), prefix = text.slice(0, text.length - body.length);
  const matches = matchingBlocks(body, before);
  const match = matches[occurrence]; if (!match) throw new Error('This base block changed outside this view. Reopen it before saving.');
  const newline = lineEnding(text); if (!newline) throw new Error('This note mixes line endings.');
  const fence = match[2]!;
  if (new RegExp(`^${fence[0]}{${fence.length},}`, 'm').test(after)) throw new Error('The base source contains a closing fence. Edit the note source to use a longer fence.');
  const normalized = after.trimEnd().replace(/\r?\n/g, newline);
  const firstLineEnd = match[0].indexOf('\n') + 1;
  const replacement = match[0].slice(0, firstLineEnd) + normalized + newline + match[1]! + fence;
  return prefix + body.slice(0, match.index) + replacement + body.slice(match.index + match[0].length);
}
