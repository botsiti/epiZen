import type { VaultFile } from './api';
import { parseNote, type Properties } from './frontmatter';
import { coverEmbed, field, keyIn, yamlText, type KindSpec } from './library';
import { lineEnding } from './text';

// The writes a found cover makes to a note the library already has. Each returns the note's new
// text with every line it didn't mean to touch byte for byte as it was, or throws and changes
// nothing: the cover's embed added on its own paragraph, and the maker, year and genres the note
// leaves empty filled in, under the note's own spelling of each key. An existing value is never
// changed. Changing a cover only points its embed at the new image; the old file stays.

/** A property a found cover fills in, under the key the note spells it with (or the kind's). */
export interface Fill {
  name: 'maker' | 'year' | 'genre';
  key: string;
  value: string | string[];
}

/** What a cover found for a note brings besides itself. */
export interface Found {
  maker?: string;
  year?: string;
  genres: string[];
}

const empty = (value: unknown) => value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);

/**
 * The maker, year and genres a found cover would fill in: only those the note's kind has, that
 * the note leaves empty or doesn't have at all (in any case of its key), and that the find knows.
 */
export function coverFills(spec: KindSpec, properties: Properties, found: Found): Fill[] {
  const fills: Fill[] = [];
  const offer = (name: Fill['name'], value: string | string[] | undefined) => {
    const kindKey = spec.keys[name];
    if (!kindKey || value === undefined || !value.length || !empty(field(properties, kindKey))) return;
    fills.push({ name, key: keyIn(properties, kindKey) ?? kindKey, value });
  };
  offer('maker', found.maker?.trim() || undefined);
  offer('year', /^\d{4}$/.test(found.year ?? '') ? found.year : undefined);
  offer('genre', found.genres.map((genre) => genre.trim()).filter(Boolean));
  return fills;
}

