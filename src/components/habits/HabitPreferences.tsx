import { useMemo, useState } from 'react';
import { formatDate } from '../../lib/dates';
import { discoveredHabits, type Habit, type HabitProblem } from '../../lib/habits';
import type { DayEntry } from '../../lib/rollup';
import { PreferenceIcon } from '../settings/icons';
import { HabitScheduleDialog, type HabitScheduleActions, type HabitScheduleRequest } from './HabitScheduleDialog';

export interface HabitPreferencesProps extends HabitScheduleActions {
  habits: Habit[];
  problems: HabitProblem[];
  days: DayEntry[];
  today: Date;
  onOpenNote: (path: string) => void;
}
export function HabitPreferences({ habits, problems, days, today, onOpenNote, ...actions }: HabitPreferencesProps) {
  const [request, setRequest] = useState<HabitScheduleRequest>();
  const [notice, setNotice] = useState('');
  const day = formatDate(today, 'YYYY-MM-DD');
  const history = useMemo(() => discoveredHabits(days, habits), [days, habits]);
  const track = (kind: HabitScheduleRequest['kind'], habit?: Habit) => { setNotice(''); setRequest({ kind, habit }); };
  return <section className="habit-settings" aria-label="Tracked habits">
    <header><h3>Your routine</h3><button type="button" className="quiet-button" onClick={() => track('new')}><PreferenceIcon name="plus" />Add habit</button></header>
    {habits.length ? <ul>{habits.map((habit) => {
      const last = habit.periods.at(-1)!;
      const action = last.until ? 'Reactivate' : 'Archive';
      const archived = !!last.until && last.until <= day;
      const schedule = archived ? `Archived from ${last.until}` : last.from > day ? `Starts ${last.from}` : last.until ? `Archives ${last.until}` : 'Every day';
      return <li key={habit.id}><span className="habit-setting-mark" data-active={!archived}><PreferenceIcon name="habits" /></span>
        <span className="habit-setting-copy"><strong>{habit.name}</strong><small>{schedule}</small></span>
        <button type="button" className="quiet-button" aria-label={`${action} ${habit.name}`} onClick={() => track(last.until ? 'resume' : 'archive', habit)}>{action}</button></li>;
    })}</ul> : <p>Add your first habit to start tracking it in daily notes.</p>}
    {!!history.length && <details><summary>From your daily notes · {history.length}</summary><ul>{history.map((habit) => <li key={habit.id}><strong className="habit-setting-copy">{habit.name}</strong><button type="button" className="quiet-button" aria-label={`Continue ${habit.name}`} onClick={() => track('continue', habit)}>Continue tracking</button></li>)}</ul></details>}
    {problems.map(({ path, message }) => <p key={path + message} role="alert">{message} <button type="button" className="quiet-button" onClick={() => onOpenNote(path)}>Open habit note</button></p>)}
    {notice && <p role="status">{notice}</p>}
    {request && <HabitScheduleDialog {...actions} request={request} today={today} onClose={() => setRequest(undefined)}
      onSaved={(_, message) => { setNotice(message); setRequest(undefined); }} />}
  </section>;
}
