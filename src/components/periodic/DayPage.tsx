import { useMemo, useState, type CSSProperties, type FormEvent, type MouseEvent } from 'react';
import { category, habitColor, METRICS } from '../../lib/categories';
import { noteTitle } from '../../lib/links';
import { addDays, formatDate, isoWeek, sameDay, startOfMonth, startOfWeek, today } from '../../lib/dates';
import { formatMinutes, parseDay, type Day, type DayTask } from '../../lib/day';
import type { ThoughtRecord } from '../../lib/cbt';
import { missingFromDay } from '../../lib/rollup';
import { Donut, Ring, Segments } from './charts';
import { order, spark } from './effects';
import { BlurText, CountUp } from './motion';
import { Bar, Hero, NavButton, Section, Tabs, Tile } from './parts';
import { questsIn } from '../../lib/quests';
import { QuestBoard } from './Quests';
import { FocusMenu } from '../calendar/FocusMenu';
import { DeleteTask, EditTask } from '../calendar/TaskDialogs';
import { Tags, ThoughtWizard } from './ThoughtWizard';
import type { PeriodicActions, PeriodicSpec } from './types';

const TABS = ['Overview', 'Tasks', 'Habits', 'Quests', 'Stream'] as const;
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
  // The thought-record wizard: open on a record to edit it, or on nothing for a new one.
  const [wizard, setWizard] = useState<{ record?: ThoughtRecord }>();
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
            <button type="button" className="nav-chip" onClick={() => setWizard({})} data-testid="hero-record">
              Thought record
            </button>
            <button type="button" className="nav-chip is-action" onClick={actions.onEdit} data-testid="edit-note">
              Edit note
            </button>
          </>
        }
      >
        <Summary text={day.summary} onSave={actions.onSetSummary} />
        {day.important && (
          <p className="hero-important" data-testid="important">
            <span className="kicker">Important</span> {day.important}
          </p>
        )}
      </Hero>

      {isToday && <YesterdayGaps spec={spec} onOpen={() => actions.onOpenPeriod('day', addDays(date, -1))} />}

      <Tabs tabs={TABS} active={tab} onChange={choose} />
      <div className="tab-panel" key={tab}>
        {tab === 'Overview' && <Overview day={day} spec={spec} actions={actions} isToday={isToday} />}
        {tab === 'Tasks' && <TasksTab day={day} spec={spec} actions={actions} isToday={isToday} />}
        {tab === 'Habits' && <HabitsTab day={day} spec={spec} actions={actions} />}
        {tab === 'Quests' && (
          <QuestBoard quests={questsIn(spec.quests, date, addDays(date, 1))} art={spec.art} today={today()} onToggle={actions.onQuestToggle} onProgress={actions.onQuestProgress} />
        )}
        {tab === 'Stream' && <StreamTab day={day} actions={actions} onOpen={(record) => setWizard({ record })} />}
      </div>
      {wizard && (
        <ThoughtWizard
          record={wizard.record}
          onClose={() => setWizard(undefined)}
          onSave={(input) => {
            if (wizard.record) actions.onUpdateRecord(wizard.record, input);
            else actions.onAddRecord(input);
            setWizard(undefined);
          }}
        />
      )}
    </article>
  );
}

/**
 * The day's summary under its date: a few words about the day, written in place. A click opens it
 * for writing; leaving the field or ⌘↩ saves it into the note's summary callout, Escape lets it go.
 */
function Summary({ text, onSave }: { text?: string; onSave: (summary: string) => void }) {
  const [draft, setDraft] = useState<string>();
  if (draft !== undefined) {
    const save = () => {
      if (draft.trim() !== (text ?? '').trim()) onSave(draft.trim());
      setDraft(undefined);
    };
    return (
      <textarea
        className="hero-summary summary-field"
        autoFocus
        value={draft}
        rows={Math.max(2, draft.split('\n').length)}
        placeholder="A few words about the day: what happened, what came to mind."
        onChange={(event) => setDraft(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setDraft(undefined);
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) event.currentTarget.blur();
        }}
        aria-label="Summary of the day"
        data-testid="summary-field"
      />
    );
  }
  return (
    <button type="button" className="summary-button" onClick={() => setDraft(text ?? '')} title="Write about the day" data-testid="summary">
      {text ? <BlurText text={text} className="hero-summary" /> : <span className="hero-summary faint">Write a few words about the day…</span>}
    </button>
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

function Overview({ day, spec, actions, isToday }: { day: Day; spec: PeriodicSpec; actions: PeriodicActions; isToday: boolean }) {
  const { totals } = day;
  const [open, setOpen] = useState<Open>();
  return (
    <>
      <div className="tiles">
        <Tile label="XP" i={0} testId="tile-xp" meta={`${totals.claimed} claimed · ${totals.xp - totals.claimed} open`}>
          <CountUp value={totals.xp} />
        </Tile>
        <Tile label="Time logged" i={1} testId="tile-time" meta={<SplitBar main={totals.main} recovery={totals.recovery} />}>
          <CountUp value={totals.logged} format={formatMinutes} />
        </Tile>
        <Tile
          label="Plan done"
          i={2}
          testId="tile-plan"
          meta={
            <span className="split-bar-wrap">
              <Bar share={(day.numbers.done ?? 0) / 100} />
              <span>
                {totals.tasksDone} of {totals.tasks} tasks
              </span>
            </span>
          }
        >
          <CountUp value={day.numbers.done ?? 0} format={(n) => `${Math.round(n)}%`} />
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
              <TaskRow key={task.line} task={task} onToggle={actions.onToggle} onMenu={menuOn(task, setOpen)} />
            ))}
          </ul>
          {day.gratitude && (
            <p className="gratitude">
              <span className="kicker">Grateful for</span> {day.gratitude}
            </p>
          )}
        </Section>
      )}
      {open && <TaskActions open={open} isToday={isToday} categories={spec.categories} actions={actions} onOpen={setOpen} />}
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

