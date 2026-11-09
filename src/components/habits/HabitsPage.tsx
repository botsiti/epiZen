import { usePluginDisplay } from '../workspace/PluginDisplay';
import { useMemo, useState } from 'react';
import { HabitDialog } from './HabitDialog';
import { addDays, addMonths, formatDate, monthGrid, parseDate, startOfWeek, startOfMonth } from '../../lib/dates';
import { discoveredHabits, habitActive, habitHistory, habitMatches, habitStats, type Habit, type HabitLifecycle, type HabitProblem } from '../../lib/habits';
import type { DayEntry } from '../../lib/rollup';
import { DateField } from '../DateField';
import './habits.css';

export interface HabitsPageProps {
  habits: Habit[];
  problems: HabitProblem[];
  days: DayEntry[];
  today: Date;
  onCreate: (name: string, from: string, history?: Habit) => Promise<void>;
  onLifecycle: (habit: Habit, change: HabitLifecycle) => Promise<void>;
  onComplete: (date: Date, habit: Habit, expected: boolean, done: boolean) => Promise<void>;
  onOpenDay: (date: Date) => void;
  onOpenNote: (path: string) => void;
  enabled?: boolean;
  onOpenSettings?: () => void;
}
type Filter = 'Active' | 'Archived' | 'History';
const dateKey = (date: Date) => formatDate(date, 'YYYY-MM-DD');
const live = (habit: Habit, date: Date) => habit.periods.some((p) => !p.until || p.until > dateKey(date));

