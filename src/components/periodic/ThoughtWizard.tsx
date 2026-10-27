import { useEffect, useState, type CSSProperties } from 'react';
import { DISTORTIONS, EMOTIONS, emotionOf, type RecordInput, type ThoughtRecord } from '../../lib/cbt';

// A thought record, five steps at a time, as the vault's Obsidian wizard walks it (rpg-day.js):
// the moment, how it felt, the thinking traps, a fairer view, and how it feels now.

const STEPS = [
  {
    title: "What's on your mind?",
    subtitle: 'Name the moment and the thought that came with it, just as it sounded in your head.',
  },
  { title: 'How did that feel?', subtitle: 'Name the emotions underneath the thought.' },
  { title: 'Does the thought bend the truth?', subtitle: 'These are common thinking traps. Tap Example on any, and check the ones that fit (optional).' },
  { title: 'A fairer way to see it', subtitle: 'Not forced positivity, just kinder and more balanced.' },
  { title: 'And now?', subtitle: 'After looking at it clearly, where do you land?' },
] as const;

const EMPTY: RecordInput = { situation: '', before: [], distortions: [], balanced: '', after: [] };

interface Props {
  /** The record to edit, or none for a new one. */
  record?: ThoughtRecord;
  onSave: (input: RecordInput) => void;
  onClose: () => void;
}

