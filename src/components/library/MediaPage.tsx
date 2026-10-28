import { useMemo, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import type { VaultFile } from '../../lib/api';
import { parseNote } from '../../lib/frontmatter';
import { bodyWithoutCover, coverEmbed, keyIn, readEntry, type KindSpec } from '../../lib/library';
import { linkResolver } from '../../lib/links';
import { NoteMarkdown } from '../NoteMarkdown';
import { followPointer, order } from '../periodic/effects';
import { useVaultImage } from '../useVaultImage';
import { RatingRing, ValueField } from './parts';
import '../periodic/periodic.css';
import './library.css';

interface Props {
  spec: KindSpec;
  path: string;
  text: string;
  files: VaultFile[];
  onOpenLink: (target: string, fromPath: string) => void;
  /** Writes one property of this note, over the note as it is on disk now. */
  onSetProperty: (key: string, value: string) => void;
  onEdit: () => void;
  onOpenLibrary: () => void;
  /** Why the last change didn't reach the note, if it didn't. */
  warning?: string;
  /** Under the page: the backlinks. */
  footer?: ReactNode;
}

const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/**
 * A rated album, film, book or podcast as a page, after Letterboxd's film page and Bookmory's
 * book page: the cover large over a soft backdrop blurred from it, the title in the serif, who
 * made it, its genres, its rating as a ring, and when it was listened to, watched or finished.
 * Setting the rating or a date writes that one property; the note's own text follows below.
 */
export function MediaPage({ spec, path, text, files, onOpenLink, onSetProperty, onEdit, onOpenLibrary, warning, footer }: Props) {
  const resolve = useMemo(() => linkResolver(files), [files]);
  const { properties, body } = useMemo(() => parseNote(text), [text]);
  const entry = useMemo(() => readEntry(path, text, resolve), [path, text, resolve]);
  const cover = useMemo(() => coverEmbed(body, path, resolve), [body, path, resolve]);
  const shown = useMemo(() => bodyWithoutCover(body, cover?.link).trim(), [body, cover]);
  const image = useVaultImage(cover?.file.path);
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

        <div className="media-cover-slot" style={{ '--aspect': spec.aspect } as CSSProperties}>
          {image.url ? (
            <img className="media-cover" src={image.url} alt={entry.title} data-testid="vault-image" />
          ) : (
            <span className="media-cover is-blank">{entry.title}</span>
          )}
        </div>

        <div className="media-main">
          <p className="kicker">
            {spec.one}
            {entry.date && <span className="media-kicker-date"> · {spec.dateLabel.toLowerCase()} {entry.date}</span>}
          </p>
          <h1 className="hero-title media-title" data-testid="note-title">
            {entry.title}
          </h1>
          {facts.length > 0 && (
            <p className="media-byline">
              {entry.maker && <span className="media-maker">{entry.maker}</span>}
              {entry.maker && entry.year && <span className="faint"> · </span>}
              {entry.year && <span className="media-year">{entry.year}</span>}
            </p>
          )}
          {entry.genres.length > 0 && (
            <ul className="media-genres" data-testid="media-genres">
              {entry.genres.map((genre) => (
                <li key={genre} className="media-genre">
                  {genre}
                </li>
              ))}
            </ul>
          )}
          <div className="media-fields">
            <ValueField label={spec.dateLabel} value={entry.date} kind="date" today onCommit={(value) => onSetProperty(key(keys.date), value)} testId="media-date" />
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
          <button type="button" className="nav-chip is-action" onClick={onEdit} data-testid="edit-note">
            Edit note
          </button>
        </nav>
      </header>

      {entry.tracks.length > 0 && (
        <section className="card glass rise media-tracks" style={order(1)} data-testid="media-tracks">
          <p className="tile-label">Favorite tracks</p>
          <ol>
            {entry.tracks.map((track, i) => (
              <li key={`${track}-${i}`}>
                <span className="media-track-number">{String(i + 1).padStart(2, '0')}</span>
                <span>{/^\d+$/.test(track) ? `Track ${track}` : track}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {shown && (
        <section className="card glass rise media-text" style={order(2)} data-testid="media-text">
          <NoteMarkdown path={path} body={shown} files={files} onOpenLink={onOpenLink} />
        </section>
      )}
      {footer && <div className="media-footer">{footer}</div>}
    </div>
  );
}
