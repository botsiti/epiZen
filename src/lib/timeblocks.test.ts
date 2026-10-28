import { describe, expect, it } from 'vitest';
import { parseDay } from './day';
import { addBlock, addTaskWithBlock, deleteBlock, deleteTask, editTask, findTask, moveBlock, newTaskLabel, setMinutes, type LineRef } from './timeblocks';

// A day as Senioro writes it (the brief's example), with a task the old way and an empty one.
const DAY = `---
mood: 4
---

### Tasks
- [x] #daily/kaizen — planning [minutes::13] <!-- focus-id: 20261027-01 -->
    - 10:56–11:09
- [ ] #daily/code — mrSuit skills [minutes::100] <!-- focus-id: 20261027-02 -->
    - 16:02–17:42
- [ ] #daily/sport — gym [minutes::40]
- [ ] #daily/book — read

**Gratitude practice:** tea
`;

const lines = (text: string) => text.split('\n');
const ref = (text: string, line: number): LineRef => ({ line, text: (lines(text)[line] ?? '').replace(/\r$/, '') });
/** Lines of `after` that aren't in `before` at the same place, once inserted lines are taken out. */
const changed = (before: string, after: string) => {
  const a = lines(before);
  const b = lines(after);
  return b.flatMap((line, i) => (line === a[i] ? [] : [[i, line] as const]));
};
const min = (h: number, m: number) => h * 60 + m;

describe('addBlock', () => {
  it('adds the block after the task’s blocks and adds its minutes, keeping the focus-id', () => {
    const after = addBlock(DAY, ref(DAY, 7), min(18, 0), min(18, 25));
    const out = lines(after);
    expect(out[7]).toBe('- [ ] #daily/code — mrSuit skills [minutes::125] <!-- focus-id: 20261027-02 -->');
    expect(out[9]).toBe('    - 18:00–18:25');
    // Only the task line changed, and one line came in under its last block.
    expect(out.filter((_, i) => i !== 7 && i !== 9)).toEqual(lines(DAY).filter((_, i) => i !== 7));
    expect(parseDay(after).tasks[1]?.blocks.map((b) => [b.start, b.end])).toEqual([
      [min(16, 2), min(17, 42)],
      [min(18, 0), min(18, 25)],
    ]);
  });

  it('puts the first block right under a task tracked the old way, keeping its unplaced minutes', () => {
    const after = addBlock(DAY, ref(DAY, 9), min(7, 0), min(7, 20));
    expect(lines(after)[9]).toBe('- [ ] #daily/sport — gym [minutes::60]');
    expect(lines(after)[10]).toBe('    - 07:00–07:20');
  });

  it('adds the minutes field when the task has none', () => {
    const after = addBlock(DAY, ref(DAY, 10), min(21, 0), min(21, 30));
    expect(lines(after)[10]).toBe('- [ ] #daily/book — read [minutes::30]');
    expect(lines(after)[11]).toBe('    - 21:00–21:30');
    const comment = '### Tasks\n- [ ] #daily/code — x <!-- focus-id: 1 -->\n';
    expect(addBlock(comment, ref(comment, 1), 60, 90)).toBe('### Tasks\n- [ ] #daily/code — x [minutes::30] <!-- focus-id: 1 -->\n    - 01:00–01:30\n');
  });

  it('counts blocks under [minutes::0] as the total, as Senioro does', () => {
    const zero = '### Tasks\n- [ ] #daily/code — backend [minutes::0]\n    - 09:00–09:42\n';
    expect(lines(addBlock(zero, ref(zero, 1), min(10, 5), min(10, 47)))[1]).toBe('- [ ] #daily/code — backend [minutes::84]');
  });

  it('skips a range the task already has, and a block under a minute', () => {
    expect(addBlock(DAY, ref(DAY, 5), min(10, 56), min(11, 9))).toBe(DAY);
    expect(addBlock(DAY, ref(DAY, 5), min(12, 0), min(12, 0))).toBe(DAY);
  });

  it('cuts a block at 23:59 of its day', () => {
    expect(lines(addBlock(DAY, ref(DAY, 10), min(23, 30), 24 * 60))[11]).toBe('    - 23:30–23:59');
    expect(() => addBlock(DAY, ref(DAY, 10), min(23, 30), 25 * 60)).toThrow(/inside its day/);
  });

  it('keeps CRLF line endings, and keeps the task’s own indent', () => {
    const crlf = DAY.replace(/\n/g, '\r\n');
    const after = addBlock(crlf, ref(crlf, 7), min(18, 0), min(18, 25));
    expect(after).toBe(addBlock(DAY, ref(DAY, 7), min(18, 0), min(18, 25)).replace(/\n/g, '\r\n'));
    const nested = '### Tasks\n- [ ] #daily/code — parent\n  - [ ] #daily/code — child [minutes::5]\n';
    expect(lines(addBlock(nested, ref(nested, 2), 60, 75))[3]).toBe('      - 01:00–01:15');
  });

  it('finds the task again when lines above it came or went', () => {
    const shifted = DAY.replace('### Tasks\n', '### Tasks\n- [ ] #daily/code — new one [minutes::0]\n');
    const seen = ref(DAY, 7);
    expect(lines(addBlock(shifted, seen, min(18, 0), min(18, 25)))[10]).toBe('    - 18:00–18:25');
  });

  it('refuses a task that changed, two tasks that read the same, a habit, and mixed line endings', () => {
    expect(() => addBlock(DAY, { line: 7, text: '- [ ] #daily/code — something else' }, 60, 90)).toThrow(/changed/);
    const twice = '### Tasks\n- [ ] #daily/code — a\n- [ ] #daily/code — a\n';
    expect(() => addBlock(twice.replace('### Tasks\n', '### Tasks\n\n'), { line: 1, text: '- [ ] #daily/code — a' }, 60, 90)).toThrow(/read the same/);
    const habit = '> [!habits]\n> - [ ] no sweet\n';
    expect(() => addBlock(habit, ref(habit, 1), 60, 90)).toThrow(/changed/);
    expect(() => addBlock('### Tasks\r\n- [ ] #daily/code — a\n', { line: 1, text: '- [ ] #daily/code — a' }, 60, 90)).toThrow(/mixes line endings/);
    expect(() => addBlock('### Tasks\n- [ ] #daily/code — a [minutes::x]\n', { line: 1, text: '- [ ] #daily/code — a [minutes::x]' }, 60, 90)).toThrow(/whole number/);
  });
});

