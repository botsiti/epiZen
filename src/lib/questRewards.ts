import { formatPercent, percentBasisPoints, type QuestRewardDefaults, type RewardTier } from './rewardRules';
import { addXp, compareXp, exactXp, multiplyXp, roundXp, scaleXp, sumXp, xpRatio, ZERO_XP, type ExactXp } from './xp';
import { textIdentity } from './text';
import type { Quest, Scope } from './quests';

export const LINEAR_QUEST_RULE = 'linear-v1';
export interface QuestMilestone { id: string; title: string; basisPoints: number; done: boolean; line: number; raw: string }
export interface NewMilestone { id: string; title: string; basisPoints: number }
export interface FrozenQuestShare { name: string; basisPoints: number }
export interface NewRewardQuest {
  scope: Scope;
  title: string;
  budget: number;
  tier: RewardTier;
  shares: FrozenQuestShare[];
  target?: number;
  milestones?: NewMilestone[];
}

/** The size describes planned work; weekly/monthly labels never multiply its reward. */
export function rarityForHours(value: string): RewardTier {
  const hours = exactXp(value);
  if (compareXp(hours, ZERO_XP) < 0 || compareXp(hours, exactXp(100000)) > 0) throw new Error('Enter planned hours from 0 to 100,000.');
  return compareXp(hours, exactXp(40)) >= 0 ? 'legendary' : compareXp(hours, exactXp(10)) >= 0 ? 'epic' : compareXp(hours, exactXp(2)) >= 0 ? 'rare' : 'common';
}
export function questBudget(tier: RewardTier, hours: string, defaults: QuestRewardDefaults): number {
  if (!Object.hasOwn(defaults.presets, tier)) throw new Error('Choose a quest size.');
  if (!hours.trim()) return defaults.presets[tier];
  rarityForHours(hours);
  const points = roundXp(scaleXp(exactXp(hours), defaults.hourlyHundredths, 100));
  if (points < 0n || points > 1_000_000_000n) throw new Error('Choose a smaller quest reward.');
  return Number(points);
}
const validId = (id: string) => /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id);
const validTitle = (title: string) => Boolean(title.trim()) && title.length <= 200 && !/[\r\n#<>]/.test(title) && !/[[\]]/.test(title.replace(/\[\[[^[\]\r\n]+\]\]/g, ''));
const validArea = (name: string) => Boolean(name.trim()) && name.length <= 80 && !/[\r\n[\]:,]/.test(name);
function checkShares(shares: readonly FrozenQuestShare[]) {
  if (!shares.length || shares.length > 101) throw new Error('Choose a life-area split or Unassigned.');
  const names = new Set<string>(); let total = 0;
  for (const share of shares) {
    const name = textIdentity(share.name);
    if (!validArea(share.name) || names.has(name) || !Number.isSafeInteger(share.basisPoints) || share.basisPoints < 0 || share.basisPoints > 10000) throw new Error('The life-area split is invalid.');
    names.add(name); total += share.basisPoints;
  }
  if (total !== 10000) throw new Error(`Life-area shares must total 100% (${Math.abs(10000 - total) / 100}% ${total < 10000 ? 'still needed' : 'over'}).`);
}
function checkMilestones(steps: readonly NewMilestone[]) {
  if (steps.length > 100) throw new Error('Use at most 100 quest steps.');
  const ids = new Set<string>(); let total = 0;
  for (const step of steps) {
    if (!validId(step.id) || ids.has(step.id) || !validTitle(step.title) || !Number.isSafeInteger(step.basisPoints) || step.basisPoints < 0 || step.basisPoints > 10000) throw new Error('A quest step has invalid details.');
    ids.add(step.id); total += step.basisPoints;
  }
  if (steps.length && total !== 10000) throw new Error(`Quest steps must share 100% of the reward (${Math.abs(10000 - total) / 100}% ${total < 10000 ? 'still needed' : 'over'}).`);
}

/** Ordinary Markdown and inline fields contain the frozen budget and shares, without a sidecar. */
export function rewardQuestBlock(quest: NewRewardQuest): string {
  if (!['weekly', 'monthly', 'custom'].includes(quest.scope) || !validTitle(quest.title)) throw new Error('Say what counts as done, without tags or brackets.');
  if (!Number.isSafeInteger(quest.budget) || quest.budget < 0 || quest.budget > 1_000_000_000) throw new Error('Choose a valid whole XP reward.');
  if (!['common', 'rare', 'epic', 'legendary'].includes(quest.tier)) throw new Error('Choose a quest size.');
  checkShares(quest.shares);
  const steps = quest.milestones ?? []; checkMilestones(steps);
  if (quest.target !== undefined && (!Number.isSafeInteger(quest.target) || quest.target < 1 || quest.target > 1_000_000 || steps.length > 0)) throw new Error('Choose either equal counter steps or named steps.');
  const spheres = quest.shares.map(({ name, basisPoints }) => `${name.trim()}:${formatPercent(basisPoints)}`).join(', ');
  const parent = `- [ ] #quest/${quest.scope} - ${quest.title.trim()} [xp::${quest.budget}] [spheres::${spheres}] [tier::${quest.tier}] [xp-rule::${LINEAR_QUEST_RULE}]${quest.target ? ` [target::${quest.target}] [current::0]` : ''}`;
  return [parent, ...steps.map((step) => `    - [ ] ${step.title.trim()} [quest-step::${step.id}] [share::${formatPercent(step.basisPoints)}]`)].join('\n');
}

/** Parse only explicitly marked steps; unrelated nested Markdown remains untouched. */
export function parseQuestMilestones(lines: readonly string[], parentLine: number, parentDepth: number): { milestones: QuestMilestone[]; problem?: string } {
  const milestones: QuestMilestone[] = [], ids = new Set<string>(); let nestedQuestDepth: number | undefined;
  for (let index = parentLine + 1; index < lines.length; index++) {
    const raw = lines[index] ?? '';
    if (!raw.trim()) continue;
    const depth = (/^[ \t]*/.exec(raw)?.[0] ?? '').replace(/\t/g, '    ').length;
    if (depth <= parentDepth) break;
    if (nestedQuestDepth !== undefined && depth > nestedQuestDepth) continue;
    nestedQuestDepth = undefined;
    if (/^\s*[-*+]\s+\[[ xX]\].*#quest\/(?:weekly|monthly|custom)\b/.test(raw)) { nestedQuestDepth = depth; continue; }
    if (!/\[quest-step::/i.test(raw)) continue;
    const line = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(raw);
    const idFields = [...raw.matchAll(/\[quest-step::([^\]]*)\]/gi)], shareFields = [...raw.matchAll(/\[share::([^\]]*)\]/gi)];
    const id = idFields[0]?.[1]?.trim() ?? '', basisPoints = percentBasisPoints(shareFields[0]?.[1] ?? '');
    const title = (line?.[2] ?? '').replace(/\[[\w-]+::[^\]]*\]/g, '').trim();
    if (!line || idFields.length !== 1 || shareFields.length !== 1 || !validId(id) || ids.has(id) || !validTitle(title) || basisPoints === undefined) return { milestones, problem: 'A quest step has invalid or duplicate fields. Edit it in the note before changing its reward.' };
    ids.add(id); milestones.push({ id, title, basisPoints, done: line[1] !== ' ', line: index, raw });
    if (milestones.length > 100) return { milestones, problem: 'This quest has too many steps to calculate safely.' };
  }
  if (milestones.length && milestones.reduce((sum, step) => sum + step.basisPoints, 0) !== 10000) return { milestones, problem: 'Quest steps must share exactly 100% of the reward.' };
  return { milestones };
}

