import { useMemo, type CSSProperties } from 'react';
import { SPHERES } from '../../lib/categories';
import { categoryMinutes, leadSphere, SPORT_FLOOR, weekDays, type SphereState } from '../../lib/home';
import type { DayEntry } from '../../lib/rollup';
import { order } from '../periodic/effects';
import { CountUp } from '../periodic/motion';
import { Bar } from '../periodic/parts';

const thousands = (n: number) => Math.round(n).toLocaleString('en-US');
const percent = (share: number) => `${Math.floor(share * 100)}%`;

/** XP per life sphere, each a level on the character's curve, drawn one segment a level. */
export function Spheres({ spheres, i, onEdit }: { spheres: SphereState[]; i: number; onEdit?: () => void }) {
  const active = spheres.filter((sphere) => !sphere.archived);
  const archived = spheres.filter((sphere) => sphere.archived);
  const total = active.reduce((sum, sphere) => sum + sphere.xp, 0);
  // Room for the highest level and the one it is working toward, in steps of five, ten at least.
  const scale = Math.max(10, Math.ceil((Math.max(1, ...active.map((sphere) => sphere.level)) + 1) / 5) * 5);
  return (
    <section className="card glass rise" style={order(i)} data-testid="spheres">
      <div className="card-head">
        <p className="tile-label">Life spheres</p>
        <span className="card-note">
          {active.length} spheres · {thousands(total)} XP
          {onEdit && <button type="button" className="sphere-edit-link" aria-label="Edit life spheres" onClick={onEdit}>Edit</button>}
        </span>
      </div>
      <p className="spheres-key">Levels 1–{scale}, a segment each</p>
      <ul className="spheres">
        {active.map((sphere, n) => (
          <li key={sphere.name} className="rise" style={{ ...order(n), '--tone': sphere.color } as CSSProperties} data-sphere={sphere.name}>
            <span className="chip-dot" />
            <span className="sphere-main">
              <span className="sphere-head">
                <span className="sphere-name">{sphere.name}</span>
                <span className="sphere-level">Lv {sphere.level}</span>
              </span>
              <LevelSegments level={sphere.level} share={sphere.share} scale={scale} label={sphere.name} />
              <span className="sphere-next">
                {percent(sphere.share)} to Lv {sphere.level + 1} · {thousands(sphere.left)} XP left
              </span>
            </span>
            <span className="sphere-xp">
              {thousands(sphere.xp)} <span className="faint">XP</span>
            </span>
          </li>
        ))}
      </ul>
      {archived.length > 0 && <details className="sphere-history"><summary>Archived spheres ({archived.length})</summary>
        <ul>{archived.map((sphere) => <li key={sphere.name}><span>{sphere.name}</span><span>{thousands(sphere.xp)} XP</span></li>)}</ul></details>}
    </section>
  );
}

/** A segment per level: the levels reached full, the one under way filled as far as it has come. */
function LevelSegments({ level, share, scale, label }: { level: number; share: number; scale: number; label: string }) {
  return (
    <span className="level-segments" role="img" aria-label={`${label}: level ${level}, ${percent(share)} toward level ${level + 1}`} style={{ '--levels': scale } as CSSProperties}>
      {Array.from({ length: scale }, (_, n) => (
        <span key={n} className="level-segment">
          <span className={n < level ? 'is-reached' : undefined} style={{ width: `${n < level ? 100 : n === level ? share * 100 : 0}%`, '--i': n } as CSSProperties} />
        </span>
      ))}
    </span>
  );
}

const HEALTH = SPHERES.find((sphere) => sphere.name === 'Health/Fitness')?.color ?? 'var(--accent)';

/** The sphere with the most XP, how far it is to its next level, and this week's sport against its floor. */
export function LeadSphere({ spheres, dayOf, today, i }: { spheres: SphereState[]; dayOf: (date: Date) => DayEntry; today: Date; i: number }) {
  const lead = leadSphere(spheres);
  const sport = useMemo(() => categoryMinutes(weekDays(dayOf, today), 'sport'), [dayOf, today]);
  return (
    <section className="card glass rise lead-sphere" style={{ ...order(i), '--tone': lead?.color ?? 'var(--accent)' } as CSSProperties} data-testid="lead-sphere">
      <div className="card-head">
        <p className="tile-label lead-label">Lead sphere</p>
        {lead && <span className="card-note">{percent(lead.share)}</span>}
      </div>
      {lead ? (
        <>
          <p className="lead-level">
            Lv <CountUp value={lead.level} />
          </p>
          <p className="lead-name">{lead.name}</p>
          <Bar share={lead.share} color={lead.color} />
          <div className="lead-stats">
            <div>
              <p className="tile-label">Sphere XP</p>
              <p className="lead-number" style={{ color: lead.color }}>
                <CountUp value={lead.xp} format={thousands} />
              </p>
            </div>
            <div>
              <p className="tile-label">To next</p>
              <p className="lead-number">
                <CountUp value={lead.left} format={thousands} />
              </p>
            </div>
          </div>
        </>
      ) : (
        <p className="lead-empty">No XP yet. Minutes logged on a daily task, like “[minutes::30]”, grow the sphere it belongs to.</p>
      )}
      <div className="sport-floor" style={{ '--tone': HEALTH } as CSSProperties} data-testid="sport-floor">
        <span>
          <span className="tile-label">Sport floor</span>
          <span className="sport-floor-note">this week, Monday to Sunday</span>
        </span>
        <span className="sport-floor-number">
          {sport} <span className="faint">/ {SPORT_FLOOR} min</span>
        </span>
        <Bar share={sport / SPORT_FLOOR} color={HEALTH} />
      </div>
    </section>
  );
}
