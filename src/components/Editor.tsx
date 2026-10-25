import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { useEffect, useRef } from 'react';

interface Props {
  /** The text the editor starts with. Later changes to it are ignored; remount to load another note. */
  initial: string;
  /** Joins lines when the text is read back, so a CRLF note stays CRLF. */
  lineSeparator: '\n' | '\r\n';
  onChange: (text: string) => void;
  /** More CodeMirror extensions, such as autocomplete. */
  extensions?: Extension[];
}

// The source looks like the note it makes: headings sized, emphasis set, Markdown's own marks faint.
const highlight = HighlightStyle.define([
  { tag: tags.heading1, fontSize: '1.45em', fontWeight: '600' },
  { tag: tags.heading2, fontSize: '1.25em', fontWeight: '600' },
  { tag: tags.heading3, fontSize: '1.1em', fontWeight: '600' },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: '600', color: 'var(--text-muted)' },
  { tag: tags.strong, fontWeight: '600' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: [tags.link, tags.url], color: 'var(--accent)' },
  { tag: tags.monospace, fontFamily: 'var(--font-mono)', fontSize: '0.9em' },
  { tag: [tags.processingInstruction, tags.meta, tags.contentSeparator], color: 'var(--text-faint)' },
  { tag: tags.quote, color: 'var(--text-muted)' },
]);

const theme = EditorView.theme(
  {
    '&': { color: 'var(--text)', backgroundColor: 'transparent', fontSize: '16px' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { fontFamily: 'var(--font-ui)', lineHeight: '1.7' },
    '.cm-content': { padding: '0', caretColor: 'var(--accent)' },
    '.cm-line': { padding: '0' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
      backgroundColor: 'var(--accent-soft)',
    },
    '.cm-placeholder': { color: 'var(--text-faint)' },
  },
  { dark: true },
);

/** A plain-text Markdown editor. The text it reports is exactly what the file will hold. */
export function Editor({ initial, lineSeparator, onChange, extensions }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const report = useRef(onChange);
  useEffect(() => {
    report.current = onChange;
  }, [onChange]);

  // Built once per mount: the parent remounts the editor (with `key`) to show another note.
  const setup = useRef({ initial, lineSeparator, extensions });
  useEffect(() => {
    const { initial: doc, lineSeparator: separator, extensions: extra = [] } = setup.current;
    const view = new EditorView({
      parent: host.current ?? undefined,
      state: EditorState.create({
        doc,
        extensions: [
          EditorState.lineSeparator.of(separator),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          markdown(),
          syntaxHighlighting(highlight),
          EditorView.lineWrapping,
          placeholder('Start writing…'),
          theme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) report.current(update.state.sliceDoc());
          }),
          ...extra,
        ],
      }),
    });
    // Focus without scrolling the pane past the note's title.
    view.contentDOM.focus({ preventScroll: true });
    return () => view.destroy();
  }, []);

  return <div className="editor" ref={host} data-testid="editor" />;
}