describe('moveBlock', () => {
  it('rewrites that one block line, and leaves the task’s minutes as they are', () => {
    const after = moveBlock(DAY, ref(DAY, 7), ref(DAY, 8), min(16, 0), min(17, 0));
    expect(changed(DAY, after)).toEqual([[8, '    - 16:00–17:00']]);
    expect(lines(after)).toHaveLength(lines(DAY).length);
    const bare = '### Tasks\n- [ ] #daily/code — a\n    - 09:00–10:00\n';
    expect(moveBlock(bare, ref(bare, 1), ref(bare, 2), min(9, 0), min(9, 30))).toBe('### Tasks\n- [ ] #daily/code — a\n    - 09:00–09:30\n');
  });

  it('refuses a block that changed, one that isn’t the task’s, a range the task has, and under a minute', () => {
    expect(() => moveBlock(DAY, ref(DAY, 7), { line: 8, text: '    - 16:02–17:43' }, 60, 90)).toThrow(/time block has changed/);
    expect(() => moveBlock(DAY, ref(DAY, 7), ref(DAY, 6), 60, 90)).toThrow(/time block has changed/);
    const two = '### Tasks\n- [ ] #daily/code — a [minutes::60]\n    - 09:00–09:30\n    - 10:00–10:30\n';
    expect(() => moveBlock(two, ref(two, 1), ref(two, 3), min(9, 0), min(9, 30))).toThrow(/already has a block/);
    expect(() => moveBlock(DAY, ref(DAY, 7), ref(DAY, 8), 60, 60)).toThrow(/at least a minute/);
  });

  it('keeps CRLF line endings', () => {
    const crlf = DAY.replace(/\n/g, '\r\n');
    expect(moveBlock(crlf, ref(crlf, 7), ref(crlf, 8), min(16, 0), min(17, 0))).toBe(moveBlock(DAY, ref(DAY, 7), ref(DAY, 8), min(16, 0), min(17, 0)).replace(/\n/g, '\r\n'));
  });

  it('leaves a block that runs past midnight to the editor, rather than cut it short', () => {
    const late = '### Tasks\n- [ ] #daily/cinema — film night [minutes::120]\n    - 23:10–01:10\n';
    expect(() => moveBlock(late, ref(late, 1), ref(late, 2), min(22, 10), min(23, 59))).toThrow(/past midnight/);
  });
});