export function modernQuestShares(quest: Quest): FrozenQuestShare[] | undefined {
  if (!quest.spheres.length) return [{ name: 'Unassigned', basisPoints: 10000 }];
  const shares = quest.spheres.map(({ name, weight }) => ({ name, basisPoints: percentBasisPoints(String(weight)) ?? -1 }));
  try { checkShares(shares); return shares; } catch { return undefined; }
}
/** Undefined means an unsupported or malformed rule; do not silently substitute old scoring. */
export function modernQuestProgress(quest: Quest): ExactXp | undefined {
  if (quest.rewardRule !== LINEAR_QUEST_RULE || quest.rewardProblem || !Number.isSafeInteger(quest.xp) || quest.xp < 0 || quest.xp > 1_000_000_000 || !modernQuestShares(quest)) return undefined;
  const steps = quest.milestones ?? [];
  if (steps.length) {
    if (quest.target !== undefined) return undefined;
    return xpRatio(BigInt(steps.filter((step) => step.done).reduce((sum, step) => sum + step.basisPoints, 0)), 10000n);
  }
  if (quest.target !== undefined) {
    if (!Number.isSafeInteger(quest.target) || quest.target < 1 || !Number.isSafeInteger(quest.current ?? 0) || (quest.current ?? 0) < 0) return undefined;
    return xpRatio(BigInt(Math.min(quest.target, quest.current ?? 0)), BigInt(quest.target));
  }
  return quest.checked || quest.rewarded ? exactXp(1) : ZERO_XP;
}
export function modernQuestCredit(quest: Quest): ExactXp | undefined {
  const share = modernQuestProgress(quest);
  return share && multiplyXp(exactXp(quest.xp), share);
}
export function modernQuestAreaCredits(quest: Quest): Map<string, ExactXp> | undefined {
  const credit = modernQuestCredit(quest), shares = modernQuestShares(quest);
  if (!credit || !shares) return undefined;
  const result = new Map<string, ExactXp>();
  for (const share of shares) result.set(share.name, addXp(result.get(share.name) ?? ZERO_XP, scaleXp(credit, share.basisPoints, 10000)));
  // This also catches accidental duplicate or missing allocation in the caller’s contract.
  if (compareXp(sumXp(result.values()), credit) !== 0) return undefined;
  return result;
}
