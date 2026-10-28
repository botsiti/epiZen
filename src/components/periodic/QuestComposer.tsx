import { useState, type CSSProperties } from 'react';
import { SPHERES } from '../../lib/categories';
import { questLine, sphereXp, stepWeight, tierOf, TIERS, toggleSphere, type NewQuest, type Tier } from '../../lib/quests';

// "+ New quest", after the vault's weekly and monthly dashboards (rpg-week.js renderQuestComposer,
// rpg-month.js renderMonthQuestComposer, and the picker parts in rpg-shared.js): what counts as
// done, the life spheres (the first pick is the main one, each further pick earns a bonus share on
// top), a tier that sets the XP, the XP itself, and a target for a quest that counts.

const TIER_ORDER: Tier[] = ['common', 'rare', 'epic', 'legendary'];

interface Props {
  scope: 'weekly' | 'monthly';
  /** Settles with why the quest wasn't added, if it wasn't. */
  onAdd: (line: string) => Promise<string | undefined>;
}

export function QuestComposer({ scope, onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [spheres, setSpheres] = useState<NewQuest['spheres']>([]);
  const [tier, setTier] = useState<Tier>('rare');
  // The dashboards start a week's quest at 300 XP and a month's at 500.
  const [xp, setXp] = useState(scope === 'weekly' ? '300' : '500');
  const [target, setTarget] = useState('0');
  const [status, setStatus] = useState<{ text: string; problem?: boolean }>();
  const [busy, setBusy] = useState(false);
  const points = Math.max(0, Math.round(Number(xp) || 0));

  const add = () => {
    if (busy) return;
    if (!title.trim()) return setStatus({ text: 'Add a title', problem: true });
    if (!spheres.length) return setStatus({ text: 'Pick a life sphere', problem: true });
    let line: string;
    try {
      line = questLine({ scope, title, xp: points, tier, spheres, target: Number(target) || 0 });
    } catch (err) {
      return setStatus({ text: err instanceof Error ? err.message : String(err), problem: true });
    }
    setBusy(true);
    setStatus(undefined);
    void onAdd(line).then((why) => {
      setBusy(false);
      if (why) return setStatus({ text: why, problem: true });
      setTitle('');
      setStatus({ text: 'Saved' });
    });
  };

  if (!open) {
    return (
      <div className="quest-tools">
        <button type="button" className="nav-chip is-action" onClick={() => setOpen(true)} data-testid="quest-new">
          + New quest
        </button>
      </div>
    );
  }
  const bonus = spheres.slice(1).reduce((sum, { weight }) => sum + sphereXp(points, weight), 0);
  return (
    <form
      className="quest-composer glass rise"
      onSubmit={(event) => {
        event.preventDefault();
        add();
      }}
      data-testid="quest-composer"
    >
      <div className="quest-composer-head">
        <p className="kicker">{scope === 'weekly' ? 'A new quest for the week' : 'A new quest for the month'}</p>
        <button type="button" className="wizard-round is-small" onClick={() => setOpen(false)} aria-label="Close" title="Close">
          ×
        </button>
      </div>
      <label className="quest-field">
        <span className="tile-label">Quest</span>
        <input
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={scope === 'weekly' ? 'Quest title, what counts as done' : 'Monthly quest title, what counts as done'}
          aria-label="Quest title"
          data-testid="quest-title"
        />
      </label>

      <div className="quest-field">
        <span className="quest-field-head">
          <span className="tile-label">Life spheres</span>
          <span className="faint">First pick is the main sphere · add more for bonus XP</span>
        </span>
        <div className="quest-spheres" role="group" aria-label="Life spheres">
          {SPHERES.map(({ name, color }) => {
            const at = spheres.findIndex((sphere) => sphere.name === name);
            return (
              <button
                key={name}
                type="button"
                aria-pressed={at >= 0}
                className={at === 0 ? 'chip is-main' : at > 0 ? 'chip is-bonus' : 'chip'}
                style={{ '--tone': color } as CSSProperties}
                onClick={() => setSpheres(toggleSphere(spheres, name))}
                data-testid="quest-sphere"
                data-sphere={name}
              >
                {name}
                {at === 0 && <span className="quest-sphere-tag">main</span>}
                {at > 0 && <span className="quest-sphere-tag">+{spheres[at]?.weight}%</span>}
              </button>
            );
          })}
        </div>
        {spheres.length > 1 && (
          <ul className="quest-split">
            {spheres.slice(1).map(({ name, weight }) => (
              <li key={name} style={{ '--tone': SPHERES.find((sphere) => sphere.name === name)?.color } as CSSProperties}>
                <span className="chip-dot" style={{ background: 'var(--tone)' }} />
                <span className="quest-split-name">{name}</span>
                <span className="quest-stepper">
                  <button type="button" className="step-button" onClick={() => setSpheres(spheres.map((s) => (s.name === name ? { name, weight: stepWeight(weight, -1) } : s)))} aria-label={`Less for ${name}`} data-testid="quest-weight-down">
                    −
                  </button>
                  <span className="quest-weight">{weight}%</span>
                  <button type="button" className="step-button" onClick={() => setSpheres(spheres.map((s) => (s.name === name ? { name, weight: stepWeight(weight, 1) } : s)))} aria-label={`More for ${name}`} data-testid="quest-weight-up">
                    +
                  </button>
                </span>
                <span className="quest-split-xp">+{sphereXp(points, weight)} XP</span>
              </li>
            ))}
          </ul>
        )}
        {spheres[0] && (
          <p className="quest-total faint" data-testid="quest-total">
            {spheres[0].name} {points}
            {bonus > 0 && ` · bonus +${bonus}`} · {points + bonus} XP in all once done
          </p>
        )}
      </div>

      <div className="quest-composer-row">
        <div className="quest-field is-grow">
          <span className="tile-label">Tier (quick XP)</span>
          <div className="quest-tiers" role="radiogroup" aria-label="Quest tier">
            {TIER_ORDER.map((key) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={tier === key}
                className={tier === key ? 'quest-tier-chip is-on' : 'quest-tier-chip'}
                style={{ '--tier': TIERS[key].color } as CSSProperties}
                onClick={() => {
                  setTier(key);
                  setXp(String(TIERS[key].xp));
                }}
                data-testid="quest-tier"
                data-tier={key}
              >
                <span aria-hidden="true">{TIERS[key].glyph}</span> {key}
                <span className="quest-tier-xp">{TIERS[key].xp}</span>
              </button>
            ))}
          </div>
        </div>
        <label className="quest-field is-number">
          <span className="tile-label">XP</span>
          <input
            type="number"
            min={0}
            step={50}
            value={xp}
            onChange={(event) => {
              setXp(event.target.value);
              // Typed XP lights the tier it falls in, as on the dashboards.
              if (Number(event.target.value) > 0) setTier(tierOf(Number(event.target.value)));
            }}
            aria-label="Quest XP"
            data-testid="quest-xp"
          />
        </label>
        <label className="quest-field is-number">
          <span className="quest-field-head">
            <span className="tile-label">Target</span>
            <span className="faint">0 = binary</span>
          </span>
          <input type="number" min={0} step={1} value={target} onChange={(event) => setTarget(event.target.value)} aria-label="Target, 0 for a done or not done quest" data-testid="quest-target" />
        </label>
      </div>

      <div className="quest-composer-foot">
        <span className={status?.problem ? 'quest-status is-problem' : 'quest-status'} role="status" data-testid="quest-status">
          {status?.text}
        </span>
        <button type="submit" className="primary-button" disabled={busy} data-testid="quest-add">
          Add quest
        </button>
      </div>
    </form>
  );
}
