import { useState } from 'react';
import { exportMarkdown } from '../../lib/api';
import { formatDate } from '../../lib/dates';
import { habitReport } from '../../lib/habitReport';
import type { Habit, HabitProblem } from '../../lib/habits';
import type { DayEntry } from '../../lib/rollup';
import { HabitDialog } from './HabitDialog';

interface Props {
  habits: Habit[];
  days: DayEntry[];
  problems: HabitProblem[];
  today: Date;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function HabitExport({ habits, days, problems, today, onClose, onSaved }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function exportReport(copy: boolean) {
    setBusy(true);
    setError('');
    try {
      const report = habitReport(habits, days, problems, today);
      if (copy) {
        await navigator.clipboard.writeText(report);
        onSaved('Habit journal copied as Markdown.');
      } else {
        const saved = await exportMarkdown(`Habit journal - ${formatDate(today, 'YYYY-MM-DD')}.md`, report);
        if (saved) onSaved('Habit journal exported.');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  return <HabitDialog title="Export habit journal" busy={busy} onCancel={onClose}>
    <div className="habits-form card glass"><h2>Export habit journal</h2>
      <p>Includes every routine, its tracking periods, streaks, and dated check-ins, plus the Markdown definitions. Daily journal entries stay private.</p>
      {error && <p role="alert">{error}</p>}
      <div className="habits-form-actions">
        <button className="quiet-chip" disabled={busy} onClick={onClose}>Cancel</button>
        <button className="quiet-chip" disabled={busy} onClick={() => void exportReport(true)}>Copy Markdown</button>
        <button className="primary-button" disabled={busy} onClick={() => void exportReport(false)}>Save Markdown…</button>
      </div>
    </div>
  </HabitDialog>;
}
