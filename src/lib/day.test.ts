import { describe, expect, it } from 'vitest';
import { clock, formatMinutes, parseDay, taskLabel } from './day';

// demo-vault/Calendar/2026/days 2026/29.09.2026.md, as it is.
const DAY = `---
date: 2026-09-29T22:50
tags:
  - Daily
cssclasses:
  - daily
  - rpg-day
  - tuesday
done: 83
sleep: 7.8
focus: 3
energy: 2
mood: 3
soc: 3
---

> [!tldr]+ **Summary of the day:**
> Rested. Did what mattered.

> [!navigation]+ Navigation
> **Date Navigation**
> [[28.09.2026|← Yesterday]] | [[30.09.2026|Tomorrow →]] | [[2026-W40 - 28.09.26|Week]] | **[[09.26 RPG|09.26]]**

>[!habits]- Habits
> - [x] no sweet
> - [x] no news
> - [x] consciousness
> - [ ] sleep schedule
> - [ ] 7 useful hours
> - [x] exercise
> - [ ] meditation

## Tuesday, September 29th, 2026

### Tasks
- [x] #daily/dog — long walk with the dog [minutes::41]
    - 08:50–09:31
- [x] #daily/code — fix the login bug [minutes::42]
    - 09:52–10:34
- [x] #daily/code — review a pull request [minutes::39]
    - 10:52–11:31
- [x] #daily/study — linear algebra: eigenvectors [minutes::48]
    - 12:12–13:00
- [x] #daily/book — notes on chapter four [minutes::25]
    - 13:18–13:43
- [ ] #daily/code — review a pull request [minutes::24]
    - 14:14–14:38

**Gratitude practice:** rain at night

### stream of consc
Less news, more sleep. Day 60 of the experiment.
`;

// The vault's daily template (Templates/Daily Note.md), as Obsidian fills it in, with a day's writing.
const TEMPLATE_DAY = `---
done:
mood: 3
soc:
important: call the bank
---

### Tasks
- [x] #daily/kaizen — planning [minutes::13] <!-- focus-id: 20261027-01 -->
    - 10:56–11:09
- [ ] #daily/leisure — film night [minutes::120]
    - 23:10–01:10
- [ ]

**Gratitude practice:**

### stream of consciousness
reflection on good thoughts:
Walked without the phone.

Recognise irrational thoughts → dispute them → find rational

| **situation/self-criticism** | **emotions** | **[[10 когнитивных искажений (cognitive distortion)\\|cognitive distortion]]** | **rational response** | **emotions after** |
| ---------------------------- | ------------ | ---------------- | --------------------- | ------------------ |
| missed the gym | guilt | all-or-nothing | one day isn't a habit | calm |
|                              |              |                  |                       |                    |
`;

describe('parseDay', () => {
  const day = parseDay(DAY);

  it('reads the tasks with their category, minutes and the time logged under each', () => {
    expect(day.tasks.map((task) => task.label)).toEqual([
      'long walk with the dog',
      'fix the login bug',
      'review a pull request',
      'linear algebra: eigenvectors',
      'notes on chapter four',
      'review a pull request',
    ]);
    expect(day.tasks[0]?.category?.name).toBe('dog');
    expect(day.tasks[0]?.blocks).toEqual([{ start: 8 * 60 + 50, end: 9 * 60 + 31 }]);
    expect(day.tasks.every((task) => !task.habit)).toBe(true);
  });

  it('keeps the habits apart', () => {
    expect(day.habits.map((habit) => habit.label)).toEqual(['no sweet', 'no news', 'consciousness', 'sleep schedule', '7 useful hours', 'exercise', 'meditation']);
    expect(day.totals.habitsDone).toBe(4);
    expect(day.totals.habits).toBe(7);
  });

  it('counts minutes when they are logged, ticked or not, and splits productive from recovery', () => {
    expect(day.totals.logged).toBe(41 + 42 + 39 + 48 + 25 + 24);
    expect(day.totals.main).toBe(day.totals.logged);
    expect(day.totals.recovery).toBe(0);
    expect(day.totals.tasksDone).toBe(5);
    expect(day.totals.tasks).toBe(6);
    // Book pays half; the rest a point a minute. Only ticked tasks are claimed.
    expect(day.totals.xp).toBe(41 + 42 + 39 + 48 + Math.round(25 * 0.5) + 24);
    expect(day.totals.claimed).toBe(day.totals.xp - 24);
    expect(day.byCategory.map(([meta, minutes]) => [meta.name, minutes])).toEqual([
      ['code', 105],
      ['study', 48],
      ['dog', 41],
      ['book', 25],
    ]);
  });

  it('reads the numbers, the summary and the words of the day', () => {
    expect(day.numbers).toMatchObject({ done: 83, sleep: 7.8, focus: 3, energy: 2, mood: 3, soc: 3 });
    expect(day.summary).toBe('Rested. Did what mattered.');
    expect(day.gratitude).toBe('rain at night');
    expect(day.stream).toEqual(['Less news, more sleep. Day 60 of the experiment.']);
    expect(day.records).toEqual([]);
  });

  it("reads the template's own day: comments, a block past midnight, the empty task, prompts and the thought record", () => {
    const filled = parseDay(TEMPLATE_DAY);
    expect(filled.tasks.map((task) => task.label)).toEqual(['planning', 'film night']);
    expect(filled.tasks[1]?.blocks).toEqual([{ start: 23 * 60 + 10, end: 25 * 60 + 10 }]);
    expect(filled.totals.recovery).toBe(120);
    expect(filled.totals.main).toBe(13);
    expect(filled.numbers).toEqual({ mood: 3 });
    expect(filled.keys).toEqual(['done', 'mood', 'soc', 'important']);
    expect(filled.important).toBe('call the bank');
    expect(filled.gratitude).toBeUndefined();
    expect(filled.stream).toEqual(['Walked without the phone.']);
    expect(filled.records).toMatchObject([{ situation: 'missed the gym', before: ['guilt'], distortions: ['all-or-nothing'], balanced: "one day isn't a habit", after: ['calm'] }]);
  });

  it('reads what the day listened to and watched', () => {
    expect(parseDay('**Listened:** [[Quiet Machinery]]\n**Watched:** [[Static Bloom|the film]]\n').media).toEqual([
      { kind: 'listened', title: 'Quiet Machinery' },
      { kind: 'watched', title: 'Static Bloom' },
    ]);
  });
});

describe('taskLabel', () => {
  it('leaves the words: no tag, fields or comments', () => {
    expect(taskLabel('#daily/code — mrSuit skills [minutes::100] <!-- focus-id: 20261027-02 -->')).toBe('mrSuit skills');
    expect(taskLabel('#daily/sport — [minutes::0] [event::gym]')).toBe('');
  });
});

describe('formatMinutes and clock', () => {
  it('reads as hours and minutes', () => {
    expect(formatMinutes(125)).toBe('2h 5m');
    expect(formatMinutes(40)).toBe('40m');
    expect(clock(8 * 60 + 5)).toBe('08:05');
    expect(clock(25 * 60 + 10)).toBe('01:10');
  });
});
