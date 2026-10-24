import { parse } from 'yaml';

export type Properties = Record<string, unknown>;

export interface ParsedNote {
  properties: Properties;
  body: string;
  /** Set when the note has a frontmatter block that isn't valid YAML. */
  error?: string;
}

// Obsidian's frontmatter: a `---` line at the very top, YAML, then a closing `---` line.
const FRONTMATTER = /^---\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

/**
 * Splits a note into its frontmatter properties and Markdown body.
 * When the frontmatter can't be parsed the body keeps the whole text, so nothing is hidden.
 */
export function parseNote(text: string): ParsedNote {
  const match = FRONTMATTER.exec(text);
  if (!match) return { properties: {}, body: text };

  let data: unknown;
  try {
    data = parse(match[1] ?? '');
  } catch (err) {
    return { properties: {}, body: text, error: err instanceof Error ? err.message : String(err) };
  }
  if (data === null || data === undefined) {
    return { properties: {}, body: text.slice(match[0].length) };
  }
  if (typeof data !== 'object' || Array.isArray(data)) {
    return { properties: {}, body: text, error: 'Frontmatter is not a set of properties' };
  }
  return { properties: data as Properties, body: text.slice(match[0].length) };
}

/** How a property value reads in the properties block. */
export function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.length ? value.map(formatValue).join(', ') : '—';
  if (typeof value === 'string') return value || '—';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null || value === undefined) return '—';
  return JSON.stringify(value);
}