describe('subtasks', () => {
  const NESTED = '### Tasks\n- [ ] #daily/code — parent [minutes::30]\n    - 08:00–08:10\n    - [ ] #daily/code — child [minutes::20]\n        - 09:00–09:20\n';

  it('keep their blocks: the parent’s are only its own', () => {
    expect(parseDay(NESTED).tasks.map((task) => [task.label, task.blocks.map((b) => b.line)])).toEqual([
      ['parent', [2]],
      ['child', [4]],
    ]);
  });

  it('can’t lose a block through their parent', () => {
    expect(() => deleteBlock(NESTED, ref(NESTED, 1), ref(NESTED, 4))).toThrow(/time block has changed/);
    expect(lines(deleteBlock(NESTED, ref(NESTED, 3), ref(NESTED, 4))).slice(3)).toEqual(['    - [ ] #daily/code — child [minutes::20]', '']);
    // A new block for the parent goes after its own, above the subtask.
    expect(lines(addBlock(NESTED, ref(NESTED, 1), min(10, 0), min(10, 10))).slice(1, 5)).toEqual([
      '- [ ] #daily/code — parent [minutes::40]',
      '    - 08:00–08:10',
      '    - 10:00–10:10',
      '    - [ ] #daily/code — child [minutes::20]',
    ]);
  });
});

describe('deleteBlock', () => {
  it('removes that one line, and leaves the task’s minutes as they are', () => {
    const after = deleteBlock(DAY, ref(DAY, 7), ref(DAY, 8));
    expect(lines(after)).toEqual(lines(DAY).filter((_, i) => i !== 8));
    const late = '### Tasks\n- [ ] #daily/cinema — film night [minutes::120]\n    - 23:10–01:10\n';
    expect(deleteBlock(late, ref(late, 1), ref(late, 2))).toBe('### Tasks\n- [ ] #daily/cinema — film night [minutes::120]\n');
  });

  it('refuses a block that changed', () => {
    expect(() => deleteBlock(DAY, ref(DAY, 7), { line: 8, text: '    - 16:02–17:41' })).toThrow(/time block has changed/);
  });
});

