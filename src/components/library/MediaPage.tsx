import { useCallback, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { VaultFile } from '../../lib/api';
import type { LinkTarget } from '../../lib/completion';
import { parseNote } from '../../lib/frontmatter';
import { coverEmbed, field, keyIn, readEntry, type KindSpec } from '../../lib/library';
import { linkResolver } from '../../lib/links';
import { ErrorBoundary } from '../ErrorBoundary';
import { followPointer, order } from '../periodic/effects';
import { useVaultImage } from '../useVaultImage';
import { FindCover } from './FindCover';
import { RatingRing, ValueField } from './parts';
import { MediaLabels } from './MediaLabels';
import { AlbumTracks } from './AlbumTracks';
import { propertyList, type ListChange } from '../../lib/mediaProperties';
import { Thoughts } from './Thoughts';
import { NoteTitle } from '../workspace/NoteTitle';
import '../periodic/periodic.css';
import './library.css';

interface Props {
  spec: KindSpec;
  genreSuggestions?: string[];
  path: string;
  text: string;
  files: VaultFile[];
  onOpenLink: (target: string, fromPath: string, newTab?: boolean) => void;
  /** Writes one property of this note, over the note as it is on disk now. */
  onSetProperty: (key: string, value: string) => void;
  onSaveLists?: (changes: ListChange[]) => Promise<void>;
  /** Writes the note's own text, under its properties, link and cover, from `before` to `after`. */
  onSaveThoughts: (before: string, after: string) => Promise<void>;
  /** The page was left with text that couldn't be saved. */
  onUnsavedThoughts: (thoughts: string, message: string) => void;
  /** What `[[` offers while writing. */
  linkTargets: LinkTarget[];
  onEdit: () => void;
  onRename?: () => void;
  onOpenLibrary: () => void;
  /** Why the last change didn't reach the note, if it didn't. */
  warning?: string;
  /** A cover was found and saved for it (the note and a new image): read the vault again. */
  onCoverSaved?: () => Promise<void>;
}

const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/**
 * A rated album, film, book or podcast as a page, after Letterboxd's film page and Bookmory's
 * book page: the cover large over a soft backdrop blurred from it, the title in the serif, who
 * made it, its genres, its rating as a ring, and when it was listened to, watched or finished.
 * Setting the rating or a date writes that one property; the note's own text follows below, and
 * is written right there.
 */
export function MediaPage(props: Props) {
  const { spec, path, text, files, onOpenLink, onSetProperty, onSaveThoughts, onUnsavedThoughts, linkTargets, onEdit, onOpenLibrary, warning, onCoverSaved, onSaveLists } = props;
  const resolve = useMemo(() => linkResolver(files), [files]);
  const { properties, body } = useMemo(() => parseNote(text), [text]);
  const entry = useMemo(() => readEntry(path, text, resolve), [path, text, resolve]);
  const cover = useMemo(() => coverEmbed(body, path, resolve), [body, path, resolve]);
  const image = useVaultImage(cover?.file.path);
  // The text open for writing saves what is left before the whole note opens in the editor.
  const flushThoughts = useRef<() => Promise<boolean>>(undefined);
  const holdFlush = useCallback((flush: (() => Promise<boolean>) | undefined) => {
    flushThoughts.current = flush;
  }, []);
  const edit = () => void (flushThoughts.current?.() ?? Promise.resolve(true)).then((saved) => saved && onEdit());
  // Finding a cover for it, or another one.
  const [finding, setFinding] = useState(false);
  if (!entry) return null;

  // A value is written under the key the note already uses (`rating` or `Rating`), or the vault's usual one.
  const key = (name: string) => keyIn(properties, name) ?? name;
  const { keys } = spec;
  const facts = [entry.maker, entry.year].filter(Boolean);
  const took = entry.started && entry.date ? days(entry.started, entry.date) : undefined;

  return (
    <div
      className="periodic-frame media-frame"
      data-testid="media-page"
      data-path={path}
      data-kind={spec.kind}
      onPointerMove={(event: PointerEvent<HTMLDivElement>) => followPointer(event)}
    >
      {warning && (
        <p className="note-warning" data-testid="media-warning">
          {warning}
        </p>
      )}
      <header className={`media-hero glass rise is-${spec.kind}`} style={order(0)} data-testid="hero">
        {image.url ? (
          <div className="media-backdrop" aria-hidden="true">
            <img src={image.url} alt="" />
          </div>
        ) : (
          <div className="hero-aurora" aria-hidden="true" />
        )}
        <div className="media-veil" aria-hidden="true" />

        <div className={cover ? 'media-cover-slot has-cover' : 'media-cover-slot'} style={{ '--aspect': spec.aspect } as CSSProperties}>
          {image.url ? (
            <img className="media-cover" src={image.url} alt={entry.title} data-testid="vault-image" />
          ) : (
            <span className="media-cover is-blank">{entry.title}</span>
          )}
          {spec.source && onCoverSaved && (
            <button type="button" className="nav-chip media-cover-find" onClick={() => setFinding(true)} data-testid="find-cover-open">
              {cover ? 'Change cover' : 'Find cover'}
            </button>
          )}
        </div>
        {finding &&
          spec.source &&
          onCoverSaved &&
          createPortal(
            <ErrorBoundary label="Finding a cover" frame={(message) => <div className="add-backdrop" onMouseDown={() => setFinding(false)}>{message}</div>}>
              <FindCover spec={{ ...spec, source: spec.source }} path={path} text={text} files={files} change={Boolean(cover)} onClose={() => setFinding(false)} onSaved={onCoverSaved} />
            </ErrorBoundary>,
            document.body,
          )}

        <div className="media-main">
          <p className="kicker">
            {spec.one}
            {entry.date && <span className="media-kicker-date"> · {spec.dateLabel.toLowerCase()} {entry.date}</span>}
          </p>
          <NoteTitle className="hero-title media-title" title={entry.title} onRename={props.onRename} />
          {facts.length > 0 && (
            <p className="media-byline">
              {entry.maker && <span className="media-maker">{entry.maker}</span>}
              {entry.maker && entry.year && <span className="faint"> · </span>}
              {entry.year && <span className="media-year">{entry.year}</span>}
            </p>
          )}
          {onSaveLists ? <>
            {keys.genre && <MediaLabels suggestions={props.genreSuggestions} label="Genres" property={key(keys.genre)} values={propertyList(field(properties, keys.genre))} onSave={onSaveLists} />}
            <MediaLabels label="Tags" property={key('tags')} values={propertyList(field(properties, 'tags'))} onSave={onSaveLists} />
          </> : <ul className="media-genres" data-testid="media-genres">{entry.genres.map((genre) => <li key={genre} className="media-genre">{genre}</li>)}</ul>}
          <div className="media-fields">
            <ValueField label={spec.dateLabel} value={entry.date} kind="date" onCommit={(value) => onSetProperty(key(keys.date), value)} testId="media-date" />
            {keys.started && (
              <ValueField label="Started" value={entry.started} kind="date" onCommit={(value) => onSetProperty(key(keys.started ?? 'Started'), value)} testId="media-started" />
            )}
            {took !== undefined && took >= 0 && <p className="media-took">read in {took === 1 ? 'a day' : `${took} days`}</p>}
          </div>
        </div>

        <div className="media-aside">
          <RatingRing value={entry.rating} onSet={(value) => onSetProperty(key(keys.rating), String(value))} />
          <ValueField label="Rating" value={entry.rating === undefined ? undefined : String(entry.rating)} kind="rating" onCommit={(value) => onSetProperty(key(keys.rating), value)} testId="rating-field" />
        </div>

        <nav className="hero-nav media-nav">
          <button type="button" className="nav-chip" onClick={onOpenLibrary} data-testid="media-library">
            ← {spec.tab}
          </button>
          <span className="nav-space" />
          <span className="media-path" title="The note">
            {path}
          </span>
          <button type="button" className="nav-chip is-action" onClick={edit} data-testid="edit-note">
            Edit note
          </button>
        </nav>
      </header>

      {spec.kind === 'album' && onSaveLists ? <AlbumTracks title={entry.title} maker={entry.maker} tracks={propertyList(field(properties, 'tracks'))} favorites={entry.tracks} favoriteKey={key(keys.tracks ?? 'favorite tracks')} onSave={onSaveLists} /> : entry.tracks.length > 0 && <section className="card glass media-tracks" data-testid="media-tracks"><p className="tile-label">Favorite tracks</p><ol>{entry.tracks.map((track) => <li key={track}><span>{/^\d+$/.test(track) ? `Track ${track}` : track}</span><span className="track-star">★</span></li>)}</ol></section>}

      <Thoughts
        spec={spec}
        path={path}
        text={text}
        files={files}
        cover={cover?.link}
        onOpenLink={onOpenLink}
        linkTargets={linkTargets}
        onSave={onSaveThoughts}
        onUnsaved={onUnsavedThoughts}
        onFlush={holdFlush}
      />
    </div>
  );
}
