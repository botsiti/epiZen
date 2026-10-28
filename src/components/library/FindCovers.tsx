import { memo, useEffect, useState, useSyncExternalStore } from 'react';
import { fetchImageIntoVault, readNote, writeNote, type VaultFile } from '../../lib/api';
import { coverFills } from '../../lib/coverEdits';
import { CoverRun, foundOf, type Row, type RowStatus } from '../../lib/coverRun';
import { describe } from '../../lib/covers';
import { parseNote } from '../../lib/frontmatter';
import { kindSpec, type MediaEntry } from '../../lib/library';
import { useEscape } from '../calendar/useEscape';
import { LookupCover } from './parts';
import { coverAsk, hasRemoteImage } from './remoteImage';

interface Props {
  /** The notes in view without a cover, in the order they are shown. */
  entries: MediaEntry[];
  files: VaultFile[];
  /** What is in view: "Albums", or "the library". */
  scope: string;
  onClose: () => void;
  /** Covers were saved: read the vault again. */
  onSaved: () => Promise<void>;
}

type Filter = 'all' | 'sure' | 'unsure' | 'none';

const FILTERS: [Filter, string][] = [
  ['all', 'All'],
  ['sure', 'Sure'],
  ['unsure', 'Unsure'],
  ['none', 'Nothing found'],
];

const isFound = (row: Row) => row.candidates.length > 0 && row.status !== 'waiting' && row.status !== 'searching';
const sure = (row: Row) => isFound(row) && Boolean(row.candidates[row.pick]?.sure);
const shows = (filter: Filter, row: Row) =>
  filter === 'all' || (filter === 'sure' ? sure(row) : filter === 'unsure' ? isFound(row) && !sure(row) : row.status === 'none' || row.status === 'failed');

const minutes = (seconds: number) => (seconds < 60 ? 'under a minute' : `${Math.ceil(seconds / 60)} min`);
const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? '' : 's'}`;
const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/**
 * Finds covers for the notes in view that have none: each is searched on its kind's source, one
 * at a time, at each service's pace, and its row fills in as the answer lands, the note on the
 * left and what was found on the right. A sure match is ticked; an unsure one is offered
 * unticked, saying why. Untick, skip, stop, then save the ticked ones. The search goes on while
 * the sheet is open, and stops when it closes.
 */
export function FindCovers({ entries, files, scope, onClose, onSaved }: Props) {
  const [run] = useState(() => new CoverRun(entries, files, { ask: coverAsk(), hasImage: hasRemoteImage, readNote, fetchImageIntoVault, writeNote }));
  // The files as they are now, for naming each new cover: saving reads the vault again.
  useEffect(() => run.setFiles(files), [run, files]);
  useEffect(() => {
    run.start();
    return () => run.stop();
  }, [run]);
  const { rows, running, saving, secondsLeft } = useSyncExternalStore(run.subscribe, run.snapshot);
  const [filter, setFilter] = useState<Filter>('all');
  const [leaving, setLeaving] = useState(false);
  const [saved, setSaved] = useState<number>();

  const count = (status: RowStatus[]) => rows.filter((row) => status.includes(row.status)).length;
  const total = rows.length;
  const searched = total - count(['waiting', 'searching']);
  const found = rows.filter(isFound).length;
  const sureCount = rows.filter(sure).length;
  const ticked = rows.filter((row) => row.ticked && (row.status === 'found' || row.status === 'unsaved')).length;
  const unsaved = count(['unsaved']);
  const waiting = count(['waiting']);
  const kinds = new Set(rows.map((row) => row.entry.kind));
  const pace = [kinds.has('album') && 'MusicBrainz takes one search a second', kinds.has('podcast') && 'iTunes about twenty a minute'].filter(Boolean).join(', ');
  const tally = found ? ` · ${found} found, ${sureCount} sure` : '';

  const hint = saving
    ? `Saving ${count(['saved'])} of ${count(['saved', 'saving']) + ticked}…`
    : saved !== undefined
      ? `Saved ${plural(saved, 'cover')}.${unsaved ? ` ${unsaved} ${unsaved === 1 ? "wasn't" : "weren't"}; ${unsaved === 1 ? 'it says' : 'each says'} why.` : ''}${waiting ? ` ${waiting} not searched yet.` : ''}`
      : running
        ? `Searched ${searched} of ${total}${tally} · about ${minutes(secondsLeft)} left${pace ? `. ${pace}.` : '.'}`
        : waiting
          ? `Stopped at ${searched} of ${total}${tally}. Go on to search the rest.`
          : `Searched all ${total}${tally}. The ticked ones are saved; untick any that look wrong.`;

  // Not while saving: each cover is saved before the sheet goes. With ticked ones unsaved, it asks first.
  const close = () => {
    if (saving) return;
    if (ticked && !leaving) return setLeaving(true);
    run.stop();
    onClose();
  };
  useEscape(close);
  const save = async () => {
    setLeaving(false);
    const count = await run.save();
    setSaved(count);
    if (count) await onSaved();
  };
  const shown = rows.filter((row) => shows(filter, row));

  return (
    <div className="add-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()} data-testid="find-covers">
      <div className="add-sheet covers-sheet" role="dialog" aria-modal="true" aria-label="Find covers">
        <div className="add-top">
          <div>
            <p className="kicker">Find covers · {scope}</p>
            <h2 className="add-title">{plural(total, 'note')} without a cover</h2>
          </div>
          <button type="button" className="wizard-round is-small" onClick={close} disabled={saving} aria-label="Close" title="Close (Esc)" data-testid="covers-close">
            ×
          </button>
        </div>
        <div className="covers-progress">
          <div className="covers-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={searched} aria-label="Searched">
            <span style={{ width: `${total ? (searched / total) * 100 : 100}%` }} />
          </div>
          <p className="add-hint covers-hint" data-testid="covers-hint" aria-live="polite">
            {hint}
          </p>
          <div className="covers-filters" role="group" aria-label="Show">
            {FILTERS.map(([name, label]) => (
              <button
                key={name}
                type="button"
                className={filter === name ? 'chip-filter is-on' : 'chip-filter'}
                onClick={() => setFilter(name)}
                aria-pressed={filter === name}
                data-testid="covers-filter"
                data-filter={name}
              >
                {label} <span className="faint">{rows.filter((row) => shows(name, row)).length}</span>
              </button>
            ))}
          </div>
        </div>
        <ul className="covers-rows" data-testid="covers-rows">
          {shown.map((row) => (
            <CoverRow key={row.entry.path} row={row} run={run} />
          ))}
          {!shown.length && <li className="covers-empty">None here.</li>}
        </ul>
        <div className="covers-foot">
          {leaving ? (
            <>
              <span className="covers-leaving">
                {plural(ticked, 'ticked cover')} {ticked === 1 ? "isn't" : "aren't"} saved.
              </span>
              <button type="button" className="nav-chip" onClick={() => setLeaving(false)}>
                Keep looking
              </button>
              <button type="button" className="nav-chip" onClick={close} data-testid="covers-leave">
                Close without saving
              </button>
            </>
          ) : (
            waiting > 0 &&
            !saving && (
              <button type="button" className="nav-chip" onClick={() => (running ? run.stop() : run.start())} data-testid="covers-stop">
                {running ? 'Stop' : 'Go on'}
              </button>
            )
          )}
          <span className="nav-space" />
          {saved !== undefined && !ticked && !saving ? (
            <button type="button" className="primary-button" onClick={close} data-testid="covers-done">
              Done
            </button>
          ) : (
            <button type="button" className="primary-button" onClick={() => void save()} disabled={!ticked || saving} data-testid="covers-save">
              {saving ? 'Saving…' : `Save ${plural(ticked, 'cover')}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const STATUS: Partial<Record<RowStatus, string>> = {
  waiting: 'Waiting',
  searching: 'Searching…',
  none: 'Nothing found',
  saving: 'Saving…',
};

