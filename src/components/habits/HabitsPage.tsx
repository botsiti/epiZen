import { HabitDelete, type HabitDeleteActions } from './HabitDelete';
import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { usePluginDisplay } from '../workspace/PluginDisplay';
import { addDays, formatDate, parseDate } from '../../lib/dates';
import { habitTone } from '../../lib/habitStyle';
import { discoveredHabits, habitActive, habitHistory, habitMatches, habitStats, type Habit, type HabitProblem, type HabitStyle } from '../../lib/habits';
import type { DayEntry } from '../../lib/rollup';
import { HabitScheduleDialog, type HabitScheduleActions, type HabitScheduleRequest } from './HabitScheduleDialog';
import { HabitHistory } from './HabitHistory';
import { HabitIcon } from './HabitIcon';
import { HabitRewardSettings, type HabitRewardActions } from './HabitRewardSettings';
import { habitAreas, habitRewardXp } from '../../lib/habitRewards';
import { xpNumber } from '../../lib/xp';
import { HabitRhythm } from './HabitRhythm';
import { HabitExport } from './HabitExport';
import { HabitPersonalize } from './HabitPersonalize';
import { HabitValueControl } from './HabitValueControl';
import './habits.css';

export interface HabitsPageProps extends HabitScheduleActions, HabitRewardActions, HabitDeleteActions {
  habits: Habit[];
  problems: HabitProblem[];
  days: DayEntry[];
  today: Date;
  onComplete: (date: Date, habit: Habit, expected: boolean, done: boolean) => Promise<void>;
  onPersonalize?: (habit: Habit, style: HabitStyle) => Promise<void>;
  onMeasure: (date: Date, habit: Habit, expected: number | undefined, value: number) => Promise<void>;
  onOpenDay: (date: Date) => void;
  onOpenNote: (path: string) => void;
  enabled?: boolean;
  onOpenSettings?: () => void;
}

const dayKey = (date: Date) => formatDate(date, 'YYYY-MM-DD');
type Filter = 'Active' | 'Archived' | 'History';
const live = (habit: Habit, key: string) => habit.periods.some((p) => !p.until || p.until > key);
const tone = (habit: Habit) => ({ '--habit-tone': habitTone(habit.id, habit.color) }) as CSSProperties;

