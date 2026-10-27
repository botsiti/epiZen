import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { category, habitColor, METRICS } from '../../lib/categories';
import { noteTitle } from '../../lib/links';
import { addDays, formatDate, isoWeek, sameDay, startOfMonth, startOfWeek, today } from '../../lib/dates';
import { clock, formatMinutes, parseDay, type Day, type DayTask } from '../../lib/day';
import { missingFromDay } from '../../lib/rollup';
import { Donut, Ring, Segments } from './charts';
import { order, spark } from './effects';
import { BlurText, CountUp } from './motion';
import { Bar, Hero, NavButton, Section, Tabs, Tile } from './parts';
import type { PeriodicActions, PeriodicSpec } from './types';

const TABS = ['Overview', 'Tasks', 'Habits', 'Stream'] as const;
type Tab = (typeof TABS)[number];
// The tab last shown, so the next day opens on it too. Kept for the session only.
let lastTab: Tab = 'Overview';

interface Props {
  spec: PeriodicSpec;
  /** The note's vault path. */
  path: string;
  /** The daily note's text as it is now. */
  text: string;
  actions: PeriodicActions;
}

/** A daily note as a page: how the day went, from the note's own text. */
export function DayPage({ spec, path, text, actions }: Props) {
  const day = useMemo(() => parseDay(text), [text]);
  const [tab, setTab] = useState<Tab>(lastTab);
  const choose = (next: Tab) => {
    lastTab = next;
    setTab(next);
  };
  const { date } = spec;
  const done = day.numbers.done;
  const monday = startOfWeek(date);
  const month = startOfMonth(date);
  const isToday = sameDay(date, today());

  return (
    <article className="periodic" data-testid="periodic" data-period="day" data-path={path}>
      <Hero
        name={noteTitle(path)}
        kicker={`${formatDate(date, 'dddd')} · Week ${isoWeek(date).week} · ${formatDate(date, 'YYYY')}`}
        title={formatDate(date, 'D MMMM')}
        aside={
          <Ring value={done ?? 0} max={100} size={132} width={9}>
            <span className="ring-number">{done === undefined ? '—' : <CountUp value={done} format={(n) => `${Math.round(n)}%`} />}</span>
            <span className="ring-label">plan done</span>
          </Ring>
        }
        nav={
          <>
            <NavButton label="‹" title="The day before" onClick={() => actions.onOpenPeriod('day', addDays(date, -1))} exists={spec.exists('day', addDays(date, -1))} testId="nav-prev" />
            <NavButton label="›" title="The day after" onClick={() => actions.onOpenPeriod('day', addDays(date, 1))} exists={spec.exists('day', addDays(date, 1))} testId="nav-next" />
            <NavButton label={`Week ${isoWeek(date).week}`} title="This week's note" onClick={() => actions.onOpenPeriod('week', monday)} exists={spec.exists('week', monday)} testId="nav-week" />
            <NavButton label={formatDate(date, 'MMMM')} title="This month's note" onClick={() => actions.onOpenPeriod('month', month)} exists={spec.exists('month', month)} testId="nav-month" />
            {!isToday && <NavButton label="Today" title="Today's note" onClick={() => actions.onOpenPeriod('day', today())} exists={spec.exists('day', today())} testId="nav-today" />}
            <span className="nav-space" />
            <button type="button" className="nav-chip is-action" onClick={actions.onEdit} data-testid="edit-note">
              Edit note
            </button>
          </>
        }
      >
        {day.summary ? <BlurText text={day.summary} className="hero-summary" /> : <p className="hero-summary faint">No summary of the day yet.</p>}
        {day.important && (
          <p className="hero-important" data-testid="important">
            <span className="kicker">Important</span> {day.important}
          </p>
        )}
      </Hero>

      {isToday && <YesterdayGaps spec={spec} onOpen={() => actions.onOpenPeriod('day', addDays(date, -1))} />}

      <Tabs tabs={TABS} active={tab} onChange={choose} />
      <div className="tab-panel" key={tab}>
        {tab === 'Overview' && <Overview day={day} spec={spec} actions={actions} />}
        {tab === 'Tasks' && <TasksTab day={day} spec={spec} actions={actions} />}
        {tab === 'Habits' && <HabitsTab day={day} spec={spec} actions={actions} />}
        {tab === 'Stream' && <StreamTab day={day} />}
      </div>
    </article>
  );
}