/** What a right-click on a task opened: its menu, or the dialog one of the menu's items opened. */
type Open = { kind: 'menu'; x: number; y: number; task: DayTask } | { kind: 'edit'; task: DayTask } | { kind: 'delete'; task: DayTask };

const menuOn = (task: DayTask, open: (open: Open) => void) => (event: MouseEvent) => {
  event.preventDefault();
  open({ kind: 'menu', x: event.clientX, y: event.clientY, task });
};

/**
 * A task's right-click menu and its dialogs: focus on it (today's tasks only: the timer logs into
 * today's note), edit its words, category and minutes, or delete it.
 */
function TaskActions({ open, isToday, categories, actions, onOpen }: { open: Open; isToday: boolean; categories: string[]; actions: PeriodicActions; onOpen: (open?: Open) => void }) {
  const { task } = open;
  const close = () => onOpen(undefined);
  if (open.kind === 'edit') {
    return (
      <EditTask
        task={task}
        categories={categories}
        onCancel={close}
        onSave={(edit) => {
          close();
          actions.onEditTask(task, edit);
        }}
      />
    );
  }
  if (open.kind === 'delete') {
    return (
      <DeleteTask
        task={task}
        onCancel={close}
        onConfirm={() => {
          close();
          actions.onDeleteTask(task);
        }}
      />
    );
  }
  return (
    <FocusMenu
      at={open}
      label={task.label}
      noFocus={isToday ? undefined : 'Focus runs on today’s tasks: the timer logs into today’s note.'}
      onFocus={(how) => actions.onFocus({ line: task.line, label: task.label, category: task.category?.name }, how)}
      onEdit={() => onOpen({ kind: 'edit', task })}
      onDeleteTask={() => onOpen({ kind: 'delete', task })}
      onClose={close}
    />
  );
}

