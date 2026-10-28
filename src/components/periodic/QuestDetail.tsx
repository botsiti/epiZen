import { useEffect, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { formatDate, parseDate } from '../../lib/dates';
import { dueDate, earned, MYTHIC, penalty, progress, sphereColor, sphereXp, TIERS, type LogEntry, type Quest, type QuestChange, type QuestEntry } from '../../lib/quests';
import { VaultImage } from '../VaultImage';
import { spark } from './effects';
import { steps, timeChip } from './questTime';

// A quest's detail, after the vault's Obsidian quest modal (rpg-week.js, renderQuestModal): its art
// with the sphere and tier, the title, when it started and is due, what it has earned, its
// description, and its adventure log, where a chapter is added, rewritten or taken out.

interface Props {
  entry: QuestEntry;
  art?: string;
  today: Date;
  onToggle: (quest: Quest) => void;
  onProgress: (quest: Quest, value: number) => void;
  /** Settles with why the change wasn't written, if it wasn't. */
  onChange: (quest: Quest, change: QuestChange) => Promise<string | undefined>;
  onClose: () => void;
}

const SCOPES = { weekly: 'Weekly quest', monthly: 'Monthly quest', custom: 'Mythic quest' } as const;

/** `2026-08-16` as "Sunday, 16 Aug". */
const longDay = (iso: string) => {
  const date = parseDate(iso, 'YYYY-MM-DD');
  return date ? formatDate(date, 'dddd, D MMM') : iso;
};

/** ⌘ or Ctrl with Enter. */
const sends = (event: KeyboardEvent) => event.key === 'Enter' && (event.metaKey || event.ctrlKey);

export function QuestDetail({ entry, art, today, onToggle, onProgress, onChange, onClose }: Props) {
  const { quest, period } = entry;
  const mythic = quest.scope === 'custom';
  const tier = TIERS[quest.tier];
  const sphere = quest.spheres[0]?.name;
  const tone = sphere ? sphereColor(sphere) : tier.color;
  const iso = formatDate(today, 'YYYY-MM-DD');
  const due = dueDate(quest, period);
  const lost = penalty(quest, iso, period);
  const when = timeChip(quest, due, iso);
  const share = progress(quest);
  const won = earned(quest);

  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ entry: LogEntry; words: string }>();
  const [asking, setAsking] = useState<LogEntry>();
  const [deadline, setDeadline] = useState<string>();

  // A delete asks once; left alone, it stops asking.
  useEffect(() => {
    if (!asking) return;
    const timer = setTimeout(() => setAsking(undefined), 2400);
    return () => clearTimeout(timer);
  }, [asking]);

  // Escape puts away what is open in the dialog first, then the dialog.
  useEffect(() => {
    const key = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (editing) setEditing(undefined);
      else if (deadline !== undefined) setDeadline(undefined);
      else onClose();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [editing, deadline, onClose]);

  const send = (change: QuestChange, after?: () => void) => {
    setBusy(true);
    void onChange(quest, change).then((why) => {
      setBusy(false);
      setProblem(why);
      if (!why) after?.();
    });
  };
  const addChapter = () => {
    if (!draft.trim() || busy) return;
    send({ kind: 'add-chapter', words: draft }, () => setDraft(''));
  };
  const saveChapter = () => {
    if (!editing || !editing.words.trim() || busy) return;
    if (editing.words.trim() === editing.entry.text) return setEditing(undefined);
    send({ kind: 'edit-chapter', entry: editing.entry, words: editing.words }, () => setEditing(undefined));
  };
  const saveDeadline = (date?: string) => send({ kind: 'deadline', date }, () => setDeadline(undefined));
  const chapters = quest.log.filter((item) => item.xp === undefined).length;

  return createPortal(
    <div className="periodic-layer quest-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()} data-testid="quest-detail">
      <div className={`quest-dialog${mythic ? ' is-mythic' : ''}`} role="dialog" aria-modal="true" aria-label={quest.title} style={{ '--tone': tone, '--tier': mythic ? MYTHIC.color : tier.color } as CSSProperties}>
        <div className="quest-dialog-art">
          {art ? <VaultImage path={art} alt="" className="quest-art-image" /> : <span className="quest-art-blank" aria-hidden="true" />}
          <span className="quest-veil" aria-hidden="true" />
          {sphere && (
            <span className="quest-dialog-chip is-sphere">
              <span className="chip-dot" style={{ background: tone }} />
              {sphere}
            </span>
          )}
          <span className="quest-dialog-chip is-tier">{mythic ? `${MYTHIC.glyph} Mythic` : `${tier.glyph} ${quest.tier}`}</span>
          <button type="button" className="wizard-round is-small quest-dialog-close" onClick={onClose} aria-label="Close" title="Close (Esc)" data-testid="quest-detail-close">
            ×
          </button>
          <span className="quest-dialog-scope">{SCOPES[quest.scope]}</span>
        </div>

        <div className="quest-dialog-body">
          <h2 className="quest-dialog-title" data-testid="quest-detail-title">
            {quest.title}
          </h2>
          {quest.spheres.length > 1 && (
            <p className="quest-dialog-bonus">
              {quest.spheres.slice(1).map(({ name, weight }) => (
                <span key={name} className="chip" style={{ '--tone': sphereColor(name) } as CSSProperties} title={`+${sphereXp(quest.xp, weight)} XP once done`}>
                  {name} +{weight}%
                </span>
              ))}
            </p>
          )}

          <div className="quest-dialog-meta" data-testid="quest-detail-meta">
            {quest.start && <span>Started {formatDate(parseDate(quest.start, 'YYYY-MM-DD') ?? today, 'D MMM')}</span>}
            {deadline === undefined ? (
              <>
                {due && (
                  <span className={lost ? 'is-late' : undefined}>
                    {longDay(due)}
                    {quest.deadline ? '' : ' (end of its ' + (quest.scope === 'weekly' ? 'week' : 'month') + ')'}
                    {when ? ` · ${when}` : ''}
                  </span>
                )}
                {lost > 0 && <span className="is-late">−{lost} XP penalty</span>}
                <button type="button" className="quiet-chip" onClick={() => setDeadline(quest.deadline ?? due ?? iso)} data-testid="quest-deadline-edit">
                  {quest.deadline ? '✎ Edit deadline' : '+ Set deadline'}
                </button>
              </>
            ) : (
              <span className="quest-deadline-edit">
                <input
                  type="date"
                  value={deadline}
                  onChange={(event) => setDeadline(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && deadline && saveDeadline(deadline)}
                  aria-label="Deadline"
                  data-testid="quest-deadline-field"
                />
                <button type="button" className="primary-button" disabled={!deadline || busy} onClick={() => saveDeadline(deadline)} data-testid="quest-deadline-save">
                  Save
                </button>
                {quest.deadline && (
                  <button type="button" className="quiet-chip" disabled={busy} onClick={() => saveDeadline(undefined)} data-testid="quest-deadline-clear">
                    Clear
                  </button>
                )}
                <button type="button" className="quiet-chip" onClick={() => setDeadline(undefined)}>
                  Cancel
                </button>
              </span>
            )}
          </div>

          <div className="quest-dialog-grid">
            <div className="quest-earned card glass">
              <p className="tile-label">Earned</p>
              <p className="quest-earned-value" data-testid="quest-detail-earned">
                +{won}
                <span className="of"> XP</span>
              </p>
              <p className="faint">of {quest.xp} XP</p>
              {quest.target !== undefined && (
                <div className="quest-progress">
                  <span className="bar" aria-hidden="true">
                    <span style={{ width: `${share * 100}%`, background: tone }} />
                  </span>
                  <span className="quest-count">
                    {quest.current ?? 0} / {quest.target} ({Math.round(share * 100)}%)
                  </span>
                  {!quest.done && (
                    <span className="quest-steps">
                      <button type="button" className="step-button" onClick={() => onProgress(quest, (quest.current ?? 0) - 1)} aria-label="One less" disabled={!quest.current}>
                        −1
                      </button>
                      {steps(quest.target).map((step) => (
                        <button key={step} type="button" className="step-button" onClick={() => onProgress(quest, (quest.current ?? 0) + step)}>
                          +{step}
                        </button>
                      ))}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="quest-about">
              <p className="tile-label">The quest</p>
              {quest.desc ? <p className="quest-about-text">“{quest.desc}”</p> : <p className="faint">No description in its note.</p>}
            </div>
          </div>

          <section className="quest-log-section">
            <div className="section-head">
              <h3 className="section-title">Adventure log</h3>
              <span className="section-note">{chapters === 1 ? '1 chapter' : `${chapters} chapters`}</span>
            </div>
            {quest.log.length ? (
              <ol className="quest-log" data-testid="quest-log">
                {quest.log.map((item) =>
                  item.xp !== undefined ? (
                    <li key={item.line} className="quest-log-entry is-stamp" data-testid="quest-stamp">
                      <span className="quest-log-dot" aria-hidden="true" />
                      <span className="quest-log-date">{item.date}</span>
                      <span className="quest-log-words">{item.text}</span>
                    </li>
                  ) : editing?.entry.line === item.line ? (
                    <li key={item.line} className="quest-log-entry is-editing">
                      <span className="quest-log-dot" aria-hidden="true" />
                      <span className="quest-log-date">{item.date}</span>
                      <div className="quest-log-editor">
                        <textarea
                          autoFocus
                          value={editing.words}
                          onChange={(event) => setEditing({ entry: item, words: event.target.value })}
                          onKeyDown={(event) => {
                            if (!sends(event)) return;
                            event.preventDefault();
                            saveChapter();
                          }}
                          aria-label="The chapter"
                          data-testid="chapter-edit-field"
                        />
                        <span className="quest-log-buttons">
                          <button type="button" className="quiet-chip" onClick={() => setEditing(undefined)}>
                            Cancel
                          </button>
                          <button type="button" className="primary-button" disabled={!editing.words.trim() || busy} onClick={saveChapter} data-testid="chapter-edit-save">
                            Save
                          </button>
                        </span>
                      </div>
                    </li>
                  ) : (
                    <li key={item.line} className="quest-log-entry" data-testid="chapter" data-line={item.line}>
                      <span className="quest-log-dot" aria-hidden="true" />
                      <span className="quest-log-date">{item.date}</span>
                      <button type="button" className="quest-log-words" onClick={() => setEditing({ entry: item, words: item.text })} title="Click to rewrite">
                        {item.text}
                      </button>
                      <span className="quest-log-actions">
                        <button type="button" className="quest-log-action" onClick={() => setEditing({ entry: item, words: item.text })} aria-label="Rewrite this chapter" title="Rewrite" data-testid="chapter-edit">
                          ✎
                        </button>
                        <button
                          type="button"
                          className={asking?.line === item.line ? 'quest-log-action is-asking' : 'quest-log-action'}
                          disabled={busy}
                          onClick={() => (asking?.line === item.line ? send({ kind: 'delete-chapter', entry: item }, () => setAsking(undefined)) : setAsking(item))}
                          aria-label={asking?.line === item.line ? 'Delete it: click again' : 'Delete this chapter'}
                          title={asking?.line === item.line ? 'Click again to delete it' : 'Delete'}
                          data-testid="chapter-delete"
                        >
                          {asking?.line === item.line ? 'Delete?' : '×'}
                        </button>
                      </span>
                    </li>
                  ),
                )}
              </ol>
            ) : (
              <p className="faint">No chapters yet. Add the first one below.</p>
            )}
            <div className="quest-chapter-composer">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (!sends(event)) return;
                  event.preventDefault();
                  addChapter();
                }}
                placeholder="What did you do toward this quest? Add a chapter to the log…"
                aria-label="A new chapter"
                data-testid="chapter-field"
              />
              <span className="quest-log-buttons">
                <span className="faint">⌘ + Enter to add</span>
                <button type="button" className="primary-button" disabled={!draft.trim() || busy} onClick={addChapter} data-testid="chapter-add">
                  + Add chapter
                </button>
              </span>
            </div>
          </section>
          {problem && (
            <p className="quest-dialog-problem" role="alert" data-testid="quest-detail-problem">
              {problem}
            </p>
          )}
        </div>

        <footer className="wizard-foot">
          <span className="wizard-step">{quest.done ? (quest.doneOn ? `Done ${formatDate(parseDate(quest.doneOn, 'YYYY-MM-DD') ?? today, 'D MMM')}` : 'Done') : when ? `Open · ${when}` : 'Open'}</span>
          <button
            type="button"
            className="wizard-continue"
            onClick={(event) => {
              if (!quest.done) {
                const box = event.currentTarget.getBoundingClientRect();
                spark(box.left + box.width / 2, box.top + box.height / 2, tier.color);
              }
              onToggle(quest);
            }}
            data-testid="quest-detail-toggle"
          >
            {quest.done ? 'Reopen' : 'Mark complete'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
