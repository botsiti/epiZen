import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { formatDate } from '../../lib/dates';
import { dueDate, earned, MYTHIC, penalty, progress, sphereColor, TIERS, type Quest, type QuestChange, type QuestEntry } from '../../lib/quests';
import { VaultImage } from '../VaultImage';
import { order, spark } from './effects';
import { Section } from './parts';
import { QuestDetail } from './QuestDetail';
import { steps, timeChip } from './questTime';

interface Actions {
  onToggle: (quest: Quest) => void;
  onProgress: (quest: Quest, value: number) => void;
}

interface BoardProps extends Actions {
  quests: QuestEntry[];
  /** The art file for a quest, if the vault has one. */
  art: (quest: Quest) => string | undefined;
  today: Date;
  /** Labels for the weekly and monthly groups, such as "This week". */
  groups?: { weekly: string; monthly: string };
  /** Limit the initial board, with more available on demand. */
  pageSize?: number;
  /** A chapter or a deadline from a quest's detail. Without it, a card doesn't open its detail. */
  onChange?: (quest: Quest, change: QuestChange) => Promise<string | undefined>;
}

/** Which quest's detail is open: its note, its line and its title, to find it again after a write. */
type Opened = { path: string; line: number; title: string };

const opened = (quests: QuestEntry[], open?: Opened) => {
  if (!open) return undefined;
  const at = (test: (quest: Quest) => boolean) => quests.find(({ quest }) => quest.path === open.path && test(quest));
  return at((q) => q.line === open.line && q.title === open.title) ?? at((q) => q.title === open.title) ?? at((q) => q.line === open.line);
};

type Filter = 'all' | 'weekly' | 'monthly';

/** Mythic quests pinned on top, then weekly and monthly quests behind filter chips. */
export function QuestBoard({ quests, art, today, onToggle, onProgress, onChange, pageSize, groups = { weekly: 'This week', monthly: 'This month' } }: BoardProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<Opened>();
  const [limit, setLimit] = useState(pageSize ?? Infinity);
  const detail = opened(quests, open);
  const onOpen = onChange && ((quest: Quest) => setOpen({ path: quest.path, line: quest.line, title: quest.title }));
  const mythic = useMemo(
    () =>
      quests
        .filter(({ quest }) => quest.scope === 'custom')
        .sort((a, b) => Number(a.quest.done) - Number(b.quest.done) || (a.quest.deadline ?? '9').localeCompare(b.quest.deadline ?? '9') || b.quest.xp - a.quest.xp),
    [quests],
  );
  const regular = quests.filter(({ quest }) => quest.scope !== 'custom');
  const count = (scope: Filter) => regular.filter(({ quest }) => scope === 'all' || quest.scope === scope).length;
  const shown = (['weekly', 'monthly'] as const).filter((scope) => filter === 'all' || filter === scope);
  const visible = [...mythic, ...regular.filter(({ quest }) => filter === 'all' || quest.scope === filter)].slice(0, limit);
  const hasMore = mythic.length + regular.filter(({ quest }) => filter === 'all' || quest.scope === filter).length > limit;
  if (!quests.length) return <p className="empty-line">No quests here. A line like “- [ ] #quest/weekly - Two long runs [xp::300]” in a weekly note shows as a card.</p>;
  return (
    <div className="quest-board" data-testid="quest-board">
      {mythic.length > 0 && (
        <section className="mythic-shelf">
          <div className="section-head">
            <h2 className="section-title mythic-title">
              {MYTHIC.glyph} Mythic quests
            </h2>
            <span className="section-note">
              {mythic.filter(({ quest }) => !quest.done).length} active · {mythic.filter(({ quest }) => quest.done).length} done
            </span>
            <span className="section-note mythic-pin">Pinned above every filter</span>
          </div>
          <div className="quest-grid">
            {mythic.filter((entry) => visible.includes(entry)).map((entry, i) => (
              <QuestCard key={`${entry.quest.path}:${entry.quest.line}`} entry={entry} i={i} art={art(entry.quest)} today={today} onToggle={onToggle} onProgress={onProgress} onOpen={onOpen} />
            ))}
          </div>
        </section>
      )}
      {regular.length > 0 && (
        <>
          <div className="quest-filters" role="tablist">
            {(['all', 'weekly', 'monthly'] as const).map((scope) => (
              <button key={scope} type="button" role="tab" aria-selected={filter === scope} className={filter === scope ? 'chip-filter is-on' : 'chip-filter'} onClick={() => { setFilter(scope); setLimit(pageSize ?? Infinity); }} data-testid="quest-filter" data-filter={scope}>
                {scope === 'all' ? 'All' : scope === 'weekly' ? 'Weekly' : 'Monthly'} · {count(scope)}
              </button>
            ))}
          </div>
          {shown.map((scope) => {
            const list = regular.filter(({ quest }) => quest.scope === scope);
            if (!list.length) return null;
            return (
              <Section key={scope} title={groups[scope]} note={`${list.filter(({ quest }) => quest.done).length}/${list.length} done`}>
                <div className="quest-grid">
                  {list.filter((entry) => visible.includes(entry)).map((entry, i) => (
                    <QuestCard key={`${entry.quest.path}:${entry.quest.line}`} entry={entry} i={i} art={art(entry.quest)} today={today} onToggle={onToggle} onProgress={onProgress} onOpen={onOpen} />
                  ))}
                </div>
              </Section>
            );
          })}
        </>
      )}
      {pageSize && hasMore && <button type="button" className="shelf-all" onClick={() => setLimit((n) => n + pageSize)}>See {pageSize} more</button>}
      {detail && onChange && (
        <QuestDetail entry={detail} art={art(detail.quest)} today={today} onToggle={onToggle} onProgress={onProgress} onChange={onChange} onClose={() => setOpen(undefined)} />
      )}
    </div>
  );
}

