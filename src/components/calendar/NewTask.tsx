import { useState, type CSSProperties, type FormEvent } from 'react';
import { category } from '../../lib/categories';
import { formatDate, sameDay } from '../../lib/dates';
import { useEscape } from './useEscape';
import { Layer } from '../Layer';

interface Props {
  /** The days on screen, one to pick. */
  days: Date[];
  initial: Date;
  categories: string[];
  onCancel: () => void;
  onSave: (day: Date, category: string, words: string) => void;
}

/** A task for a day, with no time yet: its time comes later, from a block or the timer. */
export function NewTask({ days, initial, categories, onCancel, onSave }: Props) {
  const [day, setDay] = useState(initial);
  const [chosen, setChosen] = useState(categories[0] ?? 'code');
  const [words, setWords] = useState('');
  useEscape(onCancel);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (words.trim()) onSave(day, chosen, words);
  };
  return (
    <Layer>
      <div className="periodic-layer focus-menu-backdrop is-dim" onMouseDown={onCancel}>
        <form className="new-task glass" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-label="New task" data-testid="new-task">
          <p className="kicker">New task</p>
          {days.length > 1 && (
            <div className="new-task-days" role="radiogroup" aria-label="Day">
              {days.map((date) => (
                <button
                  key={date.getTime()}
                  type="button"
                  role="radio"
                  aria-checked={sameDay(date, day)}
                  className={sameDay(date, day) ? 'new-task-day is-chosen' : 'new-task-day'}
                  onClick={() => setDay(date)}
                  data-testid="new-task-day"
                  data-date={formatDate(date, 'YYYY-MM-DD')}
                >
                  <span>{formatDate(date, 'ddd')}</span>
                  <strong>{date.getDate()}</strong>
                </button>
              ))}
            </div>
          )}
          {days.length === 1 && <p className="new-task-one">{formatDate(day, 'dddd, D MMMM')}</p>}
          <div className="composer-categories" role="radiogroup" aria-label="Category">
            {categories.slice(0, 10).map((name) => (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={name === chosen}
                className={name === chosen ? 'chip is-chosen' : 'chip'}
                style={{ '--tone': category(name).color } as CSSProperties}
                onClick={() => setChosen(name)}
                data-testid="new-task-category"
                data-category={name}
              >
                {name}
              </button>
            ))}
          </div>
          <input autoFocus value={words} onChange={(event) => setWords(event.target.value)} placeholder={`A ${chosen} task`} aria-label="Task" data-testid="new-task-text" />
          <div className="popover-actions">
            <button type="button" className="quiet-chip" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={!words.trim()} data-testid="new-task-add">
              Add task
            </button>
          </div>
        </form>
      </div>
    </Layer>
  );
}
