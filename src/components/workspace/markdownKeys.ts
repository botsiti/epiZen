import { EditorSelection } from '@codemirror/state';
import type { Command } from '@codemirror/view';

function wrap(marker: string): Command {
  return (view) => {
    const { state } = view;
    view.dispatch(state.changeByRange(({ from, to }) => {
      const size = marker.length;
      const selected = state.sliceDoc(from, to);
      if (from >= size && state.sliceDoc(from - size, from) === marker && state.sliceDoc(to, to + size) === marker) {
        return { changes: [{ from: from - size, to: from }, { from: to, to: to + size }], range: EditorSelection.range(from - size, to - size) };
      }
      if (selected.length > size * 2 && selected.startsWith(marker) && selected.endsWith(marker)) {
        const insert = selected.slice(size, -size);
        return { changes: { from, to, insert }, range: EditorSelection.range(from, from + insert.length) };
      }
      return { changes: { from, to, insert: marker + selected + marker }, range: EditorSelection.range(from + size, to + size) };
    }), { userEvent: 'input.format' });
    return true;
  };
}

const insertLink: Command = (view) => {
  const { state } = view;
  view.dispatch(state.changeByRange(({ from, to }) => {
    const selected = state.sliceDoc(from, to);
    const url = /^(?:https?:\/\/|mailto:)\S+$/.test(selected);
    const label = url ? '' : selected.replace(/[\\[\]]/g, '\\$&');
    const address = url ? selected.replace(/\(/g, '%28').replace(/\)/g, '%29') : '';
    const insert = `[${label}](${address})`;
    return { changes: { from, to, insert }, range: EditorSelection.cursor(url || !label ? from + 1 : from + label.length + 3) };
  }), { userEvent: 'input.format' });
  return true;
};

export const MARKDOWN_KEYS = [
  { key: 'Mod-b', run: wrap('**'), label: 'Bold', keys: '⌘B' },
  { key: 'Mod-i', run: wrap('_'), label: 'Italic', keys: '⌘I' },
  { key: 'Mod-Shift-x', run: wrap('~~'), label: 'Strikethrough', keys: '⇧⌘X' },
  { key: 'Mod-Alt-c', run: wrap('`'), label: 'Inline code', keys: '⌥⌘C' },
  { key: 'Mod-k', run: insertLink, label: 'Insert Markdown link', keys: '⌘K' },
];
