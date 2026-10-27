import { useMemo, type PointerEvent, type ReactNode } from 'react';
import { formatMinutes } from '../../lib/day';
import { lifeXp, progress, rankOf, sphereXp, streak } from '../../lib/home';
import type { Shelf } from '../../lib/media';
import type { Period } from '../../lib/periodic';
import type { DayEntry } from '../../lib/rollup';
import { followPointer, order } from '../periodic/effects';
import { BlurText, CountUp } from '../periodic/motion';
import { Bar } from '../periodic/parts';
import { Memento } from './Memento';
import { Shelves } from './Shelves';
import { LeadSphere, Spheres } from './Spheres';
import { Averages, Focus, Today } from './Week';
import '../periodic/periodic.css';
import './home.css';

export interface HomeProps {
  vaultName: string;
  stats: { notes: number; folders: number; images: number };
  /** Today, as the app's clock reads it; everything below counts from it. */
  today: Date;
  /** Today's daily note: its name, and its path when it exists. */
  todayNote: { name: string; path?: string };
  /** Every daily note in the vault, with what it holds. */
  days: DayEntry[];
  /** The day behind a date: its note, if it has one. */
  dayOf: (date: Date) => DayEntry;
  exists: (period: Period, date: Date) => boolean;
  /** What each daily number is out of (5, 10 or 100), read from every day that logged it. */
  scales: Record<string, number>;
  shelves: Shelf[];
  /** From the app's settings; the vault doesn't hold it. */
  birthDate?: Date;
  onOpenNote: (path: string) => void;
  /** Opens the note of that day, week or month, or creates it from its template. */
  onOpenPeriod: (period: Period, date: Date) => void;
}

const thousands = (n: number) => Math.round(n).toLocaleString('en-US');

/**
 * The vault at a glance, shaped like the Obsidian homepage ("Kaizen cockpit"): the character's
 * level, how much time is left, the last seven days, the life spheres, and the rated shelves.
 * Everything is worked out from the daily notes; nothing here writes to the vault.
 */
export function Home(props: HomeProps) {
  const { days, today, dayOf } = props;
  const xp = useMemo(() => lifeXp(days), [days]);
  const run = useMemo(() => streak(days, today), [days, today]);
  const spheres = useMemo(() => sphereXp(days), [days]);
  const todayEntry = dayOf(today);
  return (
    <div className="periodic-frame home-frame" data-testid="home" onPointerMove={(event: PointerEvent<HTMLDivElement>) => followPointer(event)}>
      <Hero {...props} xp={xp} streak={run} todayEntry={todayEntry} />
      <Memento today={today} birth={props.birthDate} i={1} />
      <div className="home-row">
        <Averages dayOf={dayOf} today={today} scales={props.scales} i={2} />
        <Focus dayOf={dayOf} today={today} onOpenNote={props.onOpenNote} i={3} />
        <Today entry={todayEntry} today={today} todayNote={props.todayNote} exists={props.exists} onOpenPeriod={props.onOpenPeriod} i={4} />
      </div>
      <div className="home-row is-spheres">
        <Spheres spheres={spheres} i={5} />
        <LeadSphere spheres={spheres} dayOf={dayOf} today={today} i={6} />
      </div>
      <Shelves shelves={props.shelves} today={today} onOpen={props.onOpenNote} i={7} />
    </div>
  );
}

function Hero({ vaultName, stats, days, xp, streak: run, todayEntry }: HomeProps & { xp: number; streak: { current: number; best: number }; todayEntry: DayEntry }) {
  const level = progress(xp);
  const totals = todayEntry.day?.totals;
  return (
    <header className="hero glass home-hero rise" style={order(0)} data-testid="home-hero">
      <div className="hero-aurora" aria-hidden="true" />
      <div className="hero-main">
        <p className="kicker" data-testid="rank">
          {rankOf(level.level)} · Kaizen profile
        </p>
        <h1 className="hero-title" data-testid="hero-title">
          Level {level.level}
        </h1>
        <BlurText text="The character being upgraded: every logged minute feeds the build, and the sphere of life it went to." className="hero-summary" />
      </div>
      <dl className="hero-stats" data-testid="hero-stats">
        <Stat label="Level" meta={<LevelMeta share={level.share} left={level.left} next={level.level + 1} />}>
          <CountUp value={level.level} />
        </Stat>
        <Stat label="Streak" meta={`best ${run.best}d`}>
          <CountUp value={run.current} format={(n) => `${Math.round(n)}d`} />
        </Stat>
        <Stat label="Life XP" meta={`from ${days.filter((entry) => entry.day).length} daily notes`} accent>
          <CountUp value={xp} format={thousands} />
        </Stat>
        <Stat label="Today" meta={totals ? `tasks done · ${formatMinutes(totals.logged)} logged` : 'no note yet'}>
          {totals ? (
            <>
              <CountUp value={totals.tasksDone} />
              <span className="of">/{totals.tasks}</span>
            </>
          ) : (
            <span className="faint">—</span>
          )}
        </Stat>
      </dl>
      <p className="hero-nav home-vault">
        <span data-testid="vault-name">{vaultName}</span>
        <span>
          {stats.notes} notes · {stats.folders} folders · {stats.images} images
        </span>
      </p>
    </header>
  );
}

function Stat({ label, meta, accent, children }: { label: string; meta: ReactNode; accent?: boolean; children: ReactNode }) {
  return (
    <div className="hero-stat">
      <dt className="tile-label">{label}</dt>
      <dd className={accent ? 'hero-stat-value is-accent' : 'hero-stat-value'}>{children}</dd>
      <dd className="hero-stat-meta">{meta}</dd>
    </div>
  );
}

function LevelMeta({ share, left, next }: { share: number; left: number; next: number }) {
  return (
    <span className="level-meta" title={`${thousands(left)} XP to level ${next}`}>
      <Bar share={share} />
      <span>
        {Math.floor(share * 100)}% · {thousands(left)} to Lv {next}
      </span>
    </span>
  );
}
