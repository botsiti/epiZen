import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { addRewardCategory, formatPercent, hideRewardCategory, newRewardSettings, percentBasisPoints, readRewardSettings, removeRewardArea, removeRewardCategory, renameRewardArea, renameRewardCategory, restoreRewardArea, restoreRewardCategory, rewardArea, rewardCategory, rewardPolicy, scheduleRewardPolicy, validateRewardSettings, validateShares } from './rewardRules';

it('accepts the shared native/frontend settings contract fixture', () => {
  const fixture: unknown = JSON.parse(readFileSync(resolve('test/fixtures/reward-settings.json'), 'utf8'));
  expect(() => validateRewardSettings(fixture)).not.toThrow();
});

it('starts with the guide’s complete ready-to-use category, area and reward defaults', () => {
  const settings = newRewardSettings('vault-1');
  expect(() => validateRewardSettings(settings)).not.toThrow();
  expect(settings.categories).toHaveLength(14);
  expect(settings.areas).toHaveLength(8);
  expect(settings.policies[0]?.categories.dog).toEqual({ profile: 'leisure', shares: [{ area: 'fun-recreation', basisPoints: 5000 }, { area: 'social', basisPoints: 5000 }] });
  expect(settings.questRewards.presets).toEqual({ common: 100, rare: 500, epic: 2000, legendary: 6000 });
  expect(settings.seedCategoryTasks).toBe(false);
});
it('reserves a used category’s old tag through rename, archive and restore without changing its rules', () => {
  const before = newRewardSettings('vault-1'), renamed = renameRewardCategory(before, 'kaizen', 'Personal practice', 'practice-time');
  const archived = removeRewardCategory(renamed, 'kaizen', new Set(['kaizen']));
  expect(rewardCategory(archived, 'kaizen')).toMatchObject({ id: 'kaizen', name: 'Personal practice', archived: true });
  expect(rewardCategory(archived, 'practice-time')?.id).toBe('kaizen');
  expect(archived.policies).toEqual(before.policies);
  expect(restoreRewardCategory(archived, 'kaizen').categories.find((item) => item.id === 'kaizen')?.archived).toBe(false);
  const collision = structuredClone(archived); collision.categories.push({ ...before.categories[0]!, id: 'different', tag: 'kaizen' });
  expect(() => validateRewardSettings(collision)).toThrow('already belongs');
});
it('allows complete removal of a never-used category and keeps a renamed life area’s identity', () => {
  const settings = newRewardSettings('vault-1');
  const removed = removeRewardCategory(settings, 'biology', new Set());
  expect(rewardCategory(removed, 'biology')).toBeUndefined();
  expect(removed.policies[0]?.categories.biology).toBeUndefined();
  const renamed = renameRewardArea(settings, 'personal-growth', 'Learning');
  expect(rewardArea(renamed, 'Personal Growth')?.id).toBe('personal-growth');
  expect(rewardArea(renamed, 'Learning')?.id).toBe('personal-growth');
});
it('hides and restores a category without deleting it, even when it has not been used yet', () => {
  const hidden = hideRewardCategory(newRewardSettings('vault-1'), 'biology');
  expect(rewardCategory(hidden, 'biology')?.archived).toBe(true);
  expect(restoreRewardCategory(hidden, 'biology').categories.find((item) => item.id === 'biology')?.archived).toBe(false);
});
it('adds a new category today without changing old awards, and delays adopting an existing tag', () => {
  const before = newRewardSettings('vault-1');
  const entry = { ...before.categories[0]!, id: 'drawing', name: 'Drawing: art', tag: 'рисование', aliases: [] };
  const rule = { profile: 'practice' as const, shares: [{ area: 'personal-growth', basisPoints: 10000 }] };
  const next = addRewardCategory(before, entry, rule, '2026-11-09', 'new-category', new Set());
  expect(rewardPolicy(next, '2026-11-08')).toEqual(before.policies[0]);
  expect(rewardPolicy(next, '2026-11-09')?.categories.drawing).toEqual(rule);
  const adopted = addRewardCategory(before, entry, rule, '2026-11-09', 'existing-category', new Set(['рисование']));
  expect(rewardPolicy(adopted, '2026-11-09')?.categories.drawing).toBeUndefined();
  expect(rewardPolicy(adopted, '2026-11-10')?.categories.drawing).toEqual(rule);
  const collision = { ...entry, id: 'different', tag: 'dog' };
  expect(() => addRewardCategory(before, collision, rule, '2026-11-09', 'collision', new Set())).toThrow('already belongs');
});
it('schedules changed shares for future days and does not duplicate a retried change', () => {
  const before = newRewardSettings('vault-1'), policy = structuredClone(before.policies[0]!);
  policy.id = 'future'; policy.effectiveFrom = '2026-11-10';
  policy.categories.kaizen = { profile: 'focus', shares: [{ area: 'personal-growth', basisPoints: 7000 }, { area: 'career-work', basisPoints: 3000 }] };
  const next = scheduleRewardPolicy(before, policy, '2026-11-09');
  expect(rewardPolicy(next, '2026-11-09')).toEqual(before.policies[0]);
  expect(rewardPolicy(next, '2026-11-10')?.categories.kaizen).toEqual(policy.categories.kaizen);
  expect(scheduleRewardPolicy(next, { ...policy, id: 'retry-id' }, '2026-11-09')).toEqual(next);
  expect(() => scheduleRewardPolicy(before, { ...policy, effectiveFrom: '2026-11-09' }, '2026-11-09')).toThrow('tomorrow');
});
it('archives a used life area, preserving past splits and moving future shares to Unassigned', () => {
  const before = newRewardSettings('vault-1');
  const archived = removeRewardArea(before, 'spiritual', new Set(['spiritual']), '2026-11-09', 'archive-change');
  expect(archived.areas.find((area) => area.id === 'spiritual')?.archived).toBe(true);
  expect(rewardPolicy(archived, '2026-11-09')?.categories.meditation?.shares).toEqual([{ area: 'spiritual', basisPoints: 10000 }]);
  expect(rewardPolicy(archived, '2026-11-10')?.categories.meditation?.shares).toEqual([{ area: 'unassigned', basisPoints: 10000 }]);
  const restored = restoreRewardArea(archived, 'spiritual');
  expect(restored.areas.find((area) => area.id === 'spiritual')?.archived).toBe(false);
  expect(rewardPolicy(restored, '2026-11-10')?.categories.meditation?.shares).toEqual([{ area: 'unassigned', basisPoints: 10000 }]);
});
it('deletes a never-used life area without leaving invalid references', () => {
  const next = removeRewardArea(newRewardSettings('vault-1'), 'spiritual', new Set(), '2026-11-09', 'unused-change');
  expect(rewardArea(next, 'Spiritual')).toBeUndefined();
  expect(next.policies[0]?.categories.meditation?.shares).toEqual([{ area: 'unassigned', basisPoints: 10000 }]);
  expect(() => validateRewardSettings(next)).not.toThrow();
});
it('requires exact percentage totals and retains unsupported stored rules rather than substituting defaults', () => {
  expect(percentBasisPoints('33.33')).toBe(3333);
  expect(formatPercent(3333)).toBe('33.33');
  expect(percentBasisPoints('33.333')).toBeUndefined();
  expect(percentBasisPoints('100.01')).toBeUndefined();
  const ids = new Set(['one', 'two', 'three']);
  expect(() => validateShares([{ area: 'one', basisPoints: 3333 }, { area: 'two', basisPoints: 3333 }, { area: 'three', basisPoints: 3334 }], ids)).not.toThrow();
  expect(() => validateShares([{ area: 'one', basisPoints: 9900 }], ids)).toThrow('still needed');
  const newer = { ...newRewardSettings('vault-1'), version: 2 };
  expect(readRewardSettings(newer)).toMatchObject({ kind: 'unavailable', raw: newer });
  expect(readRewardSettings(undefined)).toEqual({ kind: 'legacy' });
  const malformed = newRewardSettings('vault-1'); delete malformed.policies[0]!.categories.kaizen;
  expect(readRewardSettings(malformed).kind).toBe('unavailable');
  const unsafe = newRewardSettings('vault-1'); unsafe.categories[0]!.id = 'constructor';
  expect(() => validateRewardSettings(unsafe)).toThrow('identifier');
});
