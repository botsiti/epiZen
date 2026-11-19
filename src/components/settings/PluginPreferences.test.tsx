import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { SettingsScreen, type SettingsDraft } from './SettingsScreen';
import { DEFAULT_PERIODIC, DEFAULT_PERIODIC_FEATURES } from '../../lib/periodic';
import { ALL_PLUGINS, NO_PLUGINS, DEFAULT_HOME_SECTIONS, PLUGINS } from '../../lib/plugins';

it('configures plugins and selected check-ins, keeps failed drafts, and saves per-vault choices together', async () => {
  const user = userEvent.setup(), save = vi.fn().mockRejectedValueOnce('Settings are busy').mockResolvedValueOnce(undefined);
  render(<SettingsScreen plugins={NO_PLUGINS} homeSections={DEFAULT_HOME_SECTIONS} periodic={DEFAULT_PERIODIC} features={DEFAULT_PERIODIC_FEATURES} birthDate="" podcasts={{ artwork: 'show' }} folders={[]} onSave={save} />);
  expect(screen.getByRole('heading', { name: 'Plugins' })).toBeVisible();
  await user.click(screen.getByRole('switch', { name: 'Enable Check-ins' }));
  expect(screen.getByRole('switch', { name: 'Enable Periodic notes' })).toBeChecked();
  await user.click(screen.getByRole('button', { name: 'Configure Check-ins' }));
  for (const name of ['Energy', 'Focus', 'Social']) await user.click(screen.getByRole('checkbox', { name: new RegExp(`^${name}`) }));
  await user.click(screen.getByRole('switch', { name: 'Enable epiBase' }));
  await user.click(screen.getByTestId('settings-save'));
  expect(screen.getByRole('alert')).toHaveTextContent('Settings are busy');
  expect(screen.getByRole('switch', { name: 'Enable epiBase' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: /^Focus/ })).not.toBeChecked();
  await user.click(screen.getByTestId('settings-save'));
  const saved = save.mock.calls[1]![0] as SettingsDraft;
  expect(saved.plugins).toEqual({ ...NO_PLUGINS, bases: true, periodic: true, checkins: true });
  expect(saved.features.checkIns).toEqual({ enabled: true, metrics: ['mood', 'sleep'] });
});
it('opens configuration for every plugin and preserves appearance drafts when visiting setup', async () => {
  const user = userEvent.setup(), save = vi.fn().mockResolvedValue(undefined);
  render(<SettingsScreen plugins={ALL_PLUGINS} periodic={DEFAULT_PERIODIC} features={DEFAULT_PERIODIC_FEATURES} birthDate="" podcasts={{ artwork: 'show' }} folders={[]} onSave={save} />);
  for (const plugin of PLUGINS) expect(screen.getByRole('button', { name: `Configure ${plugin.name}` })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Configure Habits' }));
  await user.selectOptions(screen.getByRole('combobox', { name: 'Habits layout' }), 'compact');
  await user.selectOptions(screen.getByRole('combobox', { name: 'Habits default view' }), 'History');
  await user.click(screen.getByRole('checkbox', { name: 'Today’s progress' }));
  await user.click(screen.getByRole('button', { name: 'Configure Periodic notes' }));
  await user.click(screen.getByRole('button', { name: 'Folders, dates & templates' }));
  expect(screen.getByRole('heading', { name: 'Periodic notes' })).toBeVisible();
  await user.click(screen.getByTestId('settings-save'));
  const saved = save.mock.calls[0]![0] as SettingsDraft;
  expect(saved.pluginDisplay?.habits).toEqual({ density: 'compact', defaultView: 'History', sections: { today: false } });
});
it('keeps independent homepage sections and exposes paused dependencies without deleting preferences', async () => {
  const user = userEvent.setup(), save = vi.fn().mockResolvedValue(undefined);
  render(<SettingsScreen plugins={ALL_PLUGINS} periodic={DEFAULT_PERIODIC} features={DEFAULT_PERIODIC_FEATURES} birthDate="" podcasts={{ artwork: 'show' }} folders={[]} onSave={save} />);
  await user.click(screen.getByRole('button', { name: 'Configure Homepage' }));
  await user.click(screen.getByRole('checkbox', { name: 'Memento mori' }));
  await user.click(screen.getByRole('switch', { name: 'Enable Periodic notes' }));
  expect(screen.getAllByText(/Paused · enable Periodic/)).not.toHaveLength(0);
  expect(screen.getByRole('switch', { name: 'Enable CBT' })).toBeChecked();
  await user.type(screen.getByRole('searchbox', { name: 'Find a plugin' }), 'habit');
  const panel = within(screen.getByTestId('plugin-settings'));
  expect(panel.getByRole('switch', { name: 'Enable Habits' })).toBeVisible();
  expect(panel.queryByRole('switch', { name: 'Enable Library' })).toBeNull();
  await user.click(screen.getByTestId('settings-save'));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ homeSections: { ...DEFAULT_HOME_SECTIONS, memento: false }, plugins: { ...ALL_PLUGINS, periodic: false } }));
});

