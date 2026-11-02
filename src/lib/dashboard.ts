export interface Task {
  /** Zero-based line in the note. */
  line: number;
  /** Where the box's mark (` ` or `x`) sits in the note's text. */
  offset: number;
  done: boolean;
  /** The task as it reads, without the list marker and box. */
  text: string;
  /** From a `#daily/<category>` tag. */
  category?: string;
  /** From a `[minutes::N]` field. */
  minutes?: number;
  /** Inside an explicit `[!habits]` callout, kept apart from the day's tasks. */
  habit: boolean;
  /** Stable identity for a managed habit, kept in ordinary inline fields. */
  habitId?: string;
}

// A task line: optional quote marks (a task inside a callout), a list marker, a box.
const TASK = /^([ \t]*(?:>[ \t]*)*(?:[-*+]|\d+[.)])[ \t]+\[)([ xX])(\][ \t]+)(.*)$/;
const FENCE = /^[ \t]*(?:>[ \t]*)*(`{3,}|~{3,})/;

/** Every `- [ ]` and `- [x]` task in a note, also inside callouts, but not inside code. */
export function parseTasks(text: string): Task[] {
  const tasks: Task[] = [];
  let offset = 0;
  let fence: string | undefined;
  const callouts: { depth: number; habit: boolean }[] = [];
  text.split('\n').forEach((raw, line) => {
    const content = raw.replace(/\r$/, '');
    const quote = /^[ \t]*(?:>[ \t]*)*/.exec(content)?.[0] ?? '';
    const depth = (quote.match(/>/g) ?? []).length;
    while (callouts.length && callouts.at(-1)!.depth > depth) callouts.pop();
    const opens = FENCE.exec(content)?.[1];
    if (opens && (!fence || opens.startsWith(fence))) fence = fence ? undefined : opens;
    else if (!fence) {
      const callout = depth ? /^\[!([^\]]+)\]/.exec(content.slice(quote.length)) : undefined;
      // A quote ending, or a new callout at the same depth, closes the old context.
      // Nested ordinary quotes inherit it; another callout owns its own task list.
      if (callout) {
        if (callouts.at(-1)?.depth === depth) callouts.pop();
        callouts.push({ depth, habit: callout[1]?.toLowerCase() === 'habits' });
      }
      const match = TASK.exec(content);
      if (match) {
        const body = match[4] ?? '';
        tasks.push({
          line,
          offset: offset + (match[1] ?? '').length,
          done: match[2] !== ' ',
          text: body,
          category: /#daily\/([\w-]+)/.exec(body)?.[1],
          minutes: Number(/\[minutes::\s*(\d+)\s*\]/.exec(body)?.[1]) || undefined,
          habit: callouts.at(-1)?.habit ?? false,
          ...(/\[habit::([a-zA-Z0-9-]{8,80})\]/.exec(body)?.[1] ? { habitId: /\[habit::([a-zA-Z0-9-]{8,80})\]/.exec(body)![1] } : {}),
        });
      }
    }
    offset += raw.length + 1;
  });
  return tasks;
}

/** The note with that one task ticked or unticked: one character changes, nothing else. */
export function toggleTask(text: string, task: Task): string {
  const mark = text[task.offset];
  if (mark === undefined || !/[ xX]/.test(mark) || (mark !== ' ') !== task.done) throw new Error('That task has changed in the note.');
  return text.slice(0, task.offset) + (task.done ? ' ' : 'x') + text.slice(task.offset + 1);
}
