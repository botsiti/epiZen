import { usePluginDisplay } from '../workspace/PluginDisplay';
import { useMemo, useState } from 'react';
import { habitColor } from '../../lib/categories';
import { formatMinutes } from '../../lib/day';
import { addDays, addMonths, day, formatDate, startOfMonth, startOfWeek } from '../../lib/dates';
import { earned, penalty, questsIn, questXp, type Quest, type QuestChange, type QuestEntry } from '../../lib/quests';
import { rollup, type DayEntry } from '../../lib/rollup';
import { Donut } from '../periodic/charts';
import { QuestBoard } from '../periodic/Quests';
import { FocusActivity } from './FocusActivity';
import '../periodic/periodic.css';
import './insights.css';

interface QuestProps {
  quests: QuestEntry[];
  art: (quest: Quest) => string | undefined;
  today: Date;
  onToggle: (quest: Quest) => void;
  onProgress: (quest: Quest, value: number) => void;
  onChange: (quest: Quest, change: QuestChange) => Promise<string | undefined>;
}

export function QuestPage({ quests, art, today, onToggle, onProgress, onChange }: QuestProps) {
  const display = usePluginDisplay('quests');
  const [month, setMonth] = useState(() => startOfMonth(today));
  const entries = useMemo(() => questsIn(quests, month, addMonths(month, 1)), [quests, month]);
  const done = entries.filter(({ quest }) => quest.done).length;
  const xp = entries.reduce((sum, { quest }) => sum + earned(quest), 0);
  const iso = formatDate(today, 'YYYY-MM-DD');
  const overdue = entries.map((entry) => ({ ...entry, lost: penalty(entry.quest, iso, entry.period) })).filter((entry) => entry.lost > 0).sort((a, b) => b.lost - a.lost || a.quest.title.localeCompare(b.quest.title));
  const lost = overdue.reduce((sum, entry) => sum + entry.lost, 0);
  return <div className="periodic-frame insights" data-testid="quests-page">
    <header className="insights-header"><p className="kicker">Your adventures</p><h1>Quests</h1><p>Weekly, monthly and mythic quests active in this month.</p></header>
    <MonthNavigation month={month} onChange={setMonth} today={today} />
    {display.sections.progress && <section className="quest-xp-summary glass" aria-labelledby="quest-xp-heading" data-testid="quest-xp-summary">
      <div className="quest-xp-heading"><div><p className="kicker">Your progress</p><h2 id="quest-xp-heading">Quest XP</h2><p>Current progress on quests active in {formatDate(month, 'MMMM YYYY')}.</p></div><span>{done} of {entries.length} complete</span></div>
      <div className="quest-xp-totals"><div><span>Earned</span><strong>{xp ? '+' : ''}{xp.toLocaleString('en-US')} <small>XP</small></strong></div><div><span>Overdue penalty</span><strong>{lost ? '−' : ''}{lost.toLocaleString('en-US')} <small>XP</small></strong></div><div><span>Net</span><strong>{(xp - lost).toLocaleString('en-US')} <small>XP</small></strong></div><div><span>Lifetime net</span><strong>{questXp(quests, iso).toLocaleString('en-US')} <small>XP</small></strong></div></div>
      {overdue.length > 0 && <div className="quest-xp-overdue"><h3>Overdue <span>{overdue.length}</span></h3><ul>{overdue.map(({ quest, lost: amount }) => <li key={`${quest.path}:${quest.line}`}><span>{quest.title}</span><strong>−{amount.toLocaleString('en-US')} XP</strong></li>)}</ul></div>}
    </section>}
    <QuestBoard key={formatDate(month, 'YYYY-MM')} quests={entries} art={art} today={today} onToggle={onToggle} onProgress={onProgress} onChange={onChange} pageSize={8} groups={{ weekly: 'Weekly quests', monthly: 'Monthly quests' }} />
  </div>;
}

function MonthNavigation({ month, onChange, today }: { month: Date; onChange: (date: Date) => void; today: Date }) {
  return <div className="insight-navigation"><button className="shelf-all" onClick={() => onChange(addMonths(month, -1))} aria-label="Previous month">←</button><strong>{formatDate(month, 'MMMM YYYY')}</strong><button className="shelf-all" onClick={() => onChange(addMonths(month, 1))} aria-label="Next month">→</button><button className="shelf-all" onClick={() => onChange(startOfMonth(today))}>Today</button></div>;
}

