import type { DayTask, TimeBlock } from './day';
import { rewardCategory, rewardPolicy, unassignedReward, validRewardDate, type DailyRewardPolicy, type RewardCategory, type RewardProfile, type RewardSettings } from './rewardRules';
import { addXp, compareXp, exactXp, minXp, multiplyXp, scaleXp, subtractXp, sumXp, ZERO_XP, type ExactXp } from './xp';

export interface DailyAward {
  line: number;
  category?: RewardCategory;
  profile: RewardProfile;
  minutes: number;
  xp: ExactXp;
  areas: ReadonlyMap<string, ExactXp>;
  done: boolean;
}
export interface DailyRewards {
  policyId: string;
  awards: DailyAward[];
  xp: ExactXp;
  claimed: ExactXp;
  areas: ReadonlyMap<string, ExactXp>;
  logged: number;
  main: number;
  recovery: number;
}

/** Cumulative points for a profile on one day; differences award only the unused daily boost. */
export function profileXp(policy: DailyRewardPolicy, profile: RewardProfile, minutes: ExactXp): ExactXp {
  const rule = policy.profiles[profile];
  if (compareXp(minutes, ZERO_XP) < 0) throw new Error('Logged minutes cannot be negative.');
  const base = scaleXp(minutes, rule.rateHundredths, 100);
  if (!rule.boostHundredths || !rule.boostMinutes) return base;
  const fraction = scaleXp(minXp(minutes, exactXp(rule.boostMinutes)), 1, rule.boostMinutes);
  return addXp(base, multiplyXp(scaleXp(exactXp(rule.boostHundredths), 1, 100), fraction));
}

type Interval = { start: number; end: number };
/** Return only time not already credited, updating the day's stable union of recorded blocks. */
function creditInterval(covered: Interval[], start: number, end: number): number {
  let overlap = 0;
  for (const old of covered) overlap += Math.max(0, Math.min(end, old.end) - Math.max(start, old.start));
  covered.push({ start, end });
  covered.sort((a, b) => a.start - b.start || a.end - b.end);
  for (let i = 1; i < covered.length;) {
    const previous = covered[i - 1]!, next = covered[i]!;
    if (next.start <= previous.end) { previous.end = Math.max(previous.end, next.end); covered.splice(i, 1); }
    else i += 1;
  }
  return Math.max(0, end - start - overlap);
}
function validBlock(block: TimeBlock): boolean {
  return Number.isSafeInteger(block.start) && Number.isSafeInteger(block.end) && block.start >= 0 && block.start < 1440 && block.end >= block.start && block.end <= 2880;
}
function creditedMinutes(task: DayTask, covered: Interval[], dayStart: number, strict = true): number {
  const invalid = () => { if (strict) throw new Error(`Invalid logged time on task line ${task.line + 1}.`); return 0; };
  if (task.blocks.some((block) => !validBlock(block))) return invalid();
  const blocks = task.blocks.filter(validBlock).toSorted((a, b) => a.start - b.start || a.end - b.end);
  const blockTotal = blocks.reduce((sum, block) => sum + block.end - block.start, 0);
  const fields = [...task.text.matchAll(/\[minutes::([^\]]*)\]/gi)];
  if (fields.length > 1 || (fields[0] && !/^\s*\d+\s*$/.test(fields[0][1] ?? ''))) return invalid();
  // An explicit zero is a correction, not a missing value. Do not resurrect old blocks.
  const logged = fields[0] ? Number(fields[0][1]) : task.minutes ?? blockTotal;
  if (!Number.isSafeInteger(logged) || logged < 0 || logged > 1_000_000) return invalid();
  let remaining = Math.min(logged, blockTotal), credited = Math.max(0, logged - blockTotal);
  for (const block of blocks) {
    if (!remaining) break;
    const used = Math.min(remaining, block.end - block.start);
    credited += creditInterval(covered, dayStart + block.start, dayStart + block.start + used);
    remaining -= used;
  }
  return credited;
}

/** One calculation for a day's task awards, in note order. A missing policy means legacy rules. */
export function scoreDailyRewards(tasks: readonly DayTask[], date: string, settings: RewardSettings): DailyRewards | undefined {
  return scoreDay(tasks, date, settings, [], 0);
}
function scoreDay(tasks: readonly DayTask[], date: string, settings: RewardSettings, covered: Interval[], dayStart: number): DailyRewards | undefined {
  if (!validRewardDate(date)) throw new Error('The daily note has an invalid date.');
  const policy = rewardPolicy(settings, date);
  if (!policy) {
    // A legacy block can cross midnight into the first day of the new rules.
    for (const task of tasks.toSorted((a, b) => a.line - b.line)) creditedMinutes(task, covered, dayStart, false);
    return undefined;
  }
  const minutesByProfile = new Map<RewardProfile, ExactXp>();
  const areas = new Map<string, ExactXp>(), awards: DailyAward[] = [];
  let logged = 0, main = 0, recovery = 0;
  for (const task of tasks.toSorted((a, b) => a.line - b.line)) {
    const minutes = creditedMinutes(task, covered, dayStart);
    const category = task.category ? rewardCategory(settings, task.category.name) : undefined;
    const rule = category && Object.hasOwn(policy.categories, category.id) ? policy.categories[category.id]! : unassignedReward();
    const previous = minutesByProfile.get(rule.profile) ?? ZERO_XP;
    const next = addXp(previous, exactXp(minutes));
    const xp = subtractXp(profileXp(policy, rule.profile, next), profileXp(policy, rule.profile, previous));
    minutesByProfile.set(rule.profile, next);
    const shares = new Map<string, ExactXp>();
    for (const { area, basisPoints } of rule.shares) {
      const amount = scaleXp(xp, basisPoints, 10000);
      shares.set(area, addXp(shares.get(area) ?? ZERO_XP, amount));
      areas.set(area, addXp(areas.get(area) ?? ZERO_XP, amount));
    }
    logged += minutes;
    if (category?.kind === 'recovery') recovery += minutes;
    else main += minutes;
    awards.push({ line: task.line, category, profile: rule.profile, minutes, xp, areas: shares, done: task.done });
  }
  return { policyId: policy.id, awards, xp: sumXp(awards.map((award) => award.xp)), claimed: sumXp(awards.filter((award) => award.done).map((award) => award.xp)), areas, logged, main, recovery };
}

export interface DatedRewardTasks { path: string; date: string; tasks: readonly DayTask[] }
/** Score in date order so a block crossing midnight cannot be paid twice on the next note. */
export function scoreDailyHistory(days: readonly DatedRewardTasks[], settings: RewardSettings): Map<string, DailyRewards> {
  const results = new Map<string, DailyRewards>(), covered: Interval[] = [], seen = new Set<string>();
  for (const day of days.toSorted((a, b) => a.date.localeCompare(b.date) || a.path.localeCompare(b.path))) {
    if (!validRewardDate(day.date)) throw new Error('A daily note has an invalid date.');
    if (seen.has(day.path)) throw new Error('A daily note was included more than once.');
    seen.add(day.path);
    const start = Date.parse(`${day.date}T00:00:00Z`) / 60_000;
    for (let i = covered.length - 1; i >= 0; i--) if (covered[i]!.end <= start) covered.splice(i, 1);
    const result = scoreDay(day.tasks, day.date, settings, covered, start);
    if (result) results.set(day.path, result);
  }
  return results;
}
