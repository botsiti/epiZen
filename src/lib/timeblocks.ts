import { parseTasks } from './dashboard';
import { blocksUnder, clock, parseDay, taskLabel, type TimeBlock } from './day';
import { addTask } from './edits';
import { lineEnding } from './text';

// The timer's, the calendar's and the task menu's writes: a time block added under a task, a
// task's minutes, a task edited, deleted, or given a focus-id for a plan. Each returns the note's new text with every other line
// byte for byte as it was, or throws and changes nothing. They write what Senioro writes
// (SenioroCore's appendBlock):
//
//   - [ ] #daily/code — mrSuit skills [minutes::100] <!-- focus-id: 20261027-02 -->
//       - 16:02–17:42
//
// A block is `<the task's indent>    - HH:MM–HH:MM` with an en dash, after the task's other
// blocks, and adds its minutes to the task's `[minutes::N]`. Only the timer writes blocks: they
// are its record, so a stretch written twice counts once. Nothing in the app shows them.

/** A line of a note as the caller saw it: where it was, and what it said (without a `\r`). */
export interface LineRef {
  line: number;
  text: string;
}

/** The last minute of a day. A block that would run past midnight stops here, as in Senioro. */
export const LAST_MINUTE = 24 * 60 - 1;

const MINUTES = /\[[ \t]*minutes::([^\]\r\n]*)\]/g;

const length = (block: { start: number; end: number }) => block.end - block.start;
const range = (start: number, end: number) => `${clock(start)}–${clock(end)}`;

/** The note's lines and the line ending that joins them back. Mixed line endings are refused. */
function split(text: string): { lines: string[]; eol: '\n' | '\r\n' } {
  const eol = lineEnding(text);
  if (!eol) throw new Error("This note mixes line endings, so Epizen won't change it.");
  return { lines: text.split(eol), eol };
}

/** A start and end in minutes since midnight, cut at 23:59. `undefined` when under a minute. */
function span(start: number, end: number): { start: number; end: number } | undefined {
  if (!Number.isInteger(start) || !Number.isInteger(end)) throw new Error('A block starts and ends on a whole minute.');
  if (start < 0 || start > LAST_MINUTE || end < 0 || end > 24 * 60) throw new Error('A block stays inside its day.');
  const cut = Math.min(end, LAST_MINUTE);
  return cut - start >= 1 ? { start, end: cut } : undefined;
}

/**
 * Where the task the caller saw is now: on its line if that still reads the same, else on the
 * one other line that reads exactly the same (lines above it came or went). Anything else is
 * refused rather than guessed: the task was changed, or two tasks read the same.
 */
function findLine(text: string, lines: string[], task: LineRef): number {
  const tasks = new Set(parseTasks(text).filter((t) => !t.habit).map((t) => t.line));
  if (tasks.has(task.line) && lines[task.line] === task.text) return task.line;
  const same = [...tasks].filter((line) => lines[line] === task.text);
  if (same.length === 1 && same[0] !== undefined) return same[0];
  throw new Error(same.length ? 'Two tasks in the note read the same, so Epizen can’t tell which one is meant' : 'That task has changed in the note');
}

/**
 * The task's minutes as Senioro counts them: a non-zero `[minutes::N]` is the total; a missing
 * or zero one means the blocks' sum. `field` is false when the line has no minutes field.
 */
function minutesOf(line: string, blocks: TimeBlock[]): { total: number; field: boolean } {
  const found = [...line.matchAll(MINUTES)];
  if (found.length > 1) throw new Error('That task has more than one minutes field, so Epizen leaves it to the editor');
  const raw = (found[0]?.[1] ?? '').trim();
  if (raw && !/^\d+$/.test(raw)) throw new Error('That task’s minutes aren’t a whole number, so Epizen leaves it to the editor');
  const literal = raw ? Number(raw) : 0;
  return { total: literal > 0 ? literal : blocks.reduce((sum, block) => sum + length(block), 0), field: found.length === 1 };
}

/** The task line with `[minutes::N]`: the field rewritten, or added before a trailing comment or block id. */
function withMinutes(line: string, minutes: number): string {
  const field = `[minutes::${Math.max(0, Math.round(minutes))}]`;
  if (new RegExp(MINUTES.source).test(line)) return line.replace(new RegExp(MINUTES.source), field);
  const tail = /(?:[ \t]*(?:<!--[\s\S]*?-->|\^[\w-]+))+[ \t]*$/.exec(line);
  const at = tail ? tail.index : line.length - (/[ \t]*$/.exec(line)?.[0].length ?? 0);
  return `${line.slice(0, at)} ${field}${line.slice(at)}`;
}

