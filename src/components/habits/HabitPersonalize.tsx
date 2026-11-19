import { useState } from 'react';
import { habitColors, habitIcons, illustratedHabitIcons, type HabitStyle } from '../../lib/habitStyle';
import type { Habit } from '../../lib/habits';
import { HabitIcon } from './HabitIcon';
import { HabitDialog } from './HabitDialog';

export function HabitStyleFields({ value, onChange, disabled }: { value: HabitStyle; onChange: (next: HabitStyle) => void; disabled: boolean }) {
  return <div className="habit-style-fields">{(['color', 'icon'] as const).map((key) =>
    <fieldset key={key} disabled={disabled}><legend>{key === 'color' ? 'Color' : 'Icon'}</legend>
      <button type="button" aria-pressed={!value[key]} onClick={() => onChange({ ...value, [key]: undefined })}>Auto</button>
      {Object.entries(key === 'color' ? habitColors : { ...illustratedHabitIcons, ...habitIcons }).map(([name, option]) =>
        <button type="button" key={name} title={name} aria-label={name} aria-pressed={value[key] === option}
          onClick={() => onChange({ ...value, [key]: option })}>{key === 'color' ? <i style={{background: option}} /> : <HabitIcon name={name} icon={option} />}</button>)}
    </fieldset>)}</div>;
}

export function HabitPersonalize({ habit, onSave }: { habit: Habit; onSave: (habit: Habit, style: HabitStyle) => Promise<void> }) {
  const [draft, setDraft] = useState<{ habit: Habit; style: HabitStyle }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    if (!draft || busy) return;
    setBusy(true);
    try { await onSave(draft.habit, draft.style); setDraft(undefined); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" className="quiet-chip" onClick={() => { setError(''); setDraft({ habit, style: { color: habit.color, icon: habit.icon } }); }}>Personalize</button>
    {draft && <HabitDialog title="Personalize habit" busy={busy} onCancel={() => setDraft(undefined)}>
      <div className="habits-form card glass"><h2>{habit.name}</h2>
        <HabitStyleFields value={draft.style} disabled={busy} onChange={(style) => setDraft({ ...draft, style })} />
        {error && <p role="alert">{error}</p>}
        <div className="habits-form-actions"><button className="quiet-chip" disabled={busy} onClick={() => setDraft(undefined)}>Cancel</button>
          <button className="primary-button" disabled={busy} onClick={() => void save()}>Save appearance</button></div>
      </div>
    </HabitDialog>}
  </>;
}