it('opens Spike setup from its plugin while retaining other unsaved preferences', async () => {
  const user = userEvent.setup(), save = vi.fn().mockResolvedValue(undefined);
  render(<SettingsScreen spikeSettings={(onBack) => <button onClick={onBack}>Back to plugins</button>} plugins={NO_PLUGINS} periodic={DEFAULT_PERIODIC} features={DEFAULT_PERIODIC_FEATURES} birthDate="" podcasts={{ artwork: 'show' }} folders={[]} onSave={save} />);
  await user.click(screen.getByRole('switch', { name: 'Enable Spike' }));
  await user.click(screen.getByRole('switch', { name: 'Enable Library' }));
  for (let visit = 0; visit < 2; visit++) {
    await user.click(screen.getByRole('button', { name: 'Configure Spike' }));
    await user.click(screen.getByRole('button', { name: 'Set up Spike' }));
    await user.click(screen.getByRole('button', { name: 'Back to plugins' }));
  }
  expect(screen.getByRole('switch', { name: 'Enable Spike' })).toBeChecked();
  expect(screen.getByRole('switch', { name: 'Enable Library' })).toBeChecked();
  await user.click(screen.getByTestId('settings-save'));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ plugins: { ...NO_PLUGINS, spike: true, library: true } }));
});

it('edits life spheres and task rules from the quest plugin and keeps the draft across pages and a failed save', async () => {
  const user = userEvent.setup(), save = vi.fn().mockRejectedValueOnce(new Error('XP settings are busy')).mockResolvedValue(undefined);
  render(<SettingsScreen rewardDocument={{ revision: 0 }} rewardDate="2026-11-18" plugins={NO_PLUGINS} periodic={DEFAULT_PERIODIC} features={DEFAULT_PERIODIC_FEATURES} birthDate="" podcasts={{ artwork: 'show' }} folders={[]} onSave={save} />);
  await user.click(screen.getByRole('button', { name: 'Configure Quests' }));
  await user.click(screen.getByRole('button', { name: 'Life spheres & XP' }));
  await user.click(screen.getByRole('switch', { name: 'Enable Quests' }));
  await user.click(screen.getByRole('button', { name: 'Add sphere' }));
  const sphereInput = screen.getByRole('textbox', { name: 'Sphere name · new sphere' });
  expect(sphereInput).toHaveFocus();
  await user.type(sphereInput, 'Music');
  expect(screen.queryByLabelText('Task tag')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /Manage categories/ }));
  expect(screen.getByTestId('settings-period-day')).toHaveAttribute('aria-pressed', 'true');
  await user.click(screen.getByRole('button', { name: 'Add category' }));
  await user.type(screen.getByRole('textbox', { name: 'Category name · new category' }), 'piano');
  await user.click(screen.getByTestId('settings-nav-quests'));
  await user.click(screen.getByRole('button', { name: 'piano' }));
  await user.clear(screen.getByLabelText('XP per minute'));
  await user.type(screen.getByLabelText('XP per minute'), '3');
  await user.selectOptions(screen.getByLabelText('Reward sphere 1'), within(screen.getByLabelText('Reward sphere 1')).getByRole('option', { name: 'Music' }));
  await user.clear(screen.getByLabelText('rare quest XP'));
  await user.type(screen.getByLabelText('rare quest XP'), '375');
  await user.click(screen.getByTestId('settings-nav-library'));
  await user.click(screen.getByRole('switch', { name: 'Enable Library' }));
  await user.click(screen.getByTestId('settings-nav-home'));
  expect(screen.queryByText('Library sources')).not.toBeInTheDocument();
  await user.click(screen.getByRole('checkbox', { name: 'Recent library' }));
  await user.click(screen.getByTestId('settings-save'));
  expect(screen.getByRole('alert')).toHaveTextContent('XP settings are busy');
  await user.click(screen.getByTestId('settings-save'));
  const saved = save.mock.calls[1]![0] as SettingsDraft;
  expect(saved.plugins).toMatchObject({ quests: true, periodic: true, library: true });
  expect(saved.homeSections?.library).toBe(false);
  const prefs = saved.rewards!.value, piano = prefs.categories.find((entry) => entry.tag === 'piano')!, music = prefs.areas.find((entry) => entry.name === 'Music')!;
  expect(prefs.questRewards.presets.rare).toBe(375);
  expect(prefs.policies[0]!.categories[piano.id]).toMatchObject({ rateHundredths: 300, shares: [{ area: music.id, basisPoints: 10000 }] });
});

