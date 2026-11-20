import { EditorView } from '@codemirror/view';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Editor } from './Editor';

/** Inserts text at the end, as a paste does. */
function paste(text: string) {
  const host = screen.getByTestId('editor').querySelector<HTMLElement>('.cm-editor');
  const view = host && EditorView.findFromDOM(host);
  if (!view) throw new Error('no editor');
  view.dispatch({ changes: { from: view.state.doc.length, insert: text }, userEvent: 'input.paste' });
}

describe('Editor', () => {
  it('keeps a CRLF note CRLF when LF text is pasted into it', () => {
    const onChange = vi.fn();
    render(<Editor initial={'---\r\nmood: 7\r\n---\r\nДень\r\n'} lineSeparator={'\r\n'} onChange={onChange} />);
    paste('one\ntwo\rthree');
    expect(onChange).toHaveBeenLastCalledWith('---\r\nmood: 7\r\n---\r\nДень\r\none\r\ntwo\r\nthree');
  });

  it('keeps an LF note LF when CRLF text is pasted into it', () => {
    const onChange = vi.fn();
    render(<Editor initial={'# Day\n'} lineSeparator={'\n'} onChange={onChange} />);
    paste('a\r\nb');
    expect(onChange).toHaveBeenLastCalledWith('# Day\na\nb');
  });

  it('toggles bold around selected text and inserts a Markdown link with the old selection as its label', () => {
    const onChange = vi.fn();
    render(<Editor initial="Before words after" lineSeparator={'\n'} onChange={onChange} />);
    const view = EditorView.findFromDOM(screen.getByTestId('editor').querySelector<HTMLElement>('.cm-editor')!)!;
    act(() => view.dispatch({ selection: { anchor: 7, head: 12 } }));
    const mod = /Mac/.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true };
    fireEvent.keyDown(view.contentDOM, { key: 'b', ...mod });
    expect(onChange).toHaveBeenLastCalledWith('Before **words** after');
    fireEvent.keyDown(view.contentDOM, { key: 'b', ...mod });
    expect(onChange).toHaveBeenLastCalledWith('Before words after');
    fireEvent.keyDown(view.contentDOM, { key: 'k', ...mod });
    expect(onChange).toHaveBeenLastCalledWith('Before [words]() after');
    expect(view.state.selection.main.head).toBe(15);
  });
});
