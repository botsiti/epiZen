import { isScalar, parseDocument } from 'yaml';
import { habitColor } from './categories';
import { lineEnding } from './text';

export interface HabitStyle { color?: string; icon?: string }
export const habitColors = { Sage: '#8fbcaa', Blue: '#6fa5e6', Teal: '#52bfc4', Amber: '#dcbc72', Peach: '#dfa163', Rose: '#e06681', Violet: '#b48ede' };
export const illustratedHabitIcons = {
  Sunrise: 'sunrise', Crescent: 'moon', Tea: 'tea', Candle: 'candle', Hourglass: 'hourglass',
  'Open book': 'book', Dumbbell: 'strength', Lotus: 'lotus', Sprout: 'sprout',
};
export const habitIcons = { Leaf: '🌿', Water: '💧', Book: '📖', Walk: '👟', Mind: '🧠', Moon: '🌙', Sun: '☀️', Strength: '💪', Music: '🎵', Pen: '✍️', Heart: '❤️', Mountain: '🏔️' };
export function habitTone(id: string, color?: string) {
  const hash = Array.from(id).reduce((value, c) => (value * 31 + c.codePointAt(0)!) >>> 0, 0);
  return color ?? habitColor(hash);
}

export function readHabitStyle(source: { color?: unknown; icon?: unknown }): HabitStyle {
  const style: HabitStyle = {};
  if (typeof source.color === 'string' && /^#[\da-f]{6}$/i.test(source.color)) style.color = source.color;
  if (typeof source.icon === 'string' && [...Object.values(habitIcons), ...Object.values(illustratedHabitIcons)].includes(source.icon)) style.icon = source.icon;
  return style;
}

/** Replace the value's YAML range only, leaving comments, line endings and the body intact. */
export function writeHabitStyle(source: string, before: HabitStyle, after: HabitStyle): string {
  const eol = lineEnding(source);
  const header = /^---\r?\n([\s\S]*?)(\r?\n---(?:\r?\n|$))/.exec(source);
  if (!header || !eol) throw new Error('The habit needs readable Markdown frontmatter.');
  const yaml = header[1]!;
  const doc = parseDocument(yaml);
  const offset = 3 + eol.length;
  const edits: { start: number; end: number; text: string }[] = [];
  for (const key of ['color', 'icon'] as const) {
    if (before[key] === after[key]) continue;
    const value = JSON.stringify(after[key] ?? '');
    const node = doc.get(key, true);
    if (!doc.has(key)) {
      edits.push({ start: yaml.length, end: yaml.length, text: eol + key + ': ' + value });
    } else if (isScalar(node) && node.range) {
      edits.push({ start: node.range[0], end: node.range[1], text: node.range[0] === node.range[1] ? ' ' + value : value });
    } else throw new Error('The habit’s color or icon is not a single value. Open the definition to edit it.');
  }
  let next = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    next = next.slice(0, offset + edit.start) + edit.text + next.slice(offset + edit.end);
  }
  return next;
}