/**
 * Adds the block `start`–`end` (minutes since midnight) under the task, after its other blocks,
 * and adds its minutes to the task's `[minutes::N]` (writing the field if the task has none).
 * A block the task already has is not added twice, and one under a minute adds nothing.
 */
export function addBlock(text: string, task: LineRef, start: number, end: number): string {
  const block = span(start, end);
  if (!block) return text;
  const { lines, eol } = split(text);
  const at = findLine(text, lines, task);
  const blocks = blocksUnder(lines, at);
  if (blocks.some((b) => b.start === block.start && b.end === block.end)) return text;
  const line = lines[at] ?? '';
  const { total } = minutesOf(line, blocks);
  lines[at] = withMinutes(line, total + length(block));
  const indent = /^[ \t]*/.exec(line)?.[0] ?? '';
  lines.splice((blocks.at(-1)?.line ?? at) + 1, 0, `${indent}    - ${range(block.start, block.end)}`);
  return lines.join(eol);
}

/**
 * Sets the minutes spent on a task already in the note: its `[minutes::N]` rewritten, or added
 * when the task has none. Only that line changes; the time blocks under it stay as they are.
 */
export function setMinutes(text: string, task: LineRef, minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 24 * 60) throw new Error('Minutes are a whole number from 0 to 1440.');
  const { lines, eol } = split(text);
  const at = findLine(text, lines, task);
  const line = lines[at] ?? '';
  minutesOf(line, blocksUnder(lines, at));
  lines[at] = withMinutes(line, minutes);
  return lines.join(eol);
}

/** What an edit sets on a task. `category` undefined leaves a task without one that way. */
export interface TaskEdit {
  words: string;
  category?: string;
  minutes: number;
}

// A task line's list marker and box, and what follows them.
const TASK_HEAD = /^([ \t]*(?:>[ \t]*)*(?:[-*+]|\d+[.)])[ \t]+\[[ xX]\][ \t]+)(.*)$/;
const FIELD = /\[[\w-]+::[^\]]*\]/g;
const COMMENT = /<!--[\s\S]*?-->/g;

/**
 * Rewrites a task's line with new words, category and minutes, as Senioro writes a task:
 * `- [ ] #daily/<category> — <words> [minutes::N]`. The rest of the line stays: the tick, the
 * indent, its other `[key::value]` fields and comments (Senioro's focus-id), a trailing block id.
 * The blocks and subtasks under it stay as they are.
 */
