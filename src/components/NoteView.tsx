import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { readNote, type VaultFile } from '../lib/api';
import { formatValue, parseNote, type Properties } from '../lib/frontmatter';
import { noteFolder, noteTitle, resolveLink } from '../lib/links';
import { parseVaultUrl, remarkCallouts, remarkWikilinks, urlTransform } from '../lib/markdown';
import { VaultImage } from './VaultImage';

const remarkPlugins = [remarkGfm, remarkCallouts, remarkWikilinks];

interface NoteProps {
  path: string;
  files: VaultFile[];
  onOpenLink: (target: string, fromPath: string) => void;
}

/** Loads a note from the vault and shows it. Read-only. */
export function NoteView({ path, files, onOpenLink }: NoteProps) {
  const [note, setNote] = useState<{ path: string; text?: string; error?: string }>({ path });

  useEffect(() => {
    let cancelled = false;
    readNote(path)
      .then((text) => !cancelled && setNote({ path, text }))
      .catch((err: unknown) => !cancelled && setNote({ path, error: String(err) }));
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (note.path !== path) return null;
  if (note.error !== undefined) {
    return (
      <section className="screen" data-testid="note-error">
        <p className="eyebrow">Couldn't read this note</p>
        <h1>{noteTitle(path)}</h1>
        <p className="muted">{note.error}</p>
      </section>
    );
  }
  if (note.text === undefined) return null;
  return <NoteContent path={path} text={note.text} files={files} onOpenLink={onOpenLink} />;
}

export function NoteContent({ path, text, files, onOpenLink }: NoteProps & { text: string }) {
  const { properties, body, error } = useMemo(() => parseNote(text), [text]);

  const components = useMemo<Components>(
    () => ({
      a({ href, children }) {
        const link = parseVaultUrl(href);
        if (link?.kind === 'link') {
          const found = resolveLink(link.target, files, path);
          // A plain link to an image has nowhere to go yet, so it shouldn't look clickable.
          if (found?.kind === 'image') return <span className="wikilink-file">{children}</span>;
          const open = (event: MouseEvent) => {
            event.preventDefault();
            onOpenLink(link.target, path);
          };
          return (
            <a href="#" className={found ? 'wikilink' : 'wikilink is-missing'} data-wikilink={link.target} onClick={open}>
              {children}
            </a>
          );
        }
        // Opening the system browser isn't wired up yet; never navigate the app window away.
        return (
          <a href={href} className="external" title={href} onClick={(event) => event.preventDefault()}>
            {children}
          </a>
        );
      },
      img({ src, alt, width }) {
        const embed = parseVaultUrl(typeof src === 'string' ? src : undefined);
        if (embed?.kind !== 'embed') return <span className="embed-missing">{alt}</span>;
        const file = resolveLink(embed.target, files, path);
        if (file?.kind === 'image') {
          return <VaultImage path={file.path} alt={alt ?? embed.target} width={width ? Number(width) : undefined} />;
        }
        return <EmbedLink target={embed.target} found={Boolean(file)} onOpen={() => onOpenLink(embed.target, path)} />;
      },
    }),
    [files, path, onOpenLink],
  );

  const folder = noteFolder(path);
  return (
    <article className="note" data-testid="note" data-path={path}>
      <header className="note-header">
        {folder && <p className="eyebrow">{folder}</p>}
        <h1 data-testid="note-title">{noteTitle(path)}</h1>
      </header>
      {error && <p className="note-warning">These properties aren't valid YAML, so the note is shown as written.</p>}
      <PropertyList properties={properties} />
      <div className="note-body">
        <Markdown remarkPlugins={remarkPlugins} urlTransform={urlTransform} components={components}>
          {body}
        </Markdown>
      </div>
    </article>
  );
}

function PropertyList({ properties }: { properties: Properties }) {
  const entries = Object.entries(properties);
  if (!entries.length) return null;
  return (
    <dl className="properties" data-testid="properties">
      {entries.map(([key, value]) => (
        <div className="property" key={key}>
          <dt>{key}</dt>
          <dd className={formatValue(value) === '—' ? 'is-empty' : undefined}>{formatValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function EmbedLink({ target, found, onOpen }: { target: string; found: boolean; onOpen: () => void }): ReactNode {
  return (
    <a
      href="#"
      className={found ? 'wikilink' : 'wikilink is-missing'}
      data-wikilink={target}
      onClick={(event) => {
        event.preventDefault();
        onOpen();
      }}
    >
      {target}
    </a>
  );
}
