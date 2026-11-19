import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { usePluginDisplay } from '../workspace/PluginDisplay';
import { addDays, formatDate, parseDate } from '../../lib/dates';
import { habitColor } from '../../lib/categories';
import { discoveredHabits, habitActive, habitHistory, habitMatches, habitStats, type Habit, type HabitProblem, type HabitStyle } from '../../lib/habits';
import type { DayEntry } from '../../lib/rollup';
import { HabitScheduleDialog, type HabitScheduleActions, type HabitScheduleRequest } from './HabitScheduleDialog';
import { HabitHistory } from './HabitHistory';
import { HabitRhythm } from './HabitRhythm';
import { HabitExport } from './HabitExport';
import { HabitPersonalize } from './HabitPersonalize';
import { HabitValueControl } from './HabitValueControl';
import './habits.css';

export interface HabitsPageProps extends HabitScheduleActions {
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
const tone = (habit: Habit): CSSProperties => {
  const hash = Array.from(habit.id).reduce((value, c) => (value * 31 + c.codePointAt(0)!) >>> 0, 0);
  return { '--habit-tone': habit.color ?? habitColor(hash) } as CSSProperties;
};

function HabitSymbol({ habit }: { habit: Habit }) {
  if (habit.icon) return <span className="habit-symbol" aria-hidden="true">{habit.icon}</span>;
  const symbol = habit.tracking?.kind === 'goal' ? 'M4 16V11m5 5V7m5 9V3' : habit.tracking?.kind === 'measure' ? 'm2 13 5-6 5 3 5-7' : 'm3 10 4 4 9-10';
  return <span className="habit-symbol" aria-hidden="true"><svg viewBox="0 0 20 20"><path d={symbol} /></svg></span>;
}

function StreakMilestone({ current }: { current: number }) {
  const thresholds = [3, 7, 14, 30, 60, 100, 180, 365];
  const next = thresholds.find((n) => n > current) ?? (Math.floor(current / 365) + 1) * 365;
  return <div className="habit-milestone">
    <div><strong>{current ? 'Next streak milestone' : 'First streak milestone'}</strong><span>{current} / {next} days</span></div>
    <progress value={current} max={next} aria-label="Streak milestone progress" />
  </div>;
}

export function HabitsPage({ habits, problems, days, today, onCreate, onLifecycle, onComplete, onMeasure, onPersonalize, onOpenDay, onOpenNote, enabled = true, onOpenSettings }: HabitsPageProps) {
  const display = usePluginDisplay('habits');
  const key = dayKey(today);
  const history = useMemo(() => discoveredHabits(days, habits), [days, habits]);
  const catalog = useMemo(() => [...habits, ...history].map((habit) => {
    const marks = habitHistory(habit, days, today);
    return { habit, marks, stats: habitStats(marks, today), today: marks.at(-1) };
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
  const due = active.filter(({ habit }) => habitActive(habit, key));
  const week = useMemo(() => {
    const counts = new Map(days.map((entry) => [dayKey(entry.date), entry.day?.habits.filter((r) => r.done).length ?? 0]));
    return Array.from({ length: 7 }, (_, i) => counts.get(dayKey(addDays(today, i - 6))) ?? 0);
  }, [days, today]);
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
    <header className="habits-head"><div><p className="kicker">{formatDate(today, 'dddd, D MMMM')}</p><h1>Habits</h1></div>
      <div className="habit-head-actions"><button type="button" className="quiet-chip" disabled={busy} onClick={() => setExporting(true)}>Export journal</button>
        <button type="button" className="primary-button" disabled={busy} onClick={() => startForm('new')}>＋ New habit</button></div>
    </header>
    {display.sections.today && <HabitRhythm today={today} due={due.length} completed={due.filter((h) => h.today?.done).length} week={week} best={active.reduce((best, h) => Math.max(best, h.stats.current), 0)} />}
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
        <div className="habits-list">{list.map(({ habit, marks, stats, today: mark }) => {
          const isDue = Boolean(habit.path && habitActive(habit, key));
          const recentMarks = marks.slice(-7);
          const type = habit.tracking?.kind === 'goal' ? `${habit.tracking.target} ${habit.tracking.unit} daily` : habit.tracking?.kind === 'measure' ? `Daily · ${habit.tracking.unit}` : 'Daily check-in';
          const caption = !habit.path ? 'From daily notes' : isDue ? type : live(habit, key) ? `Starts ${habit.periods.at(-1)!.from}` : 'Archived';
          return <article key={habit.id} style={tone(habit)} data-selected={chosen?.habit.id === habit.id} className="habit-summary" data-testid="habit-summary">
            <button type="button" className="habit-summary-select" aria-pressed={chosen?.habit.id === habit.id} onClick={() => select(habit.id)}>
              <HabitSymbol habit={habit} /><span className="habit-summary-copy"><strong>{habit.name}</strong><small>{caption}</small></span>
              <span className="habit-summary-foot"><span>{stats.current ? `${stats.current}-day streak` : `${stats.completed} completions`}</span>
                <span className="habit-summary-dots" aria-hidden="true">{Array.from({ length: 7 }, (_, i) => {
                  const day = recentMarks[i - 7 + recentMarks.length];
                  return <i key={i} data-done={day?.done} data-due={day?.due} />;
                })}</span></span>
            </button>
            {isDue && !habit.tracking && <button type="button" className="habit-quick-check" disabled={busy} aria-label={`${mark?.done ? 'Undo today for' : 'Complete today for'} ${habit.name}`} aria-pressed={!!mark?.done}
              onClick={() => void run(() => onComplete(today, habit, !!mark?.done, !mark?.done))}>{mark?.done ? '✓' : '+'}</button>}
          </article>;
        })}</div>
        {chosen && <section ref={detail} style={tone(chosen.habit)} className="habits-detail" data-testid="habit-detail">
          <div className="habits-detail-head"><div><p className="kicker">{!chosen.habit.path ? 'Habit history' : live(chosen.habit, key) ? 'Daily practice' : 'Archived routine'}</p><h2>{chosen.habit.name}</h2></div>
            <div className="habit-detail-actions">{chosen.habit.path && onPersonalize && <HabitPersonalize habit={chosen.habit} onSave={onPersonalize} />}
            {!chosen.habit.path ? <button type="button" className="quiet-chip" disabled={busy} onClick={() => startForm('continue', chosen.habit)}>Continue tracking</button> :
              <button type="button" className="quiet-chip" disabled={busy} onClick={() => startForm(chosen.habit.periods.at(-1)?.until ? 'resume' : 'archive', chosen.habit)}>{chosen.habit.periods.at(-1)?.until ? 'Reactivate' : 'Archive'}</button>}</div></div>
          <div className="habits-stats">
            <div><span>Current streak</span><strong>{chosen.stats.current}<small> {chosen.stats.current === 1 ? 'day' : 'days'}</small></strong></div>
            <div><span>Best streak</span><strong>{chosen.stats.best}<small> {chosen.stats.best === 1 ? 'day' : 'days'}</small></strong></div>
            <div><span>Completions</span><strong>{chosen.stats.completed}</strong></div>
            <div title="Completed days out of scheduled days. Today counts once completed."><span>Consistency</span><strong>{chosen.stats.rate === undefined ? '—' : `${chosen.stats.rate}%`}</strong></div>
          </div>
          {chosen.habit.path && habitActive(chosen.habit, key) && (chosen.habit.tracking ? <HabitValueControl key={chosen.habit.id + key} habit={chosen.habit} value={chosen.today?.value} onSave={(value) => onMeasure(today, chosen.habit, chosen.today?.value, value)} /> :
            <button type="button" className="habits-check-today" disabled={busy} aria-pressed={!!chosen.today?.done}
              onClick={() => void run(() => onComplete(today, chosen.habit, !!chosen.today?.done, !chosen.today?.done))}><span>{chosen.today?.done ? '✓' : '+'}</span>{chosen.today?.done ? 'Completed today' : 'Mark today complete'}<small>{formatDate(today, 'D MMM')}</small></button>)}
          <HabitHistory key={chosen.habit.id} habit={chosen.habit} marks={chosen.marks} today={today} onOpenDay={onOpenDay} />
          {chosen.habit.path && live(chosen.habit, key) && <StreakMilestone current={chosen.stats.current} />}
          <details className="habits-periods"><summary>Tracking periods · {chosen.habit.periods.length}</summary>{chosen.habit.periods.map((p) => <p key={p.from + (p.until ?? '')}>
            {formatDate(parseDate(p.from, 'YYYY-MM-DD')!, 'D MMM YYYY')}{p.from === p.until ? ' · archived before tracking began' : p.until ? ` — ${formatDate(addDays(parseDate(p.until, 'YYYY-MM-DD')!, -1), 'D MMM YYYY')}` : ' — ongoing'}{p.reset && ' · new streak'}</p>)}</details>
        </section>}
      </div>}
  </div>;
}
