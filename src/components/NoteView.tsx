import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { readNote, writeNote, type VaultFile } from '../lib/api';
import type { LinkTarget } from '../lib/completion';
import { parseTasks, toggleTask, type Task } from '../lib/dashboard';
import { formatValue, parseNote, type Properties } from '../lib/frontmatter';
import { noteFolder, noteTitle, resolveLink } from '../lib/links';
import { parseVaultUrl, remarkCallouts, remarkWikilinks, urlTransform } from '../lib/markdown';
import { flushBeforeClose, trackSave } from '../lib/saving';
import { lineEnding } from '../lib/text';
import { Dashboard, type DashboardSpec } from './Dashboard';
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
  /** A save reached the note. */
  onSaved: (path: string, text: string) => void;
  /** A save failed after the editor was closed: the text that didn't reach the note. */
  onUnsaved: (path: string, text: string, message: string) => void;
  /** What `[[` offers in the editor. */
  linkTargets: LinkTarget[];
  /** Shown under the note when reading it: its backlinks. */
  footer?: ReactNode;
  /** A periodic note's dashboard, shown above its text when reading it. */
  dashboard?: DashboardSpec;
  onOpenNote: (path: string) => void;
}

/** Loads a note from the vault and shows it, or edits it. */
export function NoteView(props: ViewProps) {
  const { path, files, onOpenLink, editing, onEditingChange, onSaved, onUnsaved, linkTargets, footer, dashboard, onOpenNote } = props;
  const [note, setNote] = useState<{ path: string; text?: string; error?: string }>({ path });
  const [tickError, setTickError] = useState<string>();
  const ticks = useRef(Promise.resolve());
  const latest = useRef<string | undefined>(undefined);
  useEffect(() => {
    latest.current = note.text;
  }, [note.text]);

  // Ticking a task on the dashboard writes that one box back to the note, one tick at a time,
  // each over the text the last one left. If the note changed on disk, it says so and reloads.
  const toggle = useCallback(
    (task: Task) => {
      ticks.current = ticks.current.then(async () => {
        const current = latest.current;
        const target = current === undefined ? undefined : parseTasks(current).find((t) => t.line === task.line && t.done === task.done);
        if (current === undefined || !target) return;
        const next = toggleTask(current, target);
        try {
          await writeNote(path, next, current);
          latest.current = next;
          setNote({ path, text: next });
          onSaved(path, next);
          setTickError(undefined);
        } catch (err) {
          setTickError(`Nothing was ticked: ${String(err)}. The note is shown as it is now.`);
          const fresh = await readNote(path).catch(() => undefined);
          if (fresh !== undefined) {
            latest.current = fresh;
            setNote({ path, text: fresh });
          }
        }
      });
    },
    [path, onSaved],
  );

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
        onSaved={(text) => {
          setNote({ path, text });
          onSaved(path, text);
        }}
        onDone={() => onEditingChange(false)}
        onUnsaved={(text, message) => onUnsaved(path, text, message)}
        linkTargets={linkTargets}
      />
    );
  }
  const edit = (
    <button type="button" className="quiet-button" onClick={() => onEditingChange(true)} data-testid="edit-note">
      Edit
    </button>
  );
  const top = dashboard && (
    <>
      {tickError && <p className="note-warning">{tickError}</p>}
      <Dashboard spec={dashboard} text={note.text} onToggle={toggle} onOpen={onOpenNote} />
    </>
  );
  return (
    <>
      <NoteContent path={path} text={note.text} files={files} onOpenLink={onOpenLink} actions={edit} top={top} />
      {footer}
    </>
  );
}

type SaveState = { kind: 'idle' | 'saving' | 'saved' } | { kind: 'failed'; message: string };

interface EditorProps extends NoteProps {
  text: string;
  onSaved: (text: string) => void;
  onDone: () => void;
  onUnsaved: (text: string, message: string) => void;
  linkTargets: LinkTarget[];
}

/**
 * The note's source beside a live preview. Edits save on their own after a short pause, one
 * save at a time, each only over the text the last one left. If the note changed on disk
 * meanwhile, saving stops and says so; nothing is overwritten, and the text that wasn't saved
 * is never dropped without a word: Done stays put, and leaving hands it to `onUnsaved`.
 */
function NoteEditor({ path, text, files, onOpenLink, onSaved, onDone, onUnsaved, linkTargets }: EditorProps) {
  // Decided once: saves keep the note's line ending, so it can't change under the editor.
  const [separator] = useState(() => lineEnding(text));
  const [draft, setDraft] = useState(text);
  const [state, setState] = useState<SaveState>({ kind: 'idle' });
  const saved = useRef(text);
  const latest = useRef(text);
  const queue = useRef(Promise.resolve());
  const failure = useRef<string | undefined>(undefined);
  const mounted = useRef(true);
  const report = useRef({ onSaved, onUnsaved });
  useEffect(() => {
    report.current = { onSaved, onUnsaved };
  }, [onSaved, onUnsaved]);
  useEffect(() => {
    // Set here too: StrictMode runs this cleanup once before the editor is really gone.
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Writes until the note holds what is on screen: typing (or undoing) during a write is
  // written right after it.
  const save = useCallback(() => {
    queue.current = queue.current.then(async () => {
      while (failure.current === undefined && latest.current !== saved.current) {
        const next = latest.current;
        if (mounted.current) setState({ kind: 'saving' });
        try {
          await writeNote(path, next, saved.current);
          saved.current = next;
          report.current.onSaved(next);
          if (mounted.current && latest.current === next) setState({ kind: 'saved' });
        } catch (err) {
          failure.current = String(err);
          if (mounted.current) setState({ kind: 'failed', message: failure.current });
        }
      }
      if (failure.current !== undefined && !mounted.current && latest.current !== saved.current) {
        report.current.onUnsaved(latest.current, failure.current);
      }
    });
    return queue.current;
  }, [path]);
  const unsaved = useCallback(() => (failure.current === undefined ? undefined : path), [path]);

  useEffect(() => {
    if (draft === saved.current) return;
    const timer = setTimeout(() => void save(), 600);
    return () => clearTimeout(timer);
  }, [draft, save]);
  // Leaving the note saves what is left, or hands it on if it can't be saved.
  // Tracked, so a quit right after leaving waits for this save too.
  useEffect(() => () => void trackSave(save().then(unsaved)), [save, unsaved]);
  // So does closing the window or quitting, which never unmounts the editor.
  useEffect(() => flushBeforeClose(() => save().then(unsaved)), [save, unsaved]);

  const change = useCallback((next: string) => {
    latest.current = next;
    setDraft(next);
  }, []);
  // Done closes the editor only once everything typed is in the note.
  const done = () =>
    void save().then(() => {
      if (failure.current === undefined) onDone();
    });

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
          <Editor initial={text} lineSeparator={separator} onChange={change} linkTargets={linkTargets} />
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

export function NoteContent({ path, text, files, onOpenLink, actions, top }: NoteProps & { text: string; actions?: ReactNode; top?: ReactNode }) {
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
      {top}
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
