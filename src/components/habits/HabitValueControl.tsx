import { useState } from 'react';
import type { Habit } from '../../lib/habits';
import './habit-values.css';

export function HabitValueControl({ habit, value, onSave }: {
  habit: Habit;
  value?: number;
  onSave: (value: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState<{ original?: number; input: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const tracking = habit.tracking;
  if (!tracking) return null;

  const save = async (next: number) => {
    if (busy) return;
    if (draft && draft.original !== value) {
      setError('This value changed while editing. Cancel to see the latest entry.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSave(next);
      setDraft(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return <div className="habit-value-control">
    {draft ? <form onSubmit={(event) => { event.preventDefault(); void save(Number(draft.input)); }}>
      <label><input aria-label={`${habit.name} value`} autoFocus type="number" required step="any" min={tracking.kind === 'goal' ? 0 : undefined}
        value={draft.input} onChange={(event) => setDraft({ ...draft, input: event.target.value })} disabled={busy} /> {tracking.unit}</label>
      <button type="submit" disabled={busy || !draft.input.trim()}>Save</button>
      <button type="button" disabled={busy} onClick={() => { setDraft(undefined); setError(''); }}>Cancel</button>
    </form> : <>
      <button type="button" disabled={busy} aria-label={`Log ${habit.name} value`} onClick={() => {
        setError(''); setDraft({ original: value, input: value?.toString() ?? '' });
      }}>{value ?? (tracking.kind === 'goal' ? 0 : 'Log')}{tracking.kind === 'goal' && ` / ${tracking.target}`} {tracking.unit}</button>
      {tracking.kind === 'goal' && <button type="button" className="habit-increment" disabled={busy}
        aria-label={`Add one to ${habit.name}`} onClick={() => void save((value ?? 0) + 1)}>+1</button>}
    </>}
    {error && <span role="alert">{error}</span>}
  </div>;
}
