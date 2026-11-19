import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { newHabit, readHabit, type Habit } from '../../lib/habits';
import { DEFAULT_PERIODIC, DEFAULT_PERIODIC_FEATURES } from '../../lib/periodic';
import { NO_PLUGINS, setPlugin } from '../../lib/plugins';
import { SettingsScreen } from '../settings/SettingsScreen';
import { HabitPreferences } from './HabitPreferences';

it('keeps the schedule editable after a write fails and restores the same routine after pausing its parent', async () => {
  const user = userEvent.setup();
  const write = vi.fn().mockRejectedValueOnce(new Error('The vault is busy.')).mockResolvedValue(undefined);
  const today = new Date(2026, 10, 18);
  function Vault() {
    const [plugins, setPlugins] = useState(setPlugin(NO_PLUGINS, 'habits', true));
    const [habits, setHabits] = useState<Habit[]>([]);
    return <SettingsScreen plugins={plugins} initialSection="plugins" birthDate="" periodic={DEFAULT_PERIODIC}
      features={DEFAULT_PERIODIC_FEATURES} podcasts={{ artwork: 'show' }} folders={[]}
      onSave={(next) => { setPlugins(next.plugins!); return Promise.resolve(); }}
      habitSettings={<HabitPreferences habits={habits} days={[]} today={today} problems={[]} onOpenNote={vi.fn()}
        onLifecycle={vi.fn()} onCreate={async (name, start) => {
          await write(name, start);
          const note = newHabit(name, start, 'habit-walk-01');
          setHabits([readHabit(note.path, note.text)!]);
        }} />} />;
  }
  render(<Vault />);
  await user.click(screen.getByRole('button', { name: 'Configure Habits' }));
  await user.click(screen.getByRole('button', { name: 'Manage tracked habits' }));
  await user.click(screen.getByRole('button', { name: 'Add habit' }));
  const dialog = within(screen.getByRole('dialog'));
  await user.type(dialog.getByLabelText('Habit name'), 'Take a walk');
  await user.click(dialog.getByRole('button', { name: 'Save habit' }));
  expect(dialog.getByRole('alert')).toHaveTextContent('vault is busy');
  expect(dialog.getByLabelText('Habit name')).toHaveValue('Take a walk');
  await user.click(dialog.getByRole('button', { name: 'Save habit' }));
  expect(screen.getByRole('button', { name: 'Archive Take a walk' })).toBeVisible();
  await user.click(screen.getByTestId('settings-nav-plugins'));
  await user.click(screen.getByRole('switch', { name: 'Enable Periodic notes' }));
  await user.click(screen.getByTestId('settings-save'));
  await user.click(screen.getByTestId('settings-nav-habits'));
  expect(screen.queryByRole('button', { name: 'Add habit' })).toBeNull();
  expect(screen.getByText('Paused')).toBeVisible();
  await user.click(screen.getByTestId('settings-nav-plugins'));
  await user.click(screen.getByRole('switch', { name: 'Enable Periodic notes' }));
  await user.click(screen.getByTestId('settings-save'));
  await user.click(screen.getByTestId('settings-nav-habits'));
  expect(screen.getByRole('button', { name: 'Archive Take a walk' })).toBeVisible();
  expect(write.mock.calls).toEqual([['Take a walk', '2026-11-18'], ['Take a walk', '2026-11-18']]);
});
