import { describe, expect, it } from 'vitest';
import { day, parseDate } from './dates';
import { parseDay } from './day';
import { changeHabit, collectHabits, discoveredHabits, habitActive, habitHistory, habitStats, newHabit, readHabit, setHabitCompletion, withHabits, type Habit } from './habits';

const make = (name = 'No sweets', from = '2026-11-01', id = 'habit-sweets-001') => {
  const created = newHabit(name, from, id); return readHabit(created.path, created.text)!;
};
const date = (iso: string) => parseDate(iso, 'YYYY-MM-DD')!;
const record = (iso: string, done: boolean) => ({ date: date(iso), path: `${iso}.md`, day: parseDay(`> [!habits]- Habits\n> - [${done ? 'x' : ' '}] No sweets\n`) });
const lifecycle = (h: Habit, action: Parameters<typeof changeHabit>[2]) => readHabit(h.path!, changeHabit(h.source!, h, action))!;

describe('habit lifecycle and identity', () => {
  it('archives for December and resumes in January with history and both streak choices', () => {
    const h = make();
    const archived = lifecycle(h, { kind: 'archive', date: '2026-12-01' });
    expect(habitActive(archived, '2026-11-30')).toBe(true);
    expect(habitActive(archived, '2026-12-01')).toBe(false);
    const records = Array.from({ length: 30 }, (_, i) => record(`2026-11-${String(i + 1).padStart(2, '0')}`, true));
    const resumed = lifecycle(archived, { kind: 'resume', date: '2027-01-01', restart: false });
    expect(resumed.id).toBe(h.id);
    const stats = habitStats(habitHistory(resumed, [...records, record('2027-01-01', true)], date('2027-01-01')), date('2027-01-01'));
    expect(stats).toMatchObject({ current: 31, best: 31, completed: 31, rate: 100 });
    const restarted = lifecycle(archived, { kind: 'resume', date: '2027-01-01', restart: true });
    expect(habitStats(habitHistory(restarted, [...records, record('2027-01-01', true)], date('2027-01-01')), date('2027-01-01'))).toMatchObject({ current: 1, best: 30, completed: 31 });
    expect(habitStats(habitHistory(archived, records, date('2026-12-20')), date('2026-12-20'))).toMatchObject({ current: 30, best: 30, completed: 30, rate: 100 });
  });
  it('treats today as pending and missed scheduled days as breaks', () => {
    const h = make();
    const records = [record('2026-11-01', true), record('2026-11-02', true)];
    expect(habitStats(habitHistory(h, records, date('2026-11-03')), date('2026-11-03')).current).toBe(2);
    expect(habitStats(habitHistory(h, records, date('2026-11-04')), date('2026-11-04'))).toMatchObject({ current: 0, best: 2, completed: 2, due: 3 });
  });
  it('can archive on its first day and refuses stale or overlapping schedules', () => {
    const h = make(); const archived = lifecycle(h, { kind: 'archive', date: '2026-11-01' });
    expect(habitActive(archived, '2026-11-01')).toBe(false);
    expect(archived.id).toBe(h.id);
    expect(() => changeHabit(h.source! + '\nOutside edit', h, { kind: 'archive', date: '2026-12-01' })).toThrow('changed outside');
    expect(() => lifecycle(h, { kind: 'archive', date: '2026-10-31' })).toThrow('after the start');
    expect(() => lifecycle(h, { kind: 'resume', date: '2026-12-01', restart: false })).toThrow('already active');
    expect(() => readHabit(h.path!, h.source!.replace('from: 2026-11-01', 'from: 2026-02-31'))).toThrow();
  });
  it.each(['\n', '\r\n'])('changes only the tracking-period value and preserves note text (%s)', (eol) => {
    const h = make(); const source = h.source!.replace('name: No sweets', 'name: No sweets\nextra: keep # comment').replaceAll('\n', eol);
    const shown = readHabit(h.path!, source)!;
    const changed = changeHabit(source, shown, { kind: 'archive', date: '2026-12-01' });
    expect(changed).toContain(`extra: keep # comment${eol}`);
    expect(changed.slice(changed.indexOf(`${eol}# No sweets`))).toBe(source.slice(source.indexOf(`${eol}# No sweets`)));
    expect(readHabit(h.path!, changed)?.periods).toEqual([{ from: '2026-11-01', until: '2026-12-01' }]);
  });
  it('finds historical habits without changing notes and detects duplicate identities', () => {
    const days = [record('2026-10-01', true), record('2026-10-02', true)];
    const history = discoveredHabits(days, []);
    expect(history).toHaveLength(1);
    const continued = newHabit('No sweets', '2026-11-01', 'habit-sweets-001', history[0]);
    const h = readHabit(continued.path, continued.text)!;
    expect(h.periods).toEqual([{ from: '2026-10-01', until: '2026-10-03' }, { from: '2026-11-01' }]);
    expect(discoveredHabits(days, [h])).toEqual([]);
    const duplicate = newHabit('no sweets', '2026-11-01', 'habit-sweets-002');
    const catalog = collectHabits(new Map([[h.path!, h.source!], [duplicate.path, duplicate.text]]));
    expect(catalog.habits).toEqual([]);expect(catalog.problems).toHaveLength(2);
  });
});

