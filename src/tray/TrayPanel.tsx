import { useState, type CSSProperties, type FormEvent } from 'react';
import { category } from '../lib/categories';
import { formatMinutes } from '../lib/day';
import { CUSTOM_MINUTES, POMODORO_PRESETS } from '../lib/timer';
import { customMinutes, panelNow, startCommand, TIMELINE_MARKS, type PanelNow, type PanelTask, type PanelView, type RoundHow, type TrayCommand } from '../lib/tray';

interface Props {
  /** What the main window last published; nothing before it has. */
  view?: PanelView;
  now: number;
  send: (command: TrayCommand) => void;
  onOpen: () => void;
  onQuit: () => void;
}

const toneOf = (name?: string) => (name ? category(name).color : 'var(--accent)');

/**
 * The panel under the menu bar item, after Senioro's: today, the day's timeline, the round under
 * way, the day's focus, and today's tasks to start a round on. Its buttons only send commands:
 * the timer is the main window's.
 */
export function TrayPanel({ view, now, send, onOpen, onQuit }: Props) {
  const shown = view && panelNow(view, now);
  return (
    <div className="tray periodic-layer" data-testid="tray">
      {shown && view ? (
        <>
          <Head shown={shown} />
          <div className="tray-scroll">
            {view.warning && (
              <p className="tray-warning" role="status">
                {view.warning}
              </p>
            )}
            <Now view={view} shown={shown} send={send} />
            <div className="tray-stats">
              <p className="tray-stat">
                <span className="tray-stat-value">{shown.focused}</span>
                <span className="tile-label">Focused today</span>
              </p>
              <p className="tray-stat">
                <span className="tray-stat-value">{shown.percent}%</span>
                <span className="tile-label">Of the day gone</span>
              </p>
            </div>
            <Tasks view={view} shown={shown} send={send} />
          </div>
        </>
      ) : (
        <p className="tray-empty">Epizen is opening…</p>
      )}
      <footer className="tray-foot">
        <button type="button" className="primary-button" onClick={onOpen} data-testid="tray-open">
          Open Epizen
        </button>
        <button type="button" className="tray-quit" onClick={onQuit} data-testid="tray-quit">
          Quit
        </button>
      </footer>
    </div>
  );
}

