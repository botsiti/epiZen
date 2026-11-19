import { useState } from 'react';
import { DEFAULT_HABIT_LEAGUES, habitAreas, readHabitReward, type HabitReward } from '../../lib/habitRewards';
import type { Habit } from '../../lib/habits';
import type { RewardArea } from '../../lib/rewardRules';
import { HabitDialog } from './HabitDialog';

export interface HabitRewardActions {
  areas?: readonly RewardArea[];
  onSaveReward?: (habit: Habit, reward: HabitReward) => Promise<void>;
}

export function HabitRewardSettings({ habit, areas, onSaveReward }: HabitRewardActions & { habit: Habit }) {
  const [draft, setDraft] = useState<HabitReward>();
  const [shown, setShown] = useState(habit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const catalog = habitAreas(areas);
  async function save() {
    if (!draft || !onSaveReward || busy) return;
    setBusy(true);
    setError('');
    try {
      await onSaveReward(shown, readHabitReward(draft)!);
      setDraft(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }
  if (!onSaveReward) return null;
  return <>
    <button type="button" className="quiet-chip" aria-label={`XP settings for ${habit.name}`} onClick={() => {
      setError('');
      setShown(habit);
      setDraft(habit.reward ?? { base: 10, leagues: DEFAULT_HABIT_LEAGUES.map((league) => ({ ...league })) });
    }}>XP settings</button>
    {draft && <HabitDialog title={`XP settings for ${habit.name}`} busy={busy} onCancel={() => setDraft(undefined)}>
      <form className="habits-form card glass" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <div><p className="kicker">Habit XP</p><h2>{habit.name}</h2></div>
        <fieldset className="habit-reward-fields" disabled={busy}>
          <label>Life area<select value={draft.area ?? ''} onChange={(event) => setDraft({ ...draft, area: event.target.value || undefined })}>
            <option value="">None</option>
            {draft.area && !catalog.some((area) => area.id === draft.area) && <option value={draft.area}>Unavailable area</option>}
            {catalog.filter((area) => !area.archived || area.id === draft.area).map((area) =>
              <option key={area.id} value={area.id}>{area.name}{area.archived ? ' (archived)' : ''}</option>)}
          </select></label>
          <label>Base XP<input type="number" min="0" max="1000" required value={Number.isFinite(draft.base) ? draft.base : ''} onChange={(event) => setDraft({ ...draft, base: event.target.valueAsNumber })} /></label>
        </fieldset>
        <fieldset className="habit-league-fieldset" disabled={busy}>
          <legend>Streak leagues</legend>
          <p>Each check-in earns its league’s XP. Set base XP to 0 to turn rewards off. Changes recalculate previous check-ins.</p>
          <div className="habit-league-row"><span>Streak days</span><span>Multiplier</span><span>XP / check-in</span><span /></div>
          <div className="habit-league-row"><span>1</span><span>1×</span><strong>{draft.base || 0}</strong><span /></div>
          {draft.leagues.map((league, index) => <div className="habit-league-row" key={index}>
            <input aria-label={`League ${index + 1} streak days`} type="number" min="2" max="10000" required
              value={Number.isFinite(league.days) ? league.days : ''} onChange={(event) => {
                const days = event.target.valueAsNumber;
                setDraft({ ...draft, leagues: draft.leagues.map((entry, i) => i === index ? { ...entry, days } : entry) });
              }} />
            <input aria-label={`League ${index + 1} multiplier`} type="number" min="1" max="10" step=".01" required
              value={Number.isFinite(league.percent) ? league.percent / 100 : ''} onChange={(event) => {
                const percent = Math.round(event.target.valueAsNumber * 100);
                setDraft({ ...draft, leagues: draft.leagues.map((entry, i) => i === index ? { ...entry, percent } : entry) });
              }} />
            <strong>{Number.isFinite(draft.base) && Number.isFinite(league.percent) ? draft.base * league.percent / 100 : '—'}</strong>
            <button type="button" aria-label={`Remove league ${index + 1}`} onClick={() => setDraft({ ...draft, leagues: draft.leagues.filter((_, i) => i !== index) })}>×</button>
          </div>)}
          <button type="button" className="quiet-chip" disabled={draft.leagues.length >= 12} onClick={() => {
            const last = draft.leagues.at(-1);
            setDraft({ ...draft, leagues: [...draft.leagues, { days: (last?.days || 1) + 7, percent: last?.percent || 100 }] });
          }}>Add league</button>
        </fieldset>
        {error && <p role="alert">{error}</p>}
        <div className="habits-form-actions"><button type="button" className="quiet-chip" disabled={busy} onClick={() => setDraft(undefined)}>Cancel</button>
          <button type="submit" className="primary-button" disabled={busy}>Save XP settings</button></div>
      </form>
    </HabitDialog>}
  </>;
}
