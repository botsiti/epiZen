import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNote, fetchImageIntoVault, lookupJson, type VaultFile } from '../../lib/api';
import { kindSpec } from '../../lib/library';
import { podcastSettings, type PodcastArtwork } from '../../lib/podcasts';
import { AddMedia } from './AddMedia';
import { LibraryView } from './LibraryView';

// The recorded answers (test/fixtures/lookup/), picked by URL as the e2e build picks them: iTunes's
// search for "lex fridman" and the show's episodes, Wikipedia's for "american fiction film" and
// "life 3.0 book", Wikidata's for American Fiction and Life 3.0, Open Library's for "life 3.0".
const recorded = (name: string): unknown => JSON.parse(readFileSync(join(process.cwd(), 'test/fixtures/lookup', name), 'utf8'));
function answerFor(url: string): string {
  const at = new URL(url);
  const param = (name: string) => at.searchParams.get(name) ?? '';
  if (at.hostname === 'en.wikipedia.org') return param('gsrsearch').endsWith(' film') ? 'wikipedia-film.json' : 'wikipedia-book.json';
  if (at.hostname === 'www.wikidata.org') {
    if (param('props') === 'claims') return param('ids') === 'Q48093278' ? 'wikidata-book-claims.json' : 'wikidata-film-claims.json';
    return param('ids').includes('Q2076321') ? 'wikidata-book-labels.json' : 'wikidata-film-labels.json';
  }
  if (at.hostname === 'openlibrary.org') return 'openlibrary-search.json';
  return url.includes('entity=podcastEpisode') ? 'itunes-episodes.json' : 'itunes-podcast.json';
}

vi.mock('../../lib/api', () => ({
  lookupJson: vi.fn(),
  // Every cover is one of the recorded ones.
  lookupImage: vi.fn(() => Promise.resolve(new Uint8Array(readFileSync(join(process.cwd(), 'test/fixtures/lookup/cover-1.png'))).buffer)),
  fetchImageIntoVault: vi.fn(),
  createNote: vi.fn(() => Promise.resolve()),
}));

const files: VaultFile[] = [
  { path: 'Rating/kino/00. Kino 2026.md', kind: 'note' },
  { path: 'Rating/books/00. Books.md', kind: 'note' },
  { path: 'Rating/podcasts/00. Podcast 2026.md', kind: 'note' },
  { path: 'Rating/podcasts/Why Dogs Dream.md', kind: 'note' },
  { path: 'Rating/podcasts/_attachments/why-dogs-dream.svg', kind: 'image' },
];

const podcast = kindSpec('podcast') as ReturnType<typeof kindSpec> & { source: 'itunes-podcast' };
const film = kindSpec('film') as ReturnType<typeof kindSpec> & { source: 'wikipedia-film' };
const book = kindSpec('book') as ReturnType<typeof kindSpec> & { source: 'wikipedia-openlibrary' };
const TITLE = 'Jensen Huang: NVIDIA – The $4 Trillion Company & the AI Revolution';

beforeAll(() => {
  // jsdom draws no blobs; a cover only has to be found.
  URL.createObjectURL = vi.fn(() => 'blob:cover');
});

beforeEach(() => {
  vi.mocked(lookupJson).mockReset();
  vi.mocked(lookupJson).mockImplementation((url: string) => Promise.resolve(recorded(answerFor(url))));
  vi.mocked(fetchImageIntoVault).mockReset();
  vi.mocked(fetchImageIntoVault).mockImplementation((_url: string, path: string) => Promise.resolve(path.replace(/\.jpg$/, '.png')));
  vi.mocked(createNote).mockClear();
});

async function toEpisodes() {
  const user = userEvent.setup();
  const onCreated = vi.fn(() => Promise.resolve());
  const onClose = vi.fn();
  render(<AddMedia spec={podcast} files={files} today={new Date(2026, 9, 28)} onClose={onClose} onCreated={onCreated} />);
  await user.type(screen.getByTestId('add-search'), 'lex fridman');
  await screen.findAllByTestId('add-result', {}, { timeout: 2000 });
  await user.click(document.querySelector('[data-testid="add-result"][data-id="1434243584"]')!);
  await screen.findAllByTestId('add-episode');
  return { user, onCreated, onClose };
}

