import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { habitColor, METRICS } from '../../lib/categories';
import { noteTitle } from '../../lib/links';
import { addDays, addMonths, formatDate, isoWeek, monthGrid, sameDay, startOfMonth, startOfWeek, today } from '../../lib/dates';
import { formatMinutes } from '../../lib/day';
import { reflections, rollup, spread, type DayEntry, type Rollup } from '../../lib/rollup';
import { Donut, LineChart, Ring, Sparkline } from './charts';
import { order } from './effects';
import { CountUp } from './motion';
import { Bar, CategoryBars, Covers, HabitGrid, Hero, NavButton, Section, Tabs, Tile } from './parts';
import { questsIn } from '../../lib/quests';
import { readSection, sectionWords, WEEK_HEADINGS, type WeekHeading } from '../../lib/sections';
import { QuestComposer } from './QuestComposer';
import { QuestBoard } from './Quests';
import type { PeriodicActions, PeriodicSpec } from './types';

const WEEK_TABS = ['Overview', 'Days', 'Quests', 'Habits', 'Stats'] as const;
const MONTH_TABS = ['Overview', 'Weeks', 'Quests', 'Days', 'Habits', 'Stats'] as const;
type WeekTab = (typeof WEEK_TABS)[number];
type MonthTab = (typeof MONTH_TABS)[number];
let lastWeekTab: WeekTab = 'Overview';
let lastMonthTab: MonthTab = 'Overview';

interface Props {
  spec: PeriodicSpec;
  /** The note's vault path. */
  path: string;
  /** The weekly or monthly note's own text. */
  text: string;
  actions: PeriodicActions;
}

/** A weekly note as a page: its seven days added up, and the week's own Plus, Minus and Next. */
export function WeekPage({ spec, path, text, actions }: Props) {
  const monday = startOfWeek(spec.date);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => spec.dayOf(addDays(startOfWeek(spec.date), i))), [spec]);
  const sum = useMemo(() => rollup(days), [days]);
  const [tab, setTab] = useState<WeekTab>(lastWeekTab);
  const choose = (next: WeekTab) => {
    lastWeekTab = next;
    setTab(next);
  };
  const sunday = addDays(monday, 6);
  // A week belongs to the month its Thursday is in, as ISO weeks belong to years.
  const month = startOfMonth(addDays(monday, 3));
  const thisWeek = startOfWeek(today());
  const done = sum.average('done');

  return (
    <article className="periodic" data-testid="periodic" data-period="week" data-path={path}>
      <Hero
        name={noteTitle(path)}
        kicker={`Week ${isoWeek(monday).week} · ${isoWeek(monday).year}`}
        title={`${formatDate(monday, 'D MMM')} — ${formatDate(sunday, 'D MMM')}`}
        aside={<DoneRing value={done} label="plan done, average" />}
        nav={
          <>
            <NavButton label="‹" title="The week before" onClick={() => actions.onOpenPeriod('week', addDays(monday, -7))} exists={spec.exists('week', addDays(monday, -7))} testId="nav-prev" />
            <NavButton label="›" title="The week after" onClick={() => actions.onOpenPeriod('week', addDays(monday, 7))} exists={spec.exists('week', addDays(monday, 7))} testId="nav-next" />
            <NavButton label={formatDate(month, 'MMMM')} title="This month's note" onClick={() => actions.onOpenPeriod('month', month)} exists={spec.exists('month', month)} testId="nav-month" />
            {!sameDay(monday, thisWeek) && <NavButton label="This week" title="This week's note" onClick={() => actions.onOpenPeriod('week', thisWeek)} exists={spec.exists('week', thisWeek)} testId="nav-today" />}
            <span className="nav-space" />
            <button type="button" className="nav-chip is-action" onClick={actions.onEdit} data-testid="edit-note">
              Edit note
            </button>
          </>
        }
      >
        <p className="hero-summary">
          {sum.noted} of 7 days written · {formatMinutes(sum.totals.logged)} logged
        </p>
      </Hero>
      <Tabs tabs={WEEK_TABS.filter((item) => spec.features?.habits !== false || item !== 'Habits')} active={spec.features?.habits === false && tab === 'Habits' ? 'Overview' : tab} onChange={choose} />
      <div className="tab-panel" key={tab}>
        {(tab === 'Overview' || (tab === 'Habits' && spec.features?.habits === false)) && (
          <>
            <Totals sum={sum} spec={spec} span={7} />
            <Section title="The days" i={12}>
              <div className="day-cards">
                {days.map((entry, i) => (
                  <DayCard key={entry.date.getTime()} entry={entry} i={i} spec={spec} actions={actions} />
                ))}
              </div>
            </Section>
            <WeekReflections text={text} i={13} onSave={actions.onSetSection} />
            <Media days={days} spec={spec} actions={actions} title="Listened and watched this week" />
          </>
        )}
        {tab === 'Days' && <DayRows days={days} actions={actions} />}
        {tab === 'Quests' && (
          <>
            <QuestComposer scope="weekly" onAdd={actions.onAddQuest} />
            <QuestBoard
              quests={questsIn(spec.quests, monday, addDays(monday, 7))}
              art={spec.art}
              today={today()}
              onToggle={actions.onQuestToggle}
              onProgress={actions.onQuestProgress}
              onChange={actions.onQuestChange}
            />
          </>
        )}
        {tab === 'Habits' && spec.features?.habits !== false && <Habits sum={sum} labels={days.map((entry) => formatDate(entry.date, 'dd'))} />}
        {tab === 'Stats' && <Stats sum={sum} spec={spec} labels={days.map((entry) => formatDate(entry.date, 'ddd'))} />}
      </div>
    </article>
  );
}

