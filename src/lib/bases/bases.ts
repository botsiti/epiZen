import { parse, stringify } from 'yaml';
import { lineEnding } from '../text';
import { resolveLink } from '../links';
import { compareValues, compileExpression, type Lookup, type Value } from './expression';
import { dateTime, equalValues, numericValue, plainValue, textValue } from './values';
import { FILE_PROPERTIES, PROPERTY_LABELS, fileValue, propertyValue, type BaseRow } from './rows';
export { baseRows, propertyValue, type BaseRow } from './rows';
export interface BaseSort { property: string; direction: 'ASC' | 'DESC' }
export interface BaseColumn { property: string; label: string; width?: number }
export type Filter = string | { and: Filter[] } | { or: Filter[] } | { not: Filter[] };
export interface BaseView {
  unavailable?: string;
  name: string; type: 'table' | 'cards' | 'list'; columns: BaseColumn[]; sort: BaseSort[];
  accepts: (row: BaseRow) => boolean; value: (row: BaseRow, property: string) => Value;
  filters?: Filter; limit?: number; groupBy?: BaseSort; groupOrder?: Value[];
  summaries: Record<string, string>; summaryDefinitions: Record<string, string>;
  image?: string; imageFit: 'cover' | 'contain'; imageAspectRatio: number; cardSize: number;
  listMarker: 'bullet' | 'number' | 'none'; indent: boolean; listSeparator: string;
}
export interface BaseDefinition { views: BaseView[]; filters?: Filter; formulas: Record<string, string>; properties: Record<string, unknown> }
export interface BaseContext { rows?: BaseRow[]; path?: string }
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const own = (value: Record<string, unknown>, key: string) => Object.hasOwn(value, key) ? value[key] : undefined;
export const lookupRow = (row: BaseRow): Lookup => (property) => propertyValue(row, property);
export function validProperty(property: string): string {
  if (!property.trim() || /[\r\n]/.test(property)) throw new Error('Choose a property name.');
  if (property.startsWith('file.') && !(FILE_PROPERTIES as readonly string[]).includes(property)) throw new Error(`Unknown file property “${property}”.`);
  return property;
}
function strings(value: unknown, label: string): Record<string, string> {
  if (value === undefined) return {};
  if (!object(value) || Object.values(value).some((item) => typeof item !== 'string')) throw new Error(`${label} must map names to expressions.`);
  return value as Record<string, string>;
}
function compileFilter(value: unknown, depth = 0): (read: Lookup) => boolean {
  if (depth > 24) throw new Error('These filters are nested too deeply.');
  if (value === undefined) return () => true;
  if (typeof value === 'string') { const evaluate = compileExpression(value); return (read) => Boolean(evaluate(read)); }
  if (!object(value) || Object.keys(value).length !== 1) throw new Error('Filters must be expressions or an and, or, or not group.');
  const key = Object.keys(value)[0]!, values = value[key];
  if (!['and', 'or', 'not'].includes(key) || !Array.isArray(values)) throw new Error('Invalid filter group.');
  const children = values.map((item) => compileFilter(item, depth + 1));
  return (read) => key === 'and' ? children.every((f) => f(read)) : key === 'or' ? children.some((f) => f(read)) : !children.some((f) => f(read));
}
function readFor(row: BaseRow, formulas: Map<string, (read: Lookup) => Value>, context: BaseContext): Lookup {
  const seen = new Set<string>(), cache = new Map<string, Value>();
  const read: Lookup = (property) => {
    if (property.startsWith('@file:')) { const path = property.slice(6); const match = resolveLink(path, (context.rows ?? [row]).map((r) => r.file), row.path); const found = (context.rows ?? [row]).find((item) => item.path === match?.path); return found ? fileValue(found) : null; }
    if (property === 'this' || property.startsWith('this.')) {
      const current = context.rows?.find((item) => item.path === context.path);
      if (!current) return null;
      return property === 'this' ? fileValue(current) : propertyValue(current, property.slice(5));
    }
    if (property.startsWith('formula.')) {
      const name = property.slice(8); if (cache.has(name)) return cache.get(name)!;
      if (seen.has(name)) throw new Error(`Circular formula: ${name}.`);
      const expression = formulas.get(name); if (!expression) throw new Error(`Unknown formula: ${name}.`);
      seen.add(name); const result = expression(read); seen.delete(name); cache.set(name, result); return result;
    }
    return propertyValue(row, property);
  };
  return read;
}
function sorting(value: unknown): BaseSort {
  if (!object(value) || typeof value.property !== 'string' || !['ASC', 'DESC'].includes(String(value.direction).toUpperCase())) throw new Error('A sort needs a property and ASC or DESC direction.');
  return { property: validProperty(value.property), direction: String(value.direction).toUpperCase() as BaseSort['direction'] };
}
/** Obsidian's YAML remains the source of truth. No private sidecar or conversion is needed. */
export function parseBase(source: string, context: BaseContext = {}): BaseDefinition {
  if (source.length > 1_000_000) throw new Error('This base is too large to display.');
  const doc: unknown = parse(source, { maxAliasCount: 50 });
  if (!object(doc) || !Array.isArray(doc.views) || !doc.views.length) throw new Error('A base needs at least one view.');
  if (doc.views.length > 100) throw new Error('This base has too many views.');
  const formulas = strings(doc.formulas, 'Formulas'), summaryDefinitions = strings(doc.summaries, 'Summaries');
  const compiled = new Map(Object.entries(formulas).map(([key, expression]) => {
    try { return [key, compileExpression(expression)] as const; }
    catch (error) { return [key, () => { throw error; }] as const; }
  }));
  const overall = compileFilter(doc.filters), properties = object(doc.properties) ? doc.properties : {};
  const readers = new WeakMap<BaseRow, Lookup>();
  const reader = (row: BaseRow) => { let read = readers.get(row); if (!read) { read = readFor(row, compiled, context); readers.set(row, read); } return read; };
  return { filters: doc.filters as Filter | undefined, formulas, properties, views: doc.views.map((raw, index): BaseView => {
    if (!object(raw)) throw new Error('A view must be a configuration map.');
    const available = ['table', 'cards', 'list'].includes(String(raw.type));
    const name = typeof raw.name === 'string' ? raw.name : `View ${index + 1}`;
    const order = raw.order ?? ['file.name'];
    if (!Array.isArray(order) || order.length > 100 || !order.every((item) => typeof item === 'string')) throw new Error('Columns must be a list of property names.');
    const widths = object(raw.columnSize) ? raw.columnSize : {};
    const columns = order.map((property: string) => {
      validProperty(property);
      if (property.startsWith('formula.') && !Object.hasOwn(formulas, property.slice(8))) throw new Error(`Unknown formula: ${property.slice(8)}.`);
      const settings = own(properties, property) ?? own(properties, property.replace(/^note\./, '')) ?? own(properties, `note.${property}`);
      const label = object(settings) && typeof settings.displayName === 'string' ? settings.displayName : PROPERTY_LABELS[property] ?? property.replace(/^(note|formula)\./, '');
      const width = widths[property] ?? widths[`note.${property}`];
      return { property, label, ...(typeof width === 'number' && width > 0 ? { width: Math.min(1200, Math.max(64, width)) } : {}) };
    });
    const sort = raw.sort ?? []; if (!Array.isArray(sort)) throw new Error('Sort must be a list.');
    if (raw.limit !== undefined && (typeof raw.limit !== 'number' || !Number.isInteger(raw.limit) || raw.limit < 0)) throw new Error('The row limit must be a non-negative whole number.');
    const filter = compileFilter(raw.filters);
    const summaries = strings(raw.summaries, 'Column summaries');
    return { name, type: available ? raw.type as BaseView['type'] : 'table', ...(!available ? { unavailable: `This view type is unavailable (${String(raw.type)}). Other views and the source remain available.` } : {}), columns, sort: sort.map(sorting), filters: raw.filters as Filter | undefined, accepts: (row) => overall(reader(row)) && filter(reader(row)), value: (row, property) => reader(row)(property), limit: raw.limit, groupBy: raw.groupBy === undefined ? undefined : sorting(raw.groupBy), groupOrder: Array.isArray(raw.groupOrder) ? raw.groupOrder.map((item) => plainValue(item)) : undefined, summaries, summaryDefinitions, image: typeof raw.image === 'string' ? raw.image : undefined, imageFit: raw.imageFit === 'contain' ? 'contain' : 'cover', imageAspectRatio: typeof raw.imageAspectRatio === 'number' && raw.imageAspectRatio > 0 ? Math.min(4, raw.imageAspectRatio) : 1, cardSize: typeof raw.cardSize === 'number' ? Math.min(500, Math.max(120, raw.cardSize)) : 240, listMarker: raw.listMarker === 'number' || raw.listMarker === 'none' ? raw.listMarker : 'bullet', indent: raw.indent === true, listSeparator: typeof raw.listSeparator === 'string' ? raw.listSeparator : ', ' };
  }) };
}
export function queryBase(rows: BaseRow[], view: BaseView, sort = view.sort): BaseRow[] {
  const result = rows.filter((row) => !row.error && view.accepts(row)).toSorted((a, b) => {
    for (const order of sort) { const left = view.value(a, order.property), right = view.value(b, order.property); const cmp = left === null || right === null ? compareValues(left, right) : compareValues(left, right) * (order.direction === 'DESC' ? -1 : 1); if (cmp) return cmp; }
    return a.path.localeCompare(b.path, undefined, { numeric: true });
  });
  return view.limit === undefined ? result : result.slice(0, view.limit);
}
export function groupRows(rows: BaseRow[], view: BaseView): { value: Value; label: string; rows: BaseRow[] }[] {
  if (!view.groupBy) return [{ value: null, label: '', rows }];
  const groups: { value: Value; label: string; rows: BaseRow[] }[] = [];
  for (const row of rows) { const value = view.value(row, view.groupBy.property); let group = groups.find((item) => equalValues(item.value, value)); if (!group) { group = { value, label: textValue(value) || 'No value', rows: [] }; groups.push(group); } group.rows.push(row); }
  if (view.groupOrder) return view.groupOrder.flatMap((value) => groups.find((group) => equalValues(group.value, value)) ?? []);
  return groups.toSorted((a, b) => compareValues(a.value, b.value) * (view.groupBy!.direction === 'DESC' ? -1 : 1));
}
export const SUMMARY_NAMES = ['Average', 'Min', 'Max', 'Sum', 'Range', 'Median', 'Stddev', 'Earliest', 'Latest', 'Checked', 'Unchecked', 'Empty', 'Filled', 'Unique'] as const;
export function summarize(values: Value[], name: string, definitions: Record<string, string> = {}): Value {
  const present = values.filter((v) => v !== null && v !== '' && (!Array.isArray(v) || v.length > 0));
  const numbers = present.map(numericValue).filter((value): value is number => value !== undefined).toSorted((a, b) => a - b);
  const sum = numbers.reduce((a, b) => a + b, 0), mean = numbers.length ? sum / numbers.length : null, middle = Math.floor(numbers.length / 2);
  if (definitions[name]) return compileExpression(definitions[name])((key) => key === 'values' ? values : null);
  switch (name) {
    case 'Empty': return values.length - present.length;
    case 'Filled': return present.length;
    case 'Unique': return present.filter((v, i) => present.findIndex((other) => equalValues(v, other)) === i).length;
    case 'Checked': return values.filter((v) => v === true).length;
    case 'Unchecked': return values.filter((v) => v === false).length;
    case 'Average': return mean;
    case 'Sum': return numbers.length ? sum : null;
    case 'Min': return numbers[0] ?? null;
    case 'Max': return numbers.at(-1) ?? null;
    case 'Median': return !numbers.length ? null : numbers.length % 2 ? numbers[middle]! : (numbers[middle - 1]! + numbers[middle]!) / 2;
    case 'Stddev': return mean === null ? null : Math.sqrt(numbers.reduce((total, n) => total + (n - mean) ** 2, 0) / numbers.length);
    case 'Range': return numbers.length ? numbers.at(-1)! - numbers[0]! : null;
    case 'Earliest': case 'Latest': { const dates = present.filter((value) => dateTime(value) !== undefined).toSorted(compareValues); return name === 'Earliest' ? dates[0] ?? null : dates.at(-1) ?? null; }
    default: throw new Error(`Unknown summary: ${name}.`);
  }
}
export interface TableDraft { name: string; folder: string; columns: string[]; filters: { property: string; operator: string; value: string }[]; sort: BaseSort }
export function tableSource(draft: TableDraft): string {
  if (!draft.name.trim()) throw new Error('Give this view a name.');
  if (!draft.columns.length) throw new Error('Choose at least one column.');
  const clauses = ['file.ext == "md"', ...(draft.folder ? [`file.inFolder(${JSON.stringify(draft.folder)})`] : [])];
  for (const item of draft.filters) {
    if (!item.property || !['==', '!=', '>', '<', '>=', '<=', 'contains'].includes(item.operator)) throw new Error('Choose a property and comparison for each filter.');
    const property = item.property.startsWith('file.') ? validProperty(item.property) : `note[${JSON.stringify(item.property.replace(/^note\./, ''))}]`;
    const value = /^-?\d+(?:\.\d+)?$/.test(item.value) ? Number(item.value) : item.value === 'true' ? true : item.value === 'false' ? false : item.value;
    clauses.push(item.operator === 'contains' ? `${property}.contains(${JSON.stringify(value)})` : `${property} ${item.operator} ${JSON.stringify(value)}`);
  }
  const source = stringify({ ...(clauses.length ? { filters: { and: clauses } } : {}), views: [{ type: 'table', name: draft.name.trim(), order: draft.columns.map(validProperty), sort: [draft.sort] }] });
  parseBase(source);
  return source;
}

/** Adds exactly one fenced block, preserving every existing byte and the note's line endings. */
export function appendBase(text: string, source: string): string {
  const newline = lineEnding(text);
  if (!newline) throw new Error('This note mixes line endings. Add the table after normalizing them in your editor.');
  parseBase(source);
  // YAML names can contain backticks; choose a fence longer than any run in the source.
  const fence = '`'.repeat(Math.max(3, ...[...source.matchAll(/`+/g)].map((match) => match[0].length + 1)));
  const gap = text === '' || text.endsWith(newline + newline) ? '' : text.endsWith(newline) ? newline : newline + newline;
  return text + gap + fence + 'base' + newline + source.trimEnd().replace(/\r?\n/g, newline) + newline + fence + newline;
}