/** A task to tick: the tick writes that one box back to the note, with a small spark. */
function TaskRow({ task, onToggle, onMenu }: { task: DayTask; onToggle: (task: DayTask) => void; onMenu: (event: MouseEvent) => void }) {
  const color = task.category?.color ?? 'var(--accent)';
  return (
    <li className={task.done ? 'task-row is-done' : 'task-row'} style={{ '--tone': color } as CSSProperties} onContextMenu={onMenu}>
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

function TasksTab({ day, spec, actions, isToday }: { day: Day; spec: PeriodicSpec; actions: PeriodicActions; isToday: boolean }) {
  const [open, setOpen] = useState<Open>();
  return (
    <>
      <Composer categories={spec.categories} onAdd={actions.onAddTask} />
      {day.tasks.length ? (
        <>
          <p className="tasks-hint">{isToday ? 'Right-click a task to focus on it, edit it or delete it.' : 'Right-click a task to edit it or delete it.'}</p>
          <div className="task-cards">
            {day.tasks.map((task, i) => (
              <TaskCard key={task.line} task={task} i={i} onToggle={actions.onToggle} onMinutes={actions.onSetMinutes} onMenu={menuOn(task, setOpen)} />
            ))}
          </div>
        </>
      ) : (
        <p className="empty-line">No tasks yet. Add one above; it goes under the note's Tasks heading.</p>
      )}
      {open && <TaskActions open={open} isToday={isToday} categories={spec.categories} actions={actions} onOpen={setOpen} />}
    </>
  );
}

function TaskCard({
  task,
  i,
  onToggle,
  onMinutes,
  onMenu,
}: {
  task: DayTask;
  i: number;
  onToggle: (task: DayTask) => void;
  onMinutes: (task: DayTask, minutes: number) => void;
  onMenu: (event: MouseEvent) => void;
}) {
  const color = task.category?.color ?? 'var(--accent)';
  const xp = task.minutes ? Math.round(task.minutes * (task.category?.multiplier ?? 1)) : 0;
  return (
    <div
      className={task.done ? 'task-card glass rise is-done' : 'task-card glass rise'}
      style={{ ...order(i), '--tone': color } as CSSProperties}
      onContextMenu={onMenu}
      data-testid="task-card"
      data-line={task.line}
    >
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
        <Minutes value={task.minutes} onSet={(minutes) => onMinutes(task, minutes)} />
      </div>
    </div>
  );
}

/**
 * The minutes spent on a task, set from its card: a click opens a field for the total, with +15,
 * +30 and +60 beside it. The field writes on Enter or when left; Escape lets it go.
 */
function Minutes({ value, onSet }: { value?: number; onSet: (minutes: number) => void }) {
  const [draft, setDraft] = useState<string>();
  const [problem, setProblem] = useState(false);
  const current = value ?? 0;
  if (draft === undefined) {
    return (
      <button type="button" className="minutes-button" onClick={() => setDraft(current ? String(current) : '')} title="Set the minutes spent on this task" data-testid="task-minutes">
        {current ? formatMinutes(current) : '+ minutes'}
      </button>
    );
  }
  const commit = (text: string) => {
    const number = Number(text.trim());
    if (text.trim() === '' || !Number.isInteger(number) || number < 0 || number > 1440) {
      setProblem(true);
      return;
    }
    setDraft(undefined);
    setProblem(false);
    if (number !== current) onSet(number);
  };
  return (
    <span className="minutes-edit">
      <input
        autoFocus
        value={draft}
        inputMode="numeric"
        placeholder="min"
        aria-label="Minutes spent"
        aria-invalid={problem || undefined}
        title={problem ? 'Minutes are a whole number from 0 to 1440.' : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => {
          // Leaving for one of the + buttons isn't leaving the edit.
          if (event.relatedTarget instanceof HTMLElement && event.relatedTarget.dataset.minutesStep) return;
          commit(draft);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit(draft);
          if (event.key === 'Escape') {
            setDraft(undefined);
            setProblem(false);
          }
        }}
        data-testid="task-minutes-field"
      />
      <span className="faint">min</span>
      {[15, 30, 60].map((step) => (
        <button key={step} type="button" className="step-button" data-minutes-step={step} onClick={() => commit(String((Number(draft) || current) + step))}>
          +{step}
        </button>
      ))}
    </span>
  );
}

/** Adds a task under the note's Tasks heading: a category and the words. Its time comes later. */
function Composer({ categories, onAdd }: { categories: string[]; onAdd: (category: string, words: string) => void }) {
  const [chosen, setChosen] = useState(categories[0] ?? 'code');
  const [words, setWords] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!words.trim()) return;
    onAdd(chosen, words);
    setWords('');
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

function StreamTab({ day, actions, onOpen }: { day: Day; actions: PeriodicActions; onOpen: (record?: ThoughtRecord) => void }) {
  const [deleting, setDeleting] = useState<number>();
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
      <Section
        title="Thought records"
        note={
          <button type="button" className="nav-chip is-action" onClick={() => onOpen()} data-testid="new-record">
            + New session
          </button>
        }
        i={3}
        testId="records"
      >
        {day.records.length ? (
          <div className="records">
            {day.records.map((record, i) => (
              <div key={record.line} className="record-card glass rise" style={order(i)} data-testid="record">
                <button type="button" className="record-open" onClick={() => onOpen(record)} title="Open this session">
                  <span className="record-top">
                    {record.time && <span className="time-chip">{record.time}</span>}
                    <span className="record-situation">{record.situation || <span className="faint">Untitled moment</span>}</span>
                  </span>
                  <span className="record-feelings">
                    <Tags names={record.before} />
                    <span className="done-arrow">→</span>
                    <Tags names={record.after} />
                  </span>
                  {record.distortions.length > 0 && (
                    <span className="record-traps">
                      {record.distortions.map((name) => (
                        <span key={name} className="trap-badge">
                          {name}
                        </span>
                      ))}
                    </span>
                  )}
                  {record.balanced && <span className="record-balanced">{record.balanced}</span>}
                </button>
                <button
                  type="button"
                  className={deleting === record.line ? 'record-delete is-asking' : 'record-delete'}
                  onClick={() => {
                    if (deleting === record.line) {
                      actions.onDeleteRecord(record);
                      setDeleting(undefined);
                    } else setDeleting(record.line);
                  }}
                  onBlur={() => setDeleting(undefined)}
                  aria-label={deleting === record.line ? 'Click again to delete' : 'Delete this session'}
                  title={deleting === record.line ? 'Click again to delete' : 'Delete'}
                  data-testid="record-delete"
                >
                  {deleting === record.line ? 'Delete?' : '×'}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-line">No sessions yet today. Start one when a thought keeps pulling at you.</p>
        )}
      </Section>
    </>
  );
}
