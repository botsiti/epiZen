import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lookupJson } from '../../lib/api';
import { AlbumTracks } from './AlbumTracks';
vi.mock('../../lib/api', () => ({ lookupJson: vi.fn() }));
beforeEach(() => { vi.mocked(lookupJson).mockReset(); });
describe('favorite tracks', () => {
  it('selects an album page, stars titles, saves the track list and favorites together', async () => {
    const user = userEvent.setup(), onSave = vi.fn(() => Promise.resolve());
    vi.mocked(lookupJson).mockImplementation((url) => Promise.resolve(JSON.parse(readFileSync(`test/fixtures/lookup/wikipedia-album-${url.includes('action=parse') ? 'tracks' : 'search'}.json`, 'utf8'))));
    render(<AlbumTracks title="Dog Man Star" maker="Suede" tracks={[]} favorites={[]} favoriteKey="favorite tracks" onSave={onSave} />);
    expect(lookupJson).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('find-tracks'));
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await user.click(await screen.findByRole('button', { name: /Dog Man Star1994/ }));
    const star = await screen.findByRole('button', { name: 'Favorite We Are the Pigs' });
    await user.click(star);
    expect(star).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Save favorites' }));
    expect(onSave).toHaveBeenCalledWith([{ key: 'tracks', before: [], after: expect.arrayContaining(['We Are the Pigs', 'Still Life']) as string[] }, { key: 'favorite tracks', before: [], after: ['We Are the Pigs'] }]);
  });
  it('reports lookup failure and keeps existing favorites readable', async () => {
    const user = userEvent.setup();
    vi.mocked(lookupJson).mockRejectedValue(new Error('offline'));
    render(<AlbumTracks title="Album" tracks={['One', 'Two']} favorites={['Two']} favoriteKey="favorite tracks" onSave={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Favorite Two' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByTestId('find-tracks'));
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('offline');
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Favorite Two' })).toHaveAttribute('aria-pressed', 'true');
  });
});
