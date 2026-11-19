// @vitest-environment node
import { expect, it } from 'vitest';
import { day } from './dates';
import { parseDay } from './day';
import { exactXp } from './xp';
import { sphereXp } from './home';
import { questActivity, taskTags } from './questActivity';
import { addRewardShare, changeTaskCategory, removeRewardShare, editQuestPreferences, newQuestArea, newTaskRule, saveQuestPreferences } from './questPreferences';
import { parseQuests, questLine, questSphereXp } from './quests';
import { addBlock, findTask } from './timeblocks';

const first = '2026-11-18', next = '2026-11-19';
const task = '- [ ] #daily/meditation — Sit';
const logged = addBlock(task, findTask(task, { label: 'Sit', category: 'meditation' }), 600, 610);

it('combines completed timer blocks with historical quest credit across rule and tag changes', () => {
  const original = saveQuestPreferences(editQuestPreferences(undefined, 0, first));
  const draft = editQuestPreferences(original, 1, next);
  const meditation = draft.categories.find((item) => item.tag === 'meditation')!;
  meditation.tag = 'sit'; meditation.rate = '7.5';
  const craft = { ...newQuestArea('craft', 8), name: 'Craft' };
  draft.areas = [...draft.areas.map((area) => area.id === 'spiritual' ? { ...area, name: 'Mindfulness' } : area), craft];
  meditation.shares = [{ area: 'spiritual', percent: '60' }, { area: 'craft', percent: '40' }];
  const settings = saveQuestPreferences(draft);
  const sessions = [
    { path: 'old.md', date: first, day: parseDay(logged) },
    { path: 'new.md', date: next, day: parseDay(logged.replace('meditation', 'sit')) },
  ];
  const scores = questActivity(sessions, settings);
  expect(scores.get('old.md')?.totals.xp).toBe(50);
  expect(scores.get('new.md')?.totals.xp).toBe(75);
  expect(scores.get('old.md')?.byCategory[0]?.[0].name).toBe('sit');
  expect(scores.get('old.md')?.tasks[0]?.category?.name).toBe('meditation'); // Timer reconnection uses the original tag.
  const quest = parseQuests('week.md', '- [x] #quest/weekly - Sit daily [xp::100] [spheres::Spiritual]')[0]!;
  const spheres = sphereXp([...scores.values()].map((d) => ({ date: day(2026, 10, 19), day: d })), questSphereXp([{ quest }]), settings);
  expect(spheres.find((entry) => entry.name === 'Mindfulness')?.xp).toBe(195);
  expect(spheres.find((entry) => entry.name === 'Craft')?.xp).toBe(30);
  expect(taskTags(['meditation', 'sit'], settings).filter((tag) => ['meditation', 'sit'].includes(tag))).toEqual(['sit']);
  expect(questLine({ scope: 'weekly', title: 'Carve a bowl', xp: 100, tier: 'common', spheres: [{ name: 'Craft', weight: 100 }], target: 0 }, settings.areas)).toContain('[spheres::Craft]');
});

it('archives choices without orphaning past scores and validates new tags and splits', () => {
  const original = saveQuestPreferences(editQuestPreferences(undefined, 0, first));
  const draft = editQuestPreferences(original, 1, next);
  draft.areas = draft.areas.map((item) => item.id === 'spiritual' ? { ...item, archived: true } : item);
  draft.categories.find((item) => item.tag === 'meditation')!.archived = true;
  const drawing = newTaskRule('art', next, 2);
  draft.categories.push({ ...drawing, tag: 'рисунок', rate: '2.5', shares: [{ area: 'personal-growth', percent: '100' }] });
  const settings = saveQuestPreferences(draft);
  expect(taskTags(['meditation'], settings)).not.toContain('meditation');
  expect(taskTags([], settings)).toContain('рисунок');
  const days = questActivity([first, next].map((date) => ({ date, path: date, day: parseDay(logged) })), settings);
  expect(days.get(first)?.areaCredits?.get('Spiritual')).toEqual(exactXp(50));
  expect(days.get(next)?.areaCredits?.get('Unassigned')).toEqual(exactXp(50));
  draft.categories.at(-1)!.shares[0]!.percent = '99';
  expect(() => saveQuestPreferences(draft)).toThrow(/total 100%/);
  draft.categories.at(-1)!.shares[0]!.percent = '100';
  draft.categories.at(-1)!.tag = 'meditation';
  expect(() => saveQuestPreferences(draft)).toThrow(/already belongs/);
});

