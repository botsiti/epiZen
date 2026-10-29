import { useRef, useState, type CSSProperties } from 'react';
import { category } from '../../lib/categories';
import { formatMinutes } from '../../lib/day';
import type { DayTaskRef, TaskChoice } from './types';

interface Props {
  tasks: DayTaskRef[];
  categories: string[];
  value?: TaskChoice;
  onChange: (choice: TaskChoice | undefined) => void;
  /** Called on Enter in the new task's field. */
  onSubmit?: () => void;
  autoFocus?: boolean;
}

/**
 * One of the day's tasks, or a new one: its words, and a category from a row of chips like the
 * day page's composer.
 */
export function TaskPicker({ tasks, categories, value, onChange, onSubmit, autoFocus }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [words, setWords] = useState(value?.kind === 'new' ? value.words : '');
  const [chosen, setChosen] = useState(value?.kind === 'new' ? value.category : (categories[0] ?? 'code'));
  const typing = (next: string, cat = chosen) => {
    setWords(next);
    setChosen(cat);
    onChange(next.trim() ? { kind: 'new', category: cat, words: next.trim() } : undefined);
  };
  return (
    <div className="task-picker">
      {tasks.length > 0 && (
        <ul className="pick-list" role="radiogroup" aria-label="The day's tasks">
          {tasks.map(({ task, ref }) => {
            const picked = value?.kind === 'task' && value.ref.line === ref.line;
            return (
              <li key={ref.line}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={picked}
                  className={picked ? 'pick-row is-picked' : 'pick-row'}
                  style={{ '--tone': task.category?.color ?? 'var(--accent)' } as CSSProperties}
                  onClick={() => {
                    setWords('');
                    onChange({ kind: 'task', ref, label: task.label, category: task.category?.name });
                  }}
                  data-testid="pick-task"
                  data-line={ref.line}
                >
                  <span className="chip-dot" />
                  <span className="pick-label">{task.label || <span className="faint">untitled</span>}</span>
                  <span className="pick-minutes">{task.minutes ? formatMinutes(task.minutes) : ''}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <input
        ref={input}
        className="pick-new"
        value={words}
        autoFocus={autoFocus && !tasks.length}
        placeholder={tasks.length ? 'Or a new task' : 'A new task'}
        aria-label="New task"
        onChange={(event) => typing(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && onSubmit) {
            event.preventDefault();
            onSubmit();
          }
        }}
        data-testid="pick-new"
      />
      {(words.trim() || !tasks.length) && (
        <div className="composer-categories" role="radiogroup" aria-label="Category">
          {categories.slice(0, 10).map((name) => (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={name === chosen}
              className={name === chosen ? 'chip is-chosen' : 'chip'}
              style={{ '--tone': category(name).color } as CSSProperties}
              onClick={() => {
                typing(words, name);
                input.current?.focus({ preventScroll: true });
              }}
              data-testid="pick-category"
              data-category={name}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