describe('daily habit projection and writes', () => {
  it('shows scheduled habits on new days, hides archived habits today, preserves earlier records', () => {
    const h = make(); const original = parseDay('### Tasks\n- [ ] #daily/code Work');
    const projected = withHabits(original, [h], day(2026, 10, 1), day(2026, 10, 1));
    expect(projected.habits[0]).toMatchObject({ label: 'No sweets', habitId: h.id, line: -1 });
    expect(projected.tasks).toEqual(original.tasks);
    const archived = lifecycle(h, { kind: 'archive', date: '2026-11-02' });
    expect(withHabits(record('2026-11-02', false).day, [archived], date('2026-11-02'), date('2026-11-02')).habits).toEqual([]);
    expect(withHabits(record('2026-11-01', true).day, [archived], date('2026-11-01'), date('2026-11-02')).habits).toHaveLength(1);
  });
  it.each(['\n', '\r\n'])('writes a completion without changing tasks, and keeps identity across label changes (%s)', (eol) => {
    const h = make(); const original = ['---', 'period: day', 'date: 2026-11-01', '---', '', '### Tasks', '- [x] #daily/code Work [minutes::30]', ''].join(eol);
    const marked = setHabitCompletion(original, h, false, true);
    expect(marked.startsWith(original)).toBe(true);
    expect(parseDay(marked).habits[0]).toMatchObject({ label: 'No sweets', habitId: h.id, done: true });
    expect(parseDay(marked).tasks).toEqual(parseDay(original).tasks);
    expect(setHabitCompletion(marked, h, true, true)).toBe(marked);
    expect(() => setHabitCompletion(marked, h, false, true)).toThrow('changed outside');
    const renamed = { ...h, name: 'Avoid sweets', aliases: ['No sweets'] };
    const unticked = setHabitCompletion(marked, renamed, true, false);
    expect(unticked).toBe(marked.replace('> - [x]', '> - [ ]'));
  });
  it('uses an existing callout, leaves other callouts untouched and rejects duplicate records', () => {
    const h = make();const text = '> [!habits]- Habits\n> - [x] Meditation\n>[!important]+ Keep\n> Keep these words.\n';
    const changed = setHabitCompletion(text, h, false, true);
    expect(changed).toBe(text.replace('>[!important]', `> - [x] No sweets [habit::${h.id}]\n>[!important]`));
    expect(() => setHabitCompletion('> [!habits]\n> - [x] No sweets\n> - [ ] No sweets\n', h, true, false)).toThrow('duplicate');
    expect(() => setHabitCompletion('```js\nconst x = 2;', h, false, true)).toThrow('code fence');
  });
});

it('does not insert into code samples, open comments or unfinished frontmatter', () => {
  const h = make();
  const source = '```md\n> [!habits]\n> - [x] Example\n```\n\nKeep me.\n';
  const changed = setHabitCompletion(source, h, false, true);
  expect(changed.startsWith(source)).toBe(true);
  expect(() => setHabitCompletion('<!-- never closed\n', h, false, true)).toThrow('comment');
  expect(() => setHabitCompletion('---\nmood: 3\n', h, false, true)).toThrow('frontmatter');
});


it('keeps a task moved outside the habits callout an ordinary task, even with an old ID', () => {
  const h = make();
  const parsed = parseDay(`### Tasks\n- [ ] Ordinary task [habit::${h.id}]\n`);
  expect(parsed.habits).toEqual([]);
  expect(parsed.tasks[0]).toMatchObject({ label: 'Ordinary task', habit: false });
  expect(parsed.tasks[0]?.habitId).toBeUndefined();
});
