// @vitest-environment node
// The homepage's numbers, worked out on every daily note of a copy of the demo vault, with a
// fixed "today". The expected totals were added up separately, from the notes' own
// `[minutes::N]` fields and the categories' rates, not by this code.
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { category } from './categories';
import { day, parseDate } from './dates';
import { parseDay } from './day';
import {
  averages,
  categoryMinutes,
  focusWeek,
  lastDays,
  leadSphere,
  levelOf,
  lifeXp,
  memento,
  parseBirthDate,
  progress,
  rankOf,
  sphereXp,
  splitXp,
  streak,
  thisYear,
  weekDays,
  xpForLevel,
} from './home';
import type { DayEntry } from './rollup';

const original = fileURLToPath(new URL('../../demo-vault', import.meta.url));
const DAYS = 'Calendar/2026/days 2026';
let copy: string;
let days: DayEntry[];
let dayOf: (date: Date) => DayEntry;

beforeAll(() => {
  copy = join(mkdtempSync(join(tmpdir(), 'epizen-home-')), 'demo-vault');
  cpSync(original, copy, { recursive: true });
  days = readdirSync(join(copy, DAYS))
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const date = parseDate(name.replace(/\.md$/, ''), 'DD.MM.YYYY');
      if (!date) throw new Error(`not a daily note: ${name}`);
      return { date, path: `${DAYS}/${name}`, day: parseDay(readFileSync(join(copy, DAYS, name), 'utf8')) };
    });
  const byTime = new Map(days.map((entry) => [entry.date.getTime(), entry]));
  dayOf = (date) => byTime.get(date.getTime()) ?? { date };
});

afterAll(() => rmSync(join(copy, '..'), { recursive: true, force: true }));

// The demo's last daily note.
const SEP_29 = day(2026, 8, 29);

describe('levels', () => {
  it('start each level 1,000 XP further on than the last, from level 1 at 0 XP', () => {
    expect([1, 2, 3, 4, 5, 6].map(xpForLevel)).toEqual([0, 1000, 3000, 6000, 10000, 15000]);
    expect([0, 999, 1000, 2999, 3000, 9999, 10000, 12296].map(levelOf)).toEqual([1, 1, 2, 2, 3, 4, 5, 5]);
    expect(levelOf(-5)).toBe(1);
    expect(levelOf(Number.NaN)).toBe(1);
  });

  it('land exactly on every boundary, with no rounding drift at high levels', () => {
    for (let level = 1; level <= 200; level += 1) {
      expect(levelOf(xpForLevel(level))).toBe(level);
      expect(levelOf(xpForLevel(level) - 1)).toBe(Math.max(1, level - 1));
    }
  });

  it('say how far through the level and how much is left', () => {
    expect(progress(12296)).toEqual({ level: 5, xp: 12296, start: 10000, next: 15000, share: 2296 / 5000, left: 2704 });
  });

  it('climb a ladder of titles', () => {
    expect([1, 2, 3, 5, 9, 10, 16, 49, 50, 80].map(rankOf)).toEqual([
      'Novice',
      'Novice',
      'Apprentice',
      'Journeyman',
      'Seeker',
      'Adept',
      'Sage',
      'Paragon',
      'Immortal',
      'Immortal',
    ]);
  });
});

describe('the demo vault on the homepage', () => {
  it('earns 12,296 life XP from its 60 daily notes, level 5, and takes extra XP on top', () => {
    expect(days).toHaveLength(60);
    expect(lifeXp(days)).toBe(12296);
    expect(lifeXp(days, 500)).toBe(12796);
    expect(rankOf(levelOf(lifeXp(days)))).toBe('Journeyman');
  });

  it('splits the XP across the life spheres, and the spheres add up to the life XP', () => {
    const spheres = sphereXp(days);
    expect(Object.fromEntries(spheres.map((sphere) => [sphere.name, sphere.xp]))).toEqual({
      'Career/Work': 3430,
      'Health/Fitness': 1501,
      'Personal Growth': 4983,
      Finance: 1046,
      Spiritual: 0,
      'Love/Relationship': 1336,
      'Fun/Recreation': 0,
      Social: 0,
    });
    expect(spheres.reduce((sum, sphere) => sum + sphere.xp, 0)).toBe(lifeXp(days));
    expect(leadSphere(spheres)).toMatchObject({ name: 'Personal Growth', level: 3, left: 1017 });
    // A vault with no time logged yet has no lead sphere, rather than the first in the list.
    expect(leadSphere(sphereXp([]))).toBeUndefined();
  });

  it('keeps a streak of all 60 days, and gives today grace until something is logged', () => {
    expect(streak(days, SEP_29)).toEqual({ current: 60, best: 60 });
    // 30 September has no note yet: the run up to yesterday still stands.
    expect(streak(days, day(2026, 8, 30))).toEqual({ current: 60, best: 60 });
    // A day with nothing breaks it.
    expect(streak(days, day(2026, 9, 1))).toEqual({ current: 0, best: 60 });
    // Mid-run, the streak is the days up to today.
    expect(streak(days, day(2026, 7, 14))).toEqual({ current: 14, best: 60 });
  });

  it('averages the last seven days of numbers, out of their scales and sleep out of 8 hours', () => {
    const week = lastDays(dayOf, SEP_29);
    expect(week.map((entry) => entry.date.getDate())).toEqual([23, 24, 25, 26, 27, 28, 29]);
    const rows = averages(week, { focus: 5, energy: 5, mood: 5, soc: 5 });
    expect(rows.map((row) => [row.label, Math.round((row.value ?? 0) * 1000) / 1000, row.count])).toEqual([
      ['Sleep', 6.886, 7],
      ['Focus', 3.143, 7],
      ['Energy', 2.571, 7],
      ['Mood', 3.429, 7],
      ['Social', 3.571, 7],
    ]);
    expect(rows[0]?.share).toBeCloseTo(48.2 / 7 / 8);
  });

  it('counts only numbers above 0, and none at all on days without notes', () => {
    const empty = averages(lastDays(dayOf, day(2026, 9, 27)), { mood: 5 });
    expect(empty.every((row) => row.value === undefined && row.count === 0 && row.share === 0)).toBe(true);
    // 0 is how the template leaves a number before it is filled in.
    const text = readFileSync(join(copy, DAYS, '29.09.2026.md'), 'utf8').replace('mood: 3', 'mood: 0');
    const rows = averages([{ date: SEP_29, day: parseDay(text) }], { mood: 5 });
    expect(rows.find((row) => row.key === 'mood')).toMatchObject({ value: undefined, count: 0 });
    expect(rows.find((row) => row.key === 'focus')).toMatchObject({ value: 3, count: 1, share: 0.6 });
  });

  it('adds up the last seven days of logged minutes, by day and by category', () => {
    const week = focusWeek(lastDays(dayOf, SEP_29));
    expect(week.days.map((row) => row.minutes)).toEqual([360, 107, 158, 190, 193, 250, 219]);
    expect(week.total).toBe(1477);
    expect(week.average).toBe(1477 / 7);
    expect(week.most).toBe(360);
    expect(week.days.at(-1)?.byCategory.map(([meta, minutes]) => [meta.name, minutes])).toEqual([
      ['code', 105],
      ['study', 48],
      ['dog', 41],
      ['book', 25],
    ]);
  });

  it("counts the week's sport, Monday to Sunday, against the floor", () => {
    expect(categoryMinutes(weekDays(dayOf, day(2026, 7, 14)), 'sport')).toBe(235);
    expect(categoryMinutes(weekDays(dayOf, day(2026, 8, 27)), 'sport')).toBe(65);
    expect(categoryMinutes(weekDays(dayOf, SEP_29), 'sport')).toBe(0);
  });
});

