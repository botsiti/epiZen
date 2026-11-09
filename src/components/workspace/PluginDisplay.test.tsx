import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { PluginDisplayProvider, PluginSurface } from './PluginDisplay';
import { pluginDisplays } from '../../lib/pluginDisplay';

it('contains a plugin render failure while preserving an unrelated note draft and permits recovery', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  let broken = true;
  function Feature() { if (broken) throw new Error('Fixture graph error'); return <p>Graph is ready</p>; }
  render(<PluginDisplayProvider value={pluginDisplays()}><label>Note draft<input defaultValue="Unsaved words" /></label><PluginSurface id="graph"><Feature /></PluginSurface></PluginDisplayProvider>);
  expect(screen.getByRole('alert')).toHaveTextContent('Graph couldn’t be shown');
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Still editing this note' } });
  broken = false;
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(screen.getByText('Graph is ready')).toBeVisible();
  expect(screen.getByRole('textbox')).toHaveValue('Still editing this note');
  log.mockRestore();
});
