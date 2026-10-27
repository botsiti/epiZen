import { describe, expect, it } from 'vitest';
import { parseTasks, toggleTask } from './dashboard';

// demo-vault/Calendar/2026/days 2026/14.08.2026.md, shortened.
const DAY = `---
date: 2026-08-14T23:23
done: 60
sleep: 6.1
focus: 9
mood: 9
---

>[!habits]- Habits
> - [ ] no sweet
> - [x] no news

### Tasks
- [ ] #daily/code — refactor the settings screen [minutes::58]
- [ ] #daily/study — linear algebra: eigenvectors [minutes::51]
- [x] #daily/sport — gym: upper body [minutes::61]
- [x] #daily/study — English: twenty new words [minutes::25]

\`\`\`
- [ ] not a task, it's code
\`\`\`
`;

describe('parseTasks', () => {
  it('finds tasks in callouts and lists, with category and minutes, and skips code', () => {
    const tasks = parseTasks(DAY);
    expect(tasks.map((task) => [task.done, task.category, task.minutes, task.habit])).toEqual([
      [false, undefined, undefined, true],
      [true, undefined, undefined, true],
      [false, 'code', 58, false],
      [false, 'study', 51, false],
      [true, 'sport', 61, false],
      [true, 'study', 25, false],
    ]);
    expect(tasks[2]?.text).toBe('#daily/code — refactor the settings screen [minutes::58]');
  });
});

describe('toggleTask', () => {
  it('changes exactly one character, and keeps CRLF', () => {
    const crlf = DAY.replaceAll('\n', '\r\n');
    for (const text of [DAY, crlf]) {
      const task = parseTasks(text)[2];
      if (!task) throw new Error('no task');
      const ticked = toggleTask(text, task);
      expect(ticked.length).toBe(text.length);
      expect([...ticked].filter((char, i) => char !== text[i])).toEqual(['x']);
      expect(ticked).toContain(`- [x] #daily/code — refactor the settings screen [minutes::58]${text === crlf ? '\r\n' : '\n'}`);
      const back = parseTasks(ticked)[2];
      if (!back) throw new Error('no task');
      expect(toggleTask(ticked, back)).toBe(text);
    }
  });

  it("refuses when the note no longer has that task's box there", () => {
    const task = parseTasks(DAY)[2];
    if (!task) throw new Error('no task');
    expect(() => toggleTask(DAY.replace('- [ ] #daily/code', '- [x] #daily/code'), task)).toThrow();
    expect(() => toggleTask('short', task)).toThrow();
  });
});