/** A monthly note as a page: its days and weeks added up. */
export function MonthPage({ spec, path, actions }: Props) {
  const first = startOfMonth(spec.date);
  const next = addMonths(first, 1);
  const days = useMemo(() => {
    const list: DayEntry[] = [];
    const end = addMonths(spec.date, 1);
    for (let date = startOfMonth(spec.date); date < end; date = addDays(date, 1)) list.push(spec.dayOf(date));
    return list;
  }, [spec]);
  const sum = useMemo(() => rollup(days), [days]);
  const [tab, setTab] = useState<MonthTab>(lastMonthTab);
  const choose = (tab: MonthTab) => {
    lastMonthTab = tab;
    setTab(tab);
  };
  const now = today();
  const current = sameDay(startOfMonth(now), first);
  const elapsed = current ? now.getDate() : now < first ? 0 : days.length;
  const done = sum.average('done');

  return (
    <article className="periodic" data-testid="periodic" data-period="month" data-path={path}>
      <Hero
        name={noteTitle(path)}
        kicker={`Month · ${days.length} days`}
        title={formatDate(first, 'MMMM YYYY')}
        aside={<DoneRing value={done} label="plan done, average" />}
        nav={
          <>
            <NavButton label="‹" title="The month before" onClick={() => actions.onOpenPeriod('month', addMonths(first, -1))} exists={spec.exists('month', addMonths(first, -1))} testId="nav-prev" />
            <NavButton label="›" title="The month after" onClick={() => actions.onOpenPeriod('month', next)} exists={spec.exists('month', next)} testId="nav-next" />
            {!current && <NavButton label="This month" title="This month's note" onClick={() => actions.onOpenPeriod('month', startOfMonth(now))} exists={spec.exists('month', startOfMonth(now))} testId="nav-today" />}
            <span className="nav-space" />
            <button type="button" className="nav-chip is-action" onClick={actions.onEdit} data-testid="edit-note">
              Edit note
            </button>
          </>
        }
      >
        <p className="hero-summary">
          {sum.noted} of {days.length} days written · {formatMinutes(sum.totals.logged)} logged
        </p>
        <div className="month-progress" title={`Day ${elapsed} of ${days.length}`}>
          <Bar share={elapsed / days.length} />
          <span className="faint">{current ? `day ${elapsed} of ${days.length}` : elapsed ? 'the whole month' : 'still to come'}</span>
        </div>
      </Hero>
      <Tabs tabs={MONTH_TABS.filter((item) => spec.features?.habits !== false || item !== 'Habits')} active={spec.features?.habits === false && tab === 'Habits' ? 'Overview' : tab} onChange={choose} />
      <div className="tab-panel" key={tab}>
        {(tab === 'Overview' || (tab === 'Habits' && spec.features?.habits === false)) && (
          <>
            <Totals sum={sum} spec={spec} span={days.length} />
            <Section title="The month, day by day" note="each day by how much of its plan was done" i={12}>
              <Heatmap first={first} days={days} actions={actions} />
            </Section>
            <Media days={days} spec={spec} actions={actions} title="Listened and watched this month" />
          </>
        )}
        {tab === 'Weeks' && <Weeks spec={spec} actions={actions} />}
        {tab === 'Quests' && (
          <>
            <QuestComposer scope="monthly" onAdd={actions.onAddQuest} />
            <QuestBoard
              quests={questsIn(spec.quests, first, next)}
              art={spec.art}
              today={now}
              onToggle={actions.onQuestToggle}
              onProgress={actions.onQuestProgress}
              onChange={actions.onQuestChange}
              groups={{ weekly: 'Weeks of the month', monthly: 'This month' }}
            />
          </>
        )}
        {tab === 'Days' && <DayRows days={days} actions={actions} />}
        {tab === 'Habits' && spec.features?.habits !== false && <Habits sum={sum} labels={days.map((entry) => String(entry.date.getDate()))} />}
        {tab === 'Stats' && <Stats sum={sum} spec={spec} labels={days.map((entry) => String(entry.date.getDate()))} />}
      </div>
    </article>
  );
}