/** On today's note: what yesterday's note never got, with a way back to it. */
function YesterdayGaps({ spec, onOpen }: { spec: PeriodicSpec; onOpen: () => void }) {
  const yesterday = spec.dayOf(addDays(spec.date, -1));
  const missing = yesterday.day ? missingFromDay(yesterday.day) : [];
  if (!missing.length) return null;
  return (
    <div className="notice glass rise" data-testid="yesterday-gaps">
      <span>
        Yesterday is missing <strong>{missing.join(', ')}</strong>.
      </span>
      <button type="button" className="nav-chip" onClick={onOpen}>
        Open yesterday
      </button>
    </div>
  );
}

function Overview({ day, spec, actions }: { day: Day; spec: PeriodicSpec; actions: PeriodicActions }) {
  const { totals } = day;
  return (
    <>
      <div className="tiles">
        <Tile label="XP" i={0} testId="tile-xp" meta={`${totals.claimed} claimed · ${totals.xp - totals.claimed} open`}>
          <CountUp value={totals.xp} />
        </Tile>
        <Tile label="Time logged" i={1} testId="tile-time" meta={<SplitBar main={totals.main} recovery={totals.recovery} />}>
          <CountUp value={totals.logged} format={formatMinutes} />
        </Tile>
        <Tile label="Tasks" i={2} testId="tile-tasks" meta={<Bar share={totals.tasks ? totals.tasksDone / totals.tasks : 0} />}>
          <CountUp value={totals.tasksDone} />
          <span className="of"> / {totals.tasks}</span>
        </Tile>
        <Tile label="Habits" i={3} testId="tile-habits" meta={<HabitDots habits={day.habits} />}>
          <CountUp value={totals.habitsDone} />
          <span className="of"> / {totals.habits}</span>
        </Tile>
      </div>
      <div className="split">
        <CheckIn day={day} spec={spec} onSet={actions.onSetProperty} />
        <TimeCard day={day} />
      </div>
      {(day.tasks.length > 0 || day.gratitude) && (
        <Section title="Tasks" note={`${totals.tasksDone} of ${totals.tasks} done`} i={6}>
          <ul className="task-list">
            {day.tasks.map((task) => (
              <TaskRow key={task.line} task={task} onToggle={actions.onToggle} />
            ))}
          </ul>
          {day.gratitude && (
            <p className="gratitude">
              <span className="kicker">Grateful for</span> {day.gratitude}
            </p>
          )}
        </Section>
      )}
    </>
  );
}

function SplitBar({ main, recovery }: { main: number; recovery: number }) {
  const total = main + recovery;
  return (
    <span className="split-bar-wrap">
      <span className="split-bar" aria-hidden="true">
        <span style={{ width: `${total ? (main / total) * 100 : 0}%` }} />
        <span className="is-recovery" style={{ width: `${total ? (recovery / total) * 100 : 0}%` }} />
      </span>
      <span>
        {formatMinutes(main)} productive · {formatMinutes(recovery)} recovery
      </span>
    </span>
  );
}

function HabitDots({ habits }: { habits: DayTask[] }) {
  return (
    <span className="habit-dots" aria-hidden="true">
      {habits.map((habit, i) => (
        <span key={habit.line} className={habit.done ? 'habit-dot is-done' : 'habit-dot'} style={{ '--tone': habitColor(i), '--i': i } as CSSProperties} />
      ))}
    </span>
  );
}

