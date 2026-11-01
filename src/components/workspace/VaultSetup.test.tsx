import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { DEFAULT_PERIODIC, DEFAULT_RECOGNITION } from '../../lib/periodic';
import { STARTER_PERIODIC } from '../../lib/vaultSetup';
import { VaultSetup } from './VaultSetup';

const props = { name: 'Test vault', create: false, periodic: DEFAULT_PERIODIC, recognition: DEFAULT_RECOGNITION, files: [{ path: 'Journal/30.10.2026.md', kind: 'note' as const }], texts: new Map([['Journal/30.10.2026.md', 'My own words']]), folders: ['Journal'], onSave: vi.fn(async () => {}), onSkip: vi.fn(async () => {}) };

it('connects the chosen folder without requesting any note creation', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn(async () => {});
  render(<VaultSetup {...props} onSave={onSave} />);
  expect(screen.getByTestId('setup-save')).toBeDisabled();
  await user.click(screen.getByLabelText('Yes, connect my notes'));
  await user.type(screen.getByLabelText('Daily notes folder'), 'Journal');
  expect(screen.getByText(/1 notes recognized/)).toBeVisible();
  await user.click(screen.getByTestId('setup-save'));
  expect(onSave).toHaveBeenCalledWith({ ...DEFAULT_PERIODIC, day: { ...DEFAULT_PERIODIC.day, folder: 'Journal' } }, DEFAULT_RECOGNITION, false);
});

it('previews a new vault and retains its choices after a failed write for retry', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn().mockRejectedValueOnce(new Error('Disk full')).mockResolvedValueOnce(undefined);
  render(<VaultSetup {...props} create files={[]} onSave={onSave} />);
  expect(screen.getByText('Your starting space')).toBeVisible();
  await user.click(screen.getByTestId('setup-save'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Disk full');
  await user.click(screen.getByTestId('setup-save'));
  expect(onSave).toHaveBeenLastCalledWith(STARTER_PERIODIC, DEFAULT_RECOGNITION, true);
  expect(onSave).toHaveBeenCalledTimes(2);
});

it('can defer setup without creating any starter notes', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn(), onSkip = vi.fn(async () => {});
  render(<VaultSetup {...props} create onSave={onSave} onSkip={onSkip} />);
  await user.click(screen.getByRole('button', { name: 'Do this later' }));
  expect(onSkip).toHaveBeenCalledOnce();
  expect(onSave).not.toHaveBeenCalled();
});
