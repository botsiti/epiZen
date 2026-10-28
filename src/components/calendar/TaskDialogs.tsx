import { useState, type CSSProperties, type FormEvent, type MouseEvent } from 'react';
import { category } from '../../lib/categories';
import { formatMinutes, type DayTask } from '../../lib/day';
import type { TaskEdit } from '../../lib/timeblocks';
import { useEscape } from './useEscape';
import { Layer } from '../Layer';

const stop = (event: MouseEvent) => event.stopPropagation();

/** Minutes typed in, or `undefined` when they aren't a whole number of a day. An empty field is 0. */
const minutesOf = (text: string) => {
  const number = Number(text.trim() || '0');
  return Number.isInteger(number) && number >= 0 && number <= 1440 ? number : undefined;
};

/** A task's words, category and minutes, changed from a right-click. */
export function EditTask({ task, categories, onCancel, onSave }: { task: DayTask; categories: string[]; onCancel: () => void; onSave: (edit: TaskEdit) => void }) {
  const [words, setWords] = useState(task.label);
  const [chosen, setChosen] = useState(task.category?.name);
  const [minutes, setMinutes] = useState(String(task.minutes ?? 0));
  useEscape(onCancel);
  const number = minutesOf(minutes);
  // The task's own category stays on offer when it isn't among the vault's most used.
  const shown = categories.slice(0, 10);
  const options = chosen && !shown.includes(chosen) ? [chosen, ...shown] : shown;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (words.trim() && number !== undefined) onSave({ words, category: chosen, minutes: number });
  };
  return (
    <Layer>
      <div className="periodic-layer focus-menu-backdrop is-dim" onMouseDown={onCancel}>
        <form className="new-task glass" onSubmit={submit} onMouseDown={stop} role="dialog" aria-label="Edit task" data-testid="edit-task">
          <p className="kicker">Edit task</p>
          <input autoFocus value={words} onChange={(event) => setWords(event.target.value)} placeholder="What the task is" aria-label="Task" data-testid="edit-task-text" />
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
            <input
              value={minutes}
              inputMode="numeric"
              aria-label="Minutes spent"
              aria-invalid={number === undefined || undefined}
              onChange={(event) => setMinutes(event.target.value)}
              data-testid="edit-task-minutes"
            />
            <span className="faint">{number === undefined ? 'minutes: a whole number from 0 to 1440' : `minutes · ${formatMinutes(number)}`}</span>
            {[15, 30, 60].map((step) => (
              <button key={step} type="button" className="step-button" onClick={() => setMinutes(String(Math.min(1440, (number ?? 0) + step)))}>
                +{step}
              </button>
            ))}
          </div>
          <div className="popover-actions">
            <button type="button" className="quiet-chip" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={!words.trim() || number === undefined} data-testid="edit-task-save">
              Save
            </button>
          </div>
        </form>
      </div>
    </Layer>
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
