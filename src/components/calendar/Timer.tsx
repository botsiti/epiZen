import { useId, useState, type CSSProperties } from 'react';
import { category } from '../../lib/categories';
import { clock } from '../../lib/day';
import { CUSTOM_MINUTES, elapsed, formatSeconds, POMODORO_PRESETS, REST_PRESETS, restLeft, shownSeconds, type TimerMode } from '../../lib/timer';
import { primeChime } from './chime';
import { TaskPicker } from './TaskPicker';
import type { DayTaskRef, TaskChoice } from './types';
import { useEscape } from './useEscape';
import { useNow } from './useNow';
import type { TimerApi } from './useTimer';

const REST_TONE = 'var(--rest)';
const toneOf = (name?: string) => (name ? category(name).color : 'var(--accent)');

/**
 * Senioro's focus dial: a thin ring with a glowing dot that goes round once per pomodoro, or 60
 * ticks that fill with the seconds of the stopwatch; big, light numerals in the middle.
 */
export function Dial({ mode, seconds, progress, tone, paused, label, size = 172, ticks = 0 }: { mode: TimerMode; seconds: number; progress: number; tone: string; paused?: boolean; label: string; size?: number; ticks?: number }) {
  const glow = useId();
  const c = size / 2;
  const r = c - 12;
  const around = 2 * Math.PI * r;
  const share = Math.max(0, Math.min(1, progress));
  return (
    <div className={paused ? 'dial is-paused' : 'dial'} style={{ width: size, height: size, '--tone': tone } as CSSProperties} data-testid="dial" data-mode={mode}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <filter id={glow} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>
        {mode === 'stopwatch' ? (
          Array.from({ length: 60 }, (_, i) => {
            const angle = (i / 60) * Math.PI * 2 - Math.PI / 2;
            const lit = i < ticks;
            const inner = lit ? r - 12 : r - 7;
            return (
              <line
                key={i}
                className={lit ? 'dial-tick is-lit' : 'dial-tick'}
                x1={c + Math.cos(angle) * r}
                y1={c + Math.sin(angle) * r}
                x2={c + Math.cos(angle) * inner}
                y2={c + Math.sin(angle) * inner}
              />
            );
          })
        ) : (
          <>
            <circle className="dial-ring" cx={c} cy={c} r={r} />
            <circle className="dial-trail" cx={c} cy={c} r={r} strokeDasharray={`${share * around} ${around}`} transform={`rotate(-90 ${c} ${c})`} />
            <g className="dial-dot" style={{ transform: `rotate(${share * 360}deg)`, transformOrigin: `${c}px ${c}px` }}>
              <circle cx={c} cy={c - r} r={7} className="dial-dot-glow" filter={`url(#${glow})`} />
              <circle cx={c} cy={c - r} r={4} className="dial-dot-core" />
            </g>
          </>
        )}
      </svg>
      <div className="dial-center">
        <span className="dial-time" data-testid="dial-time">
          {formatSeconds(seconds)}
        </span>
        <span className="dial-label">{label}</span>
      </div>
    </div>
  );
}

interface CardProps {
  timer: TimerApi;
  /** Today's tasks, to start on. */
  tasks: DayTaskRef[];
  categories: string[];
  onStart: (choice: TaskChoice) => void;
}

