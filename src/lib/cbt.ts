import { lineEnding } from './text';

// Thought records (CBT), as the vault's Obsidian wizard keeps them (Templates/Scripts/rpg-day.js):
// rows of a five-column table under the daily note's stream of consciousness.
//
//   | **situation/self-criticism** | **emotions** | **[[…\|cognitive distortion]]** | **rational response** | **emotions after** |
//   | --- | --- | --- | --- | --- |
//   | [21:04] Reviewed the day and thought … | Disappointed, Anxious | All-or-nothing | Partial still counts. | Calm |

export interface Emotion {
  name: string;
  color: string;
  shades: string[];
}

/** The wheel, clockwise from the top, with the Obsidian wizard's shades, in the app's own jewel colours. */
export const EMOTIONS: Emotion[] = [
  { name: 'Happy', color: '#e2b356', shades: ['Joyful', 'Content', 'Proud', 'Grateful', 'Excited', 'Hopeful', 'Playful'] },
  { name: 'Fear', color: '#e8864f', shades: ['Anxious', 'Insecure', 'Overwhelmed', 'Worried', 'Scared', 'Nervous'] },
  { name: 'Anger', color: '#e06681', shades: ['Frustrated', 'Offended', 'Jealous', 'Irritated', 'Resentful', 'Bitter'] },
  { name: 'Sad', color: '#6fa5e6', shades: ['Lonely', 'Hurt', 'Disappointed', 'Vulnerable', 'Guilty', 'Empty', 'Ashamed'] },
  { name: 'Surprise', color: '#b48ede', shades: ['Amazed', 'Curious', 'Confused', 'Startled', 'Moved'] },
  { name: 'Peaceful', color: '#63bd92', shades: ['Calm', 'Relaxed', 'Relieved', 'Secure', 'Rested', 'Centered'] },
];

/** The core emotion a shade belongs to, if it is one of the wheel's. */
export const emotionOf = (shade: string) => EMOTIONS.find((emotion) => emotion.shades.some((s) => s.toLowerCase() === shade.trim().toLowerCase()));

export interface Distortion {
  name: string;
  description: string;
  example: string;
  reframe: string;
}

export const DISTORTIONS: Distortion[] = [
  { name: 'Emotional reasoning', description: 'Taking a feeling as proof of fact.', example: 'I feel useless, so I must be failing.', reframe: "Feelings are real, but they aren't proof. One hard morning doesn't define you." },
  { name: 'Catastrophizing', description: 'Jumping straight to the worst outcome.', example: 'If I mess this up, everything falls apart.', reframe: 'The worst case is one story, not the likely one. What usually happens instead?' },
  { name: 'All-or-nothing', description: 'Seeing it as total success or failure.', example: "If it's not perfect, it's worthless.", reframe: 'Most of life lives in the middle. Partial still counts.' },
  { name: 'Overgeneralizing', description: 'One event becomes a never-ending pattern.', example: 'I always screw this up.', reframe: "One time isn't always. Name the single instance, not the rule." },
  { name: 'Mind reading', description: 'Assuming you know what others think.', example: "They think I'm boring.", reframe: "You're guessing, not knowing. You don't have their thoughts." },
  { name: 'Mental filter', description: 'Fixing on one negative, ignoring the rest.', example: 'The whole day was ruined by that one comment.', reframe: "One dark spot isn't the whole picture. What else was true today?" },
  { name: 'Discounting the positive', description: 'Brushing off what went well as luck or nothing.', example: 'They only praised me to be nice.', reframe: 'Wins are data too. Let the good count as much as the bad.' },
  { name: 'Should statements', description: 'Rigid rules about how you must be.', example: 'I should be further along by now.', reframe: "Says who? Trade 'should' for 'I'd like to,' and drop the whip." },
  { name: 'Labeling', description: 'Turning a mistake into an identity.', example: "I'm a failure.", reframe: "You did a thing; you aren't the thing. Describe the action, not the self." },
  { name: 'Personalizing', description: "Taking the blame for what isn't yours.", example: "It's my fault they're upset.", reframe: "You're one factor, not the whole cause. What part is actually yours?" },
];

export interface ThoughtRecord {
  /** Zero-based line of the row in the note. */
  line: number;
  /** The row as it reads in the note, to check nothing changed it before it is rewritten. */
  raw: string;
  /** `HH:MM` from a `[HH:MM]` at the start of the situation. */
  time?: string;
  situation: string;
  before: string[];
  distortions: string[];
  balanced: string;
  after: string[];
}

export interface RecordInput {
  situation: string;
  before: string[];
  distortions: string[];
  balanced: string;
  after: string[];
}