// An overview link alone on its line: `[[00. Music 2026 MOC|music 2026]]`, `[[00.Music 2026 MOC]]`.
const OVERVIEW = /^[ \t]*\[\[00\.[^[\]\n]*\]\][ \t]*$/;
// A top-level property: `Year: 1994`, `favorite tracks:`, `"Director":`. Groups: the key in double quotes, in single quotes, or bare.
const PROPERTY = /^(?:"((?:[^"\\]|\\.)*)"|'((?:[^']|'')*)'|([^\s#:'"-][^:]*?))[ \t]*:(?=[ \t]|$)/;
// What an empty value looks like on its own line.
const EMPTY_VALUE = /^[ \t]*(?:~|null|""|''|\[\])?[ \t]*$/;
const SAFE_IMAGE = /^[^[\]|#^\n\r/\\]+\.(?:svg|png|jpe?g|gif|webp)$/i;

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

interface Split {
  eol: '\n' | '\r\n';
  lines: string[];
  /** The line of the closing `---`. */
  close: number;
  properties: Properties;
}

function split(text: string): Split {
  const eol = lineEnding(text);
  if (!eol) throw new Error("This note mixes line endings, so Epizen won't change it.");
  const lines = text.split(eol);
  if (lines[0] !== '---') throw new Error('This note has no properties.');
  const close = lines.findIndex((line, i) => i > 0 && /^---[ \t]*$/.test(line));
  if (close < 0) throw new Error("This note's properties never close.");
  const { properties, error } = parseNote(text);
  if (error) throw new Error(`This note's properties aren't readable: ${error}`);
  return { eol, lines, close, properties };
}

interface Block {
  /** The key as YAML reads it. */
  key: string;
  /** The key as the note writes it, quotes and all. */
  raw: string;
  start: number;
  end: number;
}

/** Each top-level property's lines in the block: its own and those carried on under it. */
function blocks(lines: string[], close: number): Block[] {
  const found: Block[] = [];
  for (let i = 1; i < close; i += 1) {
    const match = PROPERTY.exec(lines[i] ?? '');
    if (!match) continue;
    const key = match[1] !== undefined ? match[1].replace(/\\(.)/g, '$1') : match[2] !== undefined ? match[2].replaceAll("''", "'") : (match[3] ?? '');
    const raw = (lines[i] ?? '').slice(0, (lines[i] ?? '').indexOf(':', match[0].length - 1));
    const last = found.at(-1);
    if (last) last.end = i;
    found.push({ key, raw: raw.trimEnd(), start: i, end: close });
  }
  return found;
}

/** A fill's lines, under the key as the note writes it. */
const written = (fill: Fill, key = fill.key) =>
  Array.isArray(fill.value) ? [`${key}:`, ...fill.value.map((item) => `  - ${yamlText(item)}`)] : [`${key}: ${fill.name === 'year' && /^\d{1,4}$/.test(fill.value) ? fill.value : yamlText(fill.value)}`];

/** Writes one fill: over its key's empty line, or as new lines after the property the kind puts before it. Skipped when the key holds anything. */
function applyFill(lines: string[], close: number, spec: KindSpec, fill: Fill): number {
  const all = blocks(lines, close);
  const own = all.find((block) => block.key === fill.key);
  if (own) {
    const first = lines[own.start] ?? '';
    const rest = first.slice(first.indexOf(':') + 1);
    const carried = lines.slice(own.start + 1, own.end);
    // Anything in it at all, even only a comment, and it is left alone.
    if (!EMPTY_VALUE.test(rest) || carried.some((line) => line.trim())) return close;
    // Only the key's own line is replaced, its key as it was; blank lines after it stay.
    const lines2 = written(fill, own.raw);
    lines.splice(own.start, 1, ...lines2);
    return close + lines2.length - 1;
  }
  // A key the note doesn't have: placed where the kind's order puts it, after the nearest one before it that the note has.
  const order = spec.order.filter((name) => spec.keys[name]);
  const at = order.indexOf(fill.name);
  const has = (name: (typeof order)[number]) => {
    const kindKey = spec.keys[name] ?? '';
    return all.find((block) => block.key.toLowerCase() === kindKey.toLowerCase());
  };
  const before = order
    .slice(0, Math.max(0, at))
    .reverse()
    .map(has)
    .find(Boolean);
  const after = order
    .slice(at + 1)
    .map(has)
    .find(Boolean);
  const where = before ? before.end : after ? after.start : close;
  const added = written(fill);
  lines.splice(where, 0, ...added);
  return close + added.length;
}

/** The note being given a cover, and how its links find files, to be sure it has none yet. */
export interface CoverTarget {
  spec: KindSpec;
  path: string;
  resolve: (target: string, from: string) => VaultFile | undefined;
}

/**
 * Adds a cover to a note that has none: `![[image|width]]` on its own paragraph, right after the
 * overview link the body opens with (`[[00. Music 2026 MOC]]`), or else at the top of the body,
 * as a new note has it; and the fills, each only where the note's value is empty or missing.
 * `image` is the cover's vault path or file name.
 */
export function addCover(text: string, { spec, path, resolve }: CoverTarget, image: string, fills: Fill[] = []): string {
  const name = baseName(image);
  if (!SAFE_IMAGE.test(name)) throw new Error(`“${name}” isn't an image name Epizen can embed.`);
  const { eol, lines, close: start, properties } = split(text);
  if (coverEmbed(parseNote(text).body, path, resolve)) throw new Error('This note has a cover already.');
  let close = start;
  for (const fill of fills) {
    if (!empty(field(properties, fill.key))) continue;
    close = applyFill(lines, close, spec, fill);
  }

  const embed = `![[${name}|${spec.coverWidth}]]`;
  let first = close + 1;
  while (first < lines.length && !(lines[first] ?? '').trim()) first += 1;
  const opensWithOverview = first < lines.length && OVERVIEW.test(lines[first] ?? '');
  // Text right after it gets a blank line between, so the embed is a paragraph of its own.
  const at = opensWithOverview ? first + 1 : close + 1;
  const after = lines[at];
  const textFollows = after !== undefined && after.trim() !== '';
  lines.splice(at, 0, ...(opensWithOverview ? ['', embed] : [embed]), ...(textFollows ? [''] : []));
  const next = lines.join(eol);
  sameProperties(properties, next, fills);
  return next;
}

/**
 * Reads the new text's properties back and refuses it unless they are the old ones with nothing
 * but fills set: YAML the line-by-line edit didn't foresee is caught here, before anything is written.
 */
function sameProperties(before: Properties, text: string, fills: Fill[]) {
  const { properties: after, error } = parseNote(text);
  const refuse = () => new Error("Epizen couldn't fill in this note's properties without touching others, so it left the note as it is.");
  if (error) throw refuse();
  const filled = new Map(fills.filter((fill) => empty(field(before, fill.key))).map((fill) => [fill.key, fill.value]));
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const value = filled.get(key);
    const now = after[key];
    // A fill may have been left out (its line held a comment); a property is either as it was or exactly its fill.
    const kept = JSON.stringify(before[key]) === JSON.stringify(now);
    const filledIn = value !== undefined && (Array.isArray(value) ? JSON.stringify(now) === JSON.stringify(value) : String(now) === value);
    if (!kept && !filledIn) throw refuse();
  }
}

/**
 * Points a note's cover embed at another image, keeping its width or alias. Nothing else in the
 * note changes, and the old image file stays where it is.
 */
export function replaceCover(text: string, path: string, resolve: (target: string, from: string) => VaultFile | undefined, image: string): string {
  const name = baseName(image);
  if (!SAFE_IMAGE.test(name)) throw new Error(`“${name}” isn't an image name Epizen can embed.`);
  const { body } = parseNote(text);
  const cover = coverEmbed(body, path, resolve);
  if (!cover) throw new Error('This note has no cover to change.');
  const start = text.length - body.length + cover.link.index;
  const raw = text.slice(start, start + cover.link.length);
  const target = /^!\[\[([^[\]|#\n]*)/.exec(raw)?.[1];
  if (target === undefined) throw new Error("This note's cover isn't an embed Epizen can change.");
  return `${text.slice(0, start)}![[${name}${raw.slice(3 + target.length)}${text.slice(start + cover.link.length)}`;
}
