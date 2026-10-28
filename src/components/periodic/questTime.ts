import type { Quest } from '../../lib/quests';

// How a quest's time stands, for its card and its detail.

/** Days from one ISO date to another. */
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/** The chip on a quest's art: how its time stands. */
export function timeChip(quest: Quest, due: string | undefined, today: string): string | undefined {
  if (quest.done) {
    if (!quest.deadline || !quest.doneOn) return 'Done';
    const early = daysBetween(quest.doneOn, quest.deadline);
    return early > 0 ? `Done ${early}d early` : early < 0 ? `Done ${-early}d late` : 'Done on time';
  }
  if (!due) return undefined;
  const left = daysBetween(today, due);
  return left < 0 ? `Overdue ${-left}d` : left === 0 ? 'Due today' : `${left}d left`;
}

/** Counter steps that suit the target: +10/+30/+60 for a hundred or more, +1/+5 from ten, else +1. */
export const steps = (target: number) => (target >= 100 ? [10, 30, 60] : target >= 10 ? [1, 5] : [1]);
