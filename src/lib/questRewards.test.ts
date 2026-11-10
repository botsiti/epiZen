import { expect, it } from 'vitest';
import { DEFAULT_QUEST_REWARDS } from './rewardRules';
import { modernQuestAreaCredits, modernQuestCredit, questBudget, rarityForHours, rewardQuestBlock } from './questRewards';
import { addQuest, changeQuest, earned, parseQuests, penalty, questXpExact, setQuestProgress, toggleQuest } from './quests';
import { exactXp, formatXp, sumXp } from './xp';

const date = new Date(2026, 10, 9, 12);
const parse = (text: string) => parseQuests('week.md', text)[0]!;

it('uses the guide’s presets, precise hours and rarity boundaries', () => {
  expect(['common', 'rare', 'epic', 'legendary'].map((tier) => questBudget(tier as 'common' | 'rare' | 'epic' | 'legendary', '', DEFAULT_QUEST_REWARDS))).toEqual([100, 500, 2000, 6000]);
  expect(questBudget('rare', '240', DEFAULT_QUEST_REWARDS)).toBe(24000);
  expect(questBudget('rare', '0.833333333333', DEFAULT_QUEST_REWARDS)).toBe(83);
  for (const [hours, tier] of [['1.99', 'common'], ['2', 'rare'], ['9.99', 'rare'], ['10', 'epic'], ['39.99', 'epic'], ['40', 'legendary']]) expect(rarityForHours(hours!)).toBe(tier);
});
it('shares one frozen reward across weighted steps, supports corrections, and preserves unrelated text', () => {
  const before = '# Week\r\n\r\n### Quest XP\r\n\r\n## Journal\r\nKeep [[everything]] exactly.\r\n';
  const block = rewardQuestBlock({ scope: 'weekly', title: 'Publish [[the site]]', budget: 2000, tier: 'epic', shares: [{ name: 'Career/Work', basisPoints: 7000 }, { name: 'Finance', basisPoints: 3000 }], milestones: [
    { id: 'outline', title: 'Outline', basisPoints: 2500 }, { id: 'build', title: 'Build', basisPoints: 7500 },
  ] });
  let text = addQuest(before, block), quest = parse(text);
  expect(text).toContain('## Journal\r\nKeep [[everything]] exactly.\r\n');
  expect(modernQuestCredit(quest)).toEqual(exactXp(0));
  text = changeQuest(text, quest, { kind: 'milestone', id: 'outline', done: true }, date); quest = parse(text);
  expect(modernQuestCredit(quest)).toEqual(exactXp(500));
  const areas = modernQuestAreaCredits(quest)!;
  expect(areas.get('Career/Work')).toEqual(exactXp(350));
  expect(areas.get('Finance')).toEqual(exactXp(150));
  expect(sumXp(areas.values())).toEqual(modernQuestCredit(quest));
  expect(changeQuest(text, quest, { kind: 'milestone', id: 'outline', done: true }, date)).toBe(text);
  text = changeQuest(text, quest, { kind: 'milestone', id: 'build', done: true }, date); quest = parse(text);
  expect(quest.done).toBe(true); expect(modernQuestCredit(quest)).toEqual(exactXp(2000));
  text = toggleQuest(text, quest, date); quest = parse(text);
  expect(quest.done).toBe(false); expect(modernQuestCredit(quest)).toEqual(exactXp(2000));
  text = toggleQuest(text, quest, date); quest = parse(text);
  expect(modernQuestCredit(quest)).toEqual(exactXp(2000));
  text = changeQuest(text, quest, { kind: 'milestone', id: 'outline', done: false }, date); quest = parse(text);
  expect(modernQuestCredit(quest)).toEqual(exactXp(1500));
  expect(text).toContain('## Journal\r\nKeep [[everything]] exactly.\r\n');
});
it('keeps a binary reward when reopened or paused, and reverses it only on explicit correction', () => {
  let text = rewardQuestBlock({ scope: 'monthly', title: 'Publish', budget: 101, tier: 'rare', shares: [{ name: 'Career/Work', basisPoints: 3300 }, { name: 'Finance', basisPoints: 3500 }, { name: 'Social', basisPoints: 3200 }] });
  text = toggleQuest(text, parse(text), date); let quest = parse(text);
  expect([...modernQuestAreaCredits(quest)!.values()].map(formatXp)).toEqual(['33', '35', '32']);
  text = toggleQuest(text, quest, date); quest = parse(text);
  expect(quest.done).toBe(false); expect(modernQuestCredit(quest)).toEqual(exactXp(101));
  text = changeQuest(text, quest, { kind: 'status', status: 'abandoned' }, date); quest = parse(text);
  expect(quest.status).toBe('abandoned'); expect(modernQuestCredit(quest)).toEqual(exactXp(101));
  text = changeQuest(text, quest, { kind: 'undo-reward' }, date);
  expect(modernQuestCredit(parse(text))).toEqual(exactXp(0));
});
it('uses linear counter progress without an early bonus or late penalty', () => {
  let text = rewardQuestBlock({ scope: 'weekly', title: 'Four runs', budget: 2000, tier: 'epic', shares: [{ name: 'Health/Fitness', basisPoints: 10000 }], target: 4 });
  text += ' [deadline::2026-10-01]';
  text = setQuestProgress(text, parse(text), 2, date); const quest = parse(text);
  expect(earned(quest)).toBe(1000);
  expect(penalty(quest, '2028-01-01')).toBe(0);
  expect(setQuestProgress(text, quest, 2, date)).toBe(text);
  expect(questXpExact([{ quest }], '2028-01-01')).toEqual(exactXp(1000));
});
it('does not calculate or rewrite malformed, unsupported or concurrently changed rewards', () => {
  const block = rewardQuestBlock({ scope: 'weekly', title: 'Work', budget: 500, tier: 'rare', shares: [{ name: 'Career/Work', basisPoints: 10000 }], milestones: [{ id: 'one', title: 'First', basisPoints: 10000 }] });
  const quest = parse(block);
  expect(() => changeQuest(block.replace('First', 'Changed elsewhere'), quest, { kind: 'milestone', id: 'one', done: true }, date)).toThrow('changed');
  const malformed = parse(block.replace('[share::100]', '[share::75]'));
  expect(modernQuestCredit(malformed)).toBeUndefined();
  expect(() => toggleQuest(block.replace('[share::100]', '[share::75]'), malformed, date)).toThrow('100%');
  const newer = parse(block.replace('linear-v1', 'linear-v2'));
  expect(modernQuestCredit(newer)).toBeUndefined();
  expect(Number.isNaN(earned(newer))).toBe(true);
});
