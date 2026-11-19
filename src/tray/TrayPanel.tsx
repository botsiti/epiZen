import { useState, type CSSProperties, type FormEvent } from 'react';
import { category } from '../lib/categories';
import { formatMinutes } from '../lib/day';
import { CUSTOM_MINUTES, POMODORO_PRESETS } from '../lib/timer';
import { customMinutes, panelNow, startCommand, TIMELINE_MARKS, type PanelNow, type PanelTask, type PanelView, type RoundHow, type TrayCommand, type TrayDestination } from '../lib/tray';
import { FocusSound } from './FocusSound';

interface Props {
  /** What the main window last published; nothing before it has. */
  view?: PanelView;
  now: number;
  send: (command: TrayCommand) => void;
  onOpen: (destination?: TrayDestination) => void;
  problem?: string;
  onQuit: () => void;
}

const toneOf = (name?: string) => (name ? category(name).color : 'var(--accent)');

/** The day’s focus, tasks, and shortcuts under the macOS status item. */
export function TrayPanel({ view, now, send, onOpen, onQuit, problem }: Props) {
  const shown = view && panelNow(view, now);
  const [sounds, setSounds] = useState(false);
  return (
    <div className="tray" data-testid="tray">
      {shown && <Head shown={shown} />}
      <nav className="tray-nav" aria-label="Menu bar shortcuts">
        <button type="button" className="tray-button" disabled={!view?.navigation?.dailyNote} onClick={() => onOpen('daily-note')} data-testid="tray-open-daily">
          <TrayGlyph name="note" /> Daily note
        </button>
        <button type="button" className="tray-button" disabled={!view?.navigation?.calendar} onClick={() => onOpen('calendar')} data-testid="tray-open-calendar">
          <TrayGlyph name="calendar" /> Calendar
        </button>
        <button type="button" className="tray-button" aria-expanded={sounds} aria-controls="tray-sounds" onClick={() => setSounds(!sounds)}>
          <TrayGlyph name="sound" /> Sound
        </button>
      </nav>
      <FocusSound expanded={sounds} />
      {(problem || view?.warning) && <p className="tray-warning" role="status">{problem ?? view?.warning}</p>}
      {shown && view ? (
        <div className="tray-scroll">
          <Now view={view} shown={shown} send={send} />
          <Tasks view={view} send={send} />
        </div>
      ) : (
        <p className="tray-empty">Epizen is opening…</p>
      )}
      <footer className="tray-foot">
        <button type="button" className="tray-button tray-reveal" onClick={() => onOpen()} data-testid="tray-open">
          Open Epizen <TrayGlyph name="open" />
        </button>
        <button type="button" className="tray-button tray-quiet" onClick={onQuit} data-testid="tray-quit">
          Quit
        </button>
      </footer>
    </div>
  );
}

const GLYPHS = {
  note: 'M5 2.75h5l3 3v7.5H5z M10 2.75v3h3 M7 8h4 M7 10.5h4',
  calendar: 'M2.75 4.5h10.5v8.75H2.75z M5.5 2.75V6 M10.5 2.75V6 M3 7.5h10',
  sound: 'M2.75 7v2 M5.375 5v6 M8 3v10 M10.625 5v6 M13.25 7v2',
  open: 'M4.25 11.75l7.5-7.5 M5 4.25h6.75V11',
};

function TrayGlyph({ name }: { name: keyof typeof GLYPHS }) {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
      <path d={GLYPHS[name]} />
    </svg>
  );
}

/** "Today", the date, and a thin line from 00 to 24 with a mark at now. */
function Head({ shown }: { shown: PanelNow }) {
  return (
    <header className="tray-head">
      <div className="tray-title-row">
        <h1 className="tray-title">Today</h1>
        <p className="tray-date">{shown.date} <span>·</span> {shown.clock}</p>
      </div>
      <div className="tray-timeline" style={{ '--share': shown.share } as CSSProperties} role="img" aria-label={`${shown.clock}, ${shown.percent}% of the day gone`}>
        <div className="tray-track">
          {TIMELINE_MARKS.map((mark) => (
            <span key={mark.hour} className={mark.major ? 'tray-mark is-major' : 'tray-mark'} style={{ left: `${mark.share * 100}%` }} />
          ))}
          <span className="tray-fill" />
          <span className="tray-marker" />
        </div>
        <div className="tray-hours" aria-hidden="true">
          {TIMELINE_MARKS.filter((mark) => mark.major).map((mark) => (
            <span key={mark.hour}>{String(mark.hour).padStart(2, '0')}</span>
          ))}
        </div>
      </div>
    </header>
  );
}

