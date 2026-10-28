import { Prec } from '@codemirror/state';
import { keymap, type EditorView } from '@codemirror/view';
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import type { VaultFile } from '../../lib/api';
import type { LinkTarget } from '../../lib/completion';
import { bodyWithoutCover, type KindSpec } from '../../lib/library';
import type { WikilinkMatch } from '../../lib/links';
import { flushBeforeClose, trackSave } from '../../lib/saving';
import { lineEnding } from '../../lib/text';
import { firstThoughtLead, splitThoughts } from '../../lib/thoughts';
import { Editor } from '../Editor';
import { NoteMarkdown } from '../NoteMarkdown';
import { order } from '../periodic/effects';

interface Props {
  spec: KindSpec;
  path: string;
  /** The note as it is now. */
  text: string;
  files: VaultFile[];
  /** The cover's embed in the note's body: the hero shows it, so the text doesn't again. */
  cover?: WikilinkMatch;
  onOpenLink: (target: string, fromPath: string, newTab?: boolean) => void;
  linkTargets: LinkTarget[];
  /** Rewrites the end of the note the page owns from `before` to `after` (see `replaceThoughts`); rejects with why it couldn't. */
  onSave: (before: string, after: string) => Promise<void>;
  /** The page was left with text that couldn't be saved. */
  onUnsaved: (thoughts: string, message: string) => void;
  /**
   * Hands over a flush while the text is open for writing (`undefined` once it closes): it saves
   * what is left and resolves to whether all of it is in the note.
   */
  onFlush?: (flush: (() => Promise<boolean>) | undefined) => void;
}

/**
 * What was thought of it: the note's own text, under its properties, its overview link and its
 * cover, written right here like any note. A click on the text (or on "Write") opens it for
 * writing; it saves on its own after a short pause, and Done, Escape or ⌘↵ closes it once saved.
 * The lines above the text are never touched.
 */
export function Thoughts({ spec, path, text, files, cover, onOpenLink, linkTargets, onSave, onUnsaved, onFlush }: Props) {
  const [editing, setEditing] = useState(false);
  const parts = useMemo(() => splitThoughts(text), [text]);
  // The hero shows the cover: it is left out of whichever part holds it.
  const inLinks = cover !== undefined && cover.index < parts.links.length;
  const links = bodyWithoutCover(parts.links, inLinks ? cover : undefined).trim();
  const shown = bodyWithoutCover(parts.thoughts, cover && !inLinks ? { ...cover, index: cover.index - parts.links.length } : undefined).trim();
  // A note with mixed line endings is only shown: saving would change lines that weren't touched.
  const separator = lineEnding(text);

  const open = (event: MouseEvent) => {
    if (!separator || (event.target as Element).closest('a, button')) return;
    // Selecting words to copy them isn't asking to write.
    if (window.getSelection()?.toString()) return;
    setEditing(true);
  };

  const above = links && (
    <div className="media-thoughts-links">
      <NoteMarkdown path={path} body={links} files={files} onOpenLink={onOpenLink} />
    </div>
  );

  return (
    <section className="card glass rise media-text media-thoughts" style={order(2)} data-testid="media-text">
      {editing && separator ? (
        <ThoughtsEditor
          path={path}
          initial={parts.thoughts}
          lead={parts.thoughts ? '' : firstThoughtLead(text)}
          separator={separator}
          hint={`What did you think of this ${spec.one}?`}
          linkTargets={linkTargets}
          above={above}
          onSave={onSave}
          onUnsaved={onUnsaved}
          onFlush={onFlush}
          onDone={() => setEditing(false)}
        />
      ) : (
        <>
          <div className="card-head">
            <p className="tile-label">Thoughts</p>
            {separator && shown && (
              <button type="button" className="nav-chip" onClick={() => setEditing(true)} data-testid="thoughts-write">
                Write
              </button>
            )}
          </div>
          {above}
          {shown ? (
            <div className={separator ? 'media-thoughts-text is-writable' : 'media-thoughts-text'} onClick={open} data-testid="thoughts-text">
              <NoteMarkdown path={path} body={shown} files={files} onOpenLink={onOpenLink} />
            </div>
          ) : (
            separator && (
              <button type="button" className="media-thoughts-empty" onClick={() => setEditing(true)} data-testid="thoughts-write">
                What did you think of this {spec.one}?
              </button>
            )
          )}
        </>
      )}
    </section>
  );
}

type SaveState = { kind: 'idle' | 'saving' | 'saved' } | { kind: 'failed'; message: string };

// Escape and ⌘↵ in the editor ask to be done, as an event its box hears. Above the default keys,
// whose ⌘↵ adds a line; below the completion's, so Escape first closes the `[[` list.
const DONE = 'epizen-thoughts-done';
const DONE_KEYS = [
  Prec.high(
    keymap.of(
      ['Escape', 'Mod-Enter'].map((key) => ({
        key,
        run: (view: EditorView) => {
          view.dom.dispatchEvent(new CustomEvent(DONE, { bubbles: true }));
          return true;
        },
      })),
    ),
  ),
];

