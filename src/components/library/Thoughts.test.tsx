import { EditorView } from '@codemirror/view';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { VaultFile } from '../../lib/api';
import { coverEmbed, kindSpec } from '../../lib/library';
import { linkResolver } from '../../lib/links';
import { parseNote } from '../../lib/frontmatter';
import { Thoughts } from './Thoughts';

vi.mock('../../lib/api', () => ({
  readImage: vi.fn(() => Promise.resolve(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>').buffer)),
}));

const files: VaultFile[] = [
  { path: 'Rating/music/00. Music 2026 MOC.md', kind: 'note' },
  { path: 'Rating/music/Quiet Machinery.md', kind: 'note' },
  { path: 'Rating/music/_attachments/quiet-machinery.svg', kind: 'image' },
];
const PATH = 'Rating/music/Quiet Machinery.md';

// demo-vault/Rating/music/Quiet Machinery.md, as written.
const ALBUM = `---
Artist: Lattice & Loom
Year: 2021
listened: 2026-09-15
genre:
  - IDM
rating: 80
favorite tracks:
  - Gearbox Lullaby
---
[[00. Music 2026 MOC|music 2026]]

![[quiet-machinery.svg|240]]

Sounds like the weather outside today. In a good way. Listened on [[15.09.2026]].
`;
const HEAD = ALBUM.slice(0, ALBUM.indexOf('Sounds like'));

function renderThoughts(text: string, onSave = vi.fn<(before: string, after: string) => Promise<void>>(() => Promise.resolve())) {
  const onOpenLink = vi.fn();
  const onUnsaved = vi.fn();
  const cover = coverEmbed(parseNote(text).body, PATH, linkResolver(files))?.link;
  render(
    <Thoughts spec={kindSpec('album')} path={PATH} text={text} files={files} cover={cover} onOpenLink={onOpenLink} linkTargets={[]} onSave={onSave} onUnsaved={onUnsaved} />,
  );
  return { onSave, onOpenLink, onUnsaved };
}

/** Types at the end of the open editor, as a paste does. */
function type(text: string) {
  const host = screen.getByTestId('editor').querySelector<HTMLElement>('.cm-editor');
  const view = host && EditorView.findFromDOM(host);
  if (!view) throw new Error('no editor');
  act(() => view.dispatch({ changes: { from: view.state.doc.length, insert: text }, userEvent: 'input.paste' }));
}

describe('Thoughts', () => {
  it('shows the text under the overview link, without the cover the hero already shows', () => {
    renderThoughts(ALBUM);
    const card = screen.getByTestId('media-text');
    expect(card.querySelector('a[data-wikilink="00. Music 2026 MOC"]')).not.toBeNull();
    expect(card.querySelector('img')).toBeNull();
    expect(screen.getByTestId('thoughts-text')).toHaveTextContent('Sounds like the weather outside today.');
  });

  it('opens a note with no text yet for writing, and saves the first thought under its link', async () => {
    const { onSave } = renderThoughts(HEAD);
    fireEvent.click(screen.getByRole('button', { name: 'What did you think of this album?' }));
    expect(screen.getByTestId('editor')).toBeInTheDocument();
    type('Weird and lovely.');
    fireEvent.click(screen.getByTestId('thoughts-done'));
    await waitFor(() => expect(screen.queryByTestId('editor')).toBeNull());
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenLastCalledWith('', 'Weird and lovely.');
  });

  it('opens the text for writing on a click, but a link clicked in it is followed', () => {
    const { onOpenLink } = renderThoughts(ALBUM);
    fireEvent.click(screen.getByTestId('thoughts-text').querySelector('a[data-wikilink="15.09.2026"]') as Element);
    expect(onOpenLink).toHaveBeenCalled();
    expect(screen.queryByTestId('editor')).toBeNull();
    fireEvent.click(screen.getByText(/Sounds like the weather/));
    expect(screen.getByTestId('editor')).toHaveTextContent('Sounds like the weather outside today.');
  });

  it('saves on its own a moment after the last change, from what it last saved', async () => {
    vi.useFakeTimers();
    try {
      const { onSave } = renderThoughts(ALBUM);
      fireEvent.click(screen.getByTestId('thoughts-write'));
      type('More.');
      expect(onSave).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(600);
      const before = 'Sounds like the weather outside today. In a good way. Listened on [[15.09.2026]].\n';
      expect(onSave).toHaveBeenLastCalledWith(before, `${before}More.`);
      type(' Again.');
      await vi.advanceTimersByTimeAsync(600);
      expect(onSave).toHaveBeenLastCalledWith(`${before}More.`, `${before}More. Again.`);
      expect(screen.getByTestId('thoughts-state')).toHaveTextContent('Saved');
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the text on screen and stays open when it can't be saved", async () => {
    const onSave = vi.fn(() => Promise.reject(new Error("the note's text was changed somewhere else")));
    renderThoughts(ALBUM, onSave);
    fireEvent.click(screen.getByTestId('thoughts-write'));
    type('Mine.');
    fireEvent.click(screen.getByTestId('thoughts-done'));
    await waitFor(() => expect(screen.getByTestId('thoughts-error')).toHaveTextContent("the note's text was changed somewhere else"));
    expect(screen.getByTestId('thoughts-state')).toHaveTextContent('Not saved');
    expect(screen.getByTestId('editor')).toHaveTextContent('Mine.');
  });

  it('closes on Escape once saved', async () => {
    const { onSave } = renderThoughts(ALBUM);
    fireEvent.click(screen.getByTestId('thoughts-write'));
    type('Yes.');
    const content = screen.getByTestId('editor').querySelector('.cm-content') as HTMLElement;
    fireEvent.keyDown(content, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('editor')).toBeNull());
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("offers no writing in a note with mixed line endings, where a save would change lines it didn't touch", () => {
    renderThoughts(ALBUM.replace('rating: 80\n', 'rating: 80\r\n'));
    expect(screen.queryByTestId('thoughts-write')).toBeNull();
    fireEvent.click(screen.getByText(/Sounds like the weather/));
    expect(screen.queryByTestId('editor')).toBeNull();
  });
});