it('manages daily categories with Quests off and returns name errors to the Daily list', async () => {
  const user = userEvent.setup(), save = vi.fn().mockResolvedValue(undefined);
  render(<SettingsScreen rewardDocument={{ revision: 0 }} rewardDate="2026-11-18" observedTags={['swimming']} plugins={NO_PLUGINS} periodic={DEFAULT_PERIODIC} features={DEFAULT_PERIODIC_FEATURES} birthDate="" podcasts={{ artwork: 'show' }} folders={[]} onSave={save} />);
  await user.click(screen.getByTestId('settings-nav-periodic'));
  await user.click(screen.getByRole('button', { name: 'Add category' }));
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('textbox', { name: 'Category name · new category' })).not.toBeInTheDocument();
  const swimming = screen.getByRole('textbox', { name: 'Category name · swimming' });
  await user.clear(swimming);
  await user.type(swimming, 'business');
  await user.click(screen.getByTestId('settings-nav-home'));
  await user.click(screen.getByTestId('settings-save'));
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('already belongs');
  expect(screen.getByTestId('task-category-list')).toBeVisible();
  const renamed = screen.getAllByRole('textbox', { name: 'Category name · business' }).at(-1)!;
  await user.clear(renamed); await user.type(renamed, 'Lap swim');
  await user.click(screen.getByTestId('settings-save'));
  const settings = save.mock.calls[0]![0] as SettingsDraft;
  expect(settings.plugins?.quests).toBe(false);
  expect(settings.rewards?.value.categories).toContainEqual(expect.objectContaining({ name: 'lap-swim', tag: 'lap-swim', aliases: ['swimming'] }));
});

it('filters plugins by switch state and finds a section from the settings toolbar using the keyboard', async () => {
  const user = userEvent.setup(), save = vi.fn().mockResolvedValue(undefined);
  render(<SettingsScreen plugins={{ ...NO_PLUGINS, library: true }} periodic={DEFAULT_PERIODIC} features={DEFAULT_PERIODIC_FEATURES} birthDate="" podcasts={{ artwork: 'show' }} folders={[]} onSave={save} />);
  await user.click(screen.getByRole('button', { name: 'Enabled' }));
  expect(screen.getAllByRole('switch')).toHaveLength(1);
  expect(screen.getByRole('switch', { name: 'Enable Library' })).toBeChecked();
  await user.click(screen.getByRole('switch', { name: 'Enable Library' }));
  expect(screen.getByText('No matching plugins.')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Disabled' }));
  expect(screen.getByRole('switch', { name: 'Enable Library' })).not.toBeChecked();
  await user.type(screen.getByRole('searchbox', { name: 'Search settings' }), 'music{Enter}');
  expect(screen.getByRole('heading', { name: 'Library' })).toBeVisible();
  expect(screen.getByLabelText('Search settings')).toHaveValue('');
  await user.click(screen.getByTestId('settings-save'));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ plugins: NO_PLUGINS }));
});

it('saves a calendar zone chosen inside the plugin with the rest of the settings draft', async () => {
  const user = userEvent.setup(), save = vi.fn().mockResolvedValue(undefined);
  render(<SettingsScreen calendarTimeZone="UTC" plugins={ALL_PLUGINS} periodic={DEFAULT_PERIODIC} features={DEFAULT_PERIODIC_FEATURES} folders={[]} birthDate="" podcasts={{ artwork: 'show' }} onSave={save} />);
  await user.click(screen.getByRole('button', { name: 'Configure Calendar' }));
  await user.click(screen.getByRole('button', { name: 'Calendar time zone' }));
  await user.type(screen.getByLabelText('Search time zones'), 'Tokyo{Enter}');
  expect(save).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText('Search settings'), 'library{Enter}');
  expect(screen.getByRole('heading', { name: 'Library' })).toBeVisible();
  await user.click(screen.getByTestId('settings-save'));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ calendarTimeZone: 'Asia/Tokyo' }));
});

it('keeps the catalog and its draft usable when an individual plugin settings page fails', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const user = userEvent.setup(), save = vi.fn().mockResolvedValue(undefined);
  let broken = true;
  function SpikeSettings() { if (broken) throw new Error('Fixture settings failure'); return <p>Connection ready</p>; }
  try {
    render(<SettingsScreen spikeSettings={() => <SpikeSettings />} plugins={NO_PLUGINS} periodic={DEFAULT_PERIODIC}
      features={DEFAULT_PERIODIC_FEATURES} folders={[]} birthDate="" podcasts={{ artwork: 'show' }} onSave={save} />);
    await user.click(screen.getByRole('switch', { name: 'Enable Menu bar' }));
    await user.click(screen.getByTestId('settings-nav-spike'));
    expect(screen.getByRole('alert')).toHaveTextContent('Spike settings couldn’t be shown');
    broken = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('Connection ready')).toBeVisible();
    await user.click(screen.getByTestId('settings-nav-plugins'));
    await user.click(screen.getByTestId('settings-save'));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ plugins: { ...NO_PLUGINS, menubar: true } }));
  } finally { log.mockRestore(); }
});
