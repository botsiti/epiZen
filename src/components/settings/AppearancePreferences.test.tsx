import { useState } from 'react';
import type { Appearance } from '../../lib/appearance';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { AppearancePreferences } from './AppearancePreferences';
it('saves whole-app appearance independently and preserves failed drafts', async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error('Settings busy')).mockResolvedValue(undefined), user = userEvent.setup();
  function Example() {
    const [draft, setDraft] = useState<Appearance>({ surface: 'solid', opacity: .72, motion: false });
    return <AppearancePreferences value={draft} onChange={setDraft} onSave={save} />;
  }
  render(<Example />);
  await user.click(screen.getByRole('radio', { name: 'Liquid glass' }));
  await user.click(screen.getByRole('button', { name: 'Save appearance' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Settings busy');
  expect(screen.getByRole('radio', { name: 'Liquid glass' })).toBeChecked();
  await user.click(screen.getByRole('button', { name: 'Save appearance' }));
  expect(await screen.findByRole('status')).toHaveTextContent('whole app');
  expect(save).toHaveBeenLastCalledWith({ surface: 'glass', opacity: .72, motion: false });
});

it('imports a local animated wallpaper, saves its playback choice, and can return to window material', async () => {
  const id = 'a'.repeat(64) + '--Orbit.gif';
  const item = { id, name: 'Orbit', kind: 'gif' as const, url: 'blob:orbit' };
  const add = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Unreadable file')).mockResolvedValue(item);
  const save = vi.fn().mockResolvedValue(undefined), user = userEvent.setup();
  function Example() {
    const [draft, setDraft] = useState<Appearance>({ surface: 'glass', opacity: .7, motion: false });
    const [items,setItems] = useState<typeof item[]>([]);
    return <AppearancePreferences value={draft} onChange={setDraft} onSave={save} library={{
      items, loading:false, retry:vi.fn(), remove:vi.fn(), add:async()=>{ const choice = await add() as typeof item | undefined; if (choice) setItems([choice]); return choice; },
    }} />;
  }
  render(<Example />);
  await user.click(screen.getByRole('button', {name:'Add wallpaper'}));
  expect(screen.getByRole('button', {name:'Window material'})).toHaveAttribute('aria-pressed','true');
  await user.click(screen.getByRole('button', {name:'Add wallpaper'}));
  expect(screen.getByRole('alert')).toHaveTextContent('Unreadable file');
  await user.click(screen.getByRole('button', {name:'Add wallpaper'}));
  await user.click(screen.getByRole('button', {name:'Still'}));
  await user.click(screen.getByRole('button', {name:'Save appearance'}));
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({wallpaper:id,wallpaperStill:true}));
  await user.click(screen.getByRole('button', {name:'Window material'}));
  await user.click(screen.getByRole('button', {name:'Save appearance'}));
  expect(save.mock.calls.at(-1)?.[0]).toMatchObject({wallpaper:undefined});
});
