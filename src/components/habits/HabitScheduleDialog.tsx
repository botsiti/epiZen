import { useState } from 'react';
import { formatDate } from '../../lib/dates';
import type { Habit, HabitStyle, HabitTracking, HabitLifecycle } from '../../lib/habits';
import { DateField } from '../DateField';
import { HabitDialog } from './HabitDialog';
import { HabitStyleFields } from './HabitPersonalize';
import './habits.css';

export interface HabitScheduleRequest { kind: 'new' | 'archive' | 'resume' | 'continue'; habit?: Habit }
export interface HabitScheduleActions {
  onCreate: (name: string, from: string, history?: Habit, tracking?: HabitTracking, style?: HabitStyle) => Promise<void>;
  onLifecycle: (habit: Habit, change: HabitLifecycle) => Promise<void>;
}

export function HabitScheduleDialog({ request, today, onCreate, onLifecycle, onClose, onSaved }: HabitScheduleActions & {
  request: HabitScheduleRequest;
  today: Date;
  onClose: () => void;
  onSaved: (collection: 'Active' | 'Archived', message: string) => void;
}) {
  const day = formatDate(today, 'YYYY-MM-DD');
  const last = request.habit?.periods.at(-1);
  const start = request.kind === 'resume' ? last?.until : last?.from;
  const [form, setForm] = useState({ ...request, name: request.habit?.name ?? '', date: start && start > day ? start : day, restart: false });
  const [kind, setKind] = useState<'check' | 'goal' | 'measure'>('check');
  const [unit, setUnit] = useState('');
  const [target, setTarget] = useState('');
  const [style, setStyle] = useState<HabitStyle>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async () => {
    if (busy) return;
    setBusy(true); setError(undefined);
    try {
      if (form.kind === 'new' && (kind !== 'check' || style.icon || style.color)) {
        let tracking: HabitTracking | undefined;
        if (kind === 'goal') tracking = { kind, target: Number(target), unit };
        if (kind === 'measure') tracking = { kind, unit };
        await onCreate(form.name, form.date, undefined, tracking, style);
      } else if (form.kind === 'new' || form.kind === 'continue') await onCreate(form.name, form.date, form.habit);
      else if (form.habit) await onLifecycle(form.habit, form.kind === 'archive' ? { kind: 'archive', date: form.date } : { kind: 'resume', date: form.date, restart: form.restart });
      const archived = form.kind === 'archive' && form.date <= day;
      const message = archived ? 'Habit archived. Its history is kept.' : form.kind === 'archive' ? `Archive scheduled for ${form.date}. Its history will be kept.` : 'Habit schedule saved.';
      onSaved(archived ? 'Archived' : 'Active', message);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err)); setBusy(false);
    }
  };
  return <HabitDialog busy={busy} onCancel={onClose} title={form.kind === 'archive' ? 'Archive habit' : form.kind === 'resume' ? 'Reactivate habit' : 'New habit'}><form className="habits-form card glass" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <h2>{form.kind === 'archive' ? 'Archive habit' : form.kind === 'resume' ? 'Reactivate habit' : form.kind === 'continue' ? 'Continue tracking' : 'New habit'}{form.habit && ` · ${form.habit.name}`}</h2>
      {form.kind === 'new' && <label className="field"><span>Habit name</span><input maxLength={100} aria-label="Habit name" placeholder="No sweets, read a chapter, take a walk…" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} disabled={busy} /></label>}
      {form.kind === 'new' && <label className="field"><span>Track by</span>
        <select value={kind} disabled={busy} onChange={(event) => setKind(event.target.value as typeof kind)}>
          <option value="check">Daily check-in</option><option value="goal">Daily target</option><option value="measure">Measured value</option>
        </select>
      </label>}
      {kind !== 'check' && <div className="habit-measure-fields">
        <label className="field"><span>Unit</span><input required maxLength={32} value={unit} placeholder="e.g. glasses" disabled={busy} onChange={(e) => setUnit(e.target.value)} /></label>
        {kind === 'goal' && <label className="field"><span>Daily target</span><input required type="number" step="any" min="0" value={target} disabled={busy} onChange={(e) => setTarget(e.target.value)} /></label>}
      </div>}
      <label className="field"><span>{form.kind === 'archive' ? 'Archive from' : 'Start tracking from'}</span><DateField testId="habit-effective-date" label="Habit effective date" value={form.date} onChange={(date) => setForm({ ...form, date })} /></label>
      <p>{form.kind === 'archive' ? 'The habit will disappear from this date onward. Previous check-ins, calendars and your best streak stay available.' : 'The habit appears in daily notes from this date. Existing completions remain in their original notes.'}</p>
      {form.kind === 'resume' && <fieldset><legend>Streak after the break</legend><label><input type="radio" name="streak" checked={!form.restart} onChange={() => setForm({ ...form, restart: false })} /> Resume the paused streak</label><label><input type="radio" name="streak" checked={form.restart} onChange={() => setForm({ ...form, restart: true })} /> Start fresh; keep the previous best</label></fieldset>}
      {form.kind === 'new' && <details><summary>Color and icon</summary><HabitStyleFields value={style} onChange={setStyle} disabled={busy} /></details>}
      {error && <p role="alert" className="habits-warning">{error}</p>}
      <div className="habits-form-actions"><button type="button" className="quiet-chip" disabled={busy} onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={busy || !form.name.trim() || !form.date || (kind !== 'check' && !unit.trim()) || (kind === 'goal' && !(Number(target) > 0))}>{busy ? 'Saving…' : form.kind === 'archive' ? 'Archive habit' : 'Save habit'}</button></div>
    </form></HabitDialog>;
}
