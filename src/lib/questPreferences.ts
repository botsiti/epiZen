import { TIERS, type Tier } from './quests';
import { category, habitColor } from './categories';
import {
  defaultAreaId, formatPercent, newRewardSettings, percentBasisPoints, rewardIdentity, rewardPolicy,
  UNASSIGNED, validateRewardSettings, type RewardArea, type RewardCategory, type RewardSettings,
} from './rewardRules';

export interface EditableShare { area: string; percent: string }
export interface EditableCategory extends RewardCategory { rate: string; shares: EditableShare[] }
export interface QuestPreferences {
  base: RewardSettings;
  revision: number;
  effectiveFrom: string;
  areas: RewardArea[];
  categories: EditableCategory[];
  presets: Record<Tier, string>;
}

/** Start with the rates and splits the existing dashboards use, including meditation at 5 XP/min. */
function starterRules(date: string): RewardSettings {
  const base = newRewardSettings('quest-settings', date);
  for (const tier of Object.keys(TIERS) as Tier[]) base.questRewards.presets[tier] = TIERS[tier].xp;
  const policy = base.policies[0]!;
  for (const item of base.categories) {
    const defaults = category(item.tag);
    item.kind = defaults.kind;
    policy.categories[item.id] = {
      profile: 'focus', rateHundredths: defaults.multiplier * 100,
      shares: Object.entries(defaults.spheres).map(([name, percent]) => ({ area: defaultAreaId(name), basisPoints: percent * 100 })),
    };
  }
  return base;
}

export function editQuestPreferences(value: RewardSettings | undefined, revision: number, effectiveFrom: string): QuestPreferences {
  const base = value ?? starterRules(effectiveFrom);
  // Include a pending policy when reopening settings before its start date.
  const date = [effectiveFrom, base.policies.at(-1)!.effectiveFrom].sort().at(-1)!;
  const policy = rewardPolicy(base, date)!;
  const categories = base.categories.map((item) => {
    const rule = policy.categories[item.id] ?? rewardPolicy(base, item.createdAt)?.categories[item.id];
    return { ...item, rate: rule?.rateHundredths === undefined ? '' : String(rule.rateHundredths / 100),
      shares: (rule?.shares ?? [{ area: UNASSIGNED, basisPoints: 10000 }]).map(({ area, basisPoints }) => ({ area, percent: formatPercent(basisPoints) })) };
  });
  const presets = Object.fromEntries(Object.entries(base.questRewards.presets).map(([key, value]) => [key, String(value)])) as Record<Tier, string>;
  return { base, revision, effectiveFrom: date, areas: base.areas, categories, presets };
}

export function newQuestArea(id: string, index: number): RewardArea {
  return { id, name: '', aliases: [], color: habitColor(index), archived: false };
}
export function newTaskRule(id: string, date: string, index: number): EditableCategory {
  return { id, name: '', tag: '', aliases: [], color: habitColor(index), kind: 'main', createdAt: date, archived: false,
    rate: '1', shares: [{ area: UNASSIGNED, percent: '100' }] };
}
function previousNames(current: string, previous: string | undefined, aliases: string[]) {
  return previous && rewardIdentity(previous) !== rewardIdentity(current) ? [...new Set([...aliases, previous])] : aliases;
}

/** Replace only the editable date's policy. Names and tags retain their historical identities. */
export function saveQuestPreferences(draft: QuestPreferences, observed: readonly string[] = []): RewardSettings {
  const { effectiveFrom } = draft;
  // A timer can finish while the first draft is open, moving the cutover to tomorrow.
  const base = draft.revision === 0 ? starterRules(effectiveFrom) : draft.base;
  const next = structuredClone(base);
  for (const tier of Object.keys(TIERS) as Tier[]) {
    const amount = draft.presets[tier];
    if (!/^\d+$/.test(amount) || Number(amount) > 1_000_000_000) throw new Error(`Enter a whole XP reward from 0 to 1,000,000,000 for ${tier} quests.`);
    next.questRewards.presets[tier] = Number(amount);
  }
  const policy = structuredClone(rewardPolicy(base, effectiveFrom)!);
  policy.effectiveFrom = effectiveFrom;
  policy.id = base.policies.find((item) => item.effectiveFrom === effectiveFrom)?.id ?? `rules-${effectiveFrom}`;
  next.areas = draft.areas.map((area) => ({ ...area, name: area.name.trim(),
    aliases: previousNames(area.name, base.areas.find((item) => item.id === area.id)?.name, area.aliases) }));
  if (!next.areas.some((area) => !area.archived)) throw new Error('Keep at least one active life sphere for new quests.');
  next.categories = draft.categories.map(({ rate, shares, ...item }) => {
    const tag = item.tag.trim();
    const previous = base.categories.find((entry) => entry.id === item.id);
    if (previous && rewardIdentity(tag) !== rewardIdentity(previous.tag) && !previous.aliases.some((alias) => rewardIdentity(alias) === rewardIdentity(tag))
      && observed.some((used) => rewardIdentity(used) === rewardIdentity(tag))) throw new Error(`The tag “${tag}” already has tasks. Add it as its own category to keep its historical XP.`);
    if (rate !== '' && (!/^\d+(\.\d{1,2})?$/.test(rate) || Number(rate) > 10000)) throw new Error(`Enter an XP rate from 0 to 10,000 with up to two decimal places for ${tag || 'the new category'}.`);
    const allocations = new Map<string, number>();
    const seen = new Set<string>();
    for (const share of shares) {
      const percent = percentBasisPoints(share.percent);
      if (percent === undefined || seen.has(share.area)) throw new Error(`Check the life sphere split for ${tag}. Each sphere needs one percentage.`);
      seen.add(share.area);
      const area = next.areas.find((entry) => entry.id === share.area)?.archived ? UNASSIGNED : share.area;
      allocations.set(area, (allocations.get(area) ?? 0) + percent);
    }
    policy.categories[item.id] = { profile: policy.categories[item.id]?.profile ?? 'focus',
      ...(rate !== '' ? { rateHundredths: Math.round(Number(rate) * 100) } : {}),
      shares: [...allocations].map(([area, basisPoints]) => ({ area, basisPoints })) };
    return { ...item, createdAt: previous?.createdAt ?? effectiveFrom, tag, name: previous?.tag === tag ? previous.name : tag,
      aliases: previousNames(tag, previous?.tag, item.aliases) };
  });
  if (!next.categories.some((item) => !item.archived)) throw new Error('Keep at least one active task category for logging time.');
  next.policies = [...next.policies.filter((entry) => entry.effectiveFrom !== effectiveFrom), policy].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  validateRewardSettings(next);
  return next;
}