/** The timer on the calendar page: the dial, the task, and what can be done now. */
export function TimerCard({ timer, tasks, categories, onStart }: CardProps) {
  const { state } = timer;
  const { session, rest, prefs } = state;
  const counting = Boolean(rest ?? (session && session.pausedAt === undefined));
  const now = useNow(counting, 250);
  const [picking, setPicking] = useState(false);
  const phase = session ? (session.pausedAt === undefined ? 'running' : 'paused') : rest ? 'rest' : 'idle';

  const start = (choice: TaskChoice) => {
    primeChime();
    onStart(choice);
    setPicking(false);
  };

  let dial;
  if (session) {
    const seconds = Math.floor(elapsed(session, now) / 1000);
    dial = (
      <Dial
        key={session.id}
        mode={session.mode}
        seconds={shownSeconds(session, now)}
        progress={session.planned ? seconds / session.planned : 0}
        ticks={seconds % 60}
        tone={toneOf(session.task.category)}
        paused={session.pausedAt !== undefined}
        label={session.pausedAt !== undefined ? 'paused' : session.planned ? 'left' : 'focused'}
      />
    );
  } else if (rest) {
    dial = <Dial key={`rest-${rest.startedAt}`} mode="pomodoro" seconds={restLeft(rest, now)} progress={1 - restLeft(rest, now) / rest.seconds} tone={REST_TONE} label="rest" />;
  } else {
    dial = <Dial mode={prefs.mode} seconds={prefs.mode === 'pomodoro' ? prefs.minutes * 60 : 0} progress={0} tone="var(--text-faint)" label={prefs.mode === 'pomodoro' ? `${prefs.minutes} min round` : 'stopwatch'} />;
  }

  return (
    <section className={`timer-card glass rise is-${phase}`} data-testid="timer" data-state={phase}>
      <p className="tile-label">{session ? (session.mode === 'pomodoro' ? `Pomodoro · ${Math.round((session.planned ?? 0) / 60)} min` : 'Stopwatch') : rest ? 'Rest' : 'Focus'}</p>
      {dial}
      {session && (
        <>
          <p className="timer-task" title={session.task.label}>
            {session.task.category && (
              <span className="chip" style={{ '--tone': toneOf(session.task.category) } as CSSProperties}>
                {session.task.category}
              </span>
            )}
            <span className="timer-task-label">{session.task.label}</span>
          </p>
          <p className="timer-since">since {clock(new Date(session.stretchStartedAt).getHours() * 60 + new Date(session.stretchStartedAt).getMinutes())}</p>
          <div className="timer-actions">
            {session.pausedAt === undefined ? (
              <button type="button" className="nav-chip" onClick={timer.pause} data-testid="timer-pause">
                Pause
              </button>
            ) : (
              <button type="button" className="primary-button" onClick={timer.resume} data-testid="timer-resume">
                Resume
              </button>
            )}
            <button type="button" className="nav-chip" onClick={timer.stop} data-testid="timer-stop">
              Stop
            </button>
          </div>
        </>
      )}
      {!session && rest && (
        <>
          <div className="timer-presets" role="radiogroup" aria-label="Rest">
            {REST_PRESETS.map((seconds) => (
              <button key={seconds} type="button" role="radio" aria-checked={rest.seconds === seconds} className={rest.seconds === seconds ? 'preset is-chosen' : 'preset'} onClick={() => timer.setRest(seconds)}>
                {formatSeconds(seconds)}
              </button>
            ))}
          </div>
          <div className="timer-actions">
            <button type="button" className="nav-chip" onClick={timer.endRest} data-testid="timer-skip-rest">
              Skip rest
            </button>
          </div>
        </>
      )}
      {!session && !rest && (
        <>
          <p className="timer-since">{prefs.mode === 'pomodoro' ? `then ${formatSeconds(prefs.rest)} rest` : 'counts up until you stop'}</p>
          <div className="timer-actions">
            <button type="button" className="primary-button" onClick={() => setPicking((open) => !open)} aria-expanded={picking} data-testid="timer-start">
              Start focus…
            </button>
            <button type="button" className="nav-chip" onClick={() => timer.startRest()} title={`Rest for ${formatSeconds(prefs.rest)}`} data-testid="timer-rest">
              Rest
            </button>
          </div>
        </>
      )}
      {timer.saveError && <p className="timer-problem">The timer couldn’t save itself: {timer.saveError}</p>}
      {state.pending
        .filter((block) => timer.failures.has(block.id))
        .map((block) => (
          <div key={block.id} className="timer-problem" data-testid="timer-unwritten">
            <span>
              {clock(block.start)}–{clock(block.end)} on “{block.task.label}” isn’t in the note yet: {timer.failures.get(block.id)}.
            </span>
            <span className="timer-problem-actions">
              <button type="button" className="nav-chip" onClick={() => timer.retry(block.id)}>
                Try again
              </button>
              <button type="button" className="nav-chip" onClick={() => timer.discard(block.id)}>
                Let it go
              </button>
            </span>
          </div>
        ))}
      {picking && !session && !rest && <StartFocus timer={timer} tasks={tasks} categories={categories} onCancel={() => setPicking(false)} onStart={start} />}
    </section>
  );
}