interface EditorProps {
  path: string;
  initial: string;
  /** What a first thought is written after (`firstThoughtLead`); `''` when the note has text. */
  lead: string;
  separator: '\n' | '\r\n';
  hint: string;
  linkTargets: LinkTarget[];
  above: ReactNode;
  onSave: Props['onSave'];
  onUnsaved: Props['onUnsaved'];
  onFlush: Props['onFlush'];
  onDone: () => void;
}

/**
 * The text open for writing. As the note editor does, it saves one write at a time, each over
 * what the last one left; if one can't be written, saving stops and says so, the text stays on
 * screen, Done stays put, and leaving hands it to `onUnsaved`.
 *
 * What it writes is the end of the note it owns: the text, after the lead a first thought needs.
 * Erased, the text takes its lead with it, and the note is as it was.
 */
function ThoughtsEditor({ path, initial, lead, separator, hint, linkTargets, above, onSave, onUnsaved, onFlush, onDone }: EditorProps) {
  const [owned] = useState(() => (text: string) => (text ? lead + text : ''));
  const [draft, setDraft] = useState(initial);
  const [state, setState] = useState<SaveState>({ kind: 'idle' });
  const saved = useRef(initial);
  const latest = useRef(initial);
  const queue = useRef(Promise.resolve());
  const failure = useRef<string | undefined>(undefined);
  const mounted = useRef(true);
  const report = useRef({ onSave, onUnsaved, onDone });
  useEffect(() => {
    report.current = { onSave, onUnsaved, onDone };
  }, [onSave, onUnsaved, onDone]);
  useEffect(() => {
    // Set here too: StrictMode runs this cleanup once before the editor is really gone.
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const save = useCallback(() => {
    queue.current = queue.current.then(async () => {
      while (failure.current === undefined && latest.current !== saved.current) {
        const next = latest.current;
        if (mounted.current) setState({ kind: 'saving' });
        try {
          await report.current.onSave(owned(saved.current), owned(next));
          saved.current = next;
          if (mounted.current && latest.current === next) setState({ kind: 'saved' });
        } catch (err) {
          failure.current = err instanceof Error ? err.message : String(err);
          if (mounted.current) setState({ kind: 'failed', message: failure.current });
        }
      }
      if (failure.current !== undefined && !mounted.current && latest.current !== saved.current) {
        report.current.onUnsaved(latest.current, failure.current);
      }
    });
    return queue.current;
  }, [owned]);
  const unsaved = useCallback(() => (failure.current === undefined ? undefined : path), [path]);

  useEffect(() => {
    if (draft === saved.current) return;
    const timer = setTimeout(() => void save(), 600);
    return () => clearTimeout(timer);
  }, [draft, save]);
  // Leaving the page saves what is left, and a quit right after waits for it.
  useEffect(() => () => void trackSave(save().then(unsaved)), [save, unsaved]);
  useEffect(() => flushBeforeClose(() => save().then(unsaved)), [save, unsaved]);

  const change = useCallback((next: string) => {
    latest.current = next;
    setDraft(next);
  }, []);
  // Done (and "Edit note") go on only once everything written is in the note.
  const flush = useCallback(() => save().then(() => failure.current === undefined), [save]);
  useEffect(() => {
    onFlush?.(flush);
    return () => onFlush?.(undefined);
  }, [onFlush, flush]);
  const done = useCallback(
    () =>
      void flush().then((saved) => {
        if (saved) report.current.onDone();
      }),
    [flush],
  );
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = box.current;
    element?.addEventListener(DONE, done);
    return () => element?.removeEventListener(DONE, done);
  }, [done]);

  const label = { idle: '', saving: 'Saving…', saved: 'Saved', failed: 'Not saved' }[state.kind];
  return (
    <>
      <div className="card-head">
        <p className="tile-label">Thoughts</p>
        <span className="media-thoughts-actions">
          <span className="save-state" data-testid="thoughts-state">
            {label}
          </span>
          <button type="button" className="nav-chip is-action" onClick={done} data-testid="thoughts-done">
            Done
          </button>
        </span>
      </div>
      {above}
      {state.kind === 'failed' && (
        <p className="note-warning" data-testid="thoughts-error">
          Couldn't save: {state.message}. Your text is still here; copy it before you leave this page.
        </p>
      )}
      <div className="media-thoughts-editor" ref={box}>
        <Editor initial={initial} lineSeparator={separator} onChange={change} linkTargets={linkTargets} extensions={DONE_KEYS} placeholder={hint} />
      </div>
    </>
  );
}
