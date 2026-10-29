import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { MediaLabels } from './MediaLabels';
it('edits genres, retaining the draft after a save failure', async () => {
  const user = userEvent.setup(), onSave = vi.fn().mockRejectedValueOnce(new Error('changed')).mockResolvedValueOnce(undefined);
  render(<MediaLabels label="Genres" property="Genre" values={['rock']} onSave={onSave} />);
  await user.click(screen.getByRole('button', { name: 'Edit genres' }));
  await user.click(screen.getByRole('button', { name: 'Remove rock' }));
  await user.type(screen.getByRole('textbox'), 'ambient');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('changed');
  expect(screen.getByRole('textbox')).toHaveValue('ambient');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(onSave).toHaveBeenLastCalledWith([{ key: 'Genre', before: ['rock'], after: ['ambient'] }]);
});
