import { parseTasks } from './dashboard';
import { blocksUnder, clock, parseDay, taskLabel, type TimeBlock } from './day';
import { addTask } from './edits';
import { lineEnding } from './text';

// The calendar's and the timer's writes: a time block added under a task, moved, resized or
// removed. Each returns the note's new text with every other line byte for byte as it was, or
// throws and changes nothing. They write what Senioro writes (SenioroCore's appendBlock):
//
//   - [ ] #daily/code — mrSuit skills [minutes::100] <!-- focus-id: 20261027-02 -->
//       - 16:02–17:42
//
// A block is `<the task's indent>    - HH:MM–HH:MM` with an en dash, after the task's other
// blocks, and the task's `[minutes::N]` moves by the block's minutes.

/** A line of a note as the caller saw it: where it was, and what it said (without a `\r`). */
export interface LineRef {
  line: number;
  text: string;
}

/** The last minute of a day. A block that would run past midnight stops here, as in Senioro. */
export const LAST_MINUTE = 24 * 60 - 1;

const MINUTES = /\[[ \t]*minutes::([^\]\r\n]*)\]/g;
const RANGE = /(\d{1,2}):(\d{2})[ \t]*[–—-][ \t]*(\d{1,2}):(\d{2})/;

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

/** The block the caller saw, among the task's own blocks, found the same way as the task. */
function findBlock(lines: string[], blocks: TimeBlock[], block: LineRef): TimeBlock {
  const exact = blocks.find((b) => b.line === block.line && lines[b.line] === block.text);
  if (exact) return exact;
  const same = blocks.filter((b) => lines[b.line] === block.text);
  if (same.length === 1 && same[0]) return same[0];
  throw new Error('That time block has changed in the note');
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
 * Moves or resizes one of the task's blocks: rewrites the times on that one line, and moves the
 * task's `[minutes::N]` by the difference (never below 0). A task without the field keeps its line.
 */
export function moveBlock(text: string, task: LineRef, block: LineRef, start: number, end: number): string {
  const next = span(start, end);
  if (!next) throw new Error('A block is at least a minute long');
  const { lines, eol } = split(text);
  const at = findLine(text, lines, task);
  const blocks = blocksUnder(lines, at);
  const old = findBlock(lines, blocks, block);
  if (old.start === next.start && old.end === next.end) return text;
  if (blocks.some((b) => b !== old && b.start === next.start && b.end === next.end)) throw new Error(`That task already has a block at ${range(next.start, next.end)}`);
  const blockLine = lines[old.line] ?? '';
  lines[old.line] = blockLine.replace(RANGE, range(next.start, next.end));
  const line = lines[at] ?? '';
  const { total, field } = minutesOf(line, blocks);
  if (field) lines[at] = withMinutes(line, total + length(next) - length(old));
  return lines.join(eol);
}

/** Removes one of the task's blocks, and takes its minutes off the task's `[minutes::N]` (never below 0). */
export function deleteBlock(text: string, task: LineRef, block: LineRef): string {
  const { lines, eol } = split(text);
  const at = findLine(text, lines, task);
  const blocks = blocksUnder(lines, at);
  const old = findBlock(lines, blocks, block);
  const line = lines[at] ?? '';
  const { total, field } = minutesOf(line, blocks);
  if (field) lines[at] = withMinutes(line, total - length(old));
  lines.splice(old.line, 1);
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

/** The note's tasks that the snapshot describes: by focus-id when it has one, else by words and category. */
function matching(text: string, want: TaskSnapshot) {
  const label = taskLabel(want.label);
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
  const label = taskLabel(want.label);
  if (!task) throw new Error(matches.length ? `Two tasks read “${label}”, so Epizen can’t tell which one is meant` : `“${label}” is no longer in the note`);
  return { line: task.line, text: (text.split('\n')[task.line] ?? '').replace(/\r$/, '') };
}

/** True when the note has a task the snapshot describes, even if two do. */
export const hasTask = (text: string, want: TaskSnapshot) => matching(text, want).length > 0;

/**
 * Adds a new task `- [ ] #daily/<category> — <words> [minutes::0]` under the Tasks heading, then
 * the block under it, in one change. When the note already has that task, the block goes under it.
 */
export function addTaskWithBlock(text: string, category: string, words: string, start: number, end: number): string {
  const want = { label: words, category };
  if (hasTask(text, want)) return addBlock(text, findTask(text, want), start, end);
  const added = addTask(text, category, words, 0);
  return addBlock(added, findTask(added, want), start, end);
}