const HEADER = /^\|\s*\*\*situation/i;
const SEPARATOR = /^\|[\s:|-]+\|\s*$/;
const STREAM = /^#{1,6}\s+stream of consc/i;

/** A table row's cells; `\|` (as in a [[link\|alias]]) stays inside its cell. */
export const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.replace(/\\\|/g, '|').trim());

const list = (cell: string) =>
  cell
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

function table(lines: string[]): { header: number; end: number } | undefined {
  const header = lines.findIndex((line) => HEADER.test(line));
  if (header < 0) return undefined;
  let end = header + 1;
  while (end < lines.length && (lines[end] ?? '').trimStart().startsWith('|')) end += 1;
  return { header, end };
}

/** Every filled row of the note's thought-record table. Empty rows (the template's) are left out. */
export function parseRecords(text: string): ThoughtRecord[] {
  const lines = text.split('\n').map((line) => line.replace(/\r$/, ''));
  const found = table(lines);
  if (!found) return [];
  const records: ThoughtRecord[] = [];
  for (let line = found.header + 1; line < found.end; line += 1) {
    const raw = lines[line] ?? '';
    if (SEPARATOR.test(raw)) continue;
    const [situation = '', before = '', distortions = '', balanced = '', after = ''] = cells(raw);
    if (![situation, before, distortions, balanced, after].some(Boolean)) continue;
    const stamp = /^\[(\d{1,2}:\d{2})\]\s*/.exec(situation);
    records.push({
      line,
      raw,
      time: stamp?.[1],
      situation: stamp ? situation.slice(stamp[0].length) : situation,
      before: list(before),
      distortions: list(distortions),
      balanced,
      after: list(after),
    });
  }
  return records;
}

const cell = (value: string) => value.replace(/\s*[\r\n]+\s*/g, ' ').replace(/\|/g, '\\|').trim();

/** The record as a table row, the situation stamped with its time. */
export function recordRow(input: RecordInput, time: string): string {
  const situation = cell(input.situation);
  return `| ${[`[${time}]${situation ? ` ${situation}` : ''}`, input.before.map(cell).join(', '), input.distortions.map(cell).join(', '), cell(input.balanced), input.after.map(cell).join(', ')].join(' | ')} |`;
}

const TABLE_HEAD = [
  '| **situation/self-criticism** | **emotions** | **[[10 когнитивных искажений (cognitive distortion)\\|cognitive distortion]]** | **rational response** | **emotions after** |',
  '| --- | --- | --- | --- | --- |',
];

function linesOf(text: string) {
  const eol = lineEnding(text);
  if (!eol) throw new Error("This note mixes line endings, so Epizen won't change it.");
  return { eol, lines: text.split(eol) };
}

/**
 * Adds a record as a new row after the table's last row. A note without the table gets one at
 * the end of its stream of consciousness, or a stream section at its end when it has none.
 */
export function addRecord(text: string, input: RecordInput, time: string): string {
  const { eol, lines } = linesOf(text);
  const row = recordRow(input, time);
  const found = table(lines);
  if (found) {
    lines.splice(found.end, 0, row);
    return lines.join(eol);
  }
  const stream = lines.findIndex((line) => STREAM.test(line));
  if (stream >= 0) {
    let end = lines.findIndex((line, i) => i > stream && /^#{1,6}\s/.test(line));
    if (end < 0) end = lines.length;
    // After the section's last line with text, then a blank line before the table.
    let at = end;
    while (at > stream + 1 && !(lines[at - 1] ?? '').trim()) at -= 1;
    lines.splice(at, 0, '', ...TABLE_HEAD, row);
    return lines.join(eol);
  }
  const trailing = text.endsWith(eol);
  const body = trailing ? lines.slice(0, -1) : lines;
  return [...body, '', '### stream of consciousness', '', ...TABLE_HEAD, row].join(eol) + (trailing ? eol : '');
}

/** Rewrites the record's row, keeping its time, only while the row still reads as it did. */
export function updateRecord(text: string, record: ThoughtRecord, input: RecordInput): string {
  const { eol, lines } = linesOf(text);
  if (lines[record.line] !== record.raw) throw new Error('That thought record has changed in the note.');
  lines[record.line] = recordRow(input, record.time ?? '00:00');
  return lines.join(eol);
}

/** Takes the record's row out, only while it still reads as it did. */
export function deleteRecord(text: string, record: ThoughtRecord): string {
  const { eol, lines } = linesOf(text);
  if (lines[record.line] !== record.raw) throw new Error('That thought record has changed in the note.');
  lines.splice(record.line, 1);
  return lines.join(eol);
}