function Now({ view, shown, send }: { view: PanelView; shown: PanelNow; send: Props['send'] }) {
  const { session } = view;
  const { round, rest } = shown;
  const paused = round?.state === 'paused';
  const state = round ? (paused ? 'paused' : 'running') : rest ? 'rest' : 'idle';
  const progress = round?.progress ?? rest?.progress;
  const current = view.tasks.some((task) => task.current);
  const description = round ? (paused ? 'Paused' : round.kind) : rest ? 'Rest' : undefined;

  return (
    <section className="tray-now" data-testid="tray-now" data-state={state}>
      <div className="tray-now-summary">
        <div className="tray-now-main">
          {description ? (
            <>
              <span className="tray-now-time" data-testid="tray-time">{round?.time ?? rest?.time}</span>
              <span className="tray-caption">{description}</span>
            </>
          ) : <span className="tray-idle">Nothing running</span>}
        </div>
        <div className="tray-total">
          <strong>{shown.focused}</strong>
          <span className="tray-caption">Focused today</span>
        </div>
        {(round || rest || view.vault) && (
          <div className="tray-now-actions">
            {round ? (
              <>
                <RoundButton kind={paused ? 'resume' : 'pause'} label={paused ? 'Resume' : 'Pause'} send={send} />
                <RoundButton kind="stop" label="Stop" send={send} />
              </>
            ) : rest ? <RoundButton kind="skip-rest" label="Skip rest" send={send} /> : <RoundButton kind="rest" label="Rest" send={send} />}
          </div>
        )}
      </div>
      {round && !current && <p className="tray-now-task" title={session?.label}>{session?.label || 'Untitled'}</p>}
      {progress !== undefined && (
        <span className="tray-progress" style={{ '--progress': progress } as CSSProperties} aria-hidden="true" />
      )}
    </section>
  );
}

function RoundButton({ kind, label, send }: { kind: 'resume' | 'pause' | 'stop' | 'skip-rest' | 'rest'; label: string; send: Props['send'] }) {
  return <button type="button" className="tray-button" onClick={() => send({ kind })} data-testid={`tray-${kind}`}>{label}</button>;
}

function Tasks({ view, send }: { view: PanelView; send: Props['send'] }) {
  const done = view.tasks.filter((task) => task.done).length;
  let empty: string | undefined;
  if (!view.vault) empty = 'No vault is open. Open Epizen to choose one.';
  else if (!view.note) empty = 'Today has no note yet.';
  else if (!view.tasks.length) empty = 'No tasks in today’s note yet.';
  return (
    <section className="tray-tasks" aria-label="Today’s tasks">
      <div className="tray-tasks-head">
        <h2>Today’s tasks</h2>
        {view.tasks.length > 0 && (
          <p className="tray-count">
            {done} of {view.tasks.length} done
          </p>
        )}
      </div>
      {empty ? (
        <p className="tray-none">{empty}</p>
      ) : (
        <ul className="tray-list">
          {view.tasks.map((task) => (
            <TaskCard key={`${task.line}:${task.text}`} task={task} view={view} send={send} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** One of today's tasks: its category, words and minutes, and how to start a round on it. */
function TaskCard({ task, view, send }: { task: PanelTask; view: PanelView; send: Props['send'] }) {
  const [custom, setCustom] = useState<string>();
  const start = (how: RoundHow) => {
    setCustom(undefined);
    send(startCommand(view.day, task, how));
  };
  const classes = ['tray-task', task.current && 'is-current', task.done && 'is-done'].filter(Boolean).join(' ');
  return (
    <li className={classes} style={{ '--tone': toneOf(task.category) } as CSSProperties} data-testid="tray-task">
      <div className="tray-task-top">
        <p className="tray-task-label" title={task.label}>{task.label || 'Untitled'}</p>
        {task.current && <span className="tray-current">Current</span>}
      </div>
      <div className="tray-task-meta">
        {task.category && <span className="tray-category">{task.category}</span>}
        <span>{formatMinutes(task.minutes)} logged</span>
      </div>
      {!task.current && !task.done &&
        (custom === undefined ? (
          <div className="tray-starts" role="group" aria-label={`Start a round on ${task.label}`}>
            {POMODORO_PRESETS.map((minutes, i) => (
              <button key={minutes} type="button" className={i === 0 ? 'tray-button tray-start is-first' : 'tray-button tray-start'} onClick={() => start({ mode: 'pomodoro', minutes })} data-testid={`tray-start-${minutes}`}>
                {minutes} min
              </button>
            ))}
            <button type="button" className="tray-button tray-start" onClick={() => setCustom((POMODORO_PRESETS as readonly number[]).includes(view.prefs.minutes) ? '' : String(view.prefs.minutes))} data-testid="tray-start-custom">
              Custom
            </button>
            <button type="button" className="tray-button tray-start" onClick={() => start({ mode: 'stopwatch' })} data-testid="tray-start-live">
              Live
            </button>
          </div>
        ) : (
          <CustomRound value={custom} onChange={setCustom} onStart={(minutes) => start({ mode: 'pomodoro', minutes })} onCancel={() => setCustom(undefined)} />
        ))}
    </li>
  );
}

/** Custom: a round of so many minutes, typed. */
function CustomRound({ value, onChange, onStart, onCancel }: { value: string; onChange: (value: string) => void; onStart: (minutes: number) => void; onCancel: () => void }) {
  const minutes = customMinutes(value);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (minutes !== undefined) onStart(minutes);
  };
  return (
    <form className="tray-custom" onSubmit={submit}>
      <label className="tray-custom-field">
        <input
          value={value}
          inputMode="numeric"
          placeholder="30"
          autoFocus
          aria-label={`Minutes, ${CUSTOM_MINUTES.min} to ${CUSTOM_MINUTES.max}`}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 3))}
          onKeyDown={(event) => {
            // Escape leaves Custom, not the panel.
            if (event.key === 'Escape') {
              event.stopPropagation();
              onCancel();
            }
          }}
          data-testid="tray-custom-minutes"
        />
        <span>min</span>
      </label>
      <button type="submit" className="tray-button tray-start is-first" disabled={minutes === undefined} data-testid="tray-custom-start">
        Start
      </button>
      <button type="button" className="tray-button tray-quiet" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}
