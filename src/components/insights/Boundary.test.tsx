import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../ErrorBoundary';

it('keeps navigation available and retries a failed insights screen', async () => {
  const user = userEvent.setup();
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  let fail = true;
  function Screen() {
    if (fail) throw new Error('Cannot draw statistics');
    return <p>Statistics recovered</p>;
  }
  try {
    render(<><button>Home</button><ErrorBoundary label="Statistics"><Screen /></ErrorBoundary></>);
    expect(screen.getByRole('button', { name: 'Home' })).toBeEnabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot draw statistics');
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('Statistics recovered')).toBeInTheDocument();
  } finally {
    log.mockRestore();
  }
});