/** The day's numbers, each set from here: a tap on a segment, or a number typed in. */
function CheckIn({ day, spec, onSet }: { day: Day; spec: PeriodicSpec; onSet: (key: string, value: string) => void }) {
  return (
    <div className="card glass rise" style={order(4)} data-testid="check-in">
      <p className="tile-label">Check-in</p>
      <ul className="check-in">
        {METRICS.map(({ key, label, color }) => {
          const value = day.numbers[key] || undefined;
          const max = spec.scales[key] ?? 5;
          return (
            <li key={key} className={day.keys.includes(key) ? undefined : 'is-untracked'} data-metric={key}>
              <span className="check-label">{label}</span>
              {max <= 10 ? (
                <Segments value={value} max={max} color={color} label={label} onPick={(picked) => onSet(key, String(picked))} />
              ) : (
                <NumberField value={value} min={0} max={max} step={1} onCommit={(next) => onSet(key, next)} label={label} />
              )}
              <span className="check-value" style={{ color: value === undefined ? undefined : color }}>
                {value ?? '—'}
                <span className="faint">/{max}</span>
              </span>
            </li>
          );
        })}
        <li data-metric="sleep">
          <span className="check-label">Sleep</span>
          <NumberField value={day.numbers.sleep} min={0} max={24} step={0.1} onCommit={(next) => onSet('sleep', next)} label="Sleep" suffix="h" />
          <span className="check-value">{day.numbers.sleep === undefined ? '—' : `${day.numbers.sleep}h`}</span>
        </li>
        <li data-metric="done">
          <span className="check-label">Plan done</span>
          <NumberField value={day.numbers.done} min={0} max={100} step={1} onCommit={(next) => onSet('done', next)} label="Plan done" suffix="%" />
          <span className="check-value">{day.numbers.done === undefined ? '—' : `${day.numbers.done}%`}</span>
        </li>
      </ul>
    </div>
  );
}

/** A number typed in and written when the field is left or Enter is pressed. A number out of range is refused, not written. */
function NumberField({ value, min, max, step, onCommit, label, suffix }: { value?: number; min: number; max: number; step: number; onCommit: (value: string) => void; label: string; suffix?: string }) {
  const [draft, setDraft] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const shown = draft ?? (value === undefined ? '' : String(value));
  const commit = () => {
    if (draft === undefined) return;
    const text = draft.trim().replace(',', '.');
    setDraft(undefined);
    if (text === (value === undefined ? '' : String(value))) return;
    const number = Number(text);
    if (!text || !Number.isFinite(number) || number < min || number > max || (step === 1 && !Number.isInteger(number))) {
      setProblem(`${label} is a ${step === 1 ? 'whole ' : ''}number from ${min} to ${max}.`);
      return;
    }
    setProblem(undefined);
    onCommit(String(number));
  };
  return (
    <span className="number-field">
      <input
        type="text"
        inputMode="decimal"
        value={shown}
        placeholder="—"
        aria-label={label}
        aria-invalid={problem ? true : undefined}
        title={problem}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            setDraft(undefined);
            setProblem(undefined);
          }
        }}
        data-testid={`field-${label.toLowerCase().replace(/\s+/g, '-')}`}
      />
      {suffix && <span className="faint">{suffix}</span>}
      {problem && (
        <span className="field-problem" role="alert">
          {problem}
        </span>
      )}
    </span>
  );
}