it('keeps legacy days and isolates a malformed log from another day’s XP', () => {
  const settings = saveQuestPreferences(editQuestPreferences(undefined, 0, first));
  const days = questActivity([
    { date: '2020-01-01', path: 'legacy', day: parseDay(logged) },
    { date: first, path: 'bad', day: parseDay(logged + ' [minutes::oops]\n- [ ] Broken [minutes::oops]') },
    { date: next, path: 'good', day: parseDay(logged) },
  ], settings);
  expect(days.get('legacy')?.totals.xp).toBe(50);
  expect(days.get('bad')?.rewardProblem).toMatch(/Invalid logged time/);
  expect(days.get('bad')?.totals.xp).toBe(0);
  expect(days.get('good')?.tasks[0]?.earnedXp).toBe(50);
});

it('keeps a newly logged day under legacy rules if the first setup moves to tomorrow', () => {
  const draft = editQuestPreferences(undefined, 0, first);
  draft.categories.find((item) => item.tag === 'meditation')!.rate = '3';
  const settings = saveQuestPreferences({ ...draft, effectiveFrom: next });
  expect(settings.startDate).toBe(next);
  const days = questActivity([first, next].map((date) => ({ date, path: date, day: parseDay(logged) })), settings);
  expect(days.get(first)?.totals.xp).toBe(50);
  expect(days.get(next)?.totals.xp).toBe(30);
});

it('offers categories from notes and adopts only the edited tag, retaining its older spelling', () => {
  const draft = editQuestPreferences(undefined, 0, first, ['woodwork', 'swimming', 'SWIMMING', 'CODE']);
  expect(draft.categories.filter((entry) => entry.suggested).map((entry) => entry.tag)).toEqual(['woodwork', 'swimming']);
  const item = draft.categories.find((entry) => entry.tag === 'woodwork')!;
  const edited = changeTaskCategory(draft, item.id, { tag: 'Wood Craft', rate: '2.5', shares: [{ area: 'personal-growth', percent: '100' }] });
  const saved = saveQuestPreferences(edited, ['woodwork', 'swimming']);
  expect(saved.categories.some((entry) => entry.tag === 'swimming')).toBe(false);
  expect(saved.categories.find((entry) => entry.id === item.id)).toMatchObject({ name: 'wood-craft', tag: 'wood-craft', aliases: ['woodwork'] });
  const lookup = taskTags(['woodwork', 'wood-craft', 'swimming'], saved);
  expect(lookup).toContain('wood-craft');
  expect(lookup).toContain('swimming');
  expect(lookup).not.toContain('woodwork');
  const activity = questActivity([{ path: 'logged', date: first, day: parseDay('- [ ] #daily/woodwork Carve [minutes::10]') }], saved);
  expect(activity.get('logged')?.areaCredits?.get('Personal Growth')).toEqual(exactXp(25));
});

it('balances new and removed destinations to the hundredth of a percent', () => {
  const shares = [{ area: 'finance', percent: '66.67' }, { area: 'spiritual', percent: '33.33' }];
  const split = addRewardShare(shares, 'social');
  expect(split.map((row) => row.percent)).toEqual(['33.34', '33.33', '33.33']);
  expect(removeRewardShare(split, 2)).toEqual(shares);
  expect(addRewardShare([{ area: 'social', percent: '80' }], 'finance')[1]?.percent).toBe('20');
});