type Range = 'Weekly' | 'Monthly' | 'Yearly';
export function StatisticsPage({ days, dayOf, today, showHabits }: { days: DayEntry[]; dayOf: (date: Date) => DayEntry; today: Date; showHabits: boolean }) {
  const display = usePluginDisplay('statistics');
  const [period, setPeriod] = useState(today);
  const [range, setRange] = useState<Range>(display.defaultView as Range);
  const start = range === 'Weekly' ? startOfWeek(period) : range === 'Monthly' ? startOfMonth(period) : day(period.getFullYear(), 0, 1);
  const end = range === 'Weekly' ? addDays(start, 7) : range === 'Monthly' ? addMonths(start, 1) : day(start.getFullYear() + 1, 0, 1);
  const summary = rollup(days.filter(({ date }) => date >= start && date < end));
  const months = Array.from({ length: 12 }, (_, i) => addMonths(startOfMonth(today), i - 11));
  const habitNames = [...new Set(days.filter(({ date }) => date >= months[0]! && date <= today).flatMap(({ day: value }) => value?.habits.map((habit) => habit.label) ?? []))];
  const changePeriod = (step: number) => setPeriod(range === 'Weekly' ? addDays(period, step * 7) : addMonths(period, step * (range === 'Monthly' ? 1 : 12)));
  const periodLabel = range === 'Weekly' ? `${formatDate(start, 'MMM D')} – ${formatDate(addDays(end, -1), 'MMM D, YYYY')}` : formatDate(start, range === 'Monthly' ? 'MMMM YYYY' : 'YYYY');
  return <div className="periodic-frame insights" data-testid="statistics-page">
    <header className="insights-header"><p className="kicker">Deep statistics</p><h1>Statistics</h1><p>Explore your focus and the habits you are keeping.</p></header>
    {display.sections.activity && <FocusActivity dayOf={dayOf} today={today} />}
    <section className="card glass insight-card"><div className="insight-card-head"><div><h2>Focus analysis</h2><p className="insight-subtitle">Time by category</p></div><div className="insight-range" role="group" aria-label="Focus period">{(['Weekly', 'Monthly', 'Yearly'] as const).map((item) => <button key={item} className={range === item ? 'chip-filter is-on' : 'chip-filter'} aria-pressed={range === item} onClick={() => setRange(item)}>{item}</button>)}</div></div>
      <div className="insight-period"><button className="shelf-all" onClick={() => changePeriod(-1)} aria-label="Previous focus period">←</button><strong>{periodLabel}</strong><button className="shelf-all" onClick={() => changePeriod(1)} aria-label="Next focus period">→</button></div>
      <div className="focus-analysis"><Donut parts={summary.byCategory.map(([meta, value]) => ({ color: meta.color, value, label: `${meta.name}: ${formatMinutes(value)}` }))} center={<><strong>{formatMinutes(summary.totals.logged)}</strong><span>Focus time</span></>} /><div className="focus-breakdown">{summary.byCategory.length === 0 ? <p className="empty-line">No time logged in this period.</p> : summary.byCategory.map(([meta, value]) => <div className="focus-category" key={meta.name}><span style={{ color: meta.color }}>{meta.name}</span><span className="focus-track"><i style={{ width: `${summary.totals.logged ? value / summary.totals.logged * 100 : 0}%`, background: meta.color }} /></span><small>{Math.round(value / summary.totals.logged * 100)}% · {formatMinutes(value)}</small></div>)}</div></div>
      <div className="insight-totals"><div><span>Hours</span><strong>{(summary.totals.logged / 60).toFixed(1)}</strong></div><div><span>Tasks</span><strong>{summary.totals.tasks}</strong></div><div><span>Top category</span><strong>{summary.byCategory[0]?.[0].name ?? '—'}</strong></div></div>
    </section>
    {showHabits && display.sections.habits && <section className="card glass insight-card"><h2>Habits</h2><p className="insight-subtitle">Completed days out of calendar days · last 12 months</p>{habitNames.length === 0 ? <p className="empty-line">No habits recorded yet.</p> : <div className="habits-scroll"><div className="habit-months"><span />{months.map((month) => <span key={month.getTime()} title={formatDate(month, 'MMMM YYYY')}>{formatDate(month, 'MMM')}</span>)}{habitNames.map((name, i) => <HabitRow key={name} name={name} color={habitColor(i)} months={months} days={days} />)}</div></div>}</section>}
  </div>;
}

function HabitRow({ name, color, months, days }: { name: string; color: string; months: Date[]; days: DayEntry[] }) {
  return <><span className="habit-name">{name}</span>{months.map((month) => { const end = addMonths(month, 1); const total = Math.round((Date.UTC(end.getFullYear(), end.getMonth(), 1) - Date.UTC(month.getFullYear(), month.getMonth(), 1)) / 86400000); const count = days.filter(({ date, day: value }) => date >= month && date < end && value?.habits.some((habit) => habit.label === name && habit.done)).length; const label = `${name} · ${formatDate(month, 'MMMM YYYY')}: ${count}/${total} days (${Math.round(count / total * 100)}%)`; return <span key={month.getTime()} className="habit-fill" role="img" aria-label={label} title={label}><i style={{ width: `${Math.min(100, count / total * 100)}%`, background: color }} /></span>; })}</>;
}