export function editTask(text: string, task: LineRef, edit: TaskEdit): string {
  const label = newTaskLabel(edit.words);
  if (!label) throw new Error('Say what the task is.');
  const category = edit.category?.trim().toLowerCase();
  if (category !== undefined && !/^[\w-]+$/.test(category)) throw new Error('A category is one word, like code or sport.');
  if (!Number.isInteger(edit.minutes) || edit.minutes < 0 || edit.minutes > 24 * 60) throw new Error('Minutes are a whole number from 0 to 1440.');
  const { lines, eol } = split(text);
  const at = findLine(text, lines, task);
  const line = lines[at] ?? '';
  const [, head = '', body = ''] = TASK_HEAD.exec(line) ?? [];
  const { field } = minutesOf(line, blocksUnder(lines, at));
  const blockId = /[ \t](\^[\w-]+)[ \t]*$/.exec(body)?.[1];
  const fields = (body.match(FIELD) ?? []).filter((f) => !/^\[minutes::/.test(f));
  const minutes = field || edit.minutes ? [`[minutes::${edit.minutes}]`] : [];
  const parts = [category ? `#daily/${category} — ${label}` : label, ...minutes, ...fields, ...(body.match(COMMENT) ?? []), ...(blockId ? [blockId] : [])];
  const next = head + parts.join(' ');
  if (next === line) return text;
  lines[at] = next;
  return lines.join(eol);
}

/**
 * Takes a task out of the note with everything indented under it: its time blocks, subtasks and
 * notes. A blank line after them stays.
 */
export function deleteTask(text: string, task: LineRef): string {
  const { lines, eol } = split(text);
  const at = findLine(text, lines, task);
  const depth = (/^[ \t]*/.exec(lines[at] ?? '')?.[0] ?? '').replace(/\t/g, '    ').length;
  let last = at;
  for (let i = at + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (!line.trim()) continue;
    if ((/^[ \t]*/.exec(line)?.[0] ?? '').replace(/\t/g, '    ').length <= depth) break;
    last = i;
  }
  lines.splice(at, last - at + 1);
  return lines.join(eol);
}

/** What the timer and the calendar remember of a task, to find it again in the note's later text. */
export interface TaskSnapshot {
  label: string;
  category?: string;
  /** Senioro's `<!-- focus-id: … -->`, when the line has one. */
  focusId?: string;
  /** Where it was, to choose between two tasks that read the same. */
  line?: number;
}

const FOCUS_ID = /<!--\s*focus-id:\s*([\w-]+)\s*-->/;
export const focusIdOf = (text: string) => FOCUS_ID.exec(text)?.[1];

/** A label as the line `#daily/<category> — <label>` reads back (`taskLabel` takes one leading dash off a line). */
const asWritten = (label: string) => taskLabel(`— ${label}`);

/**
 * The label a new task with these words will read as. Words holding a `[field::value]` or a
 * comment are refused: the line would read differently from what was typed.
 */
export function newTaskLabel(words: string): string {
  const label = asWritten(words);
  if (label !== words.trim().replace(/\s+/g, ' ')) throw new Error('A new task’s words can’t hold a [field::value], a #daily/ tag or a comment');
  return label;
}

/** The note's tasks that the snapshot describes: by focus-id when it has one, else by words and category. */
function matching(text: string, want: TaskSnapshot) {
  const label = asWritten(want.label);
  const category = want.category?.toLowerCase();
  const tasks = parseDay(text).tasks;
  return want.focusId
    ? tasks.filter((task) => focusIdOf(task.text) === want.focusId)
    : tasks.filter((task) => task.label === label && task.category?.name.toLowerCase() === category);
}

/**
 * The task in the note now that the snapshot describes. Throws when it is gone, or when two
 * tasks match and its line can't tell them apart.
 */
export function findTask(text: string, want: TaskSnapshot): LineRef {
  const matches = matching(text, want);
  const found = matches.length > 1 ? matches.filter((task) => task.line === want.line) : matches;
  const task = found.length === 1 ? found[0] : undefined;
  const label = asWritten(want.label);
  if (!task) throw new Error(matches.length ? `Two tasks read “${label}”, so Epizen can’t tell which one is meant` : `“${label}” is no longer in the note`);
  return { line: task.line, text: (text.split('\n')[task.line] ?? '').replace(/\r$/, '') };
}

/** True when the note has a task the snapshot describes, even if two do. */
export const hasTask = (text: string, want: TaskSnapshot) => matching(text, want).length > 0;

/** Senioro's focus-id for a new one of the day's tasks: `YYYYMMDD-NN`, after the highest the note has. */
export function nextFocusId(text: string, day: Date): string {
  const prefix = `${day.getFullYear()}${String(day.getMonth() + 1).padStart(2, '0')}${String(day.getDate()).padStart(2, '0')}`;
  const taken = [...text.matchAll(new RegExp(FOCUS_ID.source, 'g'))].map((match) => new RegExp(`^${prefix}-(\\d+)$`).exec(match[1] ?? '')?.[1]);
  const last = Math.max(0, ...taken.map((n) => Number(n ?? 0)));
  return `${prefix}-${String(last + 1).padStart(2, '0')}`;
}

/**
 * The task's focus-id, as Senioro writes it: `<!-- focus-id: … -->` at the end of its line
 * (before a block id). A task without one gets one; the calendar finds a planned task by it.
 */
export function withFocusId(text: string, task: LineRef, day: Date): { text: string; focusId: string } {
  const { lines, eol } = split(text);
  const at = findLine(text, lines, task);
  const line = lines[at] ?? '';
  const own = focusIdOf(line);
  if (own) return { text, focusId: own };
  const focusId = nextFocusId(text, day);
  const blockId = /[ \t]+\^[\w-]+[ \t]*$/.exec(line);
  const end = blockId ? blockId.index : line.trimEnd().length;
  lines[at] = `${line.slice(0, end)} <!-- focus-id: ${focusId} -->${line.slice(end)}`;
  return { text: lines.join(eol), focusId };
}

/** A new task with a focus-id under the Tasks heading, or the focus-id of the one the note already has with those words. */
export function addTaskWithFocusId(text: string, category: string, words: string, day: Date): { text: string; focusId: string } {
  const want = { label: newTaskLabel(words), category };
  const added = hasTask(text, want) ? text : addTask(text, category, words);
  return withFocusId(added, findTask(added, want), day);
}

/**
 * Adds a new task `- [ ] #daily/<category> — <words> [minutes::0]` under the Tasks heading, then
 * the block under it, in one change. When the note already has that task, the block goes under it.
 */
export function addTaskWithBlock(text: string, category: string, words: string, start: number, end: number): string {
  const want = { label: newTaskLabel(words), category };
  if (hasTask(text, want)) return addBlock(text, findTask(text, want), start, end);
  const added = addTask(text, category, words, 0);
  return addBlock(added, findTask(added, want), start, end);
}