/** Pomodoro or stopwatch, the round, and the task to focus on: one of today's, or a new one. */
function StartFocus({ timer, tasks, categories, onCancel, onStart }: { timer: TimerApi; tasks: DayTaskRef[]; categories: string[]; onCancel: () => void; onStart: (choice: TaskChoice) => void }) {
  const { prefs } = timer.state;
  const [choice, setChoice] = useState<TaskChoice>();
  // What is typed in Custom; until then it shows the round chosen last, when that isn't a preset.
  const [typed, setTyped] = useState<string>();
  const preset = (POMODORO_PRESETS as readonly number[]).includes(prefs.minutes);
  const custom = typed ?? (preset ? '' : String(prefs.minutes));
  const customChosen = typed === undefined ? !preset : typed !== '';
  useEscape(onCancel);
  const go = () => choice && onStart(choice);
  return (
    <div className="cal-popover glass timer-setup" role="dialog" aria-label="Start focus" data-testid="timer-setup">
      <p className="kicker">Focus today</p>
      <div className="switch" role="radiogroup" aria-label="Kind of timer">
        {(['pomodoro', 'stopwatch'] as const).map((mode) => (
          <button key={mode} type="button" role="radio" aria-checked={prefs.mode === mode} className={prefs.mode === mode ? 'switch-option is-chosen' : 'switch-option'} onClick={() => timer.setPrefs({ mode })} data-testid={`timer-mode-${mode}`}>
            {mode === 'pomodoro' ? 'Pomodoro' : 'Stopwatch'}
          </button>
        ))}
      </div>
      {prefs.mode === 'pomodoro' && (
        <div className="timer-presets" role="radiogroup" aria-label="Round">
          {POMODORO_PRESETS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              role="radio"
              aria-checked={!customChosen && prefs.minutes === minutes}
              className={!customChosen && prefs.minutes === minutes ? 'preset is-chosen' : 'preset'}
              onClick={() => {
                setTyped(undefined);
                timer.setPrefs({ minutes });
              }}
            >
              {minutes} min
            </button>
          ))}
          <label className={customChosen ? 'preset preset-custom is-chosen' : 'preset preset-custom'}>
            <input
              value={custom}
              inputMode="numeric"
              placeholder="Custom"
              title={`${CUSTOM_MINUTES.min} to ${CUSTOM_MINUTES.max} minutes`}
              aria-label={`Custom round, ${CUSTOM_MINUTES.min} to ${CUSTOM_MINUTES.max} minutes`}
              onChange={(event) => {
                const text = event.target.value.replace(/\D/g, '').slice(0, 3);
                setTyped(text);
                if (Number(text) >= CUSTOM_MINUTES.min) timer.setPrefs({ minutes: Math.min(CUSTOM_MINUTES.max, Number(text)) });
              }}
              data-testid="timer-custom"
            />
            {customChosen && <span className="faint"> min</span>}
          </label>
        </div>
      )}
      <TaskPicker tasks={tasks} categories={categories} value={choice} onChange={setChoice} onSubmit={go} autoFocus />
      <div className="popover-actions">
        <button type="button" className="quiet-chip" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="primary-button" disabled={!choice} onClick={go} data-testid="timer-go">
          Start
        </button>
      </div>
    </div>
  );
}

/** The running timer at the top of the sidebar: its task, its time, and a way back to the calendar. */
export function TimerPill({ timer, onOpen }: { timer: TimerApi; onOpen: () => void }) {
  const { session, rest } = timer.state;
  const counting = Boolean(rest ?? (session && session.pausedAt === undefined));
  const now = useNow(counting, 250);
  const unwritten = timer.state.pending.some((block) => timer.failures.has(block.id));
  if (!session && !rest && !unwritten) return null;
  const tone = session ? toneOf(session.task.category) : rest ? REST_TONE : 'var(--text-muted)';
  const label = session ? session.task.label : rest ? 'Rest' : 'Time not written';
  const time = session ? formatSeconds(shownSeconds(session, now)) : rest ? formatSeconds(restLeft(rest, now)) : '!';
  const paused = session?.pausedAt !== undefined;
  return (
    <button type="button" className={paused ? 'timer-pill is-paused' : 'timer-pill'} style={{ '--tone': tone } as CSSProperties} onClick={onOpen} title="Open the calendar" data-testid="timer-pill">
      <span className="timer-pill-dot" aria-hidden="true" />
      <span className="timer-pill-label">{paused ? `Paused · ${label}` : label}</span>
      <span className="timer-pill-time">{time}</span>
    </button>
  );
}
