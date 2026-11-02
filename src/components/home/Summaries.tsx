import { useMemo, useState } from 'react';
import { day, formatDate, startOfMonth, addMonths } from '../../lib/dates';
import { formatMinutes } from '../../lib/day';
import { readMonthlySection, spendingLabel } from '../../lib/monthlyReview';
import { memento } from '../../lib/home';
import { rollup, type DayEntry } from '../../lib/rollup';
import type { Period } from '../../lib/periodic';
import './summaries.css';

export interface SummariesProps {
  today: Date;
  days: DayEntry[];
  birthDate?: Date;
  monthOf: (date: Date) => { path?: string; text?: string; ambiguous?: boolean };
  onOpenPeriod: (period: Period, date: Date) => void;
}

/** Each month has its own note and a rollup of its daily notes; nothing here writes to the vault. */
export function Summaries({ today, days, birthDate, monthOf, onOpenPeriod }: SummariesProps) {
  const [year, setYear] = useState(today.getFullYear());
  const rows = useMemo(() => Array.from({ length: 12 }, (_, index) => {
    const month = day(year, index, 1);
    const end = addMonths(month, 1);
    const total = rollup(days.filter(({ date }) => date >= month && date < end));
    const note = monthOf(month);
    const summary = note.text === undefined ? undefined : readMonthlySection(note.text, 'summary');
    const decisions = note.text === undefined ? undefined : readMonthlySection(note.text, 'decisions');
    const spending = note.text === undefined ? undefined : readMonthlySection(note.text, 'spending');
    return { month, total, note, summary, decisions, spending };
  }), [year, days, monthOf]);
  const spans = memento(today, birthDate).spans;
  const lifeEnd = birthDate && day(birthDate.getFullYear() + 80, birthDate.getMonth(), birthDate.getDate());
  const lifeShare = birthDate && lifeEnd ? Math.max(0, Math.min(1, (today.getTime() - birthDate.getTime()) / (lifeEnd.getTime() - birthDate.getTime()))) : undefined;

  return <div className="periodic-frame summaries" data-testid="summaries-page">
    <header className="summaries-header"><p className="kicker">Your year, in perspective</p><h1>Summaries</h1><p>Monthly reflections and averages from your daily notes.</p></header>
    <div className="summaries-progress" aria-label="Time in perspective">
      {spans.slice(0, 2).map((span) => <ProgressCard key={span.label} label={span.label} share={span.share} detail={`${span.daysLeft} days left`} />)}
      <ProgressCard label="Life" share={lifeShare} detail={birthDate ? '80-year frame' : 'Add a birth date in Settings'} />
      <ProgressCard label="Until 30" share={spans[2]?.share} detail={spans[2] ? `${spans[2].daysLeft} days left` : 'Add a birth date in Settings'} />
    </div>
    <div className="summaries-toolbar"><div><span className="summaries-eyebrow">Year in review</span><h2>{year}</h2></div><div className="summaries-year" aria-label="Summary year">
      <button type="button" className="shelf-all" aria-label="Previous summary year" onClick={() => setYear((value) => value - 1)}>←</button>
      <button type="button" className="shelf-all" onClick={() => setYear(today.getFullYear())}>This year</button>
      <button type="button" className="shelf-all" aria-label="Next summary year" onClick={() => setYear((value) => value + 1)}>→</button>
    </div></div>
    <div className="summaries-list">{rows.map(({ month, total, note, summary, decisions, spending }) => {
      const metrics = [['Mood', 'mood'], ['Energy', 'energy'], ['Focus', 'focus'], ['Social', 'soc'], ['Sleep', 'sleep']] as const;
      return <article className="summaries-month glass" key={month.getTime()} data-testid="summary-month" data-month={formatDate(month, 'YYYY-MM')}>
        <div className="summaries-month-head"><div><span className="summaries-month-number">{formatDate(month, 'MM')}</span><h3>{formatDate(month, 'MMMM')}</h3></div>
          <button type="button" className="shelf-all" onClick={() => onOpenPeriod('month', startOfMonth(month))}>{note.path ? 'Open month' : note.ambiguous ? 'Choose month note' : 'Create month'}</button></div>
        <div className="summaries-month-content"><div className="summaries-words">
          <span className="summaries-eyebrow">Reflection</span>
          {summary?.problem ? <p className="summaries-empty">{summary.problem}</p> : summary?.value ? <p>{summary.value}</p> : <p className="summaries-empty">{note.path ? 'No reflection written yet.' : note.ambiguous ? 'Choose which note represents this month in Settings.' : 'No monthly note yet.'}</p>}
        </div><div className="summaries-words summaries-decisions"><span className="summaries-eyebrow">Decisions</span><p className={!decisions?.value ? 'summaries-empty' : undefined}>{decisions?.problem ?? (decisions?.value || 'No decisions recorded yet.')}</p></div><div className="summaries-metrics" aria-label={`${formatDate(month, 'MMMM')} statistics`}>
          <div><span>Focus time</span><strong>{total.noted ? formatMinutes(total.totals.logged) : '—'}</strong></div>
          <div className="summaries-spending"><span>Expenses</span><strong>{spending?.problem ? 'Check month note' : spendingLabel(spending?.value ?? '')}</strong></div>
          <div><span>XP</span><strong>{total.noted ? total.totals.xp.toLocaleString('en-US') : '—'}</strong></div>
          {metrics.map(([label, key]) => { const value = total.average(key); return <div key={key}><span>{label}</span><strong>{value === undefined ? '—' : `${value}${key === 'sleep' ? 'h' : ''}`}</strong></div>; })}
        </div></div>
      </article>;
    })}</div>
  </div>;
}

function ProgressCard({ label, share, detail }: { label: string; share?: number; detail: string }) {
  return <div className="summaries-progress-card glass"><span className="summaries-eyebrow">{label}</span><strong>{share === undefined ? '—' : `${(share * 100).toFixed(1)}%`}</strong><div className="summaries-progress-track" aria-hidden="true"><i style={{ width: `${(share ?? 0) * 100}%` }} /></div><small>{detail}</small></div>;
}
