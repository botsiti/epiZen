/** Values interpreted from Bases expressions. Tagged values never contain executable code. */
export type Value = string | number | boolean | null | Value[] | { [key: string]: Value };
export type Lookup = (property: string) => Value;
export const isRecord = (value: Value): value is Record<string, Value> => value !== null && typeof value === 'object' && !Array.isArray(value);
export const kind = (value: Value, name: string) => isRecord(value) && value.$kind === name;
export const ownValue = (value: Value, key: string): Value => isRecord(value) && Object.hasOwn(value, key) && !['__proto__', 'prototype', 'constructor'].includes(key) ? value[key] ?? null : null;
export function plainValue(value: unknown, depth = 0): Value {
  if (depth > 16) return null;
  if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((item) => plainValue(item, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !['__proto__', 'prototype', 'constructor'].includes(key)).map(([key, item]) => [key, plainValue(item, depth + 1)]));
  return null;
}
export function textValue(value: Value): string {
  if (value === null) return '';
  if (Array.isArray(value)) return value.map(textValue).join(', ');
  if (kind(value, 'date')) return textValue(ownValue(value, 'iso'));
  if (kind(value, 'file') || kind(value, 'link') || kind(value, 'image')) return textValue(ownValue(value, 'label')) || textValue(ownValue(value, 'path'));
  if (isRecord(value)) return JSON.stringify(value);
  return String(value);
}
export function dateValue(value: Value): Value {
  if (kind(value, 'date')) return value;
  const raw = textValue(value).replace(' ', 'T');
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(raw) || !Number.isFinite(Date.parse(raw))) return null;
  return { $kind: 'date', iso: raw };
}
export function dateTime(value: Value): number | undefined {
  const raw = kind(value, 'date') ? ownValue(value, 'iso') : value;
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:[T ].*)?$/.test(raw)) return undefined;
  const time = Date.parse(raw.replace(' ', 'T')); return Number.isFinite(time) ? time : undefined;
}
export function equalValues(a: Value, b: Value): boolean {
  if (a === b) return true;
  if ((kind(a, 'link') || kind(a, 'file')) && (kind(b, 'link') || kind(b, 'file'))) return ownValue(a, 'path') === ownValue(b, 'path');
  if (kind(a, 'date') || kind(b, 'date')) return dateTime(a) !== undefined && dateTime(a) === dateTime(b);
  return typeof a === 'object' && typeof b === 'object' && JSON.stringify(a) === JSON.stringify(b);
}
export function compareValues(a: Value, b: Value): number {
  if (equalValues(a, b)) return 0;
  if (a === null) return 1; if (b === null) return -1;
  const left = dateTime(a), right = dateTime(b);
  if (left !== undefined && right !== undefined) return left - right;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return textValue(a).localeCompare(textValue(b), undefined, { numeric: true });
}
export function containsValue(value: Value, part: Value): boolean {
  return Array.isArray(value) ? value.some((item) => equalValues(item, part)) : typeof value === 'string' && typeof part === 'string' && value.includes(part);
}
export function numericValue(value: Value): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return undefined;
  const number = Number(value); return Number.isFinite(number) ? number : undefined;
}
export function duration(value: Value): Value {
  if (kind(value, 'duration')) return value;
  const source = textValue(value);
  const pattern = /(-?\d+(?:\.\d+)?)\s*(ms|years?|y|months?|M|weeks?|w|days?|d|hours?|h|minutes?|m|seconds?|s)/g;
  const parts = [...source.matchAll(pattern)];
  if (!parts.length || source.replace(pattern, '').trim()) throw new Error('Use a duration such as “7d” or “1 month”.');
  let months = 0, ms = 0;
  for (const part of parts) {
    const n = Number(part[1]), unit = part[2]!;
    if (/^(y|year)/.test(unit)) months += n * 12;
    else if (unit === 'M' || unit.startsWith('month')) months += n;
    else ms += n * (unit === 'ms' ? 1 : unit.startsWith('w') ? 604800000 : unit.startsWith('d') ? 86400000 : unit.startsWith('h') ? 3600000 : unit.startsWith('m') ? 60000 : 1000);
  }
  return { $kind: 'duration', months, ms };
}
export function arithmetic(a: Value, b: Value, op: string): Value {
  if (a === null || b === null) return null;
  if (kind(a, 'date') && (kind(b, 'duration') || typeof b === 'string') && (op === '+' || op === '-')) {
    const offset = duration(b), sign = op === '+' ? 1 : -1, date = new Date(dateTime(a)!);
    date.setUTCMonth(date.getUTCMonth() + Number(ownValue(offset, 'months')) * sign);
    date.setTime(date.getTime() + Number(ownValue(offset, 'ms')) * sign);
    return dateValue(date.toISOString());
  }
  if (kind(a, 'date') && kind(b, 'date') && op === '-') return { $kind: 'duration', months: 0, ms: dateTime(a)! - dateTime(b)! };
  if (op === '+' && (typeof a === 'string' || typeof b === 'string')) {
    const left = textValue(a), right = textValue(b);
    if (left.length + right.length > 100000) throw new Error('This formula produces too much text.');
    return left + right;
  }
  const left = numericValue(a), right = numericValue(b);
  if (left === undefined || right === undefined) throw new Error(`“${op}” needs numbers or dates.`);
  const result = op === '+' ? left + right : op === '-' ? left - right : op === '*' ? left * right : op === '/' ? left / right : left % right;
  return Number.isFinite(result) ? result : null;
}
export function formatDateValue(value: Value, format: string): string | null {
  const time = dateTime(value); if (time === undefined) return null;
  const date = new Date(time), raw = kind(value, 'date') ? ownValue(value, 'iso') : value;
  const utc = typeof raw === 'string' && raw.length === 10;
  const year = utc ? date.getUTCFullYear() : date.getFullYear(), month = (utc ? date.getUTCMonth() : date.getMonth()) + 1, day = utc ? date.getUTCDate() : date.getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  const values: Record<string, string> = { YYYY: String(year), yyyy: String(year), YY: String(year).slice(-2), MM: pad(month), M: String(month), DD: pad(day), dd: pad(day), D: String(day), HH: pad(date.getHours()), mm: pad(date.getMinutes()), ss: pad(date.getSeconds()), MMMM: date.toLocaleDateString('en-US', { month: 'long', ...(utc ? { timeZone: 'UTC' } : {}) }), MMM: date.toLocaleDateString('en-US', { month: 'short', ...(utc ? { timeZone: 'UTC' } : {}) }), dddd: date.toLocaleDateString('en-US', { weekday: 'long', ...(utc ? { timeZone: 'UTC' } : {}) }), ddd: date.toLocaleDateString('en-US', { weekday: 'short', ...(utc ? { timeZone: 'UTC' } : {}) }) };
  return format.replace(/\[([^\]]*)\]|YYYY|yyyy|MMMM|dddd|MMM|ddd|YY|MM|DD|dd|HH|mm|ss|M|D/g, (token, literal: string | undefined) => literal ?? values[token] ?? token);
}