describe('splitting XP across spheres', () => {
  it('gives each sphere its share in whole XP that add up to the task', () => {
    expect(splitXp(41, category('dog').spheres)).toEqual([
      ['Love/Relationship', 25],
      ['Personal Growth', 16],
    ]);
    expect(splitXp(45, category('business').spheres)).toEqual([
      ['Career/Work', 23],
      ['Finance', 22],
    ]);
    expect(splitXp(13, category('leisure').spheres)).toEqual([
      ['Fun/Recreation', 7],
      ['Social', 6],
    ]);
    expect(splitXp(0, category('dog').spheres)).toEqual([
      ['Love/Relationship', 0],
      ['Personal Growth', 0],
    ]);
  });

  it('sends a category the vault does not know to Personal Growth', () => {
    expect(category('pottery').spheres).toEqual({ 'Personal Growth': 100 });
    const text = '### Tasks\n- [x] #daily/pottery — a bowl [minutes::30]\n- [ ] no category at all [minutes::10]\n';
    const spheres = sphereXp([{ date: SEP_29, day: parseDay(text) }]);
    expect(spheres.find((sphere) => sphere.name === 'Personal Growth')?.xp).toBe(40);
  });
});

describe('memento mori', () => {
  it('counts the year and the month without a birth date', () => {
    const { spans, life, weeks } = memento(day(2026, 9, 27));
    expect(spans.map((span) => [span.label, Math.round(span.share * 1000) / 10, span.daysLeft])).toEqual([
      ['Year', 81.9, 66],
      ['Month', 83.9, 5],
    ]);
    expect(life).toBeUndefined();
    expect(weeks).toBeUndefined();
  });

  it('counts life up to 30 from a birth date, and the weeks spent of 1,560', () => {
    const birth = parseBirthDate('1998-03-21');
    expect(birth).toEqual(day(1998, 2, 21));
    const { life, weeks } = memento(day(2026, 9, 27), birth);
    // 21 March 2028 is 511 days after 27 October 2026, of the 10,958 from birth to 30.
    expect(life).toMatchObject({ label: 'Till 30', daysLeft: 511 });
    expect(life?.share).toBeCloseTo(10447 / 10958, 3);
    expect(weeks).toEqual({ cells: 1560, lived: 1487, current: 1487 });
  });

  it('stops at the ends: nothing left after 30, nothing spent before birth', () => {
    expect(memento(day(2029, 0, 1), day(1998, 2, 21))).toMatchObject({ life: { share: 1, daysLeft: 0 }, weeks: { lived: 1560, current: 1559 } });
    expect(memento(day(1998, 0, 1), day(1998, 2, 21))).toMatchObject({ life: { share: 0 }, weeks: { lived: 0, current: 0 } });
  });

  it('takes a birth date only as a real YYYY-MM-DD day', () => {
    expect(parseBirthDate(' 1998-03-21 ')).toEqual(day(1998, 2, 21));
    for (const value of ['1998-02-30', '21.03.1998', '1998-3-21', '', undefined, 19980321, null]) expect(parseBirthDate(value)).toBeUndefined();
  });
});

describe('shelves', () => {
  it("count what was listened to or watched this year, up to today", () => {
    const items = ['2026-08-10', '2026-09-21', '2026-11-02', '2025-12-31', 'someday', undefined].map((date, i) => ({ path: `${i}.md`, title: `${i}`, rating: 80, date }));
    expect(thisYear(items, day(2026, 9, 27))).toBe(2);
  });
});
