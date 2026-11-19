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

it('previews a preset, recovers from invalid JSON and saves a reusable custom palette', async () => {
  const save = vi.fn().mockResolvedValue(undefined), user = userEvent.setup();
  const palette = { name: 'Vesper', background: '#141526', surface: '#20253a', text: '#eceeff', accent: '#a2bcff' };
  function Example() {
    const [draft, setDraft] = useState<Appearance>({ surface: 'solid', opacity: .72, motion: false });
    return <AppearancePreferences value={draft} onChange={setDraft} onSave={save} />;
  }
  render(<Example />);
  await user.click(screen.getByRole('radio', { name: 'Gruvbox' }));
  expect(screen.getByRole('radio', { name: 'Gruvbox' })).toBeChecked();
  await user.click(screen.getByRole('button', { name: 'Paste theme…' }));
  const source = screen.getByRole('textbox', { name: 'Palette JSON' });
  await user.click(source); await user.paste('bad json');
  await user.click(screen.getByRole('button', { name: 'Add theme' }));
  expect(screen.getByRole('alert')).toHaveTextContent('valid JSON');
  await user.clear(source); await user.click(source); await user.paste(JSON.stringify(palette));
  await user.click(screen.getByRole('button', { name: 'Add theme' }));
  expect(screen.getByRole('radio', { name: 'Vesper' })).toBeChecked();
  await user.click(screen.getByRole('button', { name: 'Save appearance' }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ theme: 'Vesper', customThemes: [palette] }));
  await user.click(screen.getByRole('button', { name: 'Remove Vesper' }));
  expect(screen.getByRole('radio', { name: 'Epizen' })).toBeChecked();
});
