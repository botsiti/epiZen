import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { formatMinutes } from '../../lib/day';
import type { Rollup } from '../../lib/rollup';
import { calendarHourLabel, type Hours } from '../../lib/schedule';
import { Layer } from '../Layer';

interface DialogProps {
  title: string;
  onClose: () => void;
  returnFocus: HTMLElement;
  saving?: boolean;
  children: ReactNode;
}

function CalendarDialog({ title, onClose, returnFocus, saving, children }: DialogProps) {
  const heading = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const node = dialog.current;
    if (node?.showModal) node.showModal();
    else node?.setAttribute('open', '');
    node?.querySelector<HTMLElement>('[data-initial-focus]')?.focus();
    return () => { node?.close?.(); returnFocus.focus({ preventScroll: true }); };
  }, [returnFocus]);
  return <Layer>
    <dialog ref={dialog} className="calendar-details" aria-modal="true" aria-labelledby={heading}
      onCancel={(event) => { event.preventDefault(); if (!saving) onClose(); }}
      onClick={(event) => { if (event.target === dialog.current && !saving) onClose(); }}>
      <div className="calendar-details-body">
        <header>
          <h2 id={heading}>{title}</h2>
          <button type="button" className="calendar-details-close" aria-label={`Close ${title.toLowerCase()}`} disabled={saving} onClick={onClose}>×</button>
        </header>
        {children}
      </div>
    </dialog>
  </Layer>;
}

export function CalendarActivity({ mode, title, totals, events, onOpenWeek, ...dialog }: {
  mode: 'day' | 'week'; title: string; totals: Rollup; events?: number; onOpenWeek?: () => void;
} & Pick<DialogProps, 'onClose' | 'returnFocus'>) {
  const { logged, main, recovery, tasksDone, tasks } = totals.totals;
  return <CalendarDialog {...dialog} title={mode === 'week' ? 'Weekly activity' : 'Daily activity'}>
    <p className="cal-activity-date">{title}</p>
    <p className="cal-activity-total">{formatMinutes(logged)} <span>logged</span></p>
    <p className="cal-activity-meta">
      {tasks > 0 && <span>{tasksDone} of {tasks} tasks done</span>}
      {events !== undefined && <span data-testid="cal-planned">{events} {events === 1 ? 'event' : 'events'} in Calendar</span>}
    </p>
    {logged > 0 ? <>
      <div className="cal-activity-bar" aria-hidden="true">
        {totals.byCategory.map(([category, minutes]) => <span key={category.name} style={{ flexGrow: minutes, backgroundColor: category.color }} />)}
      </div>
      <dl className="cal-activity-split">
        <div><dt>Productive</dt><dd>{formatMinutes(main)}</dd></div>
        <div><dt>Recovery</dt><dd>{formatMinutes(recovery)}</dd></div>
      </dl>
      <dl className="cal-activity-categories" aria-label="Logged time by category">
        {totals.byCategory.map(([category, minutes]) => <div key={category.name}>
          <dt><span aria-hidden="true" style={{ backgroundColor: category.color }} />{category.name}</dt>
          <dd>{formatMinutes(minutes)}</dd>
        </div>)}
      </dl>
    </> : <p className="cal-activity-empty">No time logged in this {mode}.</p>}
    {onOpenWeek && <button type="button" className="cal-details-link" onClick={() => { dialog.onClose(); onOpenWeek(); }}>Open weekly note <span aria-hidden="true">→</span></button>}
  </CalendarDialog>;
}

const HOURS = Array.from({ length: 25 }, (_, hour) => hour * 60);

export function CalendarDayHours({ value, focus, onSave, ...dialog }: {
  value: Hours; focus: 'start' | 'end'; onSave: (value: Hours) => Promise<void>;
} & Pick<DialogProps, 'onClose' | 'returnFocus'>) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    if (saving) return;
    setSaving(true); setError('');
    try { await onSave(draft); dialog.onClose(); }
    catch (reason) { setError(`Couldn’t save day hours. ${String(reason)}`); setSaving(false); }
  };
  return <CalendarDialog {...dialog} title="Day hours" saving={saving}>
    <form className="cal-hours-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <fieldset disabled={saving}>
        <label>Day starts<select data-initial-focus={focus === 'start' ? '' : undefined} value={draft.first}
          onChange={(event) => setDraft({ ...draft, first: Number(event.target.value) })}>
          {HOURS.filter((minute) => minute < draft.last).map((minute) => <option key={minute} value={minute}>{calendarHourLabel(minute)}</option>)}
        </select></label>
        <label>Day ends<select data-initial-focus={focus === 'end' ? '' : undefined} value={draft.last}
          onChange={(event) => setDraft({ ...draft, last: Number(event.target.value) })}>
          {HOURS.filter((minute) => minute > draft.first).map((minute) => <option key={minute} value={minute}>{calendarHourLabel(minute)}</option>)}
        </select></label>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <button type="submit" className="cal-details-save" disabled={saving}>{saving ? 'Saving…' : 'Save hours'}</button>
    </form>
  </CalendarDialog>;
}
