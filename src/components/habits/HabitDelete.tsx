import { useState } from 'react';
import { canDeleteHabit } from '../../lib/habitDeletion';
import type { Habit } from '../../lib/habits';
import { HabitDialog } from './HabitDialog';

export interface HabitDeleteActions {
  onDelete?: (habit: Habit) => Promise<void>;
}

export function HabitDelete({ habit, today, onDelete }: HabitDeleteActions & { habit: Habit; today: Date }) {
  const [shown, setShown] = useState<Habit>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!onDelete || !canDeleteHabit(habit, today)) return null;
  const remove = async () => {
    if (!shown || busy) return;
    setBusy(true);
    setError('');
    try {
      await onDelete(shown);
      setShown(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };
  return <>
    <button type="button" className="quiet-chip habit-delete" aria-label={`Delete ${habit.name}`}
      onClick={() => { setError(''); setShown(habit); }}>Delete</button>
    {shown && <HabitDialog title={`Delete ${shown.name}?`} busy={busy} onCancel={() => setShown(undefined)}>
      <div className="habits-form card glass">
        <h2>Delete {shown.name}?</h2>
        <p>This removes its check-ins and earned XP. The habit definition moves to the vault trash.</p>
        {error && <p role="alert">{error}</p>}
        <div className="habits-form-actions">
          <button type="button" className="quiet-chip" disabled={busy} onClick={() => setShown(undefined)}>Cancel</button>
          <button type="button" className="primary-button" disabled={busy} onClick={() => void remove()}>{busy ? 'Deleting…' : 'Delete habit'}</button>
        </div>
      </div>
    </HabitDialog>}
  </>;
}
