import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNote, fetchImageIntoVault, lookupJson, type VaultFile } from '../../lib/api';
import { kindSpec } from '../../lib/library';
import { AddMedia } from './AddMedia';

// The recorded iTunes answers (test/fixtures/lookup/): a search for "lex fridman", and the show's episodes.
const recorded = (name: string): unknown => JSON.parse(readFileSync(join(process.cwd(), 'test/fixtures/lookup', name), 'utf8'));

vi.mock('../../lib/api', () => ({
  lookupJson: vi.fn(),
  // Every cover is one of the recorded ones.
  lookupImage: vi.fn(() => Promise.resolve(new Uint8Array(readFileSync(join(process.cwd(), 'test/fixtures/lookup/cover-1.png'))).buffer)),
  fetchImageIntoVault: vi.fn(),
  createNote: vi.fn(() => Promise.resolve()),
}));

const files: VaultFile[] = [
  { path: 'Rating/podcasts/00. Podcast 2026.md', kind: 'note' },
  { path: 'Rating/podcasts/Why Dogs Dream.md', kind: 'note' },
  { path: 'Rating/podcasts/_attachments/why-dogs-dream.svg', kind: 'image' },
];

const podcast = kindSpec('podcast') as ReturnType<typeof kindSpec> & { source: 'itunes-podcast' };
const TITLE = 'Jensen Huang: NVIDIA – The $4 Trillion Company & the AI Revolution';

beforeAll(() => {
  // jsdom draws no blobs; a cover only has to be found.
  URL.createObjectURL = vi.fn(() => 'blob:cover');
});

beforeEach(() => {
  vi.mocked(lookupJson).mockImplementation((url: string) =>
    Promise.resolve(recorded(url.includes('entity=podcastEpisode') ? 'itunes-episodes.json' : 'itunes-podcast.json')),
  );
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
      expect.stringMatching(/^https:\/\/is1-ssl\.mzstatic\.com\/.+\/600x600bb\.jpg$/),
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

  it('enters an episode by hand with the show filled in', async () => {
    const { user } = await toEpisodes();
    await user.click(screen.getByTestId('add-manual'));
    expect(screen.getByTestId('add-title')).toHaveValue('');
    expect(screen.getByTestId('add-maker')).toHaveValue('Lex Fridman Podcast');
    expect(screen.getByTestId('add-year')).toHaveValue('');
  });
});
