import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { DEFAULT_PERIODIC, DEFAULT_RECOGNITION } from '../../lib/periodic';
import { ErrorBoundary } from '../ErrorBoundary';
import { PeriodicRecognitionFields } from './PeriodicPreferences';

const files = ['2026-10-30.md', '30.10.2026.md', 'Archive/An unnamed day.md'].map((path) => ({ path, kind: 'note' as const }));
function Fields() {
  const [value, onChange] = useState(DEFAULT_RECOGNITION);
  return <PeriodicRecognitionFields periodic={DEFAULT_PERIODIC} value={value} onChange={onChange} files={files} texts={new Map()} />;
}

it('resolves duplicates and links an arbitrarily named note without a vault write', async () => {
  const user = userEvent.setup();
  render(<Fields />);
  const choice = screen.getByRole('combobox', { name: 'Calendar note for day:2026-10-30' });
  expect(choice).toHaveValue('');
  await user.selectOptions(choice, '30.10.2026.md');
  expect(choice).toHaveValue('30.10.2026.md');
  await user.click(screen.getByText('Link an older note or correct its date'));
  await user.type(screen.getByRole('combobox', { name: 'Existing note' }), 'Archive/An unnamed day.md');
  await user.type(screen.getByTestId('periodic-link-date'), '2026-10-29');
  await user.keyboard('{Escape}');
  await user.click(screen.getByRole('button', { name: 'Apply link' }));
  expect(screen.getByText(/3 notes recognized/)).toBeVisible();
  expect(screen.getByText('Archive/An unnamed day.md · day 2026-10-29')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Reset' }));
  expect(screen.getByText(/2 notes recognized/)).toBeVisible();
});

it('recovers a failed setup subtree while another screen remains usable', async () => {
  const user = userEvent.setup();
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  let fail = true;
  function Setup() { if (fail) throw new Error('Setup failed'); return <Fields />; }
  try {
    render(<><button>Open notes</button><ErrorBoundary label="Vault setup"><Setup /></ErrorBoundary></>);
    expect(screen.getByRole('button', { name: 'Open notes' })).toBeEnabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Setup failed');
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByTestId('periodic-recognition')).toBeVisible();
  } finally { log.mockRestore(); }
});