export function ThoughtWizard({ record, onSave, onClose }: Props) {
  const [step, setStep] = useState(0);
  const [input, setInput] = useState<RecordInput>(() =>
    record ? { situation: record.situation, before: record.before, distortions: record.distortions, balanced: record.balanced, after: record.after } : EMPTY,
  );
  const [leaving, setLeaving] = useState(false);
  const touched = JSON.stringify(input) !== JSON.stringify(record ? { situation: record.situation, before: record.before, distortions: record.distortions, balanced: record.balanced, after: record.after } : EMPTY);
  const close = () => (touched && !leaving ? setLeaving(true) : onClose());

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (touched) setLeaving(true);
        else onClose();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [touched, onClose]);

  const ready = [input.situation.trim() !== '', input.before.length > 0, true, input.balanced.trim() !== '', input.after.length > 0, true][step] ?? true;
  const set = (patch: Partial<RecordInput>) => setInput((prev) => ({ ...prev, ...patch }));
  const done = step === STEPS.length;

  return (
    <div className="wizard-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()} data-testid="thought-wizard">
      <div className="wizard" role="dialog" aria-modal="true" aria-label="Thought record">
        <div className="wizard-top">
          <button type="button" className="wizard-round" onClick={() => (step ? setStep(step - 1) : close())} aria-label="Back" title="Back">
            ←
          </button>
          <span className="wizard-progress" aria-hidden="true">
            <span style={{ width: `${(Math.min(step, STEPS.length) / STEPS.length) * 100}%` }} />
          </span>
          <button type="button" className="wizard-round is-small" onClick={close} aria-label="Close" title="Close (Esc)">
            ×
          </button>
        </div>

        <div className="wizard-body" key={step}>
          {done ? (
            <Summary input={input} />
          ) : (
            <>
              <header className="wizard-head">
                <p className="kicker">Thought record · {['The moment', 'Feelings', 'Thinking traps', 'A fairer view', 'Checking in'][step]}</p>
                <h2>{STEPS[step]?.title}</h2>
                <p>{STEPS[step]?.subtitle}</p>
              </header>
              {step === 0 && (
                <>
                  <textarea
                    autoFocus
                    value={input.situation}
                    onChange={(event) => set({ situation: event.target.value })}
                    placeholder="e.g. Reviewed the day and thought “I barely moved the needle, I'm falling behind.”"
                    data-testid="wizard-situation"
                  />
                  <p className="wizard-hint">Write the raw thought, not a tidied version. You'll get to reframe it in a minute.</p>
                </>
              )}
              {step === 1 && <Feelings picked={input.before} start="Sad" label="You're feeling" onChange={(before) => set({ before })} />}
              {step === 2 && <Traps picked={input.distortions} onChange={(distortions) => set({ distortions })} />}
              {step === 3 && (
                <>
                  {input.situation.trim() && <blockquote className="wizard-quote">“{input.situation.trim()}”</blockquote>}
                  <textarea
                    autoFocus
                    value={input.balanced}
                    onChange={(event) => set({ balanced: event.target.value })}
                    placeholder="If a good friend had this thought, what would you gently say to them?"
                    data-testid="wizard-balanced"
                  />
                  <p className="wizard-hint">A balanced thought isn't forced positivity. It's just fairer and kinder than the first one.</p>
                </>
              )}
              {step === 4 && <Feelings picked={input.after} start="Peaceful" label="You're feeling now" onChange={(after) => set({ after })} />}
            </>
          )}
        </div>

        <footer className="wizard-foot">
          <span className="wizard-step">{done ? 'Complete' : `Step ${step + 1} of ${STEPS.length}`}</span>
          <button
            type="button"
            className="wizard-continue"
            disabled={!ready}
            onClick={() => (done ? onSave(input) : setStep(step + 1))}
            data-testid="wizard-continue"
          >
            {done ? (record ? 'Save changes' : 'Save to my diary') : 'Continue'}
          </button>
        </footer>

        {leaving && (
          <div className="wizard-leave" role="alertdialog" aria-label="Discard this entry?">
            <p>Discard this entry?</p>
            <span className="faint">Your changes haven't been saved.</span>
            <div>
              <button type="button" className="nav-chip" onClick={() => setLeaving(false)}>
                Keep writing
              </button>
              <button type="button" className="nav-chip is-action" onClick={onClose} data-testid="wizard-discard">
                Discard entry
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** The emotion wheel: six cores around a ring; the open one's shades below; the picked shades as tags. */
function Feelings({ picked, start, label, onChange }: { picked: string[]; start: string; label: string; onChange: (picked: string[]) => void }) {
  const [open, setOpen] = useState(() => emotionOf(picked[0] ?? '')?.name ?? start);
  const core = EMOTIONS.find((emotion) => emotion.name === open) ?? EMOTIONS[0];
  const toggle = (shade: string) => onChange(picked.includes(shade) ? picked.filter((s) => s !== shade) : [...picked, shade]);
  return (
    <div className="feelings">
      <div className="wheel" style={{ '--ring': `conic-gradient(from -30deg, ${EMOTIONS.map((e, i) => `${e.color} ${i * 60}deg ${(i + 1) * 60}deg`).join(', ')})` } as CSSProperties}>
        <span className="wheel-ring" aria-hidden="true" />
        <span className="wheel-center" aria-hidden="true">
          {open}
        </span>
        {EMOTIONS.map((emotion, i) => {
          const angle = (i * 60 * Math.PI) / 180;
          const used = picked.some((shade) => emotionOf(shade)?.name === emotion.name);
          return (
            <button
              key={emotion.name}
              type="button"
              className={`wheel-core${emotion.name === open ? ' is-open' : ''}${used ? ' is-used' : ''}`}
              style={{ '--tone': emotion.color, left: `calc(50% + ${Math.sin(angle) * 108}px)`, top: `calc(50% - ${Math.cos(angle) * 108}px)` } as CSSProperties}
              onClick={() => setOpen(emotion.name)}
              aria-pressed={emotion.name === open}
              data-testid="wheel-core"
              data-emotion={emotion.name}
            >
              {emotion.name}
            </button>
          );
        })}
      </div>
      <p className="shades-label">
        More shades of <strong>{core?.name}</strong>
      </p>
      <div className="shades">
        {core?.shades.map((shade) => (
          <button
            key={shade}
            type="button"
            className={picked.includes(shade) ? 'shade is-picked' : 'shade'}
            style={{ '--tone': core.color } as CSSProperties}
            onClick={() => toggle(shade)}
            aria-pressed={picked.includes(shade)}
            data-testid="shade"
            data-shade={shade}
          >
            {shade}
          </button>
        ))}
      </div>
      <p className="kicker picked-label">{label}</p>
      {picked.length ? (
        <div className="picked">
          {picked.map((shade) => (
            <span key={shade} className="picked-tag" style={{ '--tone': emotionOf(shade)?.color ?? '#7c8a86' } as CSSProperties}>
              {shade}
              <button type="button" onClick={() => toggle(shade)} aria-label={`Remove ${shade}`}>
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="faint picked-empty">Tap the wheel, then pick the shades that fit.</p>
      )}
    </div>
  );
}

/** The ten thinking traps, each with an example thought and a reframe. */
function Traps({ picked, onChange }: { picked: string[]; onChange: (picked: string[]) => void }) {
  const [shown, setShown] = useState<string>();
  return (
    <div className="traps">
      {DISTORTIONS.map((trap) => {
        const on = picked.includes(trap.name);
        return (
          <div key={trap.name} className={on ? 'trap is-on' : 'trap'}>
            <div className="trap-top">
              <button
                type="button"
                className="trap-check"
                role="checkbox"
                aria-checked={on}
                aria-label={trap.name}
                onClick={() => {
                  onChange(on ? picked.filter((name) => name !== trap.name) : [...picked, trap.name]);
                  if (!on) setShown(trap.name);
                }}
                data-testid="trap"
                data-trap={trap.name}
              />
              <div className="trap-text">
                <strong>{trap.name}</strong>
                <span>{trap.description}</span>
              </div>
              <button type="button" className="trap-example" onClick={() => setShown(shown === trap.name ? undefined : trap.name)}>
                Example
              </button>
            </div>
            {shown === trap.name && (
              <div className="trap-open">
                <p className="trap-quote">“{trap.example}”</p>
                <p className="trap-reframe">{trap.reframe}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Summary({ input }: { input: RecordInput }) {
  return (
    <div className="wizard-done">
      <span className="done-mark" aria-hidden="true">
        ✓
      </span>
      <h2>Nicely done.</h2>
      <p>You stayed with something hard and looked at it clearly.</p>
      <div className="done-card">
        <p className="kicker">How you felt → now</p>
        <div className="done-feelings">
          <Tags names={input.before} />
          <span className="done-arrow">→</span>
          <Tags names={input.after} />
        </div>
        {input.balanced.trim() && <p className="done-balanced">{input.balanced.trim()}</p>}
      </div>
    </div>
  );
}

/** Feelings as chips in their core emotion's colour. */
export function Tags({ names }: { names: string[] }) {
  if (!names.length) return <span className="faint">–</span>;
  return (
    <span className="feeling-tags">
      {names.map((name) => (
        <span key={name} className="feeling-tag" style={{ '--tone': emotionOf(name)?.color ?? '#7c8a86' } as CSSProperties}>
          {name}
        </span>
      ))}
    </span>
  );
}
