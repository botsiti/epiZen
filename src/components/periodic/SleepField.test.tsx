import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { SleepField } from './SleepField';

it('saves the pair together, preserving a minute draft after an invalid entry', async () => {
  const user = userEvent.setup(); const onCommit = vi.fn();
  render(<><SleepField value={6.1} onCommit={onCommit} /><button>Outside</button></>);
  const hours = screen.getByLabelText('Sleep hours'); const minutes = screen.getByLabelText('Sleep minutes');
  await user.click(hours); await user.tab(); await user.click(screen.getByText('Outside'));
  expect(onCommit).not.toHaveBeenCalled();
  await user.clear(hours); await user.type(hours, '7'); await user.tab();
  expect(onCommit).not.toHaveBeenCalled();
  await user.clear(minutes); await user.type(minutes, '60{Enter}');
  expect(screen.getByRole('alert')).toHaveTextContent('0 to 59');
  expect(hours).toHaveValue('7'); expect(minutes).toHaveValue('60');
  expect(onCommit).not.toHaveBeenCalled();
  await user.clear(minutes); await user.type(minutes, '30{Enter}');
  expect(onCommit).toHaveBeenCalledExactlyOnceWith('7.5');
});

it('keeps a failed draft for retry, blocks overlapping edits and shows refreshed values after success', async () => {
  const user = userEvent.setup();
  let finish!: (error?: string) => void;
  const onCommit = vi.fn().mockImplementationOnce(() => new Promise<string | undefined>((resolve) => { finish = resolve; })).mockResolvedValueOnce(undefined);
  const view = render(<SleepField value={6} onCommit={onCommit} />);
  const hours = screen.getByLabelText('Sleep hours'); const minutes = screen.getByLabelText('Sleep minutes');
  await user.clear(hours); await user.type(hours, '11');
  await user.clear(minutes); await user.type(minutes, '1{Enter}');
  expect(hours).toBeDisabled(); expect(minutes).toBeDisabled();
  await act(async () => { finish('The note changed outside Epizen.'); await Promise.resolve(); });
  expect(hours).toHaveValue('11'); expect(minutes).toHaveValue('1');
  expect(screen.getByRole('alert')).toHaveTextContent('Your entry is kept');
  view.rerender(<SleepField value={8} onCommit={onCommit} />);
  expect(hours).toHaveValue('11');
  await user.click(minutes); await user.keyboard('{Enter}');
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(onCommit).toHaveBeenLastCalledWith('11.016667');
  view.rerender(<SleepField value={11.016667} onCommit={onCommit} />);
  expect(hours).toHaveValue('11'); expect(minutes).toHaveValue('1');
});

it('allows clearing the value, distinguishes zero, and cancels an edit with Escape', async () => {
  const user = userEvent.setup(); const onCommit = vi.fn();
  render(<><SleepField value={0} onCommit={onCommit} /><button>Outside</button></>);
  const hours = screen.getByLabelText('Sleep hours'); const minutes = screen.getByLabelText('Sleep minutes');
  expect(hours).toHaveValue('0'); expect(minutes).toHaveValue('0');
  await user.clear(hours); await user.type(hours, '5{Escape}');
  await user.click(screen.getByText('Outside'));
  expect(onCommit).not.toHaveBeenCalled(); expect(hours).toHaveValue('0');
  await user.clear(hours); await user.clear(minutes); await user.click(screen.getByText('Outside'));
  expect(onCommit).toHaveBeenCalledExactlyOnceWith('');
});
