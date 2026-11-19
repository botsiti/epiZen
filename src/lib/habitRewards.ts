import { SPHERES } from './categories';
import { defaultAreaId, type RewardArea } from './rewardRules';
import { formatDate } from './dates';
import type { Day } from './day';
import { addXp, scaleXp, exactXp, xpNumber, ZERO_XP, type ExactXp } from './xp';

export interface HabitLeague { days: number; percent: number }
export interface HabitReward { base: number; area?: string; leagues: HabitLeague[] }

export const DEFAULT_HABIT_LEAGUES: readonly HabitLeague[] = [
  { days: 7, percent: 150 }, { days: 20, percent: 200 },
  { days: 30, percent: 250 }, { days: 100, percent: 400 },
];

const defaultAreas = SPHERES.map(({ name, color }) => ({ id: defaultAreaId(name), name, color, archived: false }));
export const habitAreas = (areas?: readonly RewardArea[]) => areas ?? defaultAreas;

export function readHabitReward(value: unknown): HabitReward | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || !('base' in value) || typeof value.base !== 'number' ||
      !Number.isInteger(value.base) || value.base < 0 || value.base > 1000) {
    throw new Error('Base XP must be a whole number from 0 to 1,000.');
  }
  const area = 'area' in value ? value.area : undefined;
  if (area !== undefined && (typeof area !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(area))) {
    throw new Error('Choose a valid life area.');
  }
  if (!('leagues' in value) || !Array.isArray(value.leagues) || value.leagues.length > 12) {
    throw new Error('Choose up to twelve streak leagues.');
  }
  let days = 1;
  let percent = 100;
  const entries: unknown[] = value.leagues;
  const leagues = entries.map((league) => {
    if (!league || typeof league !== 'object' || !('days' in league) || !('percent' in league) ||
        typeof league.days !== 'number' || !Number.isInteger(league.days) || league.days <= days || league.days > 10000 ||
        typeof league.percent !== 'number' || !Number.isInteger(league.percent) || league.percent < percent || league.percent > 1000) {
      throw new Error('League days must increase from 2 to 10,000. Multipliers must stay level or increase, from 1× to 10× with up to two decimal places.');
    }
    days = league.days;
    percent = league.percent;
    return { days, percent };
  });
  return { base: value.base, area, leagues };
}

export function habitRewardXp(reward: HabitReward, streak: number): ExactXp {
  const percent = reward.leagues.findLast((league) => streak >= league.days)?.percent ?? 100;
  return scaleXp(exactXp(reward.base), percent, 100);
}

export interface HabitRewardDay { xp: ExactXp; areas: Map<string, ExactXp> }

export function addHabitRewardDay(days: Map<string, HabitRewardDay>, date: Date, reward: HabitReward, streak: number) {
  if (!reward.base) return;
  const key = formatDate(date, 'YYYY-MM-DD');
  const day = days.get(key) ?? { xp: ZERO_XP, areas: new Map<string, ExactXp>() };
  const amount = habitRewardXp(reward, streak);
  day.xp = addXp(day.xp, amount);
  if (reward.area) day.areas.set(reward.area, addXp(day.areas.get(reward.area) ?? ZERO_XP, amount));
  days.set(key, day);
}

export function applyHabitRewards(day: Day, reward?: HabitRewardDay): Day {
  if (!reward) return day;
  const xp = xpNumber(reward.xp);
  return { ...day, habitAreaCredits: reward.areas, habitRewardXp: xp,
    exactReward: day.exactReward && addXp(day.exactReward, reward.xp),
    totals: { ...day.totals, xp: day.totals.xp + xp, claimed: day.totals.claimed + xp } };
}
