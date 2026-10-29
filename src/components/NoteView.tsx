import { setMediaLists } from '../lib/mediaProperties';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { readNote, writeNote, type VaultFile } from '../lib/api';
import type { LinkTarget } from '../lib/completion';
import { parseTasks, toggleTask } from '../lib/dashboard';
import { addRecord, deleteRecord, updateRecord } from '../lib/cbt';
import { addTask, setProperty, setSummary, syncPlanDone } from '../lib/edits';
import { addQuest } from '../lib/quests';
import { writeSection } from '../lib/sections';
import { replaceThoughts, splitThoughts } from '../lib/thoughts';
import { deleteTask, editTask, focusIdOf, newTaskLabel, setMinutes } from '../lib/timeblocks';
import type { FocusHow } from './calendar/FocusMenu';
import type { TaskChange, TaskChoice } from './calendar/types';
import { formatValue, parseNote, type Properties } from '../lib/frontmatter';
import { isMediaNote, type KindSpec } from '../lib/library';
import { noteFolder, noteTitle } from '../lib/links';
import { flushBeforeClose, trackSave, whenSaved } from '../lib/saving';
import { lineEnding } from '../lib/text';
import { Editor } from './Editor';
import { MediaPage } from './library/MediaPage';
import { NoteMarkdown } from './NoteMarkdown';
import { PeriodicPage } from './periodic/PeriodicPage';
import type { PeriodicActions, PeriodicSpec } from './periodic/types';

interface NoteProps {
  path: string;
  files: VaultFile[];
  /** A [[link]] was clicked; `newTab` for a ⌘-click or a middle click. */
  onOpenLink: (target: string, fromPath: string, newTab?: boolean) => void;
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
  /** For a daily, weekly or monthly note: what its page reads from the rest of the vault. */
  periodic?: PeriodicSpec;
  /** For a note in one of the library's folders: its kind. A rated one opens as a media page. */
  media?: { spec: KindSpec; onOpenLibrary: () => void; onCoverSaved: () => Promise<void> };
  onOpenNote: (path: string) => void;
  /** Opens a day, week or month, creating its note from the template if it has none. */
  onOpenPeriod: PeriodicActions['onOpenPeriod'];
  /** The note's text as the app knows it, which the timer, the calendar or a quest may have just written. */
  known?: string;
  onQuestToggle: PeriodicActions['onQuestToggle'];
  onQuestProgress: PeriodicActions['onQuestProgress'];
  onQuestChange: PeriodicActions['onQuestChange'];
  /** Starts the timer on a task of today's note. */
  onStartTimer: (choice: TaskChoice, how?: FocusHow) => void;
  /** A task of this note was edited or deleted: the timer and the task's plans follow it. */
  onTaskChanged: (change: TaskChange) => void;
}

