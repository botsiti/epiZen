import { category, DEFAULT_TASK_TAGS, type Category } from './categories';
import { scoreDailyHistory, type DailyRewards } from './dailyRewards';
import type { Day } from './day';
import { rewardCategory, type RewardSettings } from './rewardRules';
import { xpNumber, ZERO_XP, type ExactXp } from './xp';

export interface RecordedDay { date: string; path: string; day: Day }

/** Keep the task's Markdown tag and editable minutes intact. Reports group historical aliases
 * under the current tag. XP and sphere credits both come from the same dated award. */
function applyAwards(day: Day, settings: RewardSettings, score?: DailyRewards, problem?: string): Day {
  const minutes = new Map<string, [Category, number]>();
  function accumulate(meta: Category, count: number) {
    if (count) minutes.set(meta.name, [meta, (minutes.get(meta.name)?.[1] ?? 0) + count]);
  }
  const awards = new Map(score?.awards.map((award) => [award.line, award]));
  const tasks = day.tasks.map((task) => {
    const meta = task.category ?? category('other');
    const award = awards.get(task.line);
    const entry = award?.category ?? rewardCategory(settings, meta.name);
    const displayed = entry ? { ...meta, color: entry.color } : meta;
    accumulate(entry ? { ...displayed, name: entry.tag } : meta, score ? award?.minutes ?? 0 : task.minutes ?? 0);
    return { ...task, category: task.category && displayed,
      ...(score || problem ? { earnedXp: xpNumber(award?.xp ?? ZERO_XP) } : {}) };
  });
  const byCategory = [...minutes.values()].sort((a, b) => b[1] - a[1] || a[0].name.localeCompare(b[0].name));
  if (!score && !problem) return { ...day, tasks, byCategory };
  const areaCredits = new Map<string, ExactXp>();
  for (const [id, xp] of score?.areas ?? []) areaCredits.set(settings.areas.find((area) => area.id === id)?.name ?? 'Unassigned', xp);
  return { ...day, tasks, byCategory, areaCredits, exactReward: score?.xp ?? ZERO_XP, rewardProblem: problem,
    totals: { ...day.totals, ...(score && { logged: score.logged, main: score.main, recovery: score.recovery }), xp: score ? xpNumber(score.xp) : 0, claimed: score ? xpNumber(score.claimed) : 0 } };
}

export function questActivity(days: RecordedDay[], settings: RewardSettings) {
  const problems = new Map<string, string>();
  const results = scoreDailyHistory(days.map(({ day, ...entry }) => ({ ...entry, tasks: day.tasks })), settings, (path, message) => problems.set(path, message));
  return new Map(days.map(({ day, path }) => [path, applyAwards(day, settings, results.get(path), problems.get(path))]));
}

export function taskTags(observed: string[], settings?: RewardSettings): string[] {
  if (!settings) return [...new Set([...observed, 'code', 'routine', ...DEFAULT_TASK_TAGS])];
  const recognized = observed.map((name) => {
    const item = rewardCategory(settings, name);
    return item ? item.archived ? [] : [item.tag] : [name];
  });
  const routine = rewardCategory(settings, 'routine');
  return [...new Set([...recognized.flat(), ...settings.categories.filter((item) => !item.archived).map((item) => item.tag), ...(!routine ? ['routine'] : [])])];
}