export function QuestCard({ entry, i, art, today, onToggle, onProgress, onOpen }: Actions & { entry: QuestEntry; i: number; art?: string; today: Date; onOpen?: (quest: Quest) => void }) {
  const { quest, period } = entry;
  const mythic = quest.scope === 'custom';
  const tier = TIERS[quest.tier];
  const sphere = quest.spheres[0]?.name;
  const tone = sphere ? sphereColor(sphere) : tier.color;
  const iso = formatDate(today, 'YYYY-MM-DD');
  const lost = penalty(quest, iso, period);
  const chip = timeChip(quest, dueDate(quest, period), iso);
  const share = progress(quest);
  return (
    <article
      className={`quest-card glass rise${mythic ? ' is-mythic' : ''}${quest.done ? ' is-done' : ''}${lost ? ' is-failed' : ''}`}
      style={{ ...order(i), '--tone': tone, '--tier': tier.color } as CSSProperties}
      data-testid="quest-card"
      data-scope={quest.scope}
    >
      <QuestArt quest={quest} onOpen={onOpen}>
        {art ? <VaultImage path={art} alt="" className="quest-art-image" /> : <span className="quest-art-blank" aria-hidden="true" />}
        <span className="quest-veil" aria-hidden="true" />
        {sphere && <span className="quest-sphere">{sphere}</span>}
        <span className="quest-corner" aria-hidden="true">
          {quest.done ? '✓' : '◆'}
        </span>
        <span className="quest-tier">{mythic ? `${MYTHIC.glyph} Mythic` : `${tier.glyph} ${quest.tier}`}</span>
        {chip && <span className="quest-when">{chip}</span>}
      </QuestArt>
      <div className="quest-body">
        <div className="quest-meta">
          <span className="quest-scope">{mythic ? 'Mythic quest' : quest.scope}</span>
          <span className="quest-xp">{quest.target && !quest.done ? `+${earned(quest)} / ${quest.xp} XP` : `+${quest.xp} XP`}</span>
        </div>
        <div className="quest-title-row">
          <button
            type="button"
            className="quest-toggle"
            role="checkbox"
            aria-checked={quest.done}
            aria-label={quest.done ? `Reopen ${quest.title}` : `Complete ${quest.title}`}
            style={{ '--share': share } as CSSProperties}
            onClick={(event) => {
              if (!quest.done) {
                const box = event.currentTarget.getBoundingClientRect();
                spark(box.left + box.width / 2, box.top + box.height / 2, tier.color);
              }
              onToggle(quest);
            }}
            data-testid="quest-toggle"
          />
          <h3 className="quest-title">
            {onOpen ? (
              <button type="button" className="quest-title-open" onClick={() => onOpen(quest)}>
                {quest.title}
              </button>
            ) : (
              quest.title
            )}
          </h3>
        </div>
        {quest.desc && <p className="quest-desc">{quest.desc}</p>}
        {quest.target !== undefined && (
          <div className="quest-progress">
            <span className="bar" aria-hidden="true">
              <span style={{ width: `${share * 100}%`, background: tone }} />
            </span>
            <span className="quest-count">
              {quest.current ?? 0} of {quest.target}
            </span>
            {!quest.done && (
              <span className="quest-steps">
                <button type="button" className="step-button" onClick={() => onProgress(quest, (quest.current ?? 0) - 1)} aria-label="One less" disabled={!quest.current}>
                  −1
                </button>
                {steps(quest.target).map((step) => (
                  <button key={step} type="button" className="step-button" onClick={() => onProgress(quest, (quest.current ?? 0) + step)} data-testid="quest-step" data-step={step}>
                    +{step}
                  </button>
                ))}
              </span>
            )}
          </div>
        )}
        {lost > 0 && <p className="quest-penalty">⚠ Penalty −{lost} XP</p>}
      </div>
    </article>
  );
}

/** A quest's art; with `onOpen`, a button that opens its detail. */
function QuestArt({ quest, onOpen, children }: { quest: Quest; onOpen?: (quest: Quest) => void; children: ReactNode }) {
  if (!onOpen) return <div className="quest-art">{children}</div>;
  return (
    <button type="button" className="quest-art is-open" onClick={() => onOpen(quest)} aria-label={`Details of ${quest.title}`} title="Open the quest's details" data-testid="quest-open">
      {children}
    </button>
  );
}