describe('adding a podcast episode', () => {
  it.each<PodcastArtwork>(['show', 'episode'])('downloads the artwork chosen in the %s setting through the library', async (artwork) => {
    const user = userEvent.setup();
    const onCreated = vi.fn(() => Promise.resolve());
    const showArt = 'https://is1-ssl.mzstatic.com/show/600x600bb.jpg';
    const episodeArt = 'https://is1-ssl.mzstatic.com/episode/600x600bb.jpg';
    vi.mocked(lookupJson).mockImplementation((url) => Promise.resolve({ results: url.includes('/lookup')
      ? [{ kind: 'podcast-episode', trackId: 2, trackName: 'Sleep', collectionName: 'Huberman Lab', artworkUrl600: episodeArt }]
      : [{ kind: 'podcast', collectionId: 1, collectionName: 'Huberman Lab', artworkUrl600: showArt }] }));
    render(<LibraryView library={new Map()} files={files} tab="podcast" onTab={vi.fn()} layout="covers" onLayout={vi.fn()} hidden={[]} onHidden={vi.fn()} today={new Date(2026, 9, 28)}
      podcastArtwork={podcastSettings({ artwork }).artwork} onOpenNote={vi.fn()} onCreated={onCreated} onChanged={vi.fn(() => Promise.resolve())} />);
    await user.click(screen.getAllByTestId('library-add').find((button) => button.getAttribute('data-kind') === 'podcast')!);
    await user.type(screen.getByTestId('add-search'), 'Huberman');
    await user.click(await screen.findByTestId('add-result'));
    await user.click(await screen.findByTestId('add-episode'));
    await user.click(screen.getByTestId('add-save'));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(fetchImageIntoVault).toHaveBeenCalledWith(artwork === 'show' ? showArt : episodeArt, 'Rating/podcasts/_attachments/sleep.jpg');
  });

  it('finds the show, lists its episodes newest first, and narrows them by what is typed', async () => {
    const { user } = await toEpisodes();
    expect(lookupJson).toHaveBeenLastCalledWith('https://itunes.apple.com/lookup?id=1434243584&media=podcast&entity=podcastEpisode&limit=200');
    expect(screen.getByTestId('add-show-title')).toHaveTextContent('Lex Fridman Podcast');
    expect(screen.getAllByTestId('add-episode')).toHaveLength(16);
    expect(screen.getByTestId('episode-hint')).toHaveTextContent('The latest 16 episodes');
    expect(screen.getAllByTestId('add-episode')[0]).toHaveTextContent('AI Crisis in Math');
    expect(screen.getAllByTestId('add-episode')[0]).toHaveTextContent('26 October 2026 · 3 h 43 min');

    await user.type(screen.getByTestId('episode-filter'), 'jensen');
    expect(screen.getAllByTestId('add-episode')).toHaveLength(1);
    expect(screen.getByTestId('episode-hint')).toHaveTextContent('1 of the latest 16 episodes');
    await user.clear(screen.getByTestId('episode-filter'));
    await user.type(screen.getByTestId('episode-filter'), 'no such guest');
    expect(screen.queryAllByTestId('add-episode')).toHaveLength(0);
    expect(screen.getByTestId('episode-hint')).toHaveTextContent('No episode here has “no such guest”.');
  });

  it('fills the form from the episode, and writes its note and cover in the vault\'s format', async () => {
    const { user, onCreated } = await toEpisodes();
    await user.type(screen.getByTestId('episode-filter'), 'jensen');
    await user.click(screen.getByTestId('add-episode'));

    expect(screen.getByTestId('add-title')).toHaveValue(TITLE);
    expect(screen.getByTestId('add-maker')).toHaveValue('Lex Fridman Podcast');
    expect(screen.getByTestId('add-year')).toHaveValue('2026');
    expect(screen.getByTestId('add-date')).toHaveValue('2026-10-28');
    expect(screen.getByTestId('add-back')).toHaveTextContent('← Episodes');
    expect(screen.getByTestId('add-where')).toHaveTextContent('Rating/podcasts/Jensen Huang - NVIDIA – The $4 Trillion Company & the AI Revolution.md');

    await user.type(screen.getByTestId('add-rating'), '77');
    // The date from the calendar: back a month, the 21st.
    await user.click(screen.getByTestId('add-date'));
    await user.click(screen.getByTestId('date-picker-prev'));
    await user.click(document.querySelector('[data-testid="date-picker-day"][data-date="2026-09-21"]')!);
    expect(screen.getByTestId('add-date')).toHaveValue('2026-09-21');
    await user.click(screen.getByTestId('add-save'));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const path = 'Rating/podcasts/Jensen Huang - NVIDIA – The $4 Trillion Company & the AI Revolution.md';
    expect(fetchImageIntoVault).toHaveBeenCalledWith(
      'https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/ea/42/d7/ea42d7b1-8d4e-dd97-da5d-c508756550ca/mza_16782152345430036863.jpg/600x600bb.jpg',
      'Rating/podcasts/_attachments/jensen-huang-nvidia-the-4-trillion-company-and-the-ai-revolution.jpg',
    );
    expect(createNote).toHaveBeenCalledWith(
      path,
      '---\nAuthor: Lex Fridman Podcast\nRating: 77\nYear: 2026\nGenre:\n  - technology\nListened: 2026-09-21\n---\n[[00. Podcast 2026]]\n\n![[jensen-huang-nvidia-the-4-trillion-company-and-the-ai-revolution.png|240]]\n',
    );
    expect(onCreated).toHaveBeenCalledWith(path);
  });

  it('steps back with Escape: from the form to the episodes, to the shows, then out; a date\'s calendar closes first', async () => {
    const { user, onClose } = await toEpisodes();
    await user.click(screen.getAllByTestId('add-episode')[0]!);
    await user.click(screen.getByTestId('add-date'));
    expect(screen.getByTestId('date-picker')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('date-picker')).toBeNull();
    expect(screen.getByTestId('add-form')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.getAllByTestId('add-episode')).toHaveLength(16);
    await user.keyboard('{Escape}');
    expect(screen.getAllByTestId('add-result').length).toBeGreaterThan(0);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('enters an episode by hand with the show and its cover filled in', async () => {
    const { user } = await toEpisodes();
    await user.click(screen.getByTestId('add-manual'));
    expect(screen.getByTestId('add-title')).toHaveValue('');
    expect(screen.getByTestId('add-maker')).toHaveValue('Lex Fridman Podcast');
    expect(screen.getByTestId('add-year')).toHaveValue('');
    await user.type(screen.getByTestId('add-title'), 'An older episode');
    await user.click(screen.getByTestId('add-save'));
    await waitFor(() => expect(createNote).toHaveBeenCalled());
    expect(fetchImageIntoVault).toHaveBeenCalledWith(
      'https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/ea/42/d7/ea42d7b1-8d4e-dd97-da5d-c508756550ca/mza_16782152345430036863.jpg/600x600bb.jpg',
      'Rating/podcasts/_attachments/an-older-episode.jpg',
    );
  });
});

/** A result card's title and the line under it, whether or not its cover has loaded. */
const lines = (result: HTMLElement) => [result.querySelector('.add-result-title')?.textContent, result.querySelector('.add-result-meta')?.textContent];

describe('adding a film from Wikipedia', () => {
  it('lists the films found, reads Wikidata while one is pointed at, and fills the form with its director, year and genre', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn(() => Promise.resolve());
    render(<AddMedia spec={film} files={files} today={new Date(2026, 9, 28)} onClose={vi.fn()} onCreated={onCreated} />);
    await user.type(screen.getByTestId('add-search'), 'american fiction');
    await screen.findAllByTestId('add-result', {}, { timeout: 2000 });
    expect(lookupJson).toHaveBeenCalledWith(expect.stringContaining('gsrsearch=american%20fiction%20film&'));
    expect(screen.getAllByTestId('add-result').map(lines)).toEqual([
      ['American Fiction', '2023 film by Cord Jefferson'],
      ['Pulp Fiction', '1994 film by Quentin Tarantino'],
      ['I, Robot', '2004 film by Alex Proyas'],
    ]);
    // One service: no card says where it is from.
    expect(screen.queryByTestId('add-result-from')).toBeNull();
    expect(screen.getByTestId('add-hint')).toHaveTextContent('3 found on Wikipedia.');

    const first = screen.getAllByTestId('add-result')[0]!;
    await user.hover(first);
    await waitFor(() => expect(lookupJson).toHaveBeenCalledWith(expect.stringContaining('www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=Q116413183&props=claims')));
    await user.click(first);
    await screen.findByTestId('add-form');
    expect(screen.getByTestId('add-title')).toHaveValue('American Fiction');
    expect(screen.getByTestId('add-maker')).toHaveValue('Cord Jefferson');
    expect(screen.getByTestId('add-year')).toHaveValue('2023');
    expect(screen.getByTestId('add-form')).toHaveTextContent('drama');
    // Wikidata was read once, while pointed at: picking asked nothing more.
    expect(vi.mocked(lookupJson).mock.calls.filter(([url]) => url.includes('wikidata'))).toHaveLength(2);

    await user.type(screen.getByTestId('add-rating'), '80');
    await user.clear(screen.getByTestId('add-date'));
    await user.type(screen.getByTestId('add-date'), '2026-10-07');
    await user.keyboard('{Escape}');
    await user.click(screen.getByTestId('add-save'));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('Rating/kino/American Fiction.md'));
    expect(fetchImageIntoVault).toHaveBeenCalledWith('https://upload.wikimedia.org/wikipedia/en/d/d7/American_fiction_xxlg.jpg', 'Rating/kino/_attachments/american-fiction.jpg');
    expect(createNote).toHaveBeenCalledWith(
      'Rating/kino/American Fiction.md',
      '---\nDirector: Cord Jefferson\nYear: 2023\nWatched: 2026-10-07\nGenre:\n  - drama\nRating: 80\n---\n[[00. Kino 2026]]\n\n![[american-fiction.png|200]]\n',
    );
  });
});