function DoneRing({ value, label }: { value?: number; label: string }) {
  return (
    <Ring value={value ?? 0} max={100} size={132} width={9}>
      <span className="ring-number">{value === undefined ? '—' : <CountUp value={value} format={(n) => `${Math.round(n)}%`} />}</span>
      <span className="ring-label">{label}</span>
    </Ring>
  );
}

/** The period's totals as tiles, then each daily number's average with its line across the days. */
function Totals({ sum, spec, span }: { sum: Rollup; spec: PeriodicSpec; span: number }) {
  const { totals } = sum;
  const metrics = [
    ...METRICS.map(({ key, label, color }) => ({ key, label, color, max: spec.scales[key] ?? 5, unit: '' })),
    { key: 'sleep', label: 'Sleep', color: '#6fa5e6', max: 10, unit: 'h' },
  ];
  return (
    <>
      <div className="tiles is-three" data-testid="totals">
        <Tile label="XP" i={0} testId="tile-xp" meta={`${totals.claimed} claimed`}>
          <CountUp value={totals.xp} />
        </Tile>
        <Tile label="Productive" i={1} testId="tile-productive" meta={`${formatMinutes(totals.logged)} logged in all`}>
          <CountUp value={totals.main} format={formatMinutes} />
        </Tile>
        <Tile label="Recovery" i={2} meta="rest that counts">
          <CountUp value={totals.recovery} format={formatMinutes} />
        </Tile>
        <Tile label="Tasks" i={3} testId="tile-tasks" meta={<Bar share={totals.tasks ? totals.tasksDone / totals.tasks : 0} />}>
          <CountUp value={totals.tasksDone} />
          <span className="of"> / {totals.tasks}</span>
        </Tile>
        {spec.features?.habits !== false && <Tile label="Habits" i={4} meta={<Bar share={totals.habits ? totals.habitsDone / totals.habits : 0} />}>
          <CountUp value={totals.habitsDone} />
          <span className="of"> / {totals.habits}</span>
        </Tile>}
        <Tile label="Perfect days" i={5} meta="every task of the plan done">
          <CountUp value={sum.perfect} />
          <span className="of"> / {span}</span>
        </Tile>
      </div>
      <div className="tiles is-metrics" data-testid="averages">
        {metrics.map(({ key, label, color, max, unit }, i) => {
          const value = sum.average(key);
          return (
            <Tile key={key} label={label} i={6 + i} tone={color} className="metric-tile" meta={<Sparkline values={sum.series(key)} max={max} color={color} />}>
              {value === undefined ? <span className="faint">—</span> : <CountUp value={value} format={(n) => `${n.toFixed(1)}${unit}`} />}
              <span className="of"> avg</span>
            </Tile>
          );
        })}
      </div>
    </>
  );
}

