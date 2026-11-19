import { useId, useState } from 'react';
import { habitColors, type HabitStyle } from '../../lib/habitStyle';
import { habitIconOptions, searchHabitIcons } from '../../lib/habitIcons';
import type { Habit } from '../../lib/habits';
import { HabitIcon } from './HabitIcon';
import { HabitDialog } from './HabitDialog';

export function HabitStyleFields({ value, onChange, disabled }: { value: HabitStyle; onChange: (next: HabitStyle) => void; disabled: boolean }) {
  const [query, setQuery] = useState('');
  const search = useId();
  const options = searchHabitIcons(query);
  const selected = habitIconOptions.find(([id]) => id === value.icon);
  return <div className="habit-style-fields">
    <fieldset className="habit-icon-options" disabled={disabled}><legend>Icon</legend>
      <div className="habit-icon-search">
        <label htmlFor={search}>Search icons</label>
        <input id={search} type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <div className="habit-icon-selection">
        <button type="button" aria-pressed={!value.icon} onClick={() => onChange({ ...value, icon: undefined })}>Auto</button>
        {selected && <span><HabitIcon name={selected[1]} icon={selected[0]} />{selected[1]}</span>}
      </div>
      <div className="habit-icon-results" role="group" aria-label="Matching icons">
        {options.map(([id, name]) => <button type="button" key={id} title={name} aria-label={name}
          aria-pressed={value.icon === id} onClick={() => onChange({ ...value, icon: id })}><HabitIcon name={name} icon={id} /></button>)}
        {!options.length && <p role="status">No matching icons.</p>}
      </div>
    </fieldset>
    <fieldset className="habit-color-options" disabled={disabled}><legend>Color</legend>
      <button type="button" aria-pressed={!value.color} onClick={() => onChange({ ...value, color: undefined })}>Auto</button>
      {Object.entries(habitColors).map(([name, color]) => <button type="button" key={name} title={name} aria-label={name}
        aria-pressed={value.color === color} onClick={() => onChange({ ...value, color })}><i style={{ background: color }} /></button>)}
    </fieldset>
  </div>;
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
