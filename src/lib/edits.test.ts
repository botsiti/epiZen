import { describe, expect, it } from 'vitest';
import { addTask, setProperty } from './edits';

// The top of demo-vault/Calendar/2026/days 2026/29.09.2026.md, and its Tasks section.
const DAY = `---
date: 2026-09-29T22:50
tags:
  - Daily
done: 83
sleep: 7.8
mood: 5
soc:
---

## Tuesday, September 29th, 2026

### Tasks
- [x] #daily/dog — long walk with the dog [minutes::41]
    - 08:50–09:31
- [ ] #daily/code — review a pull request [minutes::24]
    - 14:14–14:38

**Gratitude practice:** rain at night
`;

const changed = (before: string, after: string) => {
  const a = before.split('\n');
  const b = after.split('\n');
  return b.flatMap((line, i) => (line === a[i] ? [] : [[i, line] as const]));
};

describe('setProperty', () => {
  it('rewrites only the value on that one line', () => {
    const after = setProperty(DAY, 'mood', '4');
    expect(changed(DAY, after)).toEqual([[6, 'mood: 4']]);
    expect(after.split('\n')).toHaveLength(DAY.split('\n').length);
  });

  it('fills an empty value, and empties one', () => {
    expect(changed(DAY, setProperty(DAY, 'soc', '3'))).toEqual([[7, 'soc: 3']]);
    expect(changed(DAY, setProperty(DAY, 'mood', ''))).toEqual([[6, 'mood:']]);
  });

  it('adds a property the note lacks at the end of its properties', () => {
    const after = setProperty(DAY, 'energy', '5');
    expect(after).toBe(DAY.replace('soc:\n---', 'soc:\nenergy: 5\n---'));
  });

  it('keeps CRLF line endings', () => {
    const crlf = DAY.replace(/\n/g, '\r\n');
    expect(setProperty(crlf, 'mood', '2')).toBe(crlf.replace('mood: 5\r\n', 'mood: 2\r\n'));
    expect(setProperty(crlf, 'energy', '2')).toBe(crlf.replace('soc:\r\n---', 'soc:\r\nenergy: 2\r\n---'));
  });

  it('refuses a list, a block value, a bad name, a two-line value, and a note without properties', () => {
    expect(() => setProperty(DAY, 'tags', 'x')).toThrow(/more than one line/);
    expect(() => setProperty('---\nnote: |\n  text\n---\n', 'note', 'x')).toThrow(/more than one line/);
    expect(() => setProperty('---\nnote: [a, b]\n---\n', 'note', 'x')).toThrow(/plain value/);
    expect(() => setProperty(DAY, 'mood: 1\nsleep', '4')).toThrow(/property name/);
    expect(() => setProperty(DAY, 'mood', '4\n5')).toThrow(/one line/);
    expect(() => setProperty('# A note\n', 'mood', '4')).toThrow(/no properties/);
    expect(() => setProperty('---\nmood: 4\n', 'mood', '4')).toThrow(/never close/);
  });

  it('only matches the whole name', () => {
    const text = '---\nmoody: 1\nmood: 2\n---\n';
    expect(setProperty(text, 'mood', '3')).toBe('---\nmoody: 1\nmood: 3\n---\n');
  });
});

describe('addTask', () => {
  it('adds the task after the last one and the time logged under it', () => {
    const after = addTask(DAY, 'Sport', 'evening run', 30);
    const lines = after.split('\n');
    expect(lines[17]).toBe('- [ ] #daily/sport — evening run [minutes::30]');
    expect(lines.filter((_, i) => i !== 17)).toEqual(DAY.split('\n'));
  });

  it('fills in the template\'s empty task instead of adding below it', () => {
    const template = '### Tasks\n- [ ] \n\n**Gratitude practice:** \n';
    expect(addTask(template, 'code', 'write the spec')).toBe('### Tasks\n- [ ] #daily/code — write the spec\n\n**Gratitude practice:** \n');
  });

  it('adds under the heading when there are no tasks yet, and keeps CRLF', () => {
    expect(addTask('### Tasks\r\n\r\n## Notes\r\n', 'book', 'read')).toBe('### Tasks\r\n- [ ] #daily/book — read\r\n\r\n## Notes\r\n');
  });

  it('refuses without a Tasks heading, a category or words, and for mixed line endings', () => {
    expect(() => addTask('# Day\n', 'code', 'x')).toThrow(/no Tasks heading/);
    expect(() => addTask(DAY, 'two words', 'x')).toThrow(/one word/);
    expect(() => addTask(DAY, 'code', '  ')).toThrow(/what the task is/);
    expect(() => addTask(DAY, 'code', 'a\nb')).toThrow(/one line/);
    expect(() => addTask('### Tasks\r\n\n', 'code', 'x')).toThrow(/mixes line endings/);
  });
});
