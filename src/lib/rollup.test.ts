import { describe, expect, it } from 'vitest';
import { parseDay } from './day';
import { metricScale, missingFromDay, reflections, rollup, spread } from './rollup';

const note = (props: string, tasks: string, habits = '') => `---\n${props}\n---\n\n>[!habits]- Habits\n${habits}\n\n### Tasks\n${tasks}\n`;

const monday = parseDay(
  note('done: 100\nmood: 4\nsoc: 0', '- [x] #daily/code — ship it [minutes::60]\n- [x] #daily/cinema — a film [minutes::90]', '> - [x] no sweet\n> - [ ] exercise'),
);
const tuesday = parseDay(note('done: 50\nmood: 2\nsoc: 3', '- [ ] #daily/code — tests [minutes::30]', '> - [x] no sweet\n> - [x] meditation'));

describe('rollup', () => {
  const week = rollup([
    { date: new Date(2026, 8, 28), path: 'a.md', day: monday },
    { date: new Date(2026, 8, 29), path: 'b.md', day: tuesday },
    { date: new Date(2026, 8, 30) },
  ]);

  it('adds the days up', () => {
    expect(week.noted).toBe(2);
    expect(week.totals).toMatchObject({ logged: 180, main: 90, recovery: 90, tasks: 3, tasksDone: 2, habits: 4, habitsDone: 3 });
    expect(week.byCategory.map(([meta, minutes]) => [meta.name, minutes])).toEqual([
      ['cinema', 90],
      ['code', 90],
    ]);
  });

  it('averages each number over the days that logged it, a 0 on a scale counting as not logged', () => {
    expect(week.average('mood')).toBe(3);
    expect(week.average('soc')).toBe(3);
    expect(week.average('sleep')).toBeUndefined();
    // Plan done is the share of ticked tasks: Monday's two of two, Tuesday's none of one.
    expect(week.series('done')).toEqual([100, 0, undefined]);
    expect(week.perfect).toBe(1);
  });

  it('lines each habit up across the days, absent where a day has no note or no such habit', () => {
    expect(week.habits).toEqual([
      { name: 'no sweet', marks: [true, true, null] },
      { name: 'exercise', marks: [false, null, null] },
      { name: 'meditation', marks: [null, true, null] },
    ]);
  });
});

describe('metricScale', () => {
  it('reads the scale from the values logged', () => {
    expect(metricScale('mood', [1, 3, 5])).toBe(5);
    expect(metricScale('mood', [4, 9])).toBe(10);
    expect(metricScale('focus', [40])).toBe(100);
    expect(metricScale('done', [3])).toBe(100);
    expect(metricScale('sleep', [7.5])).toBe(10);
  });
});

describe('spread', () => {
  it('gives min, max, median and mean of what is there', () => {
    expect(spread([80, undefined, 40, 100, 60])).toEqual({ min: 40, max: 100, median: 70, mean: 70 });
    expect(spread([undefined])).toBeUndefined();
  });
});

describe('missingFromDay', () => {
  it('names the tracked numbers left empty, and habits when none was ticked', () => {
    expect(missingFromDay(parseDay(note('mood: 4\nenergy:\nsoc: 0\nsleep: 7', '', '> - [ ] no sweet')))).toEqual(['energy', 'social', 'habits']);
    expect(missingFromDay(tuesday)).toEqual([]);
  });
});

describe('reflections', () => {
  it("reads a weekly note's Plus, Minus and Next lists, from every heading of that name", () => {
    // demo-vault/Calendar/2026/weeks/2026-W39 - 21.09.26.md, and the vault template's second Plus.
    const week = `#### Plus\n- Shipped on Friday\n\n#### Minus\n- Meetings ate Wednesday\n\n#### Next\n- Plan the month review\n-\n\n#### Statistics\n- not a reflection\n`;
    expect(reflections(week)).toEqual({ plus: ['Shipped on Friday'], minus: ['Meetings ate Wednesday'], next: ['Plan the month review'] });
    expect(reflections('#### Plus\nGoals\n\n#### Plus\n- one\n').plus).toEqual(['one']);
  });
});