/** A note and what was found for it: its cover, what it is, and why it isn't sure or what it fills in. */
const CoverRow = memo(function CoverRow({ row, run }: { row: Row; run: CoverRun }) {
  const { entry, status } = row;
  const spec = kindSpec(entry.kind);
  const candidate = row.candidates[row.pick];
  const open = status === 'found' || status === 'unsaved';
  const fills = candidate && row.text !== undefined ? coverFills(spec, parseNote(row.text).properties, foundOf(candidate, entry.kind)) : [];
  const why =
    status === 'saved'
      ? `Saved as ${baseName(row.image ?? '')}`
      : status === 'failed' || status === 'unsaved'
        ? row.message
        : status === 'skipped'
          ? 'Skipped'
          : candidate
            ? [candidate.sure ? 'Sure' : candidate.doubt, fills.length ? `fills ${fills.map((fill) => fill.key).join(', ')}` : undefined].filter(Boolean).join(' · ')
            : undefined;
  return (
    <li className={`covers-row is-${status}`} data-testid="covers-row" data-path={entry.path} data-status={status} data-ticked={row.ticked}>
      <input
        type="checkbox"
        className="tick covers-tick"
        checked={row.ticked}
        disabled={!open || !candidate}
        onChange={(event) => run.tick(entry.path, event.target.checked)}
        aria-label={`Save the cover found for ${entry.title}`}
        data-testid="covers-tick"
      />
      <span className="covers-note">
        <span className="covers-title">{entry.title}</span>
        <span className="covers-meta">{[entry.maker, entry.year].filter(Boolean).join(' · ') || spec.one}</span>
      </span>
      {candidate ? (
        <LookupCover url={candidate.result.thumb} title={candidate.result.title} className={`covers-thumb is-${entry.kind}`} />
      ) : (
        <span className={`covers-thumb is-${entry.kind} is-empty`} aria-hidden="true" />
      )}
      <span className="covers-match">
        <span className={status === 'searching' ? 'covers-found is-searching' : 'covers-found'} data-testid="covers-found">
          {candidate ? describe(candidate) : status === 'failed' ? 'Not searched' : (STATUS[status] ?? '')}
        </span>
        {why && <span className="covers-why">{why}</span>}
      </span>
      <span className="covers-actions">
        {open && row.candidates.length > 1 && (
          <button type="button" className="covers-next" onClick={() => run.next(entry.path)} title="The next match" data-testid="covers-next">
            {row.pick + 1}/{row.candidates.length} ›
          </button>
        )}
        {status === 'skipped' ? (
          <button type="button" className="covers-next" onClick={() => run.unskip(entry.path)} data-testid="covers-unskip">
            Undo
          </button>
        ) : (
          status !== 'saved' &&
          status !== 'saving' && (
            <button type="button" className="covers-skip" onClick={() => run.skip(entry.path)} aria-label={`Skip ${entry.title}`} title="Skip" data-testid="covers-skip">
              ×
            </button>
          )
        )}
      </span>
    </li>
  );
});
