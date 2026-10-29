import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PERIODIC } from '../lib/periodic';
import { podcastSettings } from '../lib/podcasts';
import { SettingsScreen } from './SettingsScreen';

describe('podcast settings', () => {
  it('starts with show thumbnails, saves the preference alongside other settings, and reads it back', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(() => Promise.resolve());
    const props = { periodic: DEFAULT_PERIODIC, birthDate: '1998-03-21', podcasts: podcastSettings(undefined), folders: [], notes: [], onSave };
    const view = render(<SettingsScreen {...props} />);
    expect(screen.getByRole('combobox', { name: 'Artwork for new episodes' })).toHaveValue('show');
    await user.selectOptions(screen.getByTestId('settings-podcast-artwork'), 'episode');
    await user.click(screen.getByTestId('settings-save'));
    await screen.findByText('Saved');
    expect(onSave).toHaveBeenCalledWith({ periodic: DEFAULT_PERIODIC, birthDate: '1998-03-21', podcasts: { artwork: 'episode' } });
    view.unmount();
    render(<SettingsScreen {...props} podcasts={podcastSettings({ artwork: 'episode' })} />);
    expect(screen.getByTestId('settings-podcast-artwork')).toHaveValue('episode');
    await user.selectOptions(screen.getByTestId('settings-podcast-artwork'), 'show');
    await user.click(screen.getByTestId('settings-save'));
    await screen.findByText('Saved');
    expect(onSave).toHaveBeenLastCalledWith({ periodic: DEFAULT_PERIODIC, birthDate: '1998-03-21', podcasts: { artwork: 'show' } });
  });

  it('keeps the chosen artwork after a failed save and lets the user retry', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValueOnce(new Error('Settings could not be written')).mockResolvedValueOnce(undefined);
    render(<SettingsScreen periodic={DEFAULT_PERIODIC} birthDate="" podcasts={{ artwork: 'episode' }} folders={[]} notes={[]} onSave={onSave} />);
    await user.selectOptions(screen.getByTestId('settings-podcast-artwork'), 'show');
    await user.click(screen.getByTestId('settings-save'));
    await screen.findByText('Error: Settings could not be written');
    expect(screen.queryByText('Saved')).toBeNull();
    expect(screen.getByTestId('settings-podcast-artwork')).toHaveValue('show');
    await user.click(screen.getByTestId('settings-save'));
    await screen.findByText('Saved');
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Error: Settings could not be written')).toBeNull();
  });
});
