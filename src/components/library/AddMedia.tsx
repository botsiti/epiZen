import { useEffect, useState, type FormEvent } from 'react';
import { createNote, fetchImageIntoVault, lookupJson, type VaultFile } from '../../lib/api';
import {
  coverPath,
  draftProblem,
  findOverview,
  genreName,
  isoDate,
  mediaNoteText,
  noteFileName,
  notePath,
  type KindSpec,
  type MediaDraft,
} from '../../lib/library';
import { formatDate } from '../../lib/dates';
import { readDay } from '../../lib/datePicker';
import { episodeLength, filterEpisodes, parseEpisodes, parseResults, searchUrl, SOURCE_NAMES, withDetails, type EpisodeResult, type LookupResult } from '../../lib/lookup';
import { useEscape } from '../calendar/useEscape';
import { DateField } from '../DateField';
import { order } from '../periodic/effects';
import { LookupCover, RatingRing } from './parts';

interface Props {
  spec: KindSpec & { source: NonNullable<KindSpec['source']> };
  files: VaultFile[];
  today: Date;
  onClose: () => void;
  /** The note was created: read the vault again and open it. */
  onCreated: (path: string) => Promise<void>;
}

type Search = { state: 'idle' } | { state: 'loading' } | { state: 'done'; results: LookupResult[] } | { state: 'error'; message: string };

const reason = (err: unknown) => (err instanceof Error ? err.message : String(err));

const a = (word: string) => `${/^[aeiou]/.test(word) ? 'an' : 'a'} ${word}`;

/**
 * Adds an album, film, book or podcast episode, after Bookmory's search and add form: search as
 * you type, pick a result (for a podcast, a show and then one of its episodes), check what it
 * filled in, set the rating and the date, save. Saving downloads the cover into the kind's
 * `_attachments` folder and writes the note in the vault's format.
 */