/** One day of a week: its date, how much of its plan was done, its time and its numbers. Opens the day. */
function DayCard({ entry, i, spec, actions }: { entry: DayEntry; i: number; spec: PeriodicSpec; actions: PeriodicActions }) {
  const { day, date } = entry;
  const isToday = sameDay(date, today());
  return (
    <button
      type="button"
      className={`day-card glass rise${day ? '' : ' is-missing'}${isToday ? ' is-today' : ''}`}
      style={order(i)}
      onClick={() => actions.onOpenPeriod('day', date)}
      title={day ? formatDate(date, 'dddd, D MMMM') : `${formatDate(date, 'dddd, D MMMM')}: no note yet`}
      data-testid="day-card"
    >
      <span className="day-card-name">{formatDate(date, 'ddd')}</span>
      <span className="day-card-date">{date.getDate()}</span>
      <Ring value={day?.numbers.done ?? 0} max={100} size={44} width={4}>
        <span className="ring-small">{day?.numbers.done ?? '·'}</span>
      </Ring>
      <span className="day-card-time">{day ? formatMinutes(day.totals.logged) : 'no note'}</span>
      {day && (
        <span className="day-card-metrics">
          {METRICS.map(({ key, label, color }) => (
            <span key={key} title={`${label} ${day.numbers[key] ?? '—'} of ${spec.scales[key] ?? 5}`} style={{ '--tone': color } as CSSProperties} className={day.numbers[key] ? 'metric-chip' : 'metric-chip is-empty'}>
              {label[0]}
              {day.numbers[key] ?? ''}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

/** The weekly note's Plus, Minus and Next, three cards to write in, as the Obsidian weekly dashboard has them. */
function WeekReflections({ text, i, onSave }: { text: string; i: number; onSave: PeriodicActions['onSetSection'] }) {
  return (
    <Section title="The week, looking back" i={i} testId="reflections">
      <div className="reflections">
        {WEEK_HEADINGS.map((heading, n) => (
          <Reflection key={heading} heading={heading} value={readSection(text, heading)} n={n} onSave={onSave} />
        ))}
      </div>
    </Section>
  );
}

/** One of Plus, Minus and Next: what the note says, to rewrite and save. */
function Reflection({ heading, value, n, onSave }: { heading: WeekHeading; value: string; n: number; onSave: PeriodicActions['onSetSection'] }) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  const [state, setState] = useState<{ saving?: boolean; saved?: boolean; problem?: string }>({});
  // The note changed (this save, or another): show what it says now, unless something else is typed.
  if (value !== seen) {
    setSeen(value);
    if (sectionWords(draft) === sectionWords(seen) || sectionWords(draft) === sectionWords(value)) setDraft(value);
  }
  const changed = sectionWords(draft) !== sectionWords(value);
  const field = useRef<HTMLTextAreaElement>(null);
  // Tall enough to show all of it.
  useLayoutEffect(() => {
    const box = field.current;
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${box.scrollHeight}px`;
  }, [draft]);
  const save = () => {
    setState({ saving: true });
    void onSave(heading, draft).then((problem) => setState(problem ? { problem } : { saved: true }));
  };
  const kind = heading.toLowerCase();
  return (
    <div className={`card glass rise reflection is-${kind}`} style={order(n)} data-testid="reflection" data-heading={heading}>
      <div className="reflection-head">
        <p className="tile-label">{heading}</p>
        <span className={state.problem ? 'reflection-status is-problem' : 'reflection-status'} role="status">
          {state.problem ?? (state.saved ? 'Saved' : '')}
        </span>
      </div>
      <textarea
        ref={field}
        rows={2}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setState({});
        }}
        placeholder={`${heading}…`}
        aria-label={heading}
        data-testid="reflection-field"
      />
      <button type="button" className="primary-button reflection-save" disabled={!changed || Boolean(state.saving)} onClick={save} data-testid="reflection-save">
        Save
      </button>
    </div>
  );
}

/** Covers of what the days say was listened to or watched. */
function Media({ days, spec, actions, title }: { days: DayEntry[]; spec: PeriodicSpec; actions: PeriodicActions; title: string }) {
  const items = useMemo(() => {
    const byTitle = new Map<string, string>();
    for (const { title: name, kind } of days.flatMap((entry) => entry.day?.media ?? [])) if (!byTitle.has(name)) byTitle.set(name, kind);
    return [...byTitle].map(([name, kind]) => ({ title: name, kind, item: spec.media.get(name) }));
  }, [days, spec.media]);
  if (!items.length) return null;
  return (
    <Section title={title} note={`${items.length}`} i={14}>
      <Covers items={items} onOpen={actions.onOpenNote} />
    </Section>
  );
}

/** Every day as a row: time by category as one bar, and its numbers. */
function DayRows({ days, actions }: { days: DayEntry[]; actions: PeriodicActions }) {
  const most = Math.max(1, ...days.map((entry) => entry.day?.totals.logged ?? 0));
  return (
    <div className="day-rows" data-testid="day-rows">
      <div className="day-row is-head" aria-hidden="true">
        <span>Day</span>
        <span>Time by category</span>
        <span>Done</span>
        {METRICS.map(({ key, label }) => (
          <span key={key}>{label}</span>
        ))}
        <span>Sleep</span>
      </div>
      {days.map((entry, i) => {
        const { day } = entry;
        return (
          <button key={entry.date.getTime()} type="button" className={day ? 'day-row rise' : 'day-row rise is-missing'} style={order(Math.min(i, 20))} onClick={() => actions.onOpenPeriod('day', entry.date)} data-testid="day-row">
            <span className="day-row-date">{formatDate(entry.date, 'ddd D MMM')}</span>
            <span className="stack" title={day ? formatMinutes(day.totals.logged) : 'no note'}>
              {day?.byCategory.map(([meta, minutes]) => (
                <span key={meta.name} style={{ width: `${(minutes / most) * 100}%`, background: meta.color }} title={`${meta.name} ${formatMinutes(minutes)}`} />
              ))}
            </span>
            <span>{day?.numbers.done === undefined ? '—' : `${day.numbers.done}%`}</span>
            {METRICS.map(({ key, color }) => (
              <span key={key} style={{ color: day?.numbers[key] ? color : undefined }}>
                {day?.numbers[key] || '—'}
              </span>
            ))}
            <span>{day?.numbers.sleep ?? '—'}</span>
          </button>
        );
      })}
    </div>
  );
}

function Habits({ sum, labels }: { sum: Rollup; labels: string[] }) {
  if (!sum.habits.length) return <p className="empty-line">No habits in these days' notes.</p>;
  const allDone = sum.days.filter((entry) => entry.day?.habits.length && entry.day.habits.every((habit) => habit.done)).length;
  const met = sum.totals.habits ? Math.round((sum.totals.habitsDone / sum.totals.habits) * 100) : 0;
  return (
    <>
      <div className="tiles is-three">
        <Tile label="Met" i={0}>
          <CountUp value={met} format={(n) => `${Math.round(n)}%`} />
        </Tile>
        <Tile label="Every habit" i={1} meta="days with all of them ticked">
          <CountUp value={allDone} />
          <span className="of"> days</span>
        </Tile>
        <Tile label="Ticks" i={2}>
          <CountUp value={sum.totals.habitsDone} />
          <span className="of"> / {sum.totals.habits}</span>
        </Tile>
      </div>
      <Section title="Habit by habit" i={3}>
        <HabitGrid habits={sum.habits} labels={labels} colors={sum.habits.map((_, i) => habitColor(i))} />
      </Section>
    </>
  );
}

function Stats({ sum, spec, labels }: { sum: Rollup; spec: PeriodicSpec; labels: string[] }) {
  const scale = Math.max(...METRICS.map(({ key }) => spec.scales[key] ?? 5));
  const done = spread(sum.series('done'));
  return (
    <>
      <Section title="How the days felt" note={METRICS.map(({ label }) => label).join(' · ')}>
        <div className="card glass rise chart-card">
          <LineChart series={METRICS.map(({ key, label, color }) => ({ label, color, values: sum.series(key) }))} max={scale} labels={labels} />
          <ul className="chart-legend">
            {METRICS.map(({ key, label, color }) => (
              <li key={key}>
                <span className="chip-dot" style={{ background: color }} />
                {label} <span className="faint">{sum.average(key) ?? '—'}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>
      <Section title="Plan done" note={done ? `min ${done.min}% · median ${done.median}% · average ${done.mean}% · max ${done.max}%` : undefined} i={1}>
        <div className="card glass rise chart-card">
          <LineChart series={[{ label: 'Plan done', color: 'var(--accent)', values: sum.series('done') }]} max={100} labels={labels} height={150} />
        </div>
      </Section>
      <Section title="Where the time went" note={formatMinutes(sum.totals.logged)} i={2}>
        {sum.byCategory.length ? (
          <div className="time-card is-wide">
            <Donut
              parts={sum.byCategory.map(([meta, minutes]) => ({ color: meta.color, value: minutes, label: `${meta.name} ${formatMinutes(minutes)}` }))}
              center={
                <>
                  <span className="ring-number">{formatMinutes(sum.totals.logged)}</span>
                  <span className="ring-label">logged</span>
                </>
              }
            />
            <CategoryBars rows={sum.byCategory} />
          </div>
        ) : (
          <p className="empty-line">No minutes logged in these days.</p>
        )}
      </Section>
    </>
  );
}

/** The month as a calendar, Monday first, each day lit by how much of its plan was done. */
function Heatmap({ first, days, actions }: { first: Date; days: DayEntry[]; actions: PeriodicActions }) {
  const byDate = new Map(days.map((entry) => [entry.date.getTime(), entry]));
  const now = today();
  return (
    <div className="heatmap" data-testid="heatmap">
      {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((name) => (
        <span key={name} className="heatmap-head">
          {name}
        </span>
      ))}
      {monthGrid(first)
        .flat()
        .map((date, i) => {
          const entry = byDate.get(date.getTime());
          if (!entry) return <span key={date.getTime()} className="heatmap-cell is-outside" />;
          const done = entry.day?.numbers.done;
          return (
            <button
              key={date.getTime()}
              type="button"
              className={`heatmap-cell rise${entry.day ? '' : ' is-missing'}${sameDay(date, now) ? ' is-today' : ''}`}
              style={{ ...order(i), '--heat': done === undefined ? 0 : Math.max(0.12, done / 100) } as CSSProperties}
              onClick={() => actions.onOpenPeriod('day', date)}
              title={`${formatDate(date, 'dddd, D MMMM')}: ${entry.day ? `${done ?? '—'}% done, ${formatMinutes(entry.day.totals.logged)} logged` : 'no note'}`}
              data-testid="heatmap-day"
            >
              <span>{date.getDate()}</span>
              {entry.day && <span className="heatmap-time">{formatMinutes(entry.day.totals.logged)}</span>}
            </button>
          );
        })}
    </div>
  );
}

/** The month's weeks: each one's totals and its note's Plus, Minus and Next. */
function Weeks({ spec, actions }: { spec: PeriodicSpec; actions: PeriodicActions }) {
  const weeks = useMemo(() => {
    const first = startOfMonth(spec.date);
    const next = addMonths(first, 1);
    const list = [];
    for (let monday = startOfWeek(first); monday < next; monday = addDays(monday, 7)) {
      const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
        .filter((date) => date >= first && date < next)
        .map((date) => spec.dayOf(date));
      const note = spec.weekOf(monday);
      list.push({ monday, sum: rollup(days), note, found: note.text === undefined ? undefined : reflections(note.text) });
    }
    return list;
  }, [spec]);
  return (
    <div className="week-cards">
      {weeks.map(({ monday, sum, note, found }, i) => {
        const done = sum.average('done');
        return (
          <div key={monday.getTime()} className={note.path ? 'week-card glass rise' : 'week-card glass rise is-missing'} style={order(i)} data-testid="week-card">
            <div className="week-card-head">
              <Ring value={done ?? 0} max={100} size={52} width={4}>
                <span className="ring-small">{done === undefined ? '·' : Math.round(done)}</span>
              </Ring>
              <div className="week-card-name">
                <p className="week-card-title">Week {isoWeek(monday).week}</p>
                <p className="faint">
                  {formatDate(monday, 'D MMM')} – {formatDate(addDays(monday, 6), 'D MMM')}
                </p>
              </div>
              <button type="button" className={note.path ? 'nav-chip' : 'nav-chip is-missing'} onClick={() => actions.onOpenPeriod('week', monday)} data-testid="week-open">
                {note.path ? 'Open' : 'Create'}
              </button>
            </div>
            <p className="week-card-line">
              {sum.noted} days · {formatMinutes(sum.totals.logged)} · {sum.totals.tasksDone}/{sum.totals.tasks} tasks · mood {sum.average('mood') ?? '—'}
            </p>
            {found && (found.plus.length > 0 || found.minus.length > 0 || found.next.length > 0) && (
              <ul className="week-card-reflections">
                {found.plus.map((item, k) => (
                  <li key={`p${k}`} className="is-plus">
                    {item}
                  </li>
                ))}
                {found.minus.map((item, k) => (
                  <li key={`m${k}`} className="is-minus">
                    {item}
                  </li>
                ))}
                {found.next.map((item, k) => (
                  <li key={`n${k}`} className="is-next">
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
