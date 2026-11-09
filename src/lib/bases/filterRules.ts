import type { Filter } from './bases';
export interface FilterRule { property: string; operator: string; value: string; type: 'text' | 'number' | 'date' | 'checkbox' }
export const FILTER_OPERATORS = [['==', 'is'], ['!=', 'is not'], ['contains', 'contains'], ['!contains', 'does not contain'], ['>', 'is after / greater than'], ['<', 'is before / less than'], ['>=', 'is on or after / at least'], ['<=', 'is on or before / at most'], ['empty', 'is empty'], ['!empty', 'is not empty']] as const;
const propertyPattern = '(file\\.[\\w]+|(?:note|formula)\\.[\\w-]+|note\\["(?:[^"\\\\]|\\\\.)*"\\]|[\\w-]+)';
export function readFilterRule(source: string): FilterRule | undefined {
  const comparison = new RegExp(`^\\s*${propertyPattern}\\s*(==|!=|>=|<=|>|<)\\s*(.*?)\\s*$`).exec(source);
  const method = new RegExp(`^\\s*(!?)${propertyPattern}\\.(contains|isEmpty)\\((.*?)\\)\\s*$`).exec(source);
  const prop = comparison?.[1] ?? method?.[2]; if (!prop) return undefined;
  const raw = comparison?.[3] ?? method?.[4] ?? '';
  let value: unknown;
  try { value = raw ? JSON.parse(raw) as unknown : ''; } catch { const date = /^date\("([^"]+)"\)$/.exec(raw); if (!date) return undefined; value = date[1]; }
  if (!['string', 'number', 'boolean'].includes(typeof value)) return undefined;
  const property = prop.startsWith('note[') ? `note.${JSON.parse(prop.slice(5, -1)) as string}` : prop;
  return { property, operator: comparison?.[2] ?? `${method?.[1] ? '!' : ''}${method?.[3] === 'isEmpty' ? 'empty' : 'contains'}`, value: String(value), type: typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'checkbox' : /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? 'date' : 'text' };
}
export function writeFilterRule(rule: FilterRule): string {
  const property = rule.property.startsWith('file.') || rule.property.startsWith('formula.') ? rule.property : `note[${JSON.stringify(rule.property.replace(/^note\./, ''))}]`;
  const value = rule.type === 'number' ? (rule.value.trim() && Number.isFinite(Number(rule.value)) ? String(Number(rule.value)) : '0') : rule.type === 'checkbox' ? String(rule.value === 'true') : JSON.stringify(rule.value);
  if (rule.operator === 'empty' || rule.operator === '!empty') return `${rule.operator[0] === '!' ? '!' : ''}${property}.isEmpty()`;
  if (rule.operator === 'contains' || rule.operator === '!contains') return `${rule.operator[0] === '!' ? '!' : ''}${property}.contains(${value})`;
  return `${property} ${rule.operator} ${value}`;
}
export function filterGroup(filter: Filter | undefined): { operator: 'and' | 'or' | 'not'; children: Filter[] } {
  if (!filter) return { operator: 'and', children: [] };
  if (typeof filter === 'string') return { operator: 'and', children: [filter] };
  const operator = Object.keys(filter)[0] as 'and' | 'or' | 'not';
  return { operator, children: (filter as Record<string, Filter[]>)[operator] ?? [] };
}

/** Only unambiguous AND folder constraints can suggest a creation location. */
export function filterFolder(filter: Filter | undefined): string | undefined {
  if (!filter) return undefined;
  if (typeof filter === 'string') {
    const rule = readFilterRule(filter);
    if (rule?.property === 'file.folder' && rule.operator === '==') return rule.value;
    const folder = /^file\.inFolder\(("(?:[^"\\]|\\.)*")\)$/.exec(filter.trim());
    return folder ? JSON.parse(folder[1]!) as string : undefined;
  }
  return 'and' in filter ? filter.and.map(filterFolder).find((folder) => folder !== undefined) : undefined;
}