export function AddMedia({ spec, files, today, onClose, onCreated }: Props) {
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState<{ url: string; search: Search }>();
  // A podcast's show, picked: its episodes are listed to pick one from.
  const [show, setShow] = useState<LookupResult>();
  const [picked, setPicked] = useState<LookupResult>();
  const [manual, setManual] = useState(false);
  const url = searchUrl(spec.source, query);

  // Asks once typing pauses. An answer to an older question is dropped.
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setAnswer({ url, search: { state: 'loading' } });
      lookupJson(url)
        .then((json) => !cancelled && setAnswer({ url, search: { state: 'done', results: parseResults(spec.source, json) } }))
        .catch((err: unknown) => !cancelled && setAnswer({ url, search: { state: 'error', message: reason(err) } }));
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [url, spec.source]);
  // While the next answer is on its way, the last results stay.
  const search: Search = !url ? { state: 'idle' } : answer?.url === url ? answer.search : { state: 'loading' };
  const results = search.state === 'done' ? search.results : url && answer?.search.state === 'done' ? answer.search.results : [];

  const form = picked !== undefined || manual;
  const back = () => {
    setPicked(undefined);
    setManual(false);
  };
  // Escape steps back: from the form to the list it came from, from a show's episodes to the shows, then out.
  useEscape(() => {
    if (form) return back();
    if (show) return setShow(undefined);
    onClose();
  });
  const episode = spec.kind === 'podcast';

  return (
    <div className="add-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()} data-testid="media-add">
      <div className="add-sheet" role="dialog" aria-modal="true" aria-label={`Add ${a(episode ? 'episode' : spec.one)}`}>
        <div className="add-top">
          <div>
            <p className="kicker">
              Add {a(episode ? 'podcast episode' : spec.one)} · {SOURCE_NAMES[spec.source]}
            </p>
            <h2 className="add-title">{form ? 'Rate it' : show ? 'Pick the episode' : episode ? 'Find the show' : `Find ${a(spec.one)}`}</h2>
          </div>
          <button type="button" className="wizard-round is-small" onClick={onClose} aria-label="Close" title="Close (Esc)">
            ×
          </button>
        </div>
        {form ? (
          <AddForm
            key={picked?.id ?? 'manual'}
            spec={spec}
            files={files}
            today={today}
            result={picked}
            backLabel={show ? '← Episodes' : '← Results'}
            onBack={back}
            onCreated={onCreated}
          />
        ) : show ? (
          <Episodes
            show={show}
            onPick={setPicked}
            onManual={() => setPicked({ id: `manual-${show.id}`, title: '', maker: show.title, genres: show.genres, thumb: show.thumb, cover: show.cover })}
            onBack={() => setShow(undefined)}
          />
        ) : (
          <div className="add-body">
            <input
              className="add-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={{ album: 'Album or artist', film: 'Film title', book: 'Title or author', podcast: 'Show or host', video: '' }[spec.kind]}
              autoFocus
              spellCheck={false}
              data-testid="add-search"
            />
            <p className="add-hint">
              {search.state === 'loading'
                ? `Asking ${SOURCE_NAMES[spec.source]}…`
                : search.state === 'error'
                  ? `${SOURCE_NAMES[spec.source]} didn't answer: ${search.message}.`
                  : search.state === 'done' && !search.results.length
                    ? `Nothing found for “${query.trim()}”.`
                    : `Searches ${SOURCE_NAMES[spec.source]} as you type${episode ? ', then lists the show’s episodes' : ''}. Nothing is sent until you do.`}
            </p>
            <ul className="add-results">
              {results.map((result, i) => (
                  <li key={result.id} className="rise" style={order(i)}>
                    <ResultCard spec={spec} result={result} onPick={(found) => (found.episodes ? setShow(found) : setPicked(found))} />
                  </li>
              ))}
              <li>
                <button type="button" className="add-result is-manual" onClick={() => setManual(true)} data-testid="add-manual">
                  <span className="add-result-plus" aria-hidden="true">
                    +
                  </span>
                  <span className="add-result-text">
                    <span className="add-result-title">Not there? Enter it yourself</span>
                    <span className="add-result-meta">An empty form, without a cover</span>
                  </span>
                </button>
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultCard({ spec, result, onPick }: { spec: KindSpec; result: LookupResult; onPick: (result: LookupResult) => void }) {
  const [reading, setReading] = useState(false);
  // A MusicBrainz album's genres are on its own page, read once it is picked.
  const pick = () => {
    if (!result.details) return onPick(result);
    setReading(true);
    lookupJson(result.details)
      .then((answer) => onPick(withDetails(result, answer)))
      .catch(() => onPick(result));
  };
  return (
    <button type="button" className="add-result" onClick={pick} disabled={reading} data-testid="add-result" data-id={result.id}>
      <LookupCover url={result.thumb} title={result.title} className={`add-result-cover is-${spec.kind}`} />
      <span className="add-result-text">
        <span className="add-result-title">{result.title}</span>
        <span className="add-result-meta">{[result.maker, result.year].filter(Boolean).join(' · ')}</span>
        {(result.note || result.genres.length > 0) && <span className="add-result-note">{[result.note, ...result.genres].filter(Boolean).join(' · ')}</span>}
      </span>
      {reading && <span className="add-result-reading">Reading…</span>}
    </button>
  );
}

function AddForm({
  spec,
  files,
  today,
  result,
  backLabel,
  onBack,
  onCreated,
}: {
  spec: KindSpec;
  files: VaultFile[];
  today: Date;
  result?: LookupResult;
  backLabel: string;
  onBack: () => void;
  onCreated: (path: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<MediaDraft>(() => ({
    title: result?.title ?? '',
    maker: result?.maker ?? '',
    year: result?.year ?? '',
    genres: result?.genres ?? [],
    rating: '',
    date: isoDate(today),
    started: '',
  }));
  const [genre, setGenre] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  // A cover that couldn't be downloaded: the next Save goes on without it.
  const [noCover, setNoCover] = useState(!result?.cover);
  const set = (patch: Partial<MediaDraft>) => setDraft((prev) => ({ ...prev, ...patch }));
  const target = notePath(spec, draft.title, files);
  const addGenre = () => {
    const name = genreName(genre);
    if (name && !draft.genres.map(genreName).includes(name)) set({ genres: [...draft.genres, name] });
    setGenre('');
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const problem = draftProblem(draft) ?? (target.taken ? `There is a note called “${target.path.split('/').pop()}” already. Change the title to keep both.` : undefined);
    if (problem) return setError(problem);
    setSaving(true);
    setError(undefined);
    let cover: string | undefined;
    if (result?.cover && !noCover) {
      try {
        cover = await fetchImageIntoVault(result.cover, coverPath(spec, draft.title, files));
      } catch (err) {
        setSaving(false);
        setNoCover(true);
        return setError(`The cover couldn't be downloaded: ${reason(err)}. Save again to add the ${spec.one} without it.`);
      }
    }
    const year = Number((draft.date || isoDate(today)).slice(0, 4));
    const text = mediaNoteText(spec, draft, { overview: findOverview(spec, files, year), cover });
    try {
      await createNote(target.path, text);
    } catch (err) {
      setSaving(false);
      return setError(`The note wasn't created: ${reason(err)}.${cover ? ` Its cover was saved as ${cover}.` : ''}`);
    }
    await onCreated(target.path);
  };

  const rating = /^\d{1,3}$/.test(draft.rating) ? Math.min(100, Number(draft.rating)) : undefined;
  return (
    <form className="add-body add-form" onSubmit={(event) => void save(event)} data-testid="add-form">
      <div className="add-form-cover">
        <LookupCover url={noCover ? undefined : result?.cover} title={draft.title || 'No cover'} className={`add-cover is-${spec.kind}`} onFound={(found) => !found && setNoCover(true)} />
        <RatingRing value={rating} onSet={(value) => set({ rating: String(value) })} size={136} />
      </div>
      <div className="add-fields">
        <label className="field">
          <span>Title</span>
          <input value={draft.title} onChange={(event) => set({ title: event.target.value })} data-testid="add-title" />
        </label>
        <div className="add-pair">
          <label className="field">
            <span>{spec.makerLabel}</span>
            <input value={draft.maker} onChange={(event) => set({ maker: event.target.value })} data-testid="add-maker" />
          </label>
          {spec.keys.year && (
            <label className="field is-short">
              <span>Year</span>
              <input value={draft.year} inputMode="numeric" onChange={(event) => set({ year: event.target.value })} data-testid="add-year" />
            </label>
          )}
        </div>
        <div className="field">
          <span>Genres</span>
          <div className="add-genres">
            {draft.genres.map((name) => (
              <button key={name} type="button" className="media-genre is-removable" onClick={() => set({ genres: draft.genres.filter((g) => g !== name) })} title={`Remove ${name}`}>
                {name} <span aria-hidden="true">×</span>
              </button>
            ))}
            <input
              value={genre}
              onChange={(event) => setGenre(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ',') {
                  event.preventDefault();
                  addGenre();
                }
              }}
              onBlur={addGenre}
              placeholder="add a genre"
              data-testid="add-genre"
            />
          </div>
        </div>
        <div className="add-pair">
          <label className="field is-short">
            <span>Rating</span>
            <input value={draft.rating} inputMode="numeric" placeholder="0–100" onChange={(event) => set({ rating: event.target.value.trim() })} data-testid="add-rating" />
          </label>
          <label className="field">
            <span>{spec.dateLabel}</span>
            <DateField value={draft.date} onChange={(date) => set({ date })} label={spec.dateLabel} today={today} testId="add-date" />
          </label>
          {spec.keys.started && (
            <label className="field">
              <span>Started</span>
              <DateField value={draft.started} onChange={(started) => set({ started })} label="Started" today={today} testId="add-started" />
            </label>
          )}
        </div>
        {noteFileName(draft.title) && (
          <p className={target.taken ? 'add-where is-taken' : 'add-where'} data-testid="add-where">
            {target.taken ? 'Taken: ' : 'Saves '}
            <code>{target.path}</code>
            {!noCover && result?.cover && <> and its cover in _attachments</>}
          </p>
        )}
        {error && (
          <p className="form-error" role="alert" data-testid="add-error">
            {error}
          </p>
        )}
        <div className="add-actions">
          <button type="button" className="nav-chip" onClick={onBack} data-testid="add-back">
            {backLabel}
          </button>
          <button type="submit" className="primary-button" disabled={saving} data-testid="add-save">
            {saving ? 'Saving…' : `Save ${spec.kind === 'podcast' ? 'episode' : spec.one}`}
          </button>
        </div>
      </div>
    </form>
  );
}

// At most this many episodes are drawn at once; typing narrows them.
const SHOWN_EPISODES = 60;

type Listing = { state: 'loading' } | { state: 'done'; episodes: EpisodeResult[] } | { state: 'error'; message: string };

/** A picked show's latest episodes, newest first, narrowed by what is typed (here, without asking again). */
function Episodes({ show, onPick, onManual, onBack }: { show: LookupResult; onPick: (episode: EpisodeResult) => void; onManual: () => void; onBack: () => void }) {
  const [listing, setListing] = useState<Listing>({ state: 'loading' });
  const [filter, setFilter] = useState('');
  useEffect(() => {
    if (!show.episodes) return;
    let cancelled = false;
    lookupJson(show.episodes)
      .then((json) => !cancelled && setListing({ state: 'done', episodes: parseEpisodes(json, show) }))
      .catch((err: unknown) => !cancelled && setListing({ state: 'error', message: reason(err) }));
    return () => {
      cancelled = true;
    };
  }, [show]);
  const episodes = listing.state === 'done' ? listing.episodes : [];
  const shown = filterEpisodes(episodes, filter);
  const words = filter.trim();
  return (
    <div className="add-body" data-testid="add-episodes">
      <div className="add-show">
        <LookupCover url={show.thumb} title={show.title} className="add-result-cover is-podcast" />
        <span className="add-result-text">
          <span className="add-result-title" data-testid="add-show-title">
            {show.title}
          </span>
          <span className="add-result-meta">{show.maker}</span>
          {(show.note || show.genres.length > 0) && <span className="add-result-note">{[show.note, ...show.genres].filter(Boolean).join(' · ')}</span>}
        </span>
        <button type="button" className="nav-chip" onClick={onBack} data-testid="add-shows">
          ← Shows
        </button>
      </div>
      <input
        className="add-search"
        type="search"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Filter by title or guest"
        autoFocus
        spellCheck={false}
        data-testid="episode-filter"
      />
      <p className="add-hint" data-testid="episode-hint">
        {listing.state === 'loading'
          ? 'Asking iTunes for its episodes…'
          : listing.state === 'error'
            ? `iTunes didn't answer: ${listing.message}.`
            : !episodes.length
              ? 'iTunes lists no episodes for this show.'
              : words && !shown.length
                ? `No episode here has “${words}”.`
                : `${words ? `${shown.length} of the` : 'The'} latest ${episodes.length} episodes${shown.length > SHOWN_EPISODES ? `, the first ${SHOWN_EPISODES} shown` : ''}. Typing narrows them here; nothing more is sent.`}
      </p>
      <ul className="add-results">
        {shown.slice(0, SHOWN_EPISODES).map((found, i) => (
          <li key={found.id} className="rise" style={order(Math.min(i, 10))}>
            <EpisodeRow episode={found} onPick={onPick} />
          </li>
        ))}
        <li>
          <button type="button" className="add-result is-manual" onClick={onManual} data-testid="add-manual">
            <span className="add-result-plus" aria-hidden="true">
              +
            </span>
            <span className="add-result-text">
              <span className="add-result-title">Not there? Enter it yourself</span>
              <span className="add-result-meta">The form with {show.title} filled in</span>
            </span>
          </button>
        </li>
      </ul>
    </div>
  );
}

/** An episode: the day it came out as a small calendar leaf, its title, its date and length, and the start of what it is about. */
function EpisodeRow({ episode, onPick }: { episode: EpisodeResult; onPick: (episode: EpisodeResult) => void }) {
  const released = readDay(episode.released);
  return (
    <button type="button" className="add-result add-episode" onClick={() => onPick(episode)} data-testid="add-episode" data-id={episode.id}>
      <span className="add-episode-leaf" aria-hidden="true">
        {released ? (
          <>
            <span className="add-episode-month">{formatDate(released, 'MMM')}</span>
            <span className="add-episode-day">{released.getDate()}</span>
            <span className="add-episode-year">{released.getFullYear()}</span>
          </>
        ) : (
          <span className="add-episode-month">—</span>
        )}
      </span>
      <span className="add-result-text">
        <span className="add-result-title">{episode.title}</span>
        <span className="add-result-meta">{[released && formatDate(released, 'D MMMM YYYY'), episode.minutes && episodeLength(episode.minutes)].filter(Boolean).join(' · ')}</span>
        {episode.about && <span className="add-episode-about">{episode.about}</span>}
      </span>
    </button>
  );
}