describe('adding a book from Wikipedia and Open Library', () => {
  it('shows Wikipedia\'s books as soon as they land, then Open Library\'s, each saying where it is from, a book both have once', async () => {
    const user = userEvent.setup();
    let openLibrary: (value: unknown) => void = () => undefined;
    vi.mocked(lookupJson).mockImplementation((url: string) =>
      url.includes('openlibrary.org') ? new Promise((resolve) => (openLibrary = resolve)) : Promise.resolve(recorded(answerFor(url))),
    );
    render(<AddMedia spec={book} files={files} today={new Date(2026, 9, 28)} onClose={vi.fn()} onCreated={vi.fn(() => Promise.resolve())} />);
    expect(screen.getByTestId('add-hint')).toHaveTextContent('Searches Wikipedia and Open Library as you type.');
    await user.type(screen.getByTestId('add-search'), 'life 3.0');
    await screen.findAllByTestId('add-result', {}, { timeout: 2000 });
    expect(screen.getAllByTestId('add-result')).toHaveLength(1);
    expect(screen.getByTestId('add-hint')).toHaveTextContent('Asking Open Library…');

    openLibrary(recorded('openlibrary-search.json'));
    await waitFor(() => expect(screen.getAllByTestId('add-result')).toHaveLength(5));
    expect(screen.getAllByTestId('add-result-from').map((tag) => tag.textContent)).toEqual(['Wikipedia', 'Open Library', 'Open Library', 'Open Library', 'Open Library']);
    expect(lines(screen.getAllByTestId('add-result')[0]!)).toEqual(['Life 3.0', '2017 book by Max Tegmark on artificial intelligence']);
    expect(screen.getByTestId('add-hint')).toHaveTextContent('5 found on Wikipedia and Open Library.');

    await user.click(screen.getAllByTestId('add-result')[0]!);
    await screen.findByTestId('add-form');
    expect(screen.getByTestId('add-maker')).toHaveValue('Max Tegmark');
    expect(screen.getByTestId('add-year')).toHaveValue('2017');
    expect(screen.getByTestId('add-form')).toHaveTextContent('popular science');
  });

  it('shows one service\'s books when the other doesn\'t answer, and says so', async () => {
    const user = userEvent.setup();
    vi.mocked(lookupJson).mockImplementation((url: string) => (url.includes('openlibrary.org') ? Promise.reject(new Error('the service is busy')) : Promise.resolve(recorded(answerFor(url)))));
    render(<AddMedia spec={book} files={files} today={new Date(2026, 9, 28)} onClose={vi.fn()} onCreated={vi.fn(() => Promise.resolve())} />);
    await user.type(screen.getByTestId('add-search'), 'life 3.0');
    await waitFor(() => expect(screen.getByTestId('add-hint')).toHaveTextContent("Open Library didn't answer; these are from Wikipedia."));
    expect(screen.getAllByTestId('add-result')).toHaveLength(1);
  });
});

it('offers library genre matches in the add form and saves the selection', async () => {
  const user = userEvent.setup();
  const album = kindSpec('album') as ReturnType<typeof kindSpec> & { source: 'musicbrainz' };
  render(<AddMedia spec={album} files={files} today={new Date(2026, 9, 28)} genreSuggestions={['psychedelic', 'psychedelic rock', 'ambient']} onClose={vi.fn()} onCreated={vi.fn().mockResolvedValue(undefined)} />);
  await user.click(screen.getByTestId('add-manual'));
  await user.type(screen.getByTestId('add-title'), 'New album');
  await user.type(screen.getByTestId('add-genre'), 'psycho');
  expect(screen.getByRole('group', { name: 'Suggested genres' })).toHaveTextContent('psychedelic rock');
  await user.click(screen.getByRole('button', { name: 'psychedelic' }));
  expect(screen.getByTestId('add-genre')).toHaveValue('');
  await user.click(screen.getByTestId('add-save'));
  await waitFor(() => expect(createNote).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('  - psychedelic\n')));
});
