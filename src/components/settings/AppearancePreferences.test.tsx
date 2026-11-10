import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { AppearancePreferences } from './AppearancePreferences';
it('saves whole-app appearance independently and preserves failed drafts', async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error('Settings busy')).mockResolvedValue(undefined), user = userEvent.setup();
  render(<AppearancePreferences value={{ surface: 'solid', opacity: .72, motion: false }} onSave={save} />);
  await user.selectOptions(screen.getByLabelText('Application surface'), 'glass');
  await user.click(screen.getByRole('button', { name: 'Save appearance' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Settings busy');
  expect(screen.getByLabelText('Application surface')).toHaveValue('glass');
  await user.click(screen.getByRole('button', { name: 'Save appearance' }));
  expect(await screen.findByRole('status')).toHaveTextContent('whole app');
  expect(save).toHaveBeenLastCalledWith({ surface: 'glass', opacity: .72, motion: false });
});