/** Time logged by category: a ring of arcs with the total inside, and the categories beside it. */
function TimeCard({ day }: { day: Day }) {
  const total = day.totals.logged;
  return (
    <div className="card glass rise" style={order(5)} data-testid="time-card">
      <p className="tile-label">Where the time went</p>
      {total ? (
        <div className="time-card">
          <Donut
            size={168}
            width={14}
            parts={day.byCategory.map(([meta, minutes]) => ({ color: meta.color, value: minutes, label: `${meta.name} ${formatMinutes(minutes)}` }))}
            center={
              <>
                <span className="ring-number">{formatMinutes(total)}</span>
                <span className="ring-label">logged</span>
              </>
            }
          />
          <ul className="legend">
            {day.byCategory.map(([meta, minutes]) => (
              <li key={meta.name}>
                <span className="chip-dot" style={{ background: meta.color }} />
                <span className="legend-name">{meta.name}</span>
                <span className="legend-value">{formatMinutes(minutes)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="empty-line">No minutes logged yet. A task with [minutes::N] counts here.</p>
      )}
    </div>
  );
}

/** A task to tick: the tick writes that one box back to the note, with a small spark. */
function TaskRow({ task, onToggle }: { task: DayTask; onToggle: (task: DayTask) => void }) {
  const color = task.category?.color ?? 'var(--accent)';
  return (
    <li className={task.done ? 'task-row is-done' : 'task-row'} style={{ '--tone': color } as CSSProperties}>
      <label>
        <input
          type="checkbox"
          checked={task.done}
          onChange={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            if (!task.done) spark(box.left + box.width / 2, box.top + box.height / 2, color);
            onToggle(task);
          }}
          data-testid="dash-task"
          data-line={task.line}
        />
        <span className="task-text">{task.label || <span className="faint">untitled</span>}</span>
      </label>
      {task.category && <span className="chip">{task.category.name}</span>}
      <span className="task-minutes">{task.minutes ? formatMinutes(task.minutes) : ''}</span>
    </li>
  );
}

function TasksTab({ day, spec, actions }: { day: Day; spec: PeriodicSpec; actions: PeriodicActions }) {
  return (
    <>
      <Composer categories={spec.categories} onAdd={actions.onAddTask} />
      {day.tasks.length ? (
        <div className="task-cards">
          {day.tasks.map((task, i) => (
            <TaskCard key={task.line} task={task} i={i} onToggle={actions.onToggle} />
          ))}
        </div>
      ) : (
        <p className="empty-line">No tasks yet. Add one above; it goes under the note's Tasks heading.</p>
      )}
    </>
  );
}

function TaskCard({ task, i, onToggle }: { task: DayTask; i: number; onToggle: (task: DayTask) => void }) {
  const color = task.category?.color ?? 'var(--accent)';
  const xp = task.minutes ? Math.round(task.minutes * (task.category?.multiplier ?? 1)) : 0;
  return (
    <div className={task.done ? 'task-card glass rise is-done' : 'task-card glass rise'} style={{ ...order(i), '--tone': color } as CSSProperties} data-testid="task-card">
      <div className="task-card-top">
        <input
          type="checkbox"
          className="tick"
          checked={task.done}
          aria-label={task.label || 'untitled task'}
          onChange={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            if (!task.done) spark(box.left + box.width / 2, box.top + box.height / 2, color);
            onToggle(task);
          }}
          data-testid="task-card-tick"
          data-line={task.line}
        />
        {task.category && <span className="chip">{task.category.name}</span>}
        <span className="task-card-xp">{xp} XP</span>
      </div>
      <p className="task-card-title">{task.label || <span className="faint">untitled</span>}</p>
      <div className="task-card-foot">
        <span>{task.minutes ? formatMinutes(task.minutes) : 'no time logged'}</span>
        {task.blocks.map((block) => (
          <span key={block.start} className="time-chip">
            {clock(block.start)}–{clock(block.end)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Adds a task under the note's Tasks heading: a category, the words, and minutes if any were spent. */
function Composer({ categories, onAdd }: { categories: string[]; onAdd: (category: string, words: string, minutes?: number) => void }) {
  const [chosen, setChosen] = useState(categories[0] ?? 'code');
  const [words, setWords] = useState('');
  const [minutes, setMinutes] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!words.trim()) return;
    const number = Number(minutes);
    onAdd(chosen, words, Number.isFinite(number) && number > 0 ? number : undefined);
    setWords('');
    setMinutes('');
  };
  return (
    <form className="composer glass rise" onSubmit={submit} data-testid="composer">
      <div className="composer-categories" role="radiogroup" aria-label="Category">
        {categories.slice(0, 10).map((name) => {
          const meta = category(name);
          return (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={name === chosen}
              className={name === chosen ? 'chip is-chosen' : 'chip'}
              style={{ '--tone': meta.color } as CSSProperties}
              onClick={() => setChosen(name)}
              data-testid="composer-category"
              data-category={name}
            >
              {name}
            </button>
          );
        })}
      </div>
      <div className="composer-row">
        <input value={words} onChange={(event) => setWords(event.target.value)} placeholder={`A ${chosen} task for today`} aria-label="Task" data-testid="composer-text" />
        <input value={minutes} onChange={(event) => setMinutes(event.target.value)} placeholder="min" inputMode="numeric" aria-label="Minutes" className="composer-minutes" data-testid="composer-minutes" />
        <button type="submit" className="primary-button" disabled={!words.trim()} data-testid="composer-add">
          Add task
        </button>
      </div>
    </form>
  );
}

/** Days in a row the habit was ticked, up to this day; today counts once it is ticked. */
function streak(spec: PeriodicSpec, name: string, doneToday: boolean): number {
  let count = doneToday ? 1 : 0;
  for (let back = 1; back <= 366; back += 1) {
    const habit = spec.dayOf(addDays(spec.date, -back)).day?.habits.find((h) => h.label === name);
    if (!habit?.done) break;
    count += 1;
  }
  return count;
}

function HabitsTab({ day, spec, actions }: { day: Day; spec: PeriodicSpec; actions: PeriodicActions }) {
  if (!day.habits.length) return <p className="empty-line">This note has no habits. A task list inside a [!habits] callout shows here.</p>;
  return (
    <div className="habit-pills">
      {day.habits.map((habit, i) => {
        const color = habitColor(i);
        const days = streak(spec, habit.label, habit.done);
        return (
          <button
            key={habit.line}
            type="button"
            className={habit.done ? 'habit-pill glass rise is-done' : 'habit-pill glass rise'}
            style={{ ...order(i), '--tone': color } as CSSProperties}
            aria-pressed={habit.done}
            onClick={(event) => {
              if (!habit.done) spark(event.clientX, event.clientY, color);
              actions.onToggle(habit);
            }}
            data-testid="habit-pill"
            data-line={habit.line}
          >
            <span className="habit-check" aria-hidden="true" />
            <span className="habit-label">{habit.label}</span>
            <span className="habit-streak">{days ? `${days} day${days === 1 ? '' : 's'}` : 'no streak'}</span>
          </button>
        );
      })}
    </div>
  );
}

function StreamTab({ day }: { day: Day }) {
  const empty = !day.gratitude && !day.important && !day.stream.length && !day.records.length;
  if (empty) return <p className="empty-line">Nothing written in the stream yet.</p>;
  return (
    <>
      {(day.gratitude || day.important) && (
        <div className="split">
          {day.gratitude && (
            <div className="card glass rise">
              <p className="tile-label">Grateful for</p>
              <p className="words">{day.gratitude}</p>
            </div>
          )}
          {day.important && (
            <div className="card glass rise" style={order(1)}>
              <p className="tile-label">Important</p>
              <p className="words">{day.important}</p>
            </div>
          )}
        </div>
      )}
      {day.stream.length > 0 && (
        <Section title="Stream of consciousness" i={2}>
          <div className="stream">
            {day.stream.map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>
        </Section>
      )}
      {day.records.length > 0 && (
        <Section title="Thought records" note="situation → emotion → distortion → rational response → after" i={3}>
          <div className="records">
            {day.records.map((record, i) => (
              <ol key={i} className="record glass rise" style={order(i)}>
                {record.map((cell, c) => (
                  <li key={c}>{cell || <span className="faint">—</span>}</li>
                ))}
              </ol>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
