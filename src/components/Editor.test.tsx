import { EditorView } from '@codemirror/view';
import { render, screen } from '@testing-library/react';
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
});
