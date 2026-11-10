import { category, SPHERES } from './categories';
import { restoreXp, type StoredXp } from './xp';
import { textIdentity } from './text';

export const REWARD_VERSION = 1;
export const UNASSIGNED = 'unassigned';
export const PROFILE_IDS = ['focus', 'practice', 'training', 'leisure'] as const;
export type RewardProfile = typeof PROFILE_IDS[number];
export type RewardTier = 'common' | 'rare' | 'epic' | 'legendary';
export interface RewardProfileRule { rateHundredths: number; boostHundredths: number; boostMinutes: number }
export interface RewardShare { area: string; basisPoints: number }
export interface CategoryReward { profile: RewardProfile; shares: RewardShare[] }
export interface RewardCategory { id: string; name: string; tag: string; aliases: string[]; color: string; kind: 'main' | 'recovery'; archived: boolean; createdAt: string }
export interface RewardArea { id: string; name: string; aliases: string[]; color: string; archived: boolean }
export interface DailyRewardPolicy {
  id: string;
  effectiveFrom: string;
  profiles: Record<RewardProfile, RewardProfileRule>;
  categories: Record<string, CategoryReward>;
}
export interface QuestRewardDefaults { presets: Record<RewardTier, number>; hourlyHundredths: number }
export interface LegacyOpeningBalance { asOf: string; character: StoredXp; areas: Record<string, StoredXp> }
export interface RewardSettings {
  version: 1;
  id: string;
  startDate: string;
  categories: RewardCategory[];
  areas: RewardArea[];
  policies: DailyRewardPolicy[];
  questRewards: QuestRewardDefaults;
  seedCategoryTasks: boolean;
  legacy?: LegacyOpeningBalance;
}
export type RewardSettingsState = { kind: 'legacy' } | { kind: 'ready'; value: RewardSettings } | { kind: 'unavailable'; message: string; raw: unknown };
export const rewardIdentity = textIdentity;
export const defaultAreaId = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
export const DEFAULT_PROFILES: Record<RewardProfile, RewardProfileRule> = {
  focus: { rateHundredths: 100, boostHundredths: 0, boostMinutes: 0 },
  practice: { rateHundredths: 100, boostHundredths: 5000, boostMinutes: 10 },
  training: { rateHundredths: 100, boostHundredths: 1500, boostMinutes: 30 },
  leisure: { rateHundredths: 50, boostHundredths: 0, boostMinutes: 0 },
};
export const DEFAULT_QUEST_REWARDS: QuestRewardDefaults = { presets: { common: 100, rare: 500, epic: 2000, legendary: 6000 }, hourlyHundredths: 10000 };
const STARTERS: [string, RewardProfile, [string, number][]][] = [
  ['business', 'focus', [['career-work', 5000], ['finance', 5000]]],
  ['kaizen', 'focus', [['personal-growth', 10000]]],
  ['code', 'focus', [['career-work', 10000]]],
  ['study', 'focus', [['personal-growth', 10000]]],
  ['biology', 'focus', [['personal-growth', 10000]]],
  ['math', 'focus', [['personal-growth', 10000]]],
  ['english', 'focus', [['personal-growth', 10000]]],
  ['sport', 'training', [['health-fitness', 10000]]],
  ['meditation', 'practice', [['spiritual', 10000]]],
  ['book', 'focus', [['personal-growth', 10000]]],
  ['cinema', 'leisure', [['fun-recreation', 10000]]],
  ['travel', 'leisure', [['fun-recreation', 10000]]],
  ['leisure', 'leisure', [['fun-recreation', 5000], ['social', 5000]]],
  ['dog', 'leisure', [['fun-recreation', 5000], ['social', 5000]]],
];
export const unassignedReward = (): CategoryReward => ({ profile: 'focus', shares: [{ area: UNASSIGNED, basisPoints: 10000 }] });
export function newRewardSettings(id: string, startDate = '1000-01-01'): RewardSettings {
  const categories = STARTERS.map(([tag]): RewardCategory => ({ id: tag, name: tag[0]!.toUpperCase() + tag.slice(1), tag, aliases: [], color: category(tag).color, kind: ['cinema', 'travel', 'leisure', 'dog'].includes(tag) ? 'recovery' : 'main', archived: false, createdAt: startDate }));
  const settings: RewardSettings = {
    version: 1, id, startDate, categories,
    areas: SPHERES.map(({ name, color }) => ({ id: defaultAreaId(name), name, aliases: [], color, archived: false })),
    policies: [{ id: 'initial', effectiveFrom: startDate, profiles: structuredClone(DEFAULT_PROFILES), categories: Object.fromEntries(STARTERS.map(([tag, profile, shares]) => [tag, { profile, shares: shares.map(([area, basisPoints]) => ({ area, basisPoints })) }])) }],
    questRewards: structuredClone(DEFAULT_QUEST_REWARDS), seedCategoryTasks: false,
  };
  validateRewardSettings(settings); return settings;
}
export function rewardPolicy(settings: RewardSettings, date: string): DailyRewardPolicy | undefined {
  if (!validRewardDate(date)) throw new Error('Choose a valid date for XP rules.');
  if (date < settings.startDate) return undefined;
  return settings.policies.findLast((policy) => policy.effectiveFrom <= date);
}
export const rewardCategory = (settings: RewardSettings, tag: string): RewardCategory | undefined => settings.categories.find((item) => [item.tag, ...item.aliases].some((alias) => rewardIdentity(alias) === rewardIdentity(tag)));
export const rewardArea = (settings: RewardSettings, name: string): RewardArea | undefined => settings.areas.find((item) => item.id === name || [item.name, ...item.aliases].some((alias) => rewardIdentity(alias) === rewardIdentity(name)));

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const integer = (value: unknown, max: number) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;
const identifier = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value) && !Object.hasOwn(Object.prototype, value);
export const validRewardDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const name = (value: unknown) => typeof value === 'string' && value.trim().length > 0 && value.length <= 80 && !/\p{Cc}/u.test(value);
const areaName = (value: unknown) => name(value) && !/[[\]:,]/.test(value as string);
export const validCategoryTag = (value: unknown): value is string => typeof value === 'string' && /^[\p{L}\p{M}\p{N}_-]{1,80}$/u.test(value);
/** Percent input stays integral in basis points, including values such as 33.33%. */
export function percentBasisPoints(value: string): number | undefined {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return undefined;
  const basis = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0') || 0);
  return basis <= 10000 ? basis : undefined;
}
export function formatPercent(basisPoints: number): string {
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0 || basisPoints > 10000) throw new Error('Choose a percentage from 0 to 100.');
  const fraction = basisPoints % 100;
  return `${Math.floor(basisPoints / 100)}${fraction ? `.${String(fraction).padStart(2, '0').replace(/0$/, '')}` : ''}`;
}
const color = (value: unknown) => typeof value === 'string' && value.length <= 100 && (/^#[\da-f]{6}$/i.test(value) || /^oklch\(\d+(?:\.\d+)? \d+(?:\.\d+)? \d+(?:\.\d+)?\)$/.test(value) && value.slice(6, -1).split(' ').every((part) => Number.isFinite(Number(part))));
function requireValue(test: unknown, message: string): asserts test { if (!test) throw new Error(message); }
export function validateShares(value: unknown, areas: ReadonlySet<string>): asserts value is RewardShare[] {
  requireValue(Array.isArray(value) && value.length > 0 && value.length <= 101, 'Choose at least one life area or Unassigned.');
  const seen = new Set<string>(); let total = 0;
  for (const raw of value) {
    const share = object(raw);
    requireValue(typeof share.area === 'string' && (share.area === UNASSIGNED || areas.has(share.area)) && !seen.has(share.area), 'A split contains a missing or repeated life area.');
    requireValue(integer(share.basisPoints, 10000), 'Percentages can have up to two decimal places and must be between 0 and 100.');
    seen.add(share.area); total += share.basisPoints as number;
  }
  requireValue(total === 10000, `The split must total 100% (${Math.abs(10000 - total) / 100}% ${total < 10000 ? 'still needed' : 'over'}).`);
}
/** Validate at the persisted/import boundary without rewriting unknown optional fields. */
export function validateRewardSettings(value: unknown): asserts value is RewardSettings {
  const raw = object(value);
  requireValue(raw.version === REWARD_VERSION, 'These XP rules need a different version of Epizen. They have not been replaced.');
  requireValue(identifier(raw.id) && validRewardDate(raw.startDate), 'The XP setup identifier or start date is invalid.');
  requireValue(Array.isArray(raw.categories) && raw.categories.length <= 500 && Array.isArray(raw.areas) && raw.areas.length <= 100, 'The XP category or life-area list is invalid.');
  const categoryIds = new Set<string>(), tags = new Set<string>(), areaIds = new Set<string>(), areaNames = new Set<string>();
  for (const item of raw.categories) {
    const entry = object(item);
    requireValue(identifier(entry.id) && !categoryIds.has(entry.id as string) && name(entry.name) && validRewardDate(entry.createdAt) && color(entry.color) && typeof entry.archived === 'boolean' && ['main', 'recovery'].includes(String(entry.kind)), 'A category has invalid details or a repeated identifier.');
    requireValue(validCategoryTag(entry.tag) && Array.isArray(entry.aliases) && entry.aliases.length <= 100 && entry.aliases.every(validCategoryTag), 'A category has an invalid Markdown tag.');
    for (const tag of new Set([entry.tag, ...entry.aliases].map((item) => rewardIdentity(String(item))))) { requireValue(!tags.has(tag), `The tag “${tag}” already belongs to another category, including its history.`); tags.add(tag); }
    categoryIds.add(entry.id as string);
  }
  for (const item of raw.areas) {
    const entry = object(item);
    requireValue(identifier(entry.id) && entry.id !== UNASSIGNED && !areaIds.has(entry.id as string) && areaName(entry.name) && color(entry.color) && typeof entry.archived === 'boolean', 'A life area has invalid details or a repeated identifier.');
    requireValue(Array.isArray(entry.aliases) && entry.aliases.length <= 100 && entry.aliases.every(areaName), 'A life area has invalid previous names.');
    for (const label of new Set([entry.name, ...(entry.aliases as unknown[])].map((item) => rewardIdentity(String(item))))) { requireValue(label !== 'unassigned' && !areaNames.has(label), `The name “${label}” already belongs to another life area, including its history.`); areaNames.add(label); }
    areaIds.add(entry.id as string);
  }
  requireValue(Array.isArray(raw.policies) && raw.policies.length > 0 && raw.policies.length <= 10000, 'The dated XP rules are missing or too large.');
  const policyIds = new Set<string>(); let previous = '';
  for (const item of raw.policies) {
    const policy = object(item);
    requireValue(identifier(policy.id) && !policyIds.has(policy.id as string) && validRewardDate(policy.effectiveFrom) && policy.effectiveFrom > previous && policy.effectiveFrom >= raw.startDate, 'XP rule dates and identifiers must be unique and ordered.');
    policyIds.add(policy.id as string); previous = policy.effectiveFrom;
    for (const key of PROFILE_IDS) {
      const profile = object(object(policy.profiles)[key]);
      requireValue(integer(profile.rateHundredths, 1_000_000) && integer(profile.boostHundredths, 100_000_000) && integer(profile.boostMinutes, 1440) && (!(profile.boostHundredths as number) || (profile.boostMinutes as number) > 0), `The ${key} reward rule is invalid.`);
    }
    requireValue(policy.categories !== null && typeof policy.categories === 'object' && !Array.isArray(policy.categories), 'The category reward rules are invalid.');
    const rules = object(policy.categories);
    requireValue(Object.keys(rules).length <= 500, 'There are too many category reward rules.');
    for (const [id, item] of Object.entries(rules)) {
      requireValue(categoryIds.has(id), 'A reward rule refers to a missing category.');
      const rule = object(item); requireValue(PROFILE_IDS.includes(rule.profile as RewardProfile), 'Choose a valid reward type.');
      validateShares(rule.shares, areaIds);
    }
    for (const item of raw.categories) {
      const entry = object(item);
      if ((entry.createdAt as string) <= policy.effectiveFrom) requireValue(Object.hasOwn(rules, entry.id as string), 'A dated rule is missing a category that already existed.');
    }
  }
  requireValue(object(raw.policies[0]).effectiveFrom === raw.startDate, 'The first XP policy must match its start date.');
  const quests = object(raw.questRewards), presets = object(quests.presets);
  requireValue(['common', 'rare', 'epic', 'legendary'].every((key) => integer(presets[key], 1_000_000_000)) && integer(quests.hourlyHundredths, 100_000_000), 'Quest rewards must be valid nonnegative amounts.');
  requireValue(typeof raw.seedCategoryTasks === 'boolean', 'Choose whether new daily notes include empty category tasks.');
  if (raw.legacy !== undefined) {
    const legacy = object(raw.legacy); requireValue(validRewardDate(legacy.asOf) && legacy.asOf <= raw.startDate, 'The opening balance date is invalid.');
    restoreXp(legacy.character);
    requireValue(legacy.areas !== null && typeof legacy.areas === 'object' && !Array.isArray(legacy.areas) && Object.keys(object(legacy.areas)).length <= 101, 'The opening life-area balances are invalid.');
    for (const amount of Object.values(object(legacy.areas))) restoreXp(amount);
  }
}
export function readRewardSettings(value: unknown): RewardSettingsState {
  if (value === undefined || value === null) return { kind: 'legacy' };
  try { validateRewardSettings(value); return { kind: 'ready', value: structuredClone(value) }; }
  catch (error) { return { kind: 'unavailable', message: error instanceof Error ? error.message : String(error), raw: value }; }
}
export function vaultRewardSettings(settings: Record<string, unknown>, root: string): RewardSettingsState {
  return readRewardSettings(object(object(settings.vaults)[root]).rewards);
}

/** Identity changes are immediate, but old tags/names remain attached to the same identifier. */
export function renameRewardCategory(settings: RewardSettings, id: string, nextName: string, nextTag: string): RewardSettings {
  const next = structuredClone(settings), entry = next.categories.find((item) => item.id === id);
  requireValue(entry, 'The category is unavailable.');
  entry.name = nextName.trim();
  if (rewardIdentity(entry.tag) !== rewardIdentity(nextTag)) entry.aliases = [...new Set([...entry.aliases, entry.tag])];
  entry.tag = nextTag.normalize('NFC').trim(); validateRewardSettings(next); return next;
}
export function renameRewardArea(settings: RewardSettings, id: string, nextName: string): RewardSettings {
  const next = structuredClone(settings), entry = next.areas.find((item) => item.id === id);
  requireValue(entry, 'The life area is unavailable.');
  if (rewardIdentity(entry.name) !== rewardIdentity(nextName)) entry.aliases = [...new Set([...entry.aliases, entry.name])];
  entry.name = nextName.trim(); validateRewardSettings(next); return next;
}
/** A new tag can start now; adopting a tag already present in notes starts tomorrow. */
export function addRewardCategory(settings: RewardSettings, category: RewardCategory, rule: CategoryReward, today: string, policyId: string, observedTags: ReadonlySet<string>): RewardSettings {
  requireValue(validRewardDate(today) && identifier(policyId), 'Choose a valid date for the category.');
  requireValue(!settings.categories.some((item) => item.id === category.id), 'That category identifier is already in use.');
  requireValue(category.aliases.length === 0, 'A new category cannot claim another category’s old tags.');
  const next = structuredClone(settings), start = new Date(`${today}T12:00:00Z`);
  if ([...observedTags].some((tag) => rewardIdentity(tag) === rewardIdentity(category.tag))) start.setUTCDate(start.getUTCDate() + 1);
  const createdAt = [start.toISOString().slice(0, 10), settings.startDate].sort().at(-1)!;
  next.categories.push({ ...structuredClone(category), createdAt });
  const current = rewardPolicy(settings, createdAt);
  requireValue(current, 'There are no reward rules for that start date.');
  if (!next.policies.some((policy) => policy.effectiveFrom === createdAt)) next.policies.push({ ...structuredClone(current), id: policyId, effectiveFrom: createdAt });
  for (const policy of next.policies) if (policy.effectiveFrom >= createdAt) policy.categories[category.id] = structuredClone(rule);
  next.policies.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const areas = new Map(next.areas.map((area) => [area.id, area]));
  for (const share of rule.shares) requireValue(share.area === UNASSIGNED || !areas.get(share.area)?.archived, 'Choose an active life area or Unassigned.');
  validateRewardSettings(next); return next;
}
export function hideRewardCategory(settings: RewardSettings, id: string): RewardSettings {
  const next = structuredClone(settings), entry = next.categories.find((item) => item.id === id);
  requireValue(entry, 'The category is unavailable.'); entry.archived = true; validateRewardSettings(next); return next;
}
export function removeRewardCategory(settings: RewardSettings, id: string, used: ReadonlySet<string>): RewardSettings {
  const next = structuredClone(settings), entry = next.categories.find((item) => item.id === id);
  requireValue(entry, 'The category is unavailable.');
  if (used.has(id)) entry.archived = true;
  else { next.categories = next.categories.filter((item) => item.id !== id); for (const policy of next.policies) delete policy.categories[id]; }
  validateRewardSettings(next); return next;
}
export function addRewardArea(settings: RewardSettings, area: RewardArea): RewardSettings {
  const next = structuredClone(settings);
  requireValue(area.aliases.length === 0, 'A new life area cannot claim an old name.');
  next.areas.push(structuredClone(area)); validateRewardSettings(next); return next;
}
export function restoreRewardCategory(settings: RewardSettings, id: string): RewardSettings {
  const next = structuredClone(settings), entry = next.categories.find((item) => item.id === id);
  requireValue(entry, 'The archived category is unavailable.'); entry.archived = false; return next;
}
function unassignArea(shares: RewardShare[], id: string): RewardShare[] {
  const combined = new Map<string, number>();
  for (const share of shares) {
    const area = share.area === id ? UNASSIGNED : share.area;
    combined.set(area, (combined.get(area) ?? 0) + share.basisPoints);
  }
  return [...combined].map(([area, basisPoints]) => ({ area, basisPoints }));
}
/** Preserve an area's identity when it has been used; move only future category shares. */
export function removeRewardArea(settings: RewardSettings, id: string, used: ReadonlySet<string>, today: string, policyId: string): RewardSettings {
  requireValue(validRewardDate(today) && identifier(policyId), 'Choose a valid date for the change.');
  const next = structuredClone(settings), entry = next.areas.find((area) => area.id === id);
  requireValue(entry, 'The life area is unavailable.');
  const keep = used.has(id);
  if (keep) entry.archived = true;
  else next.areas = next.areas.filter((area) => area.id !== id);
  if (keep) {
    const current = rewardPolicy(next, today);
    const tomorrow = new Date(`${today}T12:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const effectiveFrom = tomorrow.toISOString().slice(0, 10);
    const referenced = current && Object.values(current.categories).some((rule) => rule.shares.some((share) => share.area === id));
    if (referenced && !next.policies.some((policy) => policy.effectiveFrom === effectiveFrom)) next.policies.push({ ...structuredClone(current), id: policyId, effectiveFrom });
  }
  for (const policy of next.policies) {
    if (keep && policy.effectiveFrom <= today) continue;
    for (const rule of Object.values(policy.categories)) rule.shares = unassignArea(rule.shares, id);
  }
  next.policies.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  validateRewardSettings(next); return next;
}
export function restoreRewardArea(settings: RewardSettings, id: string): RewardSettings {
  const next = structuredClone(settings), entry = next.areas.find((item) => item.id === id);
  requireValue(entry, 'The archived life area is unavailable.'); entry.archived = false; validateRewardSettings(next); return next;
}
/** Only a future date can replace a reward policy. Repeated saves for that date are idempotent. */
export function scheduleRewardPolicy(settings: RewardSettings, policy: DailyRewardPolicy, today: string): RewardSettings {
  requireValue(validRewardDate(today) && validRewardDate(policy.effectiveFrom) && policy.effectiveFrom > today, 'Choose tomorrow or a later day. Past rewards and today’s boost stay unchanged.');
  const next = structuredClone(settings), areas = new Map(next.areas.map((area) => [area.id, area]));
  for (const rule of Object.values(policy.categories)) for (const share of rule.shares) requireValue(share.area === UNASSIGNED || !areas.get(share.area)?.archived, 'Move future shares from archived life areas to another area or Unassigned.');
  const existing = next.policies.find((item) => item.effectiveFrom === policy.effectiveFrom);
  const scheduled = { ...structuredClone(policy), id: existing?.id ?? policy.id };
  next.policies = [...next.policies.filter((item) => item.effectiveFrom !== policy.effectiveFrom), scheduled].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  validateRewardSettings(next); return next;
}
