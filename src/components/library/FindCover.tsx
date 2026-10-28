import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { fetchImageIntoVault, readNote, writeNote, type VaultFile } from '../../lib/api';
import { coverFills } from '../../lib/coverEdits';
import { foundOf, saveFound } from '../../lib/coverRun';
import { findCover, rankResults, searchTitle, wantedOf, type Candidate } from '../../lib/covers';
import { parseNote } from '../../lib/frontmatter';
import { readEntry, type KindSpec } from '../../lib/library';
import { linkResolver } from '../../lib/links';
import { parseSearch, readDetails, searchRequests, SOURCE_NAMES, type LookupResult, type Service, type Source } from '../../lib/lookup';
import { useEscape } from '../calendar/useEscape';
import { order } from '../periodic/effects';
import { LookupCover } from './parts';
import { coverAsk, hasRemoteImage } from './remoteImage';

interface Props {
  spec: KindSpec & { source: Source };
  path: string;
  /** The note as the page shows it: the cover is written only while the note still holds this. */
  text: string;
  files: VaultFile[];
  /** Point the cover it has at a new image, rather than add one. */
  change: boolean;
  onClose: () => void;
  /** The cover was saved: read the vault again. */
  onSaved: () => Promise<void>;
}

/** At most this many found covers are offered at once. */
const SHOWN = 8;

type Found = { state: 'searching' } | { state: 'done'; candidates: Candidate[]; typed: boolean } | { state: 'failed'; message: string };

const reason = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Finds a cover for one note, on its page: the note's kind is searched by its title and maker
 * (and year), and the best few covers found are offered, the best first and chosen when it is
 * sure. Other words can be searched. Saving downloads the chosen cover into the kind's
 * _attachments and embeds it, filling the maker, year and genres the note leaves empty; changing
 * a cover only points its embed at the new image, and the old one stays.
 */
