import { expect, it } from 'vitest';
import { parseDay } from './day';
import { scoreDailyHistory, scoreDailyRewards } from './dailyRewards';
import { newRewardSettings, scheduleRewardPolicy } from './rewardRules';
import { exactXp, formatXp, sumXp } from './xp';

const settings = () => newRewardSettings('demo');
const score = (text: string) => scoreDailyRewards(parseDay(text).tasks, '2026-11-09', settings())!;

it('implements the guide’s meditation, film, training and dog examples', () => {
  expect(score('- [x] Meditate #daily/meditation [minutes::10]').xp).toEqual(exactXp(60));
  expect(score('- [x] Film #daily/cinema [minutes::120]').xp).toEqual(exactXp(60));
  expect(score('- [x] Exercise #daily/sport [minutes::60]').xp).toEqual(exactXp(75));
  const dog = score('- [x] Walk #daily/dog [minutes::60]');
  expect(dog.xp).toEqual(exactXp(30));
  expect(dog.areas.get('fun-recreation')).toEqual(exactXp(15));
  expect(dog.areas.get('social')).toEqual(exactXp(15));
});
it('shares the daily boost between sessions and categories using the same profile', () => {
  const rules = settings();
  rules.categories.push({ ...rules.categories.find((item) => item.id === 'meditation')!, id: 'breathing', name: 'Breathing', tag: 'breathing', aliases: [] });
  rules.policies[0]!.categories.breathing = structuredClone(rules.policies[0]!.categories.meditation!);
  const tasks = parseDay('- [x] Sit #daily/meditation [minutes::5]\n- [ ] Breathe #daily/breathing [minutes::5]\n- [ ] Sit again #daily/meditation [minutes::10]').tasks;
  const result = scoreDailyRewards(tasks, '2026-11-09', rules)!;
  expect(result.awards.map((award) => formatXp(award.xp))).toEqual(['30', '30', '10']);
  expect(result.xp).toEqual(exactXp(70));
  expect(result.claimed).toEqual(exactXp(30));
});
it('keeps fractional sessions exactly and does not count a planned duration as logged time', () => {
  const result = score('- [ ] One #daily/cinema [minutes::1]\n- [ ] Two #daily/cinema [minutes::1]\n- [ ] Plan #daily/cinema [estimate::90]');
  expect(result.awards.map((award) => formatXp(award.xp))).toEqual(['1', '1', '0']);
  expect(result.xp).toEqual(exactXp(1));
  expect(result.logged).toBe(2);
});
it('counts overlapping recorded blocks once in stable note order', () => {
  const result = score('- [x] First #daily/code [minutes::60]\n  - 10:00–11:00\n- [x] Second #daily/code [minutes::60]\n  - 10:30–11:30');
  expect(result.awards.map((award) => award.minutes)).toEqual([60, 30]);
  expect(result.logged).toBe(90);
  expect(result.xp).toEqual(exactXp(90));
});
it('does not restore time explicitly corrected to zero, or count an overlapping block after midnight twice', () => {
  const corrected = score('- [ ] Corrected #daily/code [minutes::0]\n  - 09:00–09:42');
  expect(corrected.xp).toEqual(exactXp(0));
  const days = [
    { path: 'first.md', date: '2026-11-09', tasks: parseDay('- [x] Late #daily/code [minutes::20]\n  - 23:50–00:10').tasks },
    { path: 'second.md', date: '2026-11-10', tasks: parseDay('- [x] Early #daily/code [minutes::15]\n  - 00:00–00:15').tasks },
  ];
  const result = scoreDailyHistory(days.toReversed(), settings());
  expect(result.get('first.md')?.xp).toEqual(exactXp(20));
  expect(result.get('second.md')?.xp).toEqual(exactXp(5));
});
it('respects a legacy block crossing into the first day of the new rules', () => {
  const rules = newRewardSettings('demo', '2026-11-10');
  const days = [
    { path: 'old.md', date: '2026-11-09', tasks: parseDay('- [x] Late #daily/code [minutes::20]\n  - 23:50–00:10').tasks },
    { path: 'new.md', date: '2026-11-10', tasks: parseDay('- [x] Early #daily/code [minutes::15]\n  - 00:00–00:15').tasks },
  ];
  const result = scoreDailyHistory(days, rules);
  expect(result.has('old.md')).toBe(false);
  expect(result.get('new.md')?.xp).toEqual(exactXp(5));
});
it('does not treat malformed or duplicate logged-time fields as trustworthy awards', () => {
  expect(() => score('- [ ] Work #daily/code [minutes::oops]')).toThrow('Invalid logged time');
  expect(() => score('- [ ] Work #daily/code [minutes::10] [minutes::20]')).toThrow('Invalid logged time');
});
it('keeps past splits unchanged and allocates future points without forcing rounded shares to add up', () => {
  const rules = settings(), future = structuredClone(rules.policies[0]!);
  future.id = 'later'; future.effectiveFrom = '2026-11-10';
  future.categories.kaizen = { profile: 'focus', shares: [{ area: 'personal-growth', basisPoints: 3300 }, { area: 'career-work', basisPoints: 3500 }, { area: 'finance', basisPoints: 3200 }] };
  const changed = scheduleRewardPolicy(rules, future, '2026-11-09');
  const tasks = parseDay('- [x] Work #daily/kaizen [minutes::101]').tasks;
  expect(scoreDailyRewards(tasks, '2026-11-09', changed)!.areas.get('personal-growth')).toEqual(exactXp(101));
  const next = scoreDailyRewards(tasks, '2026-11-10', changed)!;
  expect([...next.areas.values()].map(formatXp)).toEqual(['33', '35', '32']);
  expect(sumXp(next.areas.values())).toEqual(next.xp);
});
it('uses Unassigned for unknown categories and preserves archived categories’ historical identity', () => {
  const rules = settings(); rules.categories.find((item) => item.id === 'dog')!.archived = true;
  const result = scoreDailyRewards(parseDay('- [x] Walk #daily/dog [minutes::60]\n- [x] Other #daily/unknown [minutes::5]').tasks, '2026-11-09', rules)!;
  expect(result.areas.get('fun-recreation')).toEqual(exactXp(15));
  expect(result.areas.get('social')).toEqual(exactXp(15));
  expect(result.areas.get('unassigned')).toEqual(exactXp(5));
});
