import { autocompletion } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { useEffect, useRef } from 'react';
import { wikilinkSource, type LinkTarget } from '../lib/completion';

interface Props {
  /** The text the editor starts with. Later changes to it are ignored; remount to load another note. */
  initial: string;
  /**
   * The note's line ending. The editor splits lines on any ending, so pasted text can't bring
   * foreign ones in, and joins them with this one, so a CRLF note stays CRLF throughout.
   */
  lineSeparator: '\n' | '\r\n';
  onChange: (text: string) => void;
  /** What `[[` offers. Kept current without rebuilding the editor. */
  linkTargets?: LinkTarget[];
  /** More CodeMirror extensions. */
  extensions?: Extension[];
  /** What an empty editor shows. */
  placeholder?: string;
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
    '.cm-tooltip.cm-tooltip-autocomplete': {
      backgroundColor: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--font-ui)', fontSize: '13.5px', maxHeight: '240px' },
    '.cm-tooltip.cm-tooltip-autocomplete > ul > li': { padding: '4px 12px', color: 'var(--text-muted)' },
    '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--accent-soft)', color: 'var(--text)' },
    '.cm-completionDetail': { marginLeft: '12px', color: 'var(--text-faint)', fontStyle: 'normal' },
    '.cm-completionMatchedText': { color: 'var(--accent)', textDecoration: 'none' },
  },
  { dark: true },
);

/** A plain-text Markdown editor. The text it reports is exactly what the file will hold. */
export function Editor({ initial, lineSeparator, onChange, linkTargets = [], extensions, placeholder: empty = 'Start writing…' }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const report = useRef(onChange);
  const targets = useRef(linkTargets);
  useEffect(() => {
    report.current = onChange;
    targets.current = linkTargets;
  }, [onChange, linkTargets]);

  // Built once per mount: the parent remounts the editor (with `key`) to show another note.
  const setup = useRef({ initial, lineSeparator, extensions, empty });
  useEffect(() => {
    const { initial: doc, lineSeparator: separator, extensions: extra = [], empty: hint } = setup.current;
    const view = new EditorView({
      parent: host.current ?? undefined,
      state: EditorState.create({
        doc,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          markdown(),
          syntaxHighlighting(highlight),
          EditorView.lineWrapping,
          placeholder(hint),
          autocompletion({ override: [wikilinkSource(() => targets.current)], icons: false }),
          theme,
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            const text = update.state.doc.toString();
            report.current(separator === '\n' ? text : text.replaceAll('\n', separator));
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