/** Loads a note from the vault and shows it, or edits it. */
export function NoteView(props: ViewProps) {
  const { path, files, onOpenLink, editing, onEditingChange, onSaved, onUnsaved, linkTargets, periodic, media, onOpenNote, onOpenPeriod, known, onQuestToggle, onQuestProgress, onQuestChange, onStartTimer, onTaskChanged } = props;
  const [note, setNote] = useState<{ path: string; text?: string; error?: string }>({ path });
  // When the app learns a new text for this note (the timer wrote a block into it while it is
  // open), show that one and build the next change on it.
  const [seen, setSeen] = useState(known);
  if (known !== seen) {
    setSeen(known);
    if (known !== undefined && note.path === path && note.text !== undefined && known !== note.text) setNote({ path, text: known });
  }
  const [changeError, setChangeError] = useState<string>();
  const changes = useRef(Promise.resolve());
  const latest = useRef<string | undefined>(undefined);
  useEffect(() => {
    latest.current = note.text;
  }, [note.text]);

  // A periodic page changes its note one change at a time (a tick, a number, a new task), each
  // over the note as it is on disk now, so a change made elsewhere is never written over. `edit`
  // returns the new text, or `undefined` when there is nothing to do. If the note changes on disk
  // between the read and the write, nothing is written: it says so and shows the note as it is.
  // `written` runs once the change is in the note. `settled` runs once either way, with why it
  // wasn't written if it wasn't. `failed` heads the page's warning; with none, the caller says it.
  const change = useCallback(
    (edit: (text: string) => string | undefined, failed: string | undefined, written?: () => void, settled?: (problem?: string) => void) => {
      changes.current = changes.current.then(async () => {
        if (latest.current === undefined) return settled?.('The note is still loading.');
        try {
          const current = await readNote(path);
          const next = edit(current);
          if (next === undefined || next === current) return settled?.();
          await writeNote(path, next, current);
          latest.current = next;
          setNote({ path, text: next });
          onSaved(path, next);
          setChangeError(undefined);
          written?.();
          settled?.();
        } catch (err) {
          const problem = err instanceof Error ? err.message : String(err);
          settled?.(problem);
          if (failed !== undefined) setChangeError(`${failed}: ${problem}. The note is shown as it is now.`);
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
  // A line of the note as the page last showed it, to find that task again when writing.
  const seenLine = useCallback((line: number) => (latest.current ?? '').split('\n')[line]?.replace(/\r$/, '') ?? '', []);
  const actions = useMemo(
    (): PeriodicActions => ({
      onOpenPeriod,
      onOpenNote,
      onEdit: () => onEditingChange(true),
      // The task is found again in the text as it is now: the same line, still ticked or not as it was shown.
      onToggle: (task) =>
        change((text) => {
          const target = parseTasks(text).find((t) => t.line === task.line && t.done === task.done);
          // Plan done follows the ticks: the same write updates the day's `done`.
          return target && syncPlanDone(toggleTask(text, target));
        }, 'Nothing was ticked'),
      onSetProperty: (key, value) => change((text) => setProperty(text, key, value), `${key} wasn't set`),
      onAddTask: (category, words, minutes) => change((text) => syncPlanDone(addTask(text, category, words, minutes)), 'The task wasn\'t added'),
      onSetSummary: (summary) => change((text) => setSummary(text, summary), "The summary wasn't saved"),
      // A task is found again by its line as the page showed it.
      onSetMinutes: (task, minutes) => {
        const seen = seenLine(task.line);
        change((text) => setMinutes(text, { line: task.line, text: seen }, minutes), "The minutes weren't saved");
      },
      onEditTask: (task, edit) => {
        const seen = seenLine(task.line);
        const before = { label: task.label, category: task.category?.name };
        const after = { label: newTaskLabel(edit.words), category: edit.category?.toLowerCase() };
        change(
          (text) => editTask(text, { line: task.line, text: seen }, edit),
          "The task wasn't changed",
          () => periodic && onTaskChanged({ kind: 'edited', path, date: periodic.date, focusId: focusIdOf(seen), before, after }),
        );
      },
      onDeleteTask: (task) => {
        const seen = seenLine(task.line);
        change(
          (text) => syncPlanDone(deleteTask(text, { line: task.line, text: seen })),
          "The task wasn't deleted",
          () => periodic && onTaskChanged({ kind: 'deleted', path, date: periodic.date, focusId: focusIdOf(seen) }),
        );
      },
      onFocus: (task, how) => onStartTimer({ kind: 'task', ref: { line: task.line, text: seenLine(task.line) }, label: task.label, category: task.category }, how),
      onAddRecord: (input) => {
        const now = new Date();
        const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        change((text) => addRecord(text, input, time), "The thought record wasn't saved");
      },
      onUpdateRecord: (record, input) => change((text) => updateRecord(text, record, input), "The thought record wasn't changed"),
      onDeleteRecord: (record) => change((text) => deleteRecord(text, record), "The thought record wasn't deleted"),
      onQuestToggle,
      onQuestProgress,
      onQuestChange,
      // A new quest goes into this note: the weekly or monthly note the page is drawn from.
      onAddQuest: (line) => new Promise((settle) => change((text) => addQuest(text, line), "The quest wasn't added", undefined, settle)),
      onSetSection: (heading, value) => new Promise((settle) => change((text) => writeSection(text, heading, value), `${heading} wasn't saved`, undefined, settle)),
    }),
    [change, onEditingChange, onOpenNote, onOpenPeriod, onQuestToggle, onQuestProgress, onQuestChange, onStartTimer, onTaskChanged, path, periodic, seenLine],
  );

  // Read once the saves under way have landed: the editor this note was last open in (here, or in
  // another tab) may still be writing what was typed.
  useEffect(() => {
    let cancelled = false;
    whenSaved()
      .then(() => readNote(path))
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
  if (media && isMediaNote(path, parseNote(note.text).properties)) {
    return (
      <MediaPage
        spec={media.spec}
        path={path}
        text={note.text}
        files={files}
        onOpenLink={onOpenLink}
        onSaveLists={(edits) => new Promise<void>((resolve, reject) => change((text) => setMediaLists(text, edits), undefined, undefined, (problem) => problem ? reject(new Error(problem)) : resolve()))}
        onSetProperty={actions.onSetProperty}
        onSaveThoughts={(before, after) =>
          new Promise<void>((resolve, reject) =>
            // The card says what went wrong, beside the text it still holds.
            change((text) => replaceThoughts(text, before, after), undefined, undefined, (problem) => (problem ? reject(new Error(problem)) : resolve())),
          )
        }
        onUnsavedThoughts={(thoughts, message) => {
          // Shown to copy from: the note as it would have been, over its last known lines.
          const { properties, links } = splitThoughts(latest.current ?? note.text ?? '');
          onUnsaved(path, properties + links + thoughts, message);
        }}
        linkTargets={linkTargets}
        onEdit={actions.onEdit}
        onOpenLibrary={media.onOpenLibrary}
        onCoverSaved={media.onCoverSaved}
        warning={changeError}
      />
    );
  }
  if (periodic) {
    return (
      <PeriodicPage
        spec={periodic}
        path={path}
        text={note.text}
        actions={actions}
        warning={changeError}
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
  return (
    <>
      {error && <p className="note-warning">These properties aren't valid YAML, so the note is shown as written.</p>}
      <PropertyList properties={properties} />
      <NoteMarkdown path={path} body={body} files={files} onOpenLink={onOpenLink} />
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