export function HabitsPage({ habits, problems, days, today, onCreate, onLifecycle, onComplete, onMeasure, onPersonalize, areas, onSaveReward, onDelete, onOpenDay, onOpenNote, enabled = true, onOpenSettings }: HabitsPageProps) {
  const display = usePluginDisplay('habits');
  const key = dayKey(today);
  const [selection, setSelection] = useState<Date>();
  const selectedDate = selection && selection <= today ? selection : today;
  const selectedKey = dayKey(selectedDate);
  const selectedLabel = key === selectedKey ? 'today' : formatDate(selectedDate, 'D MMM');
  const history = useMemo(() => discoveredHabits(days, habits), [days, habits]);
  const catalog = useMemo(() => [...habits, ...history].map((habit) => {
    const marks = habitHistory(habit, days, today);
    return { habit, marks, stats: habitStats(marks, today), byDate: new Map(marks.map((mark) => [dayKey(mark.date), mark])) };
  }), [habits, history, days, today]);
  const active = catalog.filter(({ habit }) => habit.path && live(habit, key));
  const archived = catalog.filter(({ habit }) => habit.path && !live(habit, key));
  const collections = { Active: active, Archived: archived, History: catalog.filter(({ habit }) => !habit.path) };
  const [collection, setCollection] = useState<Filter>();
  const initial = display.defaultView as Filter;
  const filter = collection ?? (initial === 'Active' && !active.length && history.length ? 'History' : initial);
  const list = collections[filter];
  const [selected, setSelected] = useState<string>();
  const chosen = list.find(({ habit }) => habit.id === selected || habit.name === selected) ?? list[0];
  const [form, setForm] = useState<HabitScheduleRequest>();
  const [exporting, setExporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [notice, setNotice] = useState('');
  const selectDate = (date: Date) => {
    setSelection(dayKey(date) === key ? undefined : date);
    setProblem('');
  };
  const detail = useRef<HTMLElement>(null);
  const select = (id: string) => {
    setSelected(id);
    // In the single-column layout the inspector can be many rows below the selected habit.
    if (detail.current?.parentElement && detail.current.parentElement.clientWidth < 690) detail.current.scrollIntoView?.({ block: 'start' });
  };
  const recent = useMemo(() => {
    const last = [...days].filter((d) => d.day?.habits.length).sort((a, b) => b.date.getTime() - a.date.getTime())[0];
    return history.filter((h) => last?.day?.habits.some((r) => habitMatches(h, r)));
  }, [days, history]);
  const due = catalog.filter(({ habit }) => habitActive(habit, selectedKey));
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6);
    const scheduled = catalog.filter((entry) => entry.byDate.get(dayKey(date))?.due);
    return { date, due: scheduled.length, completed: scheduled.filter((entry) => entry.byDate.get(dayKey(date))?.done).length };
  }), [catalog, today]);
  const chosenMark = chosen?.byDate.get(selectedKey);
  const canLog = chosen?.habit.path && habitActive(chosen.habit, selectedKey);
  const reward = chosen?.habit.reward;
  const area = habitAreas(areas).find((area) => area.id === reward?.area);
  const entryStreak = chosen && reward?.base && (canLog || chosenMark?.done) ? habitStats(chosen.marks, selectedDate).current : undefined;
  const entryXp = reward && entryStreak !== undefined ? xpNumber(habitRewardXp(reward, entryStreak + (chosenMark?.done ? 0 : 1))) : undefined;
  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setProblem(''); setNotice('');
    try { await work(); } catch (err) { setProblem(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }
  const startForm = (kind: HabitScheduleRequest['kind'], habit?: Habit) => {
    setProblem(''); setNotice(''); setForm({ kind, habit });
  };
  const continueRecent = async () => {
    let added = 0;
    for (const habit of recent) {
      try { await onCreate(habit.name, key, habit); added++; }
      catch (cause) { throw new Error(`${added} habits added. ${cause instanceof Error ? cause.message : String(cause)}`, { cause }); }
    }
    setCollection('Active');
    setNotice('Your recent routine is active again.');
  };
  return <div className="periodic-frame habits-page" data-testid="habits-page">
    <header className="habits-head"><h1>Habits</h1>
      <div className="habit-head-actions"><button type="button" className="quiet-chip" disabled={busy} onClick={() => setExporting(true)}>Export journal</button>
        <button type="button" className="primary-button" disabled={busy} onClick={() => startForm('new')}>＋ New habit</button></div>
    </header>
    {display.sections.today && <HabitRhythm today={today} selected={selectedDate} due={due.length} completed={due.filter((h) => h.byDate.get(selectedKey)?.done).length} week={week} onSelect={selectDate} />}
    {!enabled && <p className="habits-warning">Habits are hidden on daily and monthly pages. <button type="button" onClick={onOpenSettings}>Enable them in Settings</button></p>}
    {!!problems.length && <div className="habits-warning" role="alert"><strong>Some habit definitions need attention</strong>{problems.map((p) => <p key={p.path + p.message}>{p.message} <button type="button" onClick={() => onOpenNote(p.path)}>Open note</button></p>)}</div>}
    {problem && <p className="habits-warning" role="alert">{problem}</p>}
    {notice && <p className="habits-notice" role="status">{notice}</p>}
    {exporting && <HabitExport {...{ habits, days, problems, today }} onClose={() => setExporting(false)} onSaved={(message) => { setExporting(false); setNotice(message); }} />}
    {form && <HabitScheduleDialog request={form} today={today} onCreate={async (...args) => { await onCreate(...args); setSelected(args[0].trim()); }} onLifecycle={onLifecycle} onClose={() => setForm(undefined)}
      onSaved={(next, message) => { setCollection(next); setForm(undefined); setNotice(message); }} />}
    {!active.length && recent.length > 0 && filter !== 'Archived' && <aside className="habits-recent"><div><strong>Continue your recent routine</strong><p>{recent.map((h) => h.name).join(' · ')}</p></div>
      <button type="button" className="quiet-chip" disabled={busy} onClick={() => void run(continueRecent)}>Continue {recent.length} {recent.length === 1 ? 'habit' : 'habits'}</button></aside>}
    <div className="habits-toolbar" role="group" aria-label="Habit collection">{(['Active', 'Archived', 'History'] as const).map((name) =>
      <button type="button" key={name} aria-pressed={filter === name} onClick={() => { setCollection(name); setSelected(undefined); }}>{name}<small>{collections[name].length}</small></button>)}</div>
    {!list.length ? <section className="habits-empty"><h2>{filter === 'Archived' ? 'No archived habits' : filter === 'History' ? 'No historical routines yet' : 'Start your daily routine'}</h2>
      <p>{filter === 'History' ? 'Earlier habits from your daily notes appear here.' : filter === 'Archived' ? 'Paused routines keep their history here.' : 'Choose New habit to start tracking a check-in, a daily goal, or a measurement.'}</p></section> :
      <div className="habits-layout">
        <div className="habits-list">{list.map(({ habit, stats, byDate }) => {
          const mark = byDate.get(selectedKey);
          const isDue = Boolean(habit.path && habitActive(habit, selectedKey));
          const type = habit.tracking?.kind === 'goal' ? `${habit.tracking.target} ${habit.tracking.unit} daily` : habit.tracking?.kind === 'measure' ? `Daily · ${habit.tracking.unit}` : 'Daily check-in';
          const caption = !habit.path ? 'From daily notes' : isDue ? type : live(habit, key) ? 'Off schedule' : 'Archived';
          return <article key={habit.id} style={tone(habit)} data-selected={chosen?.habit.id === habit.id} className="habit-summary" data-testid="habit-summary">
            <button type="button" className="habit-summary-select" aria-pressed={chosen?.habit.id === habit.id} onClick={() => select(habit.id)}>
              <HabitIcon name={habit.name} icon={habit.icon} kind={habit.tracking?.kind} />
              <span className="habit-summary-copy"><strong>{habit.name}</strong>
                <small>{caption}</small>
                <span className="habit-summary-foot">{stats.current}d streak · {stats.best}d record</span>
              </span>
            </button>
            {isDue && !habit.tracking && <button type="button" className="habit-quick-check" disabled={busy} aria-label={`${mark?.done ? 'Undo' : 'Complete'} ${selectedLabel} for ${habit.name}`} aria-pressed={!!mark?.done}
              onClick={() => void run(() => onComplete(selectedDate, habit, !!mark?.done, !mark?.done))}>{mark?.done ? '✓' : '+'}</button>}
          </article>;
        })}</div>
        {chosen && <section ref={detail} style={tone(chosen.habit)} className="habits-detail" data-testid="habit-detail">
          <div className="habits-detail-head"><div className="habit-detail-title"><HabitIcon name={chosen.habit.name} icon={chosen.habit.icon} kind={chosen.habit.tracking?.kind} /><h2>{chosen.habit.name}</h2></div>
            <div className="habit-detail-actions">{chosen.habit.path && onPersonalize && <HabitPersonalize habit={chosen.habit} onSave={onPersonalize} />}
            {chosen.habit.path && <HabitRewardSettings habit={chosen.habit} {...{ areas, onSaveReward }} />}
            {!chosen.habit.path ? <button type="button" className="quiet-chip" disabled={busy} onClick={() => startForm('continue', chosen.habit)}>Continue tracking</button> :
              <button type="button" className="quiet-chip" disabled={busy} onClick={() => startForm(chosen.habit.periods.at(-1)?.until ? 'resume' : 'archive', chosen.habit)}>{chosen.habit.periods.at(-1)?.until ? 'Reactivate' : 'Archive'}</button>}</div></div>
          <div className="habits-stats">
            <div><span>Current streak</span><strong>{chosen.stats.current}<small> {chosen.stats.current === 1 ? 'day' : 'days'}</small></strong></div>
            <div><span>Best streak</span><strong>{chosen.stats.best}<small> {chosen.stats.best === 1 ? 'day' : 'days'}</small></strong></div>
            {entryXp !== undefined && <div style={area ? { color: area.color } : undefined}>
              <span>{area?.name ?? 'Habit XP'}</span>
              <strong>{entryXp}<small> {chosenMark?.done ? 'XP earned' : 'XP on completion'}</small></strong>
            </div>}
          </div>
          <div className="habit-entry">
            <div className="habit-entry-header"><strong>{key === selectedKey ? 'Today' : formatDate(selectedDate, 'dddd, D MMMM')}</strong>
              <button type="button" className="quiet-chip" disabled={busy} onClick={() => onOpenDay(selectedDate)}>Open daily note</button>
            </div>
            {canLog ? (chosen.habit.tracking ? <HabitValueControl key={chosen.habit.id + selectedKey} habit={chosen.habit} value={chosenMark?.value} onSave={(value) => onMeasure(selectedDate, chosen.habit, chosenMark?.value, value)} /> :
              <button type="button" className="habits-check-today" disabled={busy} aria-pressed={!!chosenMark?.done}
                onClick={() => void run(() => onComplete(selectedDate, chosen.habit, !!chosenMark?.done, !chosenMark?.done))}><span aria-hidden="true">{chosenMark?.done ? '✓' : '+'}</span>{chosenMark?.done ? `Completed ${selectedLabel}` : `Mark ${selectedLabel} complete`}</button>)
              : <p>{chosenMark?.done ? 'Completed' : 'No check-in'} · {chosen.habit.path ? 'Off schedule' : 'From daily notes'}</p>}
          </div>
          <HabitHistory key={chosen.habit.id} habit={chosen.habit} marks={chosen.marks} today={today} selected={selectedDate} onSelect={selectDate} />
          <details className="habits-periods"><summary>Tracking periods · {chosen.habit.periods.length}</summary>{chosen.habit.periods.map((p) => <p key={p.from + (p.until ?? '')}>
            {formatDate(parseDate(p.from, 'YYYY-MM-DD')!, 'D MMM YYYY')}{p.from === p.until ? ' · archived before tracking began' : p.until ? ` — ${formatDate(addDays(parseDate(p.until, 'YYYY-MM-DD')!, -1), 'D MMM YYYY')}` : ' — ongoing'}{p.reset && ' · new streak'}</p>)}</details>
          <HabitDelete key={`delete-${chosen.habit.id}`} habit={chosen.habit} today={today} onDelete={onDelete} />
        </section>}
      </div>}
  </div>;
}
