import { useState } from 'react';
import type { Appearance } from '../../lib/appearance';
import { PreferenceIcon } from './icons';
import { WallpaperMedia } from './WallpaperMedia';
import type { WallpaperLibrary } from './useWallpapers';

type Props = { library: WallpaperLibrary; draft: Appearance; onChange: (value: Partial<Appearance>) => void; onBusy: (busy: boolean) => void };
export function WallpaperPreferences({ library, draft, onChange, onBusy }: Props) {
  const [error, setError] = useState<string>(), [confirm, setConfirm] = useState<string>();
  const selected = library.items.find((item) => item.id === draft.wallpaper);
  const run = async (action: () => Promise<void>) => {
    setError(undefined); onBusy(true);
    try { await action(); } catch (error) { setError(String(error)); } finally { onBusy(false); }
  };
  return <section className="wallpaper-preferences preferences-section">
    <div className="wallpaper-heading"><h3>Background</h3><button type="button" className="wallpaper-add" disabled={library.loading || !!library.error}
      onClick={() => void run(async () => { const item = await library.add(); if (item) { setConfirm(undefined); onChange({ wallpaper: item.id }); } })}><PreferenceIcon name="plus" /> Add wallpaper</button></div>
    <p className="preferences-description">Choose a local photo, GIF or video for the glass workspace.</p>
    <div className="wallpaper-shelf" role="group" aria-label="Wallpaper library">
      <button type="button" aria-pressed={!draft.wallpaper} onClick={() => { setConfirm(undefined); onChange({ wallpaper: undefined }); }}>
        <span className="wallpaper-thumb is-material" aria-hidden="true"><PreferenceIcon name="appearance" /></span><span>Window material</span></button>
      {library.items.map((item) => <button type="button" key={item.id} aria-pressed={item.id === draft.wallpaper} title={item.name}
        onClick={() => { setConfirm(undefined); onChange({ wallpaper: item.id }); }}>
        <span className="wallpaper-thumb"><WallpaperMedia item={item} thumbnail /></span><span>{item.name}</span></button>)}
    </div>
    {selected && <div className="wallpaper-controls">
      {selected.kind !== 'image' && <div className="preferences-periods" role="group" aria-label="Wallpaper movement">
        <button type="button" aria-pressed={!draft.wallpaperStill} onClick={() => onChange({ wallpaperStill: false })}>Moving</button>
        <button type="button" aria-pressed={!!draft.wallpaperStill} onClick={() => onChange({ wallpaperStill: true })}>Still</button></div>}
      {confirm === selected.id ? <span className="wallpaper-forget">Remove the library copy? <button type="button" onClick={() => setConfirm(undefined)}>Keep</button><button type="button"
        onClick={() => void run(async () => { await library.remove(selected.id); onChange({ wallpaper: undefined }); setConfirm(undefined); })}>Remove copy</button></span>
        : <button type="button" className="wallpaper-remove" onClick={() => setConfirm(selected.id)}>Remove from library</button>}
    </div>}
    {draft.wallpaper && !selected && !library.loading && !library.error && <p role="status">This wallpaper is unavailable. Choose another background.</p>}
    {library.error && <p role="alert">{library.error} <button type="button" onClick={library.retry}>Retry library</button></p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