/** "Today", the date, and a thin line from 00 to 24 with a mark at now. */
function Head({ shown }: { shown: PanelNow }) {
  return (
    <header className="tray-head">
      <div className="tray-title-row">
        <h1 className="tray-title">Today</h1>
        <p className="tray-date">{shown.date}</p>
      </div>
      <div className="tray-timeline" style={{ '--share': shown.share } as CSSProperties} role="img" aria-label={`${shown.clock}, ${shown.percent}% of the day gone`}>
        <span className="tray-bubble">{shown.clock}</span>
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

/** Pause or resume, and stop, for the round under way. */
function RoundControls({ paused, send }: { paused: boolean; send: Props['send'] }) {
  return (
    <span className="tray-controls">
      {paused ? (
        <button type="button" className="primary-button" onClick={() => send({ kind: 'resume' })} data-testid="tray-resume">
          Resume
        </button>
      ) : (
        <button type="button" className="nav-chip" onClick={() => send({ kind: 'pause' })} data-testid="tray-pause">
          Pause
        </button>
      )}
      <button type="button" className="nav-chip" onClick={() => send({ kind: 'stop' })} data-testid="tray-stop">
        Stop
      </button>
    </span>
  );
}

/** The round under way, the rest, or nothing running. */
function Now({ view, shown, send }: { view: PanelView; shown: PanelNow; send: Props['send'] }) {
  const { session, rest } = view;
  if (session && shown.round) {
    const paused = session.pausedAt !== undefined;
    // Its own task's card has the buttons; a round on a task not listed today has them here.
    const listed = view.tasks.some((task) => task.current);
    return (
      <section className={paused ? 'tray-now glass is-paused' : 'tray-now glass'} style={{ '--tone': toneOf(session.category) } as CSSProperties} data-testid="tray-now" data-state={paused ? 'paused' : 'running'}>
        <p className="kicker">{shown.round.kind}</p>
        <p className="tray-now-time">
          <span data-testid="tray-time">{shown.round.time}</span>
          <span className="tray-now-state">{shown.round.state}</span>
        </p>
        <p className="tray-now-task" title={session.label}>
          <span className="tray-dot" aria-hidden="true" />
          {session.category && <span className="chip">{session.category}</span>}
          <span className="tray-now-words">{session.label || 'untitled'}</span>
        </p>
        {shown.round.progress !== undefined && <span className="tray-progress" style={{ '--progress': shown.round.progress } as CSSProperties} aria-hidden="true" />}
        {!listed && <RoundControls paused={paused} send={send} />}
      </section>
    );
  }
  if (rest && shown.rest) {
    return (
      <section className="tray-now glass is-rest" style={{ '--tone': 'var(--rest)' } as CSSProperties} data-testid="tray-now" data-state="rest">
        <p className="kicker">Rest</p>
        <p className="tray-now-time">
          <span data-testid="tray-time">{shown.rest.time}</span>
          <span className="tray-now-state">left</span>
        </p>
        <span className="tray-progress" style={{ '--progress': shown.rest.progress } as CSSProperties} aria-hidden="true" />
        <span className="tray-controls">
          <button type="button" className="nav-chip" onClick={() => send({ kind: 'skip-rest' })} data-testid="tray-skip-rest">
            Skip rest
          </button>
        </span>
      </section>
    );
  }
  return (
    <section className="tray-now glass is-idle" data-testid="tray-now" data-state="idle">
      <p className="kicker">Focus</p>
      <p className="tray-idle">Nothing running</p>
      {view.vault && (
        <span className="tray-controls">
          <button type="button" className="nav-chip" onClick={() => send({ kind: 'rest' })} data-testid="tray-rest">
            Rest
          </button>
        </span>
      )}
    </section>
  );
}

function Tasks({ view, shown, send }: { view: PanelView; shown: PanelNow; send: Props['send'] }) {
  const done = view.tasks.filter((task) => task.done).length;
  let empty: string | undefined;
  if (!view.vault) empty = 'No vault is open. Open Epizen to choose one.';
  else if (!view.note) empty = 'Today has no note yet. Open Epizen to make one.';
  else if (!view.tasks.length) empty = 'No tasks in today’s note yet.';
  return (
    <section className="tray-tasks" aria-label="Today’s tasks">
      <div className="tray-tasks-head">
        <p className="tile-label">Today’s tasks</p>
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
            <TaskCard key={`${task.line}:${task.text}`} task={task} view={view} shown={shown} send={send} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** One of today's tasks: its category, words and minutes, and how to start a round on it. */
function TaskCard({ task, view, shown, send }: { task: PanelTask; view: PanelView; shown: PanelNow; send: Props['send'] }) {
  const [custom, setCustom] = useState<string>();
  const start = (how: RoundHow) => {
    setCustom(undefined);
    send(startCommand(task, how));
  };
  const paused = view.session?.pausedAt !== undefined;
  const classes = ['tray-task', task.current && 'is-current', task.done && 'is-done'].filter(Boolean).join(' ');
  return (
    <li className={classes} style={{ '--tone': toneOf(task.category) } as CSSProperties} data-testid="tray-task">
      <div className="tray-task-top">
        {task.category ? <span className="chip">{task.category}</span> : <span />}
        <span className="tray-task-minutes">{formatMinutes(task.minutes)} logged</span>
      </div>
      <p className="tray-task-label" title={task.label}>
        {task.label || 'untitled'}
      </p>
      {task.current && shown.round ? (
        <div className="tray-running">
          <span className="tray-running-time">{shown.round.time}</span>
          <span className="tray-now-state">{shown.round.state}</span>
          <RoundControls paused={paused} send={send} />
        </div>
      ) : (
        !task.done &&
        (custom === undefined ? (
          <div className="tray-starts" role="group" aria-label={`Start a round on ${task.label}`}>
            {POMODORO_PRESETS.map((minutes, i) => (
              <button key={minutes} type="button" className={i === 0 ? 'tray-start is-first' : 'tray-start'} onClick={() => start({ mode: 'pomodoro', minutes })} data-testid={`tray-start-${minutes}`}>
                {minutes} min
              </button>
            ))}
            <button type="button" className="tray-start" onClick={() => setCustom((POMODORO_PRESETS as readonly number[]).includes(view.prefs.minutes) ? '' : String(view.prefs.minutes))} data-testid="tray-start-custom">
              Custom
            </button>
            <button type="button" className="tray-start" onClick={() => start({ mode: 'stopwatch' })} data-testid="tray-start-live">
              Live
            </button>
          </div>
        ) : (
          <CustomRound value={custom} onChange={setCustom} onStart={(minutes) => start({ mode: 'pomodoro', minutes })} onCancel={() => setCustom(undefined)} />
        ))
      )}
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
        <span className="faint">min</span>
      </label>
      <button type="submit" className="primary-button" disabled={minutes === undefined} data-testid="tray-custom-start">
        Start
      </button>
      <button type="button" className="tray-quit" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}