describe('findTask and addTaskWithBlock', () => {
  it('finds a task by focus-id after it changed, else by words and category', () => {
    const later = DAY.replace('mrSuit skills [minutes::100]', 'mrSuit skills, renamed [minutes::130]');
    expect(findTask(later, { label: 'mrSuit skills', category: 'code', focusId: '20261027-02' }).line).toBe(7);
    expect(findTask(DAY, { label: 'gym', category: 'sport' })).toEqual({ line: 9, text: '- [ ] #daily/sport — gym [minutes::40]' });
    expect(() => findTask(DAY, { label: 'gym', category: 'code' })).toThrow(/no longer in the note/);
  });

  it('tells two tasks that read the same apart by their line, or refuses', () => {
    const twice = '### Tasks\n- [ ] #daily/code — a\n- [ ] #daily/code — a\n';
    expect(findTask(twice, { label: 'a', category: 'code', line: 2 }).line).toBe(2);
    expect(() => findTask(twice, { label: 'a', category: 'code' })).toThrow(/Two tasks/);
  });

  it('adds a new task with [minutes::0] and its block in one change', () => {
    const after = addTaskWithBlock(DAY, 'sport', 'evening run', min(19, 0), min(19, 45));
    const out = lines(after);
    expect(out.slice(10, 13)).toEqual(['- [ ] #daily/book — read', '- [ ] #daily/sport — evening run [minutes::45]', '    - 19:00–19:45']);
    expect(out.filter((_, i) => i !== 11 && i !== 12)).toEqual(lines(DAY));
  });

  it('puts the block under the task when the note has it already', () => {
    expect(addTaskWithBlock(DAY, 'sport', 'gym', min(7, 0), min(7, 20))).toBe(addBlock(DAY, ref(DAY, 9), min(7, 0), min(7, 20)));
  });

  it('finds a new task whose words start with a dash, so a second block joins it', () => {
    const once = addTaskWithBlock(DAY, 'code', '- buy milk', 60, 90);
    expect(lines(once)[11]).toBe('- [ ] #daily/code — - buy milk [minutes::30]');
    const twice = addTaskWithBlock(once, 'code', '- buy milk', 120, 150);
    expect(lines(twice).filter((line) => line.includes('buy milk'))).toEqual(['- [ ] #daily/code — - buy milk [minutes::60]']);
    expect(findTask(twice, { label: newTaskLabel('- buy milk'), category: 'code' }).line).toBe(11);
  });

  it('refuses new words that the line would read differently', () => {
    expect(newTaskLabel('  deep   work ')).toBe('deep work');
    expect(() => addTaskWithBlock(DAY, 'code', 'x [minutes::5]', 60, 90)).toThrow(/field/);
    expect(() => addTaskWithBlock(DAY, 'code', 'x <!-- y -->', 60, 90)).toThrow(/comment/);
    expect(() => newTaskLabel('#daily/sport run')).toThrow(/tag/);
  });

  it('fills the template’s empty task', () => {
    const template = '### Tasks\n- [ ] \n\n**Gratitude practice:** \n';
    expect(addTaskWithBlock(template, 'code', 'spec', 60, 90)).toBe('### Tasks\n- [ ] #daily/code — spec [minutes::30]\n    - 01:00–01:30\n\n**Gratitude practice:** \n');
  });
});

describe('setMinutes', () => {
  it('rewrites the minutes of a task already on the list, and only that line', () => {
    expect(changed(DAY, setMinutes(DAY, ref(DAY, 9), 55))).toEqual([[9, '- [ ] #daily/sport — gym [minutes::55]']]);
  });

  it('adds the field to a task without one, before a trailing comment, and leaves blocks alone', () => {
    expect(changed(DAY, setMinutes(DAY, ref(DAY, 10), 30))).toEqual([[10, '- [ ] #daily/book — read [minutes::30]']]);
    expect(changed(DAY, setMinutes(DAY, ref(DAY, 7), 120))).toEqual([[7, '- [ ] #daily/code — mrSuit skills [minutes::120] <!-- focus-id: 20261027-02 -->']]);
  });

  it('refuses a task that changed, and minutes that are not a whole number of a day', () => {
    expect(() => setMinutes(DAY.replace('gym', 'swim'), ref(DAY, 9), 10)).toThrow(/changed/);
    expect(() => setMinutes(DAY, ref(DAY, 9), -5)).toThrow(/whole number/);
    expect(() => setMinutes(DAY, ref(DAY, 9), 2.5)).toThrow(/whole number/);
  });
});

// The Tasks section of demo-vault/Calendar/2026/days 2026/29.09.2026.md, as it is.
const REAL = `### Tasks
- [x] #daily/dog — long walk with the dog [minutes::41]
    - 08:50–09:31
- [x] #daily/code — fix the login bug [minutes::42]
    - 09:52–10:34
- [x] #daily/code — review a pull request [minutes::39]
    - 10:52–11:31
`;

