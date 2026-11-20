import { useState, type CSSProperties, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import type { CalendarEvent } from '../../lib/api';
import { category } from '../../lib/categories';
import { formatMinutes, type DayTask } from '../../lib/day';
import type { TaskEdit } from '../../lib/timeblocks';
import { useEscape } from './useEscape';
import { reason } from './useNoteWriter';
import { Layer } from '../Layer';

const stop = (event: MouseEvent) => event.stopPropagation();

/** Minutes typed in, or `undefined` when they aren't a whole number of a day. An empty field is 0. */
const minutesOf = (text: string) => {
  const number = Number(text.trim() || '0');
  return Number.isInteger(number) && number >= 0 && number <= 1440 ? number : undefined;
};

function CalendarEditor({ kind, when, onCancel, save, valid, children }: {
  kind: 'task' | 'event';
  when?: string;
  onCancel: () => void;
  save: () => void | Promise<void>;
  valid: boolean;
  children: ReactNode;
}) {
  const label = `Edit ${kind}`;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const close = () => { if (!saving) onCancel(); };
  useEscape(close);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setError(undefined);
    try {
      await save();
      onCancel();
    } catch (error) {
      setError(reason(error));
      setSaving(false);
    }
  };
  return (
    <Layer>
      <div className="periodic-layer focus-menu-backdrop is-dim" onMouseDown={close}>
        <form className="new-task glass cal-editor" onSubmit={(event) => void submit(event)} onMouseDown={stop} role="dialog" aria-label={label} data-testid={`edit-${kind}`}>
          <header>
            <h2>{label}</h2>
            {when && <p className="cal-editor-meta">{when}</p>}
          </header>
          <fieldset disabled={saving}>{children}</fieldset>
          {error && <p className="note-warning" role="alert">{error}</p>}
          <div className="popover-actions">
            <button type="button" className="quiet-chip" onClick={close} disabled={saving}>Cancel</button>
            <button type="submit" className="primary-button" disabled={!valid || saving} data-testid={`edit-${kind}-save`}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </Layer>
  );
}

/** A task's description, category and logged minutes. */
export function EditTask({ task, categories, when, note, onCancel, onSave }: {
  task: DayTask;
  categories: string[];
  when?: string;
  note?: string;
  onCancel: () => void;
  onSave: (edit: TaskEdit) => void | Promise<void>;
}) {
  const [words, setWords] = useState(task.label);
  const [chosen, setChosen] = useState(task.category?.name);
  const [minutes, setMinutes] = useState(String(task.minutes ?? 0));
  const number = minutesOf(minutes);
  // The task's own category stays on offer when it isn't among the vault's most used.
  const options = chosen && !categories.includes(chosen) ? [chosen, ...categories] : categories;
  return (
    <CalendarEditor kind="task" when={when} onCancel={onCancel} valid={Boolean(words.trim()) && number !== undefined} save={() => {
      if (number !== undefined) return onSave({ words, category: chosen, minutes: number });
    }}>
      <label className="cal-editor-field">Description
        <input autoFocus value={words} onChange={(event) => setWords(event.target.value)} placeholder="What the task is" data-testid="edit-task-text" />
      </label>
      <div className="composer-categories" role="radiogroup" aria-label="Category">
        {options.map((name) => (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={name === chosen}
            className={name === chosen ? 'chip is-chosen' : 'chip'}
            style={{ '--tone': category(name).color } as CSSProperties}
            onClick={() => setChosen(name)}
            data-testid="edit-task-category"
            data-category={name}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="edit-task-minutes">
        <label className="cal-editor-field">Minutes spent
          <input
            value={minutes}
            inputMode="numeric"
            aria-invalid={number === undefined || undefined}
            onChange={(event) => setMinutes(event.target.value)}
            data-testid="edit-task-minutes"
          />
        </label>
        <span className="cal-editor-meta">{number === undefined ? 'Enter a whole number from 0 to 1440' : formatMinutes(number)}</span>
        {[15, 30, 60].map((step) => (
          <button key={step} type="button" className="step-button" onClick={() => setMinutes(String(Math.min(1440, (number ?? 0) + step)))}>
            +{step}
          </button>
        ))}
      </div>
      {note && <p className="cal-editor-meta" title={note}>{note.split('/').at(-1)}</p>}
    </CalendarEditor>
  );
}

export function EditEvent({ event, when, onCancel, onSave }: {
  event: CalendarEvent;
  when: string;
  onCancel: () => void;
  onSave: (fields: { title?: string; notes?: string }) => Promise<unknown>;
}) {
  const [title, setTitle] = useState(event.title);
  const originalNotes = event.notes ?? '';
  const [notes, setNotes] = useState(originalNotes);
  const changedTitle = title !== event.title;
  const changedNotes = notes !== originalNotes;
  return (
    <CalendarEditor kind="event" when={when} onCancel={onCancel} valid={(!changedTitle || Boolean(title.trim())) && (changedTitle || changedNotes)} save={async () => {
      await onSave({ title: changedTitle ? title.trim() : undefined, notes: changedNotes ? notes : undefined });
    }}>
      <label className="cal-editor-field">Title
        <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label className="cal-editor-field">Description
        <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>
    </CalendarEditor>
  );
}

/** Asks before a task leaves its note, saying what goes with it. */
export function DeleteTask({ task, onCancel, onConfirm }: { task: DayTask; onCancel: () => void; onConfirm: () => void }) {
  useEscape(onCancel);
  const blocks = task.blocks.length;
  const along = [task.minutes ? `its ${formatMinutes(task.minutes)}` : '', blocks ? `${blocks} time block${blocks === 1 ? '' : 's'}` : ''].filter(Boolean);
  return (
    <Layer>
      <div className="periodic-layer focus-menu-backdrop is-dim" onMouseDown={onCancel}>
        <div className="new-task glass is-small" onMouseDown={stop} role="alertdialog" aria-label="Delete the task" data-testid="delete-task">
          <p className="kicker">Delete task</p>
          <p className="popover-words">Delete “{task.label || 'untitled'}”?</p>
          <p className="popover-note">It goes from the note{along.length ? `, with ${along.join(' and ')}` : ''}, and so does anything written under it.</p>
          <div className="popover-actions">
            <button type="button" className="quiet-chip" onClick={onCancel} autoFocus>
              Keep
            </button>
            <button type="button" className="primary-button" onClick={onConfirm} data-testid="delete-task-confirm">
              Delete
            </button>
          </div>
        </div>
      </div>
    </Layer>
  );
}
