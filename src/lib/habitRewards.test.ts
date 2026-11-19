import { expect, it } from 'vitest';
import { parseDate, formatDate } from './dates';
import { parseDay } from './day';
import { changeHabit, changeHabitReward, newHabit, readHabit, scoreHabitHistory, type Habit } from './habits';
import { applyHabitRewards } from './habitRewards';
import { lifeXp, sphereXp } from './home';
import { newRewardSettings } from './rewardRules';
import { exactXp } from './xp';

const date = (iso: string) => parseDate(iso, 'YYYY-MM-DD')!;
const record = (iso: string, done = true) => ({
  date: date(iso), path: iso + '.md', day: parseDay('> [!habits]\n> - [' + (done ? 'x' : ' ') + '] No sweets\n'),
});
const create = () => {
  const note = newHabit('No sweets', '2026-11-01', 'habit-sweets-001');
  return readHabit(note.path, note.text)!;
};
const reward = { base: 10, area: 'health-fitness', leagues: [{ days: 3, percent: 175 }] };
const configure = (habit: Habit) => readHabit(habit.path!, changeHabitReward(habit, reward))!;

it('scores the threshold check-in at its new rate when a gap is filled and removes the bonus if undone', () => {
  const habit = configure(create());
  const first = record('2026-11-01');
  const last = record('2026-11-03');
  const missing = record('2026-11-02', false);
  const filled = record('2026-11-02');
  const future = record('2026-11-05');
  const today = date('2026-11-04');
  const initial = scoreHabitHistory([habit], [first, missing, last, future], today);
  expect(initial.get('2026-11-03')?.xp).toEqual(exactXp(10));
  const backfilled = scoreHabitHistory([habit], [first, filled, last, future], today);
  expect([...backfilled.keys()]).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
  expect(backfilled.get('2026-11-03')?.xp).toEqual(exactXp(17.5));
  const days = [first, filled, last].map((entry) => ({
    ...entry, day: applyHabitRewards(entry.day, backfilled.get(formatDate(entry.date, 'YYYY-MM-DD'))),
  }));
  expect(lifeXp(days)).toBe(37.5);
  expect(sphereXp(days).find((area) => area.name === 'Health/Fitness')?.xp).toBe(37.5);
  const settings = newRewardSettings('reward-test');
  settings.areas.find((area) => area.id === 'health-fitness')!.name = 'Wellness';
  expect(sphereXp(days, undefined, settings).find((area) => area.name === 'Wellness')?.xp).toBe(37.5);
  expect(scoreHabitHistory([habit], [first, missing, last], today)).toEqual(initial);
});

it('combines task and habit XP and respects an explicit streak reset after a break', () => {
  const configured = configure(create());
  const lifecycle = (habit: Habit, action: Parameters<typeof changeHabit>[2]) =>
    readHabit(habit.path!, changeHabit(habit.source!, habit, action))!;
  const archived = lifecycle(configured, { kind: 'archive', date: '2026-11-03' });
  const resume = (restart: boolean) => lifecycle(archived, { kind: 'resume', date: '2026-11-04', restart });
  const first = record('2026-11-01');
  const second = record('2026-11-02');
  const last = record('2026-11-04');
  const continued = scoreHabitHistory([resume(false)], [first, second, last], last.date);
  const reset = scoreHabitHistory([resume(true)], [first, second, last], last.date);
  expect(continued.get('2026-11-04')?.xp).toEqual(exactXp(17.5));
  const taskDay = { ...last.day, exactReward: exactXp(20), areaCredits: new Map([['Health/Fitness', exactXp(20)]]),
    totals: { ...last.day.totals, xp: 20, claimed: 5 } };
  const day = applyHabitRewards(taskDay, reset.get('2026-11-04'));
  expect(day.totals).toMatchObject({ xp: 30, claimed: 15 });
  expect(lifeXp([{ ...last, day }])).toBe(30);
  expect(sphereXp([{ ...last, day }]).find((area) => area.name === 'Health/Fitness')?.xp).toBe(30);
});

it('updates block frontmatter without changing the schedule, unrelated fields or body', () => {
  const original = create();
  const block = 'reward: # XP\n  base: 10\n  leagues: []\n# keep this\nexample: hello';
  const source = original.source!.replace('\n---\n', '\n' + block + '\n---\n').replaceAll('\n', '\r\n');
  const habit = readHabit(original.path!, source)!;
  const next = changeHabitReward(habit, reward);
  expect(next).toBe(source.replace('reward: # XP\r\n  base: 10\r\n  leagues: []', 'reward: ' + JSON.stringify(reward) + ' # XP'));
  expect(readHabit(original.path!, next)?.reward).toEqual(reward);
  expect(() => changeHabitReward(habit, { ...reward, leagues: [{ days: 20, percent: 200 }, { days: 5, percent: 100 }] })).toThrow('League days must increase');
});
