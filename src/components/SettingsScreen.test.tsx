import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PERIODIC, DEFAULT_PERIODIC_FEATURES } from '../lib/periodic';
import { podcastSettings } from '../lib/podcasts';
import { DEFAULT_SOURCES } from '../lib/librarySources';
import { DEFAULT_FILE_PREFERENCES } from '../lib/filePreferences';
import { SettingsScreen } from './SettingsScreen';

it('filters the keyboard reference without submitting or changing preferences', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();
  render(<SettingsScreen periodic={DEFAULT_PERIODIC} birthDate="" podcasts={podcastSettings(undefined)} folders={[]} features={DEFAULT_PERIODIC_FEATURES} onSave={onSave} />);
  await user.click(screen.getByTestId('settings-nav-hotkeys'));
  const reference = within(screen.getByRole('region', { name: 'Keyboard shortcuts' }));
  await user.type(reference.getByRole('searchbox'), 'collapse');
  expect(reference.getByText('⌃3')).toBeVisible();
  expect(reference.queryByText('⌘7')).not.toBeInTheDocument();
  await user.clear(reference.getByRole('searchbox'));
  await user.type(reference.getByRole('searchbox'), 'does not exist{Enter}');
  expect(reference.getByRole('status')).toHaveTextContent('No shortcuts match');
  expect(onSave).not.toHaveBeenCalled();
});

describe('podcast settings', () => {
  it('starts with show thumbnails, saves the preference alongside other settings, and reads it back', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(() => Promise.resolve());
    const props = { periodic: DEFAULT_PERIODIC, birthDate: '1998-03-21', podcasts: podcastSettings(undefined), folders: [], features: DEFAULT_PERIODIC_FEATURES, onSave };
    const view = render(<SettingsScreen {...props} />);
    await user.click(screen.getByTestId('settings-nav-home'));
    expect(screen.getByRole('combobox', { name: 'Artwork for new episodes' })).toHaveValue('show');
    await user.selectOptions(screen.getByTestId('settings-podcast-artwork'), 'episode');
    await user.click(screen.getByTestId('settings-save'));
    await screen.findByText('Saved');
    expect(onSave).toHaveBeenCalledWith({ periodic: DEFAULT_PERIODIC, birthDate: '1998-03-21', podcasts: { artwork: 'episode' }, features: DEFAULT_PERIODIC_FEATURES, sources: DEFAULT_SOURCES, fileDefaults: DEFAULT_FILE_PREFERENCES });
    view.unmount();
    render(<SettingsScreen {...props} podcasts={podcastSettings({ artwork: 'episode' })} />);
    await user.click(screen.getByTestId('settings-nav-home'));
    expect(screen.getByTestId('settings-podcast-artwork')).toHaveValue('episode');
    await user.click(screen.getByTestId('settings-nav-home'));
    await user.selectOptions(screen.getByTestId('settings-podcast-artwork'), 'show');
    await user.click(screen.getByTestId('settings-save'));
    await screen.findByText('Saved');
    expect(onSave).toHaveBeenLastCalledWith({ periodic: DEFAULT_PERIODIC, birthDate: '1998-03-21', podcasts: { artwork: 'show' }, features: DEFAULT_PERIODIC_FEATURES, sources: DEFAULT_SOURCES, fileDefaults: DEFAULT_FILE_PREFERENCES });
  });

  it('keeps the chosen artwork after a failed save and lets the user retry', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValueOnce(new Error('Settings could not be written')).mockResolvedValueOnce(undefined);
    render(<SettingsScreen periodic={DEFAULT_PERIODIC} birthDate="" podcasts={{ artwork: 'episode' }} folders={[]} features={DEFAULT_PERIODIC_FEATURES} onSave={onSave} />);
    await user.click(screen.getByTestId('settings-nav-home'));
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

it('saves optional periodic features and keeps the choices after a failed save', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn().mockRejectedValueOnce(new Error('Could not save')).mockResolvedValueOnce(undefined);
  render(<SettingsScreen periodic={DEFAULT_PERIODIC} birthDate="" podcasts={podcastSettings(undefined)} folders={[]} features={DEFAULT_PERIODIC_FEATURES} onSave={onSave} />);
  await user.click(screen.getByRole('checkbox', { name: /Habits/ }));
  await user.click(screen.getByRole('checkbox', { name: /Thought records/ }));
  await user.click(screen.getByTestId('settings-save'));
  await screen.findByText('Error: Could not save');
  expect(screen.getByRole('checkbox', { name: /Habits/ })).not.toBeChecked();
  await user.click(screen.getByTestId('settings-save'));
  await screen.findByText('Saved');
  expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ features: { habits: false, thoughtRecords: false } }));
  expect(screen.queryByLabelText('Template')).not.toBeInTheDocument();
});

it('keeps drafts across sections and saves the selected sources and creation locations together', async () => {
  const user = userEvent.setup(), onSave = vi.fn().mockResolvedValue(undefined);
  render(<SettingsScreen periodic={DEFAULT_PERIODIC} birthDate="" podcasts={{ artwork: 'show' }} folders={['Inbox']} features={DEFAULT_PERIODIC_FEATURES} onSave={onSave} />);
  expect(screen.queryByLabelText('Birth date')).not.toBeInTheDocument();
  await user.type(screen.getByLabelText('Search settings'), 'music');
  expect(screen.getByTestId('settings-nav-home')).toBeVisible();
  expect(screen.queryByTestId('settings-nav-day')).not.toBeInTheDocument();
  await user.clear(screen.getByLabelText('Search settings'));
  await user.click(screen.getByTestId('settings-nav-home'));
  await user.type(screen.getByLabelText('Birth date'), '1995-01-02');
  await user.selectOptions(screen.getByLabelText('Books source'), 'wikipedia-book');
  await user.selectOptions(screen.getByLabelText('Podcasts source'), 'wikipedia-podcast');
  await user.click(screen.getByTestId('settings-nav-files'));
  await user.selectOptions(screen.getByLabelText('Location for new notes'), 'folder');
  await user.type(screen.getByLabelText('Notes folder'), 'Inbox');
  await user.click(screen.getByTestId('settings-nav-hotkeys'));
  expect(screen.getByRole('region', { name: 'Keyboard shortcuts' })).toBeVisible();
  await user.click(screen.getByTestId('settings-nav-home'));
  expect(screen.getByLabelText('Birth date')).toHaveValue('1995-01-02');
  await user.click(screen.getByTestId('settings-save'));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ birthDate: '1995-01-02', sources: { ...DEFAULT_SOURCES, book: 'wikipedia-book', podcast: 'wikipedia-podcast' }, fileDefaults: { ...DEFAULT_FILE_PREFERENCES, notes: 'folder', noteFolder: 'Inbox' } }));
});