export function FindCover({ spec, path, text, files, change, onClose, onSaved }: Props) {
  const entry = useMemo(() => readEntry(path, text, linkResolver(files)), [path, text, files]);
  const wanted = useMemo(() => (entry ? wantedOf(entry) : undefined), [entry]);
  const first = entry ? [searchTitle(entry.title), entry.maker].filter(Boolean).join(' ') : '';
  const [ask] = useState(coverAsk);
  const [query, setQuery] = useState(first);
  const [asked, setAsked] = useState<string>();
  const [found, setFound] = useState<Found>({ state: 'searching' });
  const [picked, setPicked] = useState<number>();
  const [missing, setMissing] = useState<ReadonlySet<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  // A typed search's results, with the details read once one is picked: what saving it fills in.
  const [details, setDetails] = useState<ReadonlyMap<string, LookupResult>>(new Map());
  // Not while saving: the cover is saved before the sheet goes.
  const close = () => !saving && onClose();
  useEscape(close);

  // The note's own search first; then whatever is typed and sent.
  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    const search = asked
      ? (async () => {
          const requests = searchRequests(spec.source, asked);
          const answers = await Promise.all(requests.map(async ({ service, url }) => [service, await ask(url).catch(() => undefined)] as const));
          const answered = Object.fromEntries(answers.filter(([, answer]) => answer !== undefined)) as Partial<Record<Service, unknown>>;
          if (requests.length && !Object.keys(answered).length) throw new Error(`${SOURCE_NAMES[spec.source]} didn't answer`);
          return { candidates: rankResults(wanted, parseSearch(spec.source, answered)), typed: true };
        })()
      : findCover(wanted, { ask, hasImage: hasRemoteImage }).then((candidates) => ({ candidates, typed: false }));
    search
      .then((done) => {
        if (cancelled) return;
        setFound({ state: 'done', ...done });
        setPicked(done.candidates[0]?.sure ? 0 : undefined);
      })
      .catch((err: unknown) => !cancelled && setFound({ state: 'failed', message: reason(err) }));
    return () => {
      cancelled = true;
    };
  }, [wanted, asked, ask, spec.source]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const words = query.trim();
    if (words.length < 2) return;
    setFound({ state: 'searching' });
    setPicked(undefined);
    setAsked(words);
  };

  const candidates = found.state === 'done' ? found.candidates.slice(0, SHOWN) : [];
  const picks = picked === undefined ? undefined : candidates[picked];
  const chosen = picks && { ...picks, result: details.get(picks.result.id) ?? picks.result };
  // A typed search's result has its details read once it is picked, for the maker, year and genres saving it fills.
  const reading = Boolean(picks && found.state === 'done' && found.typed && !details.has(picks.result.id) && (picks.result.details ?? picks.result.wikidata));
  useEffect(() => {
    if (!reading || !picks) return;
    const result = picks.result;
    let cancelled = false;
    void readDetails(result, ask)
      .catch(() => result)
      .then((read) => !cancelled && setDetails((prev) => new Map(prev).set(result.id, read)));
    return () => {
      cancelled = true;
    };
  }, [reading, picks, ask]);
  const fills = chosen && !change && entry ? coverFills(spec, parseNote(text).properties, foundOf(chosen, entry.kind)) : [];
  const source = SOURCE_NAMES[spec.source];
  const hint =
    found.state === 'searching'
      ? `Asking ${source}…`
      : found.state === 'failed'
        ? `${source} didn't answer: ${found.message}.`
        : !candidates.length
          ? `Nothing on ${source} could be ${found.typed ? `“${asked ?? ''}”` : 'this one'}. Try other words.`
          : candidates[0]?.sure && !found.typed
            ? 'The first is the one: it agrees with what the note says. Save it, or pick another.'
            : `None is sure to be this one. Pick the right cover, or try other words.`;

  const save = async () => {
    if (!chosen) return;
    setSaving(true);
    setError(undefined);
    try {
      await saveFound({ path, expected: text, candidate: chosen, files, change }, { readNote, fetchImageIntoVault, writeNote });
      await onSaved();
      onClose();
    } catch (err) {
      setSaving(false);
      setError(`The cover wasn't saved: ${reason(err)}.`);
    }
  };

  if (!entry) return null;
  return (
    <div className="add-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()} data-testid="find-cover">
      <div className="add-sheet cover-picker" role="dialog" aria-modal="true" aria-label={change ? 'Change the cover' : 'Find a cover'}>
        <div className="add-top">
          <div>
            <p className="kicker">
              {change ? 'Change the cover' : 'Find a cover'} · {source}
            </p>
            <h2 className="add-title">{entry.title}</h2>
          </div>
          <button type="button" className="wizard-round is-small" onClick={close} disabled={saving} aria-label="Close" title="Close (Esc)">
            ×
          </button>
        </div>
        <div className="add-body">
          <form onSubmit={submit}>
            <input className="add-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Other words to search" spellCheck={false} data-testid="cover-search" />
          </form>
          <p className="add-hint" data-testid="cover-hint">
            {hint}
          </p>
          <ul className="cover-choices" style={{ '--aspect': spec.aspect } as CSSProperties}>
            {candidates.map((candidate, i) => {
              const gone = missing.has(candidate.result.thumb ?? '');
              return (
                <li key={candidate.result.id} className="rise" style={order(Math.min(i, 8))}>
                  <button
                    type="button"
                    className="cover-choice"
                    onClick={() => setPicked(i)}
                    aria-pressed={picked === i}
                    disabled={gone || saving}
                    data-testid="cover-choice"
                    data-id={candidate.result.id}
                    data-sure={candidate.sure}
                  >
                    <LookupCover
                      url={candidate.result.thumb}
                      title={candidate.result.title}
                      className="cover-choice-image"
                      onFound={(there) => !there && setMissing((prev) => new Set(prev).add(candidate.result.thumb ?? ''))}
                    />
                    <span className="cover-choice-title">{candidate.result.title}</span>
                    <span className="cover-choice-meta">{[candidate.result.maker !== candidate.result.title ? candidate.result.maker : undefined, candidate.episode?.year ?? candidate.result.year].filter(Boolean).join(' · ')}</span>
                    <span className={candidate.sure ? 'cover-choice-why is-sure' : 'cover-choice-why'}>{gone ? 'no cover there' : candidate.sure ? 'Best match' : candidate.doubt}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {chosen && (
            <p className="add-where" data-testid="cover-where">
              {change ? 'Saves the new cover beside the old one, which stays, and points the note at it' : `Saves the cover in Rating/${spec.folder}/_attachments`}
              {fills.length > 0 && <> and fills {fills.map((fill) => fill.key).join(', ')}</>}.
            </p>
          )}
          {error && (
            <p className="form-error" role="alert" data-testid="cover-error">
              {error}
            </p>
          )}
          <div className="add-actions">
            <button type="button" className="nav-chip" onClick={close} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="primary-button" onClick={() => void save()} disabled={!chosen || saving || reading} data-testid="cover-save">
              {saving ? 'Saving…' : change ? 'Use this cover' : 'Save cover'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