export function HabitsPage({ habits, problems, days, today, onCreate, onLifecycle, onComplete, onOpenDay, onOpenNote, enabled = true, onOpenSettings }: HabitsPageProps) {
  const display = usePluginDisplay('habits');
  const history = useMemo(() => discoveredHabits(days, habits), [days, habits]);
  const [filter, setFilter] = useState<Filter>(display.defaultView as Filter);
  const [selected, setSelected] = useState<string>();
  const [form, setForm] = useState<{ kind: 'new' | 'archive' | 'resume' | 'continue'; habit?: Habit; name: string; date: string; restart: boolean }>();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [detailView, setDetailView] = useState<'Overview' | 'Calendar'>('Overview');
  const [month, setMonth] = useState(() => startOfMonth(today));
  const active = habits.filter((h) => live(h, today));
  const archived = habits.filter((h) => !live(h, today));
  const list = filter === 'Active' ? active : filter === 'Archived' ? archived : history;
  const chosen = list.find((h) => h.id === selected) ?? list[0];
  const marks = chosen ? habitHistory(chosen, days, today) : [];
  const stats = habitStats(marks, today);
  const recentCount = marks.filter((m) => m.done && m.date >= addDays(startOfWeek(today), -77)).length;
  const recent = useMemo(() => {
    const last = [...days].filter((d) => d.day?.habits.length).sort((a, b) => b.date.getTime() - a.date.getTime())[0];
    return history.filter((h) => last?.day?.habits.some((r) => habitMatches(h, r)));
  }, [days, history]);
  const due = active.filter((h) => habitActive(h, today));
  const doneToday = due.filter((h) => days.some((d) => dateKey(d.date) === dateKey(today) && d.day?.habits.some((r) => habitMatches(h, r) && r.done))).length;
  const run = async (work: () => Promise<void>, message?: string) => {
    if (busy) return;
    setBusy(true); setProblem(undefined); setNotice(undefined);
    try { await work(); setForm(undefined); if (message) setNotice(message); }
    catch (err) { setProblem(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  };
  const startForm = (kind: 'new' | 'archive' | 'resume' | 'continue', habit?: Habit) => {
    setProblem(undefined); setNotice(undefined);
    const start = habit?.periods.at(-1)?.from;
    setForm({ kind, habit, name: habit?.name ?? '', date: start && start > dateKey(today) ? start : dateKey(today), restart: false });
  };
  const submit = () => form && run(async () => {
    if (form.kind === 'new' || form.kind === 'continue') {
      await onCreate(form.name, form.date, form.habit); setFilter('Active');
    } else {
      await onLifecycle(form.habit!, form.kind === 'archive' ? { kind: 'archive', date: form.date } : { kind: 'resume', date: form.date, restart: form.restart });
      setFilter(form.kind === 'archive' && form.date <= dateKey(today) ? 'Archived' : 'Active');
    }
  }, form.kind === 'archive' ? form.date > dateKey(today) ? `Archive scheduled for ${form.date}. Its history will be kept.` : 'Habit archived. Its history is kept.' : 'Habit schedule saved.');

  return <div className="periodic-frame habits-page" data-testid="habits-page">
    <header className="habits-head"><div><p className="kicker">Small actions, over time</p><h1>Habits</h1><p>Your routines can change. Your history stays with you.</p></div><button type="button" className="primary-button" disabled={busy} onClick={() => startForm('new')}>＋ New habit</button></header>
    {display.sections.today && <section className="habits-today" aria-label="Today's habit progress"><div><span className="kicker">{formatDate(today, 'dddd, D MMMM')}</span><p>{due.length ? doneToday === due.length ? 'Your routine is complete for today.' : `${due.length - doneToday} small ${due.length - doneToday === 1 ? 'step' : 'steps'} still ahead.` : 'A little intention, every day.'}</p></div><div className="habits-today-score"><strong>{doneToday}<small> / {due.length}</small></strong><span>completed today</span></div><div className="habits-today-track" aria-hidden="true"><i style={{ width: `${due.length ? doneToday * 100 / due.length : 0}%` }} /></div></section>}
    {!enabled && <p className="habits-warning">Habits are hidden on daily and monthly pages. <button type="button" onClick={onOpenSettings}>Enable them in Settings</button></p>}
    {problems.length > 0 && <div className="habits-warning" role="alert"><strong>Some habit notes need attention</strong>{problems.map((p) => <p key={`${p.path}:${p.message}`}>{p.message} <button type="button" onClick={() => onOpenNote(p.path)}>Open note</button></p>)}</div>}
    {problem && <p className="habits-warning" role="alert">{problem}</p>}{notice && <p className="habits-notice" role="status">{notice}</p>}
    {form && <HabitDialog busy={busy} onCancel={() => setForm(undefined)} title={form.kind === 'archive' ? 'Archive habit' : form.kind === 'resume' ? 'Reactivate habit' : 'New habit'}><form className="habits-form card glass" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <div><p className="kicker">{form.habit?.name ?? 'A new daily routine'}</p><h2>{form.kind === 'archive' ? 'Make room for a break' : form.kind === 'resume' ? 'Bring this habit back' : form.kind === 'continue' ? 'Continue your history' : 'What would you like to practice?'}</h2></div>
      {form.kind === 'new' && <label className="field"><span>Habit name</span><input maxLength={100} aria-label="Habit name" placeholder="No sweets, read a chapter, take a walk…" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} disabled={busy} /></label>}
      <label className="field"><span>{form.kind === 'archive' ? 'Archive from' : 'Start tracking from'}</span><DateField testId="habit-effective-date" label="Habit effective date" value={form.date} onChange={(date) => setForm({ ...form, date })} /></label>
      <p>{form.kind === 'archive' ? 'The habit will disappear from this date onward. Previous check-ins, calendars and your best streak stay available.' : 'The habit appears in daily notes from this date. Existing completions remain in their original notes.'}</p>
      {form.kind === 'resume' && <fieldset><legend>Streak after the break</legend><label><input type="radio" name="streak" checked={!form.restart} onChange={() => setForm({ ...form, restart: false })} /> Resume the paused streak</label><label><input type="radio" name="streak" checked={form.restart} onChange={() => setForm({ ...form, restart: true })} /> Start fresh; keep the previous best</label></fieldset>}
      <div className="habits-form-actions"><button type="button" className="quiet-chip" disabled={busy} onClick={() => setForm(undefined)}>Cancel</button><button className="primary-button" type="submit" disabled={busy || !form.name.trim() || !form.date}>{busy ? 'Saving…' : form.kind === 'archive' ? 'Archive habit' : 'Save habit'}</button></div>
    </form></HabitDialog>}
    {!active.length && recent.length > 0 && filter === 'Active' && <section className="habits-recent card glass"><div><span className="kicker">From your daily notes</span><h2>Continue your recent routine</h2><p>{recent.map((h) => h.name).join(' · ')}</p><p>Bring this set into your current days. All earlier check-ins stay connected.</p></div><button type="button" className="primary-button" disabled={busy} onClick={() => void run(async () => { let count = 0; for (const h of recent) { try { await onCreate(h.name, dateKey(today), h); count++; } catch (err) { throw new Error(`${count} habits added. ${(err as Error).message} Reopen the page to see the saved habits.`, { cause: err }); } } }, 'Your recent routine is active again.')}>Continue {recent.length} habits</button></section>}
    <div className="habits-toolbar" role="group" aria-label="Habit collection">{(['Active', 'Archived', 'History'] as const).map((name) => <button type="button" key={name} aria-pressed={filter === name} onClick={() => { setFilter(name); setSelected(undefined); }} className={filter === name ? 'is-selected' : ''}>{name}<small>{name === 'Active' ? active.length : name === 'Archived' ? archived.length : history.length}</small></button>)}</div>
    {!list.length ? <div className="habits-empty"><h2>{filter === 'Archived' ? 'A place for habits on pause' : filter === 'History' ? 'Your history starts with a check-in' : 'Make space for one small habit'}</h2><p>{filter === 'History' ? 'Habits found in older daily notes appear here, ready to continue.' : filter === 'Archived' ? 'Archive a habit when it no longer fits your routine. Bring it back whenever you are ready.' : 'Add a habit above, or continue a habit from History. It will appear in your daily notes.'}</p></div> : <div className="habits-layout"><div className="habits-list">{list.map((habit) => {
      const summary = habitStats(habitHistory(habit, days, today), today);
      const recentMarks = habitHistory(habit, days, today).slice(-14);
      const completed = days.some((d) => dateKey(d.date) === dateKey(today) && d.day?.habits.some((r) => habitMatches(habit, r) && r.done));
      return <article key={habit.id} className={chosen?.id === habit.id ? 'habit-summary is-selected' : 'habit-summary'} data-testid="habit-summary">
        <button type="button" className="habit-summary-select" aria-pressed={chosen?.id === habit.id} onClick={() => setSelected(habit.id)}><span className="habit-summary-name">{habit.name}</span><span className="habit-summary-caption">{!habit.path ? 'From daily notes' : habitActive(habit, today) ? 'Every day' : live(habit, today) ? `Starts ${habit.periods.at(-1)!.from}` : 'On pause'}</span><span className="habit-summary-dots" aria-hidden="true">{recentMarks.map((mark) => <i key={dateKey(mark.date)} className={mark.done ? 'is-done' : mark.due ? '' : 'is-paused'} />)}</span><span className="habit-summary-records"><span>{summary.current} day streak</span><span>Best {summary.best}</span></span></button>
        {habit.path && habitActive(habit, today) && <button type="button" className={completed ? 'habit-quick-check is-done' : 'habit-quick-check'} disabled={busy} aria-label={`${completed ? 'Undo today for' : 'Complete today for'} ${habit.name}`} aria-pressed={completed} onClick={() => void run(() => onComplete(today, habit, completed, !completed))}>{completed ? '✓' : <span />}</button>}
      </article>;

    })}</div>{chosen && <section className="habits-detail card glass" data-testid="habit-detail"><div className="habits-detail-head"><div><p className="kicker">{!chosen.path ? 'Historical habit' : live(chosen, today) ? 'Your daily practice' : 'On pause'}</p><h2>{chosen.name}</h2></div>{!chosen.path ? <button type="button" className="quiet-chip" disabled={busy} onClick={() => startForm('continue', chosen)}>Continue tracking</button> : <button type="button" className="quiet-chip" disabled={busy} onClick={() => startForm(live(chosen, today) ? 'archive' : 'resume', chosen)}>{live(chosen, today) ? 'Archive' : 'Reactivate'}</button>}</div>
      <div className="habits-stats"><div><span>Current streak</span><strong>{stats.current}<small> {stats.current === 1 ? 'day' : 'days'}</small></strong></div><div><span>Best streak</span><strong>{stats.best}<small> {stats.best === 1 ? 'day' : 'days'}</small></strong></div><div><span>Completed</span><strong>{stats.completed}</strong></div><div><span>Consistency</span><strong>{stats.rate === undefined ? '—' : `${stats.rate}%`}</strong></div></div>
      {chosen.path && habitActive(chosen, today) && <button type="button" className={marks.at(-1)?.done ? 'habits-check-today is-done' : 'habits-check-today'} disabled={busy} aria-pressed={marks.at(-1)?.done ?? false} onClick={() => void run(() => onComplete(today, chosen, marks.at(-1)?.done ?? false, !marks.at(-1)?.done))}><span>{marks.at(-1)?.done ? '✓' : '○'}</span>{marks.at(-1)?.done ? 'Completed today' : 'Mark today complete'}<small>{formatDate(today, 'D MMM')}</small></button>}
      <div className="habit-detail-tabs" role="group" aria-label="Habit history view">{(['Overview', 'Calendar'] as const).map((view) => <button type="button" key={view} aria-pressed={detailView === view} onClick={() => setDetailView(view)}>{view}</button>)}</div>
      {detailView === 'Overview' ? <div className="habit-history-overview"><div className="habit-history-heading"><span className="money-label">The last 12 weeks</span><span>{recentCount} {recentCount === 1 ? 'check-in' : 'check-ins'}</span></div><div className="habit-history-grid" role="img" aria-label={`${chosen.name}: last 12 weeks of completion history`}>{Array.from({ length: 84 }, (_, i) => { const date = addDays(startOfWeek(today), i - 77);const key = dateKey(date);const mark = marks.find((m) => dateKey(m.date) === key);return <i key={key} title={`${formatDate(date, 'D MMM')}: ${mark?.done ? 'Completed' : mark?.due ? 'Not completed' : 'Not scheduled'}`} className={mark?.done ? 'is-done' : mark?.due ? 'is-due' : ''} />; })}</div><div className="habit-history-range"><span>{formatDate(addDays(startOfWeek(today), -77), 'D MMM')}</span><span>{formatDate(today, 'D MMM')}</span></div><p className="habit-history-note">Every check-in is part of the picture. Open Calendar to revisit a day.</p></div> : <>
      <div className="habits-calendar-head"><button type="button" aria-label="Previous habit month" className="quiet-chip" onClick={() => setMonth(addMonths(month, -1))}>←</button><h3>{formatDate(month, 'MMMM YYYY')}</h3><button type="button" aria-label="Next habit month" className="quiet-chip" onClick={() => setMonth(addMonths(month, 1))}>→</button></div>
      <div className="habits-calendar" aria-label={`${chosen.name} history`}>{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, i) => <span className="habits-weekday" key={i}>{label}</span>)}{monthGrid(month).map((week) => week.map((date) => { const key = dateKey(date); const mark = marks.find((m) => dateKey(m.date) === key); const future = key > dateKey(today); const outside = date.getMonth() !== month.getMonth(); const state = future ? 'Future' : mark?.done ? 'Completed' : mark?.due ? key === dateKey(today) ? 'Pending' : 'Not completed' : 'Not scheduled'; return <button type="button" key={key} disabled={future} title={`${formatDate(date, 'D MMM YYYY')} · ${state} · open daily note`} aria-label={`${formatDate(date, 'D MMM YYYY')}: ${state}`} className={`habits-calendar-day${mark?.done ? ' is-done' : ''}${mark?.due ? ' is-due' : ''}${outside ? ' is-outside' : ''}${key === dateKey(today) ? ' is-today' : ''}`} onClick={() => onOpenDay(date)}>{date.getDate()}<i /></button>; }))}</div>
      <div className="habits-legend"><span><i className="is-done" />Completed</span><span><i />Not completed</span><span><i className="is-paused" />Not scheduled</span></div>
      </>}
      <details className="habits-periods"><summary>Tracking periods · {chosen.periods.length}</summary>{chosen.periods.map((p, i) => <p key={`${p.from}:${i}`}>{p.from === p.until ? 'Archived before tracking began · ' : ''}{formatDate(parseDate(p.from, 'YYYY-MM-DD')!, 'D MMM YYYY')}{p.from === p.until ? '' : ' — '}{p.from === p.until ? '' : p.until ? formatDate(addDays(parseDate(p.until, 'YYYY-MM-DD')!, -1), 'D MMM YYYY') : 'ongoing'}{p.reset ? ' · new streak' : ''}</p>)}<p>Days on pause do not count as missed. Your best streak is always retained.</p></details>
      <p className="habits-source">{chosen.path ? <button type="button" onClick={() => onOpenNote(chosen.path!)}>Open habit note ↗</button> : 'History is read from your existing daily notes.'}</p>
    </section>}</div>}
  </div>;
}
