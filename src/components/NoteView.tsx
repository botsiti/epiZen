import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { readNote, writeNote, type VaultFile } from '../lib/api';
import { formatValue, parseNote, type Properties } from '../lib/frontmatter';
import { noteFolder, noteTitle, resolveLink } from '../lib/links';
import { parseVaultUrl, remarkCallouts, remarkWikilinks, urlTransform } from '../lib/markdown';
import { lineEnding } from '../lib/text';
import { Editor } from './Editor';
import { VaultImage } from './VaultImage';

const remarkPlugins = [remarkGfm, remarkCallouts, remarkWikilinks];

interface NoteProps {
  path: string;
  files: VaultFile[];
  onOpenLink: (target: string, fromPath: string) => void;
}

interface ViewProps extends NoteProps {
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
}

/** Loads a note from the vault and shows it, or edits it. */
export function NoteView({ path, files, onOpenLink, editing, onEditingChange }: ViewProps) {
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
  if (editing) {
    return (
      <NoteEditor
        path={path}
        text={note.text}
        files={files}
        onOpenLink={onOpenLink}
        onSaved={(text) => setNote({ path, text })}
        onDone={() => onEditingChange(false)}
      />
    );
  }
  const edit = (
    <button type="button" className="quiet-button" onClick={() => onEditingChange(true)} data-testid="edit-note">
      Edit
    </button>
  );
  return <NoteContent path={path} text={note.text} files={files} onOpenLink={onOpenLink} actions={edit} />;
}

type SaveState = { kind: 'idle' | 'saving' | 'saved' } | { kind: 'failed'; message: string };

interface EditorProps extends NoteProps {
  text: string;
  onSaved: (text: string) => void;
  onDone: () => void;
}

/**
 * The note's source beside a live preview. Edits save on their own after a short pause, one
 * save at a time, each only over the text the last one left. If the note changed on disk
 * meanwhile, saving stops and says so; nothing is overwritten.
 */
function NoteEditor({ path, text, files, onOpenLink, onSaved, onDone }: EditorProps) {
  const separator = lineEnding(text);
  const [draft, setDraft] = useState(text);
  const [state, setState] = useState<SaveState>({ kind: 'idle' });
  const saved = useRef(text);
  const latest = useRef(text);
  const queue = useRef(Promise.resolve());
  const stopped = useRef(false);
  const reportSaved = useRef(onSaved);
  useEffect(() => {
    reportSaved.current = onSaved;
  }, [onSaved]);

  const save = useCallback(() => {
    queue.current = queue.current.then(async () => {
      const next = latest.current;
      if (stopped.current || next === saved.current) return;
      setState({ kind: 'saving' });
      try {
        await writeNote(path, next, saved.current);
        saved.current = next;
        reportSaved.current(next);
        setState({ kind: latest.current === next ? 'saved' : 'saving' });
      } catch (err) {
        stopped.current = true;
        setState({ kind: 'failed', message: String(err) });
      }
    });
    return queue.current;
  }, [path]);

  useEffect(() => {
    if (draft === saved.current) return;
    const timer = setTimeout(() => void save(), 600);
    return () => clearTimeout(timer);
  }, [draft, save]);
  // Leaving the note saves what is left.
  useEffect(() => () => void save(), [save]);

  const change = useCallback((next: string) => {
    latest.current = next;
    setDraft(next);
  }, []);
  const done = () => void save().then(onDone);

  const folder = noteFolder(path);
  const label = { idle: '', saving: 'Saving…', saved: 'Saved', failed: 'Not saved' }[state.kind];
  return (
    <article className="note is-editing" data-testid="note-editor" data-path={path}>
      <header className="note-header">
        {folder && <p className="eyebrow">{folder}</p>}
        <div className="title-row">
          <h1 data-testid="note-title">{noteTitle(path)}</h1>
          <span className="save-state" data-testid="save-state">
            {label}
          </span>
          <button type="button" className="quiet-button" onClick={done} data-testid="edit-done">
            Done
          </button>
        </div>
      </header>
      {state.kind === 'failed' && (
        <p className="note-warning" data-testid="save-error">
          Couldn't save: {state.message}. Your text is still here; copy it before you leave this note.
        </p>
      )}
      {separator ? (
        <div className="edit-panes">
          <Editor initial={text} lineSeparator={separator} onChange={change} />
          <div className="preview" data-testid="preview">
            <NoteBody path={path} text={draft} files={files} onOpenLink={onOpenLink} />
          </div>
        </div>
      ) : (
        <p className="note-warning" data-testid="mixed-line-endings">
          This note mixes line endings, so Epizen won't edit it: saving would change lines you didn't touch.
        </p>
      )}
    </article>
  );
}

export function NoteContent({ path, text, files, onOpenLink, actions }: NoteProps & { text: string; actions?: ReactNode }) {
  const folder = noteFolder(path);
  return (
    <article className="note" data-testid="note" data-path={path}>
      <header className="note-header">
        {folder && <p className="eyebrow">{folder}</p>}
        <div className="title-row">
          <h1 data-testid="note-title">{noteTitle(path)}</h1>
          {actions}
        </div>
      </header>
      <NoteBody path={path} text={text} files={files} onOpenLink={onOpenLink} />
    </article>
  );
}

/** A note's properties and Markdown, rendered. */
function NoteBody({ path, text, files, onOpenLink }: NoteProps & { text: string }) {
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

  return (
    <>
      {error && <p className="note-warning">These properties aren't valid YAML, so the note is shown as written.</p>}
      <PropertyList properties={properties} />
      <div className="note-body">
        <Markdown remarkPlugins={remarkPlugins} urlTransform={urlTransform} components={components}>
          {body}
        </Markdown>
      </div>
    </>
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
