import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../lib/api';
import { collectLibrary, kindSpec } from '../../lib/library';
import { LibraryView } from './LibraryView';
import { MediaPage } from './MediaPage';

// Finding covers from the library and from a media page, with every lookup answered from the
// recordings in test/fixtures/covers/ and the disk a map of notes.
const fixture = (name: string): unknown => JSON.parse(readFileSync(join(process.cwd(), 'test/fixtures/covers', name), 'utf8'));
const index = fixture('index.json') as Record<string, string>;
const PNG = readFileSync(join(process.cwd(), 'test/fixtures/lookup/cover-1.png'));

const disk = new Map<string, string>();

vi.mock('../../lib/api', () => ({
  readImage: vi.fn(() => Promise.resolve(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>').buffer)),
  lookupJson: vi.fn((url: string) => (index[url] ? Promise.resolve(fixture(index[url])) : Promise.resolve({}))),
  lookupImage: vi.fn(() => Promise.resolve(new Uint8Array(PNG).buffer)),
  readNote: vi.fn((path: string) => Promise.resolve(disk.get(path) ?? '')),
  writeNote: vi.fn((path: string, text: string, expected: string) => {
    if (disk.get(path) !== expected) return Promise.reject(new Error('the note changed on disk since it was opened'));
    disk.set(path, text);
    return Promise.resolve();
  }),
  fetchImageIntoVault: vi.fn((_url: string, path: string) => Promise.resolve(path.replace(/\.jpg$/, '.png'))),
}));

beforeAll(() => {
  document.documentElement.dataset.motion = 'off';
  // jsdom has no blob URLs; a cover is shown from one.
  URL.createObjectURL = () => 'blob:cover';
});

// As the vault's notes are, without a cover: an album added by hand, a film with no director.
const ANTICS = '---\nArtist: Interpol\nYear:\nlistened: 2026-10-07\ngenre:\nrating: 77\nfavorite tracks:\n---\n[[00. Music 2026 MOC|music 2026]]\n';
const IKIRU = '---\nrating: 90\nYear: 1952\ngenre:\n  - drama\nWatched: 2026-01-31\n---\n[[00. Kino 2026]]\nA clerk learns he is ill.\n';
const notes = [
  { path: 'Rating/music/Antics.md', text: ANTICS },
  { path: 'Rating/kino/Ikiru (Жить).md', text: IKIRU },
];
const files: api.VaultFile[] = [...notes.map((note) => ({ path: note.path, kind: 'note' as const })), { path: 'Rating/kino/_attachments/old.png', kind: 'image' }];

beforeEach(() => {
  vi.clearAllMocks();
  disk.clear();
  for (const note of notes) disk.set(note.path, note.text);
});

const row = (title: string) => screen.getAllByTestId('covers-row').find((found) => found.getAttribute('data-path')?.includes(title))!;

describe('Find covers, in the library', () => {
  it('offers the notes in view without a cover, finds them, ticks the sure ones and saves those ticked', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn(() => Promise.resolve());
    render(<LibraryView library={collectLibrary(notes, files)} files={files} tab="all" onTab={vi.fn()} today={new Date(2026, 9, 28)} onOpenNote={vi.fn()} onCreated={vi.fn(() => Promise.resolve())} onChanged={onChanged} />);
    expect(screen.getByTestId('library-missing')).toHaveTextContent('2 without a cover · Find covers');
    await user.click(screen.getByTestId('find-covers-open'));
    expect(screen.getByRole('dialog', { name: 'Find covers' })).toHaveTextContent('2 notes without a cover');

    await waitFor(() => expect(screen.getAllByTestId('covers-row').map((found) => found.getAttribute('data-status'))).toEqual(['found', 'found']), { timeout: 5000 });
    expect(within(row('Antics')).getByTestId('covers-found')).toHaveTextContent('Antics · Interpol · 2004');
    expect(row('Antics')).toHaveTextContent('Sure · fills Year, genre');
    expect(within(row('Ikiru')).getByTestId('covers-found')).toHaveTextContent('Ikiru · Akira Kurosawa · 1952');
    expect(row('Ikiru')).toHaveTextContent('fills Director');
    expect(screen.getByTestId('covers-hint')).toHaveTextContent('Searched all 2 · 2 found, 2 sure.');

    // Unticked, the film is left as it is.
    await user.click(within(row('Ikiru')).getByTestId('covers-tick'));
    await user.click(screen.getByTestId('covers-save'));
    await waitFor(() => expect(screen.getByTestId('covers-hint')).toHaveTextContent('Saved 1 cover.'));
    expect(api.fetchImageIntoVault).toHaveBeenCalledWith('https://coverartarchive.org/release-group/bc7740e1-02c9-3ab7-9869-0e0c79acf941/front-500', 'Rating/music/_attachments/antics.jpg');
    expect(api.writeNote).toHaveBeenCalledTimes(1);
    expect(disk.get('Rating/music/Antics.md')).toBe(
      '---\nArtist: Interpol\nYear: 2004\nlistened: 2026-10-07\ngenre:\n  - indie rock\n  - alternative rock\n  - indie\nrating: 77\nfavorite tracks:\n---\n[[00. Music 2026 MOC|music 2026]]\n\n![[antics.png|240]]\n',
    );
    expect(disk.get('Rating/kino/Ikiru (Жить).md')).toBe(IKIRU);
    expect(onChanged).toHaveBeenCalled();
    expect(row('Antics')).toHaveAttribute('data-status', 'saved');
    await user.click(screen.getByTestId('covers-done'));
    expect(screen.queryByTestId('find-covers')).not.toBeInTheDocument();
  });

  it('asks before closing with ticked covers unsaved, and skips a note', async () => {
    const user = userEvent.setup();
    render(<LibraryView library={collectLibrary(notes, files)} files={files} tab="album" onTab={vi.fn()} today={new Date(2026, 9, 28)} onOpenNote={vi.fn()} onCreated={vi.fn(() => Promise.resolve())} onChanged={vi.fn(() => Promise.resolve())} />);
    await user.click(screen.getByTestId('find-covers-open'));
    expect(screen.getByRole('dialog', { name: 'Find covers' })).toHaveTextContent('Find covers · Albums1 note without a cover');
    await waitFor(() => expect(row('Antics')).toHaveAttribute('data-ticked', 'true'), { timeout: 5000 });
    await user.click(screen.getByTestId('covers-close'));
    expect(screen.getByTestId('find-covers')).toHaveTextContent("1 ticked cover isn't saved.");
    await user.click(within(row('Antics')).getByTestId('covers-skip'));
    expect(row('Antics')).toHaveAttribute('data-status', 'skipped');
    expect(screen.getByTestId('covers-save')).toBeDisabled();
    await user.click(screen.getByTestId('covers-close'));
    expect(screen.queryByTestId('find-covers')).not.toBeInTheDocument();
    expect(api.writeNote).not.toHaveBeenCalled();
  });
});

function renderPage(text: string, onCoverSaved = vi.fn(() => Promise.resolve())) {
  render(
    <MediaPage
      spec={kindSpec('film')}
      path="Rating/kino/Ikiru (Жить).md"
      text={text}
      files={files}
      onOpenLink={vi.fn()}
      onSetProperty={vi.fn()}
      onSaveThoughts={vi.fn(() => Promise.resolve())}
      onUnsavedThoughts={vi.fn()}
      linkTargets={[]}
      onEdit={vi.fn()}
      onOpenLibrary={vi.fn()}
      onCoverSaved={onCoverSaved}
    />,
  );
  return onCoverSaved;
}

describe('Find cover, on a media page', () => {
  it('offers the best few, the sure one chosen, and saves it with what the note leaves empty', async () => {
    const user = userEvent.setup();
    const onCoverSaved = renderPage(IKIRU);
    await user.click(screen.getByTestId('find-cover-open'));
    expect(screen.getByRole('dialog', { name: 'Find a cover' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByTestId('cover-choice')).toHaveLength(1));
    const [ikiru] = screen.getAllByTestId('cover-choice');
    expect(ikiru).toHaveAttribute('aria-pressed', 'true');
    expect(ikiru).toHaveTextContent('IkiruAkira Kurosawa · 1952Best match');
    expect(screen.getByTestId('cover-where')).toHaveTextContent('Saves the cover in Rating/kino/_attachments and fills Director.');
    await user.click(screen.getByTestId('cover-save'));
    await waitFor(() => expect(onCoverSaved).toHaveBeenCalled());
    expect(api.fetchImageIntoVault).toHaveBeenCalledWith('https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3a/Ikiru_poster.jpg/500px-Ikiru_poster.jpg', 'Rating/kino/_attachments/ikiru-жить.jpg');
    expect(disk.get('Rating/kino/Ikiru (Жить).md')).toBe(
      '---\nrating: 90\nDirector: Akira Kurosawa\nYear: 1952\ngenre:\n  - drama\nWatched: 2026-01-31\n---\n[[00. Kino 2026]]\n\n![[ikiru-жить.png|200]]\n\nA clerk learns he is ill.\n',
    );
    expect(screen.queryByTestId('find-cover')).not.toBeInTheDocument();
  });

  it('reads a typed search’s pick for what it fills in, and stays open until the cover is saved', async () => {
    const user = userEvent.setup();
    const bare = IKIRU.replace('genre:\n  - drama\n', '');
    disk.set('Rating/kino/Ikiru (Жить).md', bare);
    const onCoverSaved = renderPage(bare);
    await user.click(screen.getByTestId('find-cover-open'));
    await waitFor(() => expect(screen.getAllByTestId('cover-choice')).toHaveLength(1));
    // Other words, sent with Enter: the result as the search gives it, then its Wikidata facts once picked.
    await user.clear(screen.getByTestId('cover-search'));
    await user.type(screen.getByTestId('cover-search'), 'Ikiru 1952{Enter}');
    await waitFor(() => expect(screen.getByTestId('cover-where')).toHaveTextContent('Saves the cover in Rating/kino/_attachments and fills Director, Genre.'));

    // While it saves, neither ×, Cancel nor Escape closes the sheet.
    let finish = () => {};
    vi.mocked(api.fetchImageIntoVault).mockImplementationOnce((_url, path) => new Promise((done) => (finish = () => done(path))));
    await user.click(screen.getByTestId('cover-save'));
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('find-cover')).toBeInTheDocument();
    finish();
    await waitFor(() => expect(onCoverSaved).toHaveBeenCalled());
    expect(disk.get('Rating/kino/Ikiru (Жить).md')).toContain('Director: Akira Kurosawa\nYear: 1952\nWatched: 2026-01-31\nGenre:\n  - drama\n');
    expect(screen.queryByTestId('find-cover')).not.toBeInTheDocument();
  });

  it('changes a cover by pointing its embed at the new image, and leaves a note that changed meanwhile', async () => {
    const user = userEvent.setup();
    const covered = IKIRU.replace('[[00. Kino 2026]]\n', '[[00. Kino 2026]]\n\n![[old.png|200]]\n\n');
    disk.set('Rating/kino/Ikiru (Жить).md', covered);
    renderPage(covered);
    await user.click(screen.getByTestId('find-cover-open'));
    expect(screen.getByRole('dialog', { name: 'Change the cover' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('cover-save')).toBeEnabled());
    await user.click(screen.getByTestId('cover-save'));
    await waitFor(() => expect(api.writeNote).toHaveBeenCalled());
    expect(disk.get('Rating/kino/Ikiru (Жить).md')).toBe(covered.replace('![[old.png|200]]', '![[ikiru-жить.png|200]]'));

    // Edited elsewhere since the page showed it: nothing is downloaded or written.
    vi.clearAllMocks();
    disk.set('Rating/kino/Ikiru (Жить).md', `${covered}Edited in Obsidian.\n`);
    await user.click(screen.getByTestId('find-cover-open'));
    await waitFor(() => expect(screen.getByTestId('cover-save')).toBeEnabled());
    await user.click(screen.getByTestId('cover-save'));
    await waitFor(() => expect(screen.getByTestId('cover-error')).toHaveTextContent(/changed since its cover was looked for/));
    expect(api.fetchImageIntoVault).not.toHaveBeenCalled();
    expect(api.writeNote).not.toHaveBeenCalled();
  });
});