describe('editTask', () => {
  it('rewrites the words, category and minutes on that one line, keeping the tick, the focus-id and the blocks', () => {
    const after = editTask(DAY, ref(DAY, 7), { words: 'mrSuit skills v2', category: 'business', minutes: 90 });
    expect(changed(DAY, after)).toEqual([[7, '- [ ] #daily/business — mrSuit skills v2 [minutes::90] <!-- focus-id: 20261027-02 -->']]);
    expect(changed(REAL, editTask(REAL, ref(REAL, 3), { words: 'fix the logout bug', category: 'code', minutes: 42 }))).toEqual([[3, '- [x] #daily/code — fix the logout bug [minutes::42]']]);
  });

  it('changes nothing when nothing changed, and writes no minutes a task never had', () => {
    expect(editTask(DAY, ref(DAY, 7), { words: ' mrSuit  skills ', category: 'CODE', minutes: 100 })).toBe(DAY);
    expect(changed(DAY, editTask(DAY, ref(DAY, 10), { words: 'read a book', category: 'book', minutes: 0 }))).toEqual([[10, '- [ ] #daily/book — read a book']]);
    expect(changed(DAY, editTask(DAY, ref(DAY, 10), { words: 'read', category: 'book', minutes: 25 }))).toEqual([[10, '- [ ] #daily/book — read [minutes::25]']]);
    expect(changed(DAY, editTask(DAY, ref(DAY, 9), { words: 'gym', category: 'sport', minutes: 0 }))).toEqual([[9, '- [ ] #daily/sport — gym [minutes::0]']]);
  });

  it('keeps other fields, comments and a block id, and writes a task without a category without one', () => {
    const odd = '### Tasks\n  - [ ] call mum [due::friday] [minutes::5] ^call\n';
    expect(editTask(odd, ref(odd, 1), { words: 'call mum and dad', minutes: 10 })).toBe('### Tasks\n  - [ ] call mum and dad [minutes::10] [due::friday] ^call\n');
  });

  it('refuses words that would read differently, a bad category, bad minutes, and a task that changed', () => {
    expect(() => editTask(DAY, ref(DAY, 9), { words: 'gym [minutes::5]', category: 'sport', minutes: 5 })).toThrow(/field/);
    expect(() => editTask(DAY, ref(DAY, 9), { words: '  ', category: 'sport', minutes: 5 })).toThrow(/Say what/);
    expect(() => editTask(DAY, ref(DAY, 9), { words: 'gym', category: 'two words', minutes: 5 })).toThrow(/one word/);
    expect(() => editTask(DAY, ref(DAY, 9), { words: 'gym', category: 'sport', minutes: 1.5 })).toThrow(/whole number/);
    expect(() => editTask(DAY.replace('gym', 'swim'), ref(DAY, 9), { words: 'gym', category: 'sport', minutes: 5 })).toThrow(/changed/);
  });

  it('keeps CRLF line endings', () => {
    const crlf = DAY.replace(/\n/g, '\r\n');
    expect(editTask(crlf, ref(crlf, 9), { words: 'swim', category: 'sport', minutes: 40 })).toBe(editTask(DAY, ref(DAY, 9), { words: 'swim', category: 'sport', minutes: 40 }).replace(/\n/g, '\r\n'));
  });
});

describe('deleteTask', () => {
  it('takes the task out with its blocks, and nothing else', () => {
    expect(deleteTask(DAY, ref(DAY, 7))).toBe(lines(DAY).filter((_, i) => i !== 7 && i !== 8).join('\n'));
    expect(deleteTask(REAL, ref(REAL, 3))).toBe(lines(REAL).filter((_, i) => i !== 3 && i !== 4).join('\n'));
    expect(deleteTask(DAY, ref(DAY, 10))).toBe(lines(DAY).filter((_, i) => i !== 10).join('\n'));
  });

  it('takes its subtasks too, but leaves a subtask’s parent and the blank line after', () => {
    const nested = '### Tasks\n- [ ] #daily/code — parent\n    - [ ] #daily/code — child\n\n        - 09:00–09:20\n\n**Gratitude practice:** tea\n';
    expect(deleteTask(nested, ref(nested, 1))).toBe('### Tasks\n\n**Gratitude practice:** tea\n');
    expect(deleteTask(nested, ref(nested, 2))).toBe('### Tasks\n- [ ] #daily/code — parent\n\n**Gratitude practice:** tea\n');
  });

  it('refuses a task that changed, and two that read the same where the line moved', () => {
    expect(() => deleteTask(DAY.replace('gym', 'swim'), ref(DAY, 9))).toThrow(/changed/);
    const twice = '### Tasks\n- [ ] #daily/code — a\n- [ ] #daily/code — a\n';
    expect(() => deleteTask(`x\n${twice}`, ref(twice, 1))).toThrow(/Two tasks/);
  });
});
