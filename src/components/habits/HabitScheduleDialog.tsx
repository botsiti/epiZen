import { useState } from 'react';
import { formatDate } from '../../lib/dates';
import type { Habit, HabitLifecycle } from '../../lib/habits';
import { DateField } from '../DateField';
import { HabitDialog } from './HabitDialog';
import './habits.css';

export interface HabitScheduleRequest { kind: 'new' | 'archive' | 'resume' | 'continue'; habit?: Habit }
export interface HabitScheduleActions {
  onCreate: (name: string, from: string, history?: Habit) => Promise<void>;
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async () => {
    if (busy) return;
    setBusy(true); setError(undefined);
    try {
      if (form.kind === 'new' || form.kind === 'continue') await onCreate(form.name, form.date, form.habit);
      else if (form.habit) await onLifecycle(form.habit, form.kind === 'archive' ? { kind: 'archive', date: form.date } : { kind: 'resume', date: form.date, restart: form.restart });
      const archived = form.kind === 'archive' && form.date <= day;
      const message = archived ? 'Habit archived. Its history is kept.' : form.kind === 'archive' ? `Archive scheduled for ${form.date}. Its history will be kept.` : 'Habit schedule saved.';
      onSaved(archived ? 'Archived' : 'Active', message);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err)); setBusy(false);
    }
  };
  return <HabitDialog busy={busy} onCancel={onClose} title={form.kind === 'archive' ? 'Archive habit' : form.kind === 'resume' ? 'Reactivate habit' : 'New habit'}><form className="habits-form card glass" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <div><p className="kicker">{form.habit?.name ?? 'A new daily routine'}</p><h2>{form.kind === 'archive' ? 'Make room for a break' : form.kind === 'resume' ? 'Bring this habit back' : form.kind === 'continue' ? 'Continue your history' : 'What would you like to practice?'}</h2></div>
      {form.kind === 'new' && <label className="field"><span>Habit name</span><input maxLength={100} aria-label="Habit name" placeholder="No sweets, read a chapter, take a walk…" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} disabled={busy} /></label>}
      <label className="field"><span>{form.kind === 'archive' ? 'Archive from' : 'Start tracking from'}</span><DateField testId="habit-effective-date" label="Habit effective date" value={form.date} onChange={(date) => setForm({ ...form, date })} /></label>
      <p>{form.kind === 'archive' ? 'The habit will disappear from this date onward. Previous check-ins, calendars and your best streak stay available.' : 'The habit appears in daily notes from this date. Existing completions remain in their original notes.'}</p>
      {form.kind === 'resume' && <fieldset><legend>Streak after the break</legend><label><input type="radio" name="streak" checked={!form.restart} onChange={() => setForm({ ...form, restart: false })} /> Resume the paused streak</label><label><input type="radio" name="streak" checked={form.restart} onChange={() => setForm({ ...form, restart: true })} /> Start fresh; keep the previous best</label></fieldset>}
      {error && <p role="alert" className="habits-warning">{error}</p>}
      <div className="habits-form-actions"><button type="button" className="quiet-chip" disabled={busy} onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={busy || !form.name.trim() || !form.date}>{busy ? 'Saving…' : form.kind === 'archive' ? 'Archive habit' : 'Save habit'}</button></div>
    </form></HabitDialog>;
}
