import { WallpaperPreferences } from './WallpaperPreferences';
import { LiveWallpaper } from './WallpaperMedia';
import type { WallpaperLibrary } from './useWallpapers';
import { useState, type CSSProperties, type FormEvent } from 'react';
import type { Appearance } from '../../lib/appearance';
import { PreferenceIcon } from './icons';
import { SettingRow } from './SettingRow';

export function AppearancePreferences({ library, value: draft, onChange, onSave, nativeError }: { library?: WallpaperLibrary; value: Appearance; onChange: (draft: Appearance) => void; onSave: (value: Appearance) => Promise<void>; nativeError?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>(), [saved, setSaved] = useState(false);
  const selected = library?.items.find((item) => item.id === draft.wallpaper);
  const change = (patch: Partial<Appearance>) => { onChange({ ...draft, ...patch }); setSaved(false); setError(undefined); };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(undefined); setSaved(false);
    try { await onSave(draft); setSaved(true); }
    catch (error) { setError(String(error)); }
    finally { setBusy(false); }
  };
  return <form className="preferences-form appearance-form" onSubmit={(event) => void save(event)}>
    <fieldset className="preferences-fields" disabled={busy}>
      <fieldset className="appearance-surfaces"><legend>Window surface</legend>
        <div className="surface-options">{(['solid', 'glass'] as const).map((surface) => {
          const name = surface === 'glass' ? 'Liquid glass' : 'Solid';
          return <label key={surface} className="surface-choice" data-surface={surface} style={{ '--sample-opacity': draft.opacity } as CSSProperties}>
            <input type="radio" name="application-surface" aria-label={name} checked={draft.surface === surface} onChange={() => change({ surface })} />
            <span className="surface-scene" aria-hidden="true">
              {surface === 'glass' && selected && <LiveWallpaper item={selected} still={draft.wallpaperStill} preview />}
              <span className="surface-note"><span><PreferenceIcon name="note" />Daily note</span><i /><i /></span>
            </span>
            <span className="surface-caption">{name}<span aria-hidden="true" className="surface-indicator" /></span>
          </label>;
        })}</div>
      </fieldset>
      {draft.surface === 'glass' && library && <WallpaperPreferences library={library} draft={draft} onChange={change} onBusy={setBusy} />}
      <section className="preferences-section"><h3>Display</h3><div className="preferences-card">
        {draft.surface === 'glass' && <SettingRow title="Surface opacity">
          <span className="appearance-opacity"><input type="range" aria-label="Surface opacity" aria-valuetext={`${Math.round(draft.opacity * 100)}%`} min="45" max="95" value={Math.round(draft.opacity * 100)} onChange={(event) => change({ opacity: Number(event.target.value) / 100 })} /><span aria-hidden="true">{Math.round(draft.opacity * 100)}%</span></span>
        </SettingRow>}
        {!(draft.surface === 'glass' && selected) && <SettingRow title="Animated ambient background" description="Subtle colour movement behind the workspace."><input className="preference-switch" type="checkbox" aria-label="Animated ambient background" checked={draft.motion} onChange={(event) => change({ motion: event.target.checked })} /></SettingRow>}
      </div><p className="preferences-footnote">Epizen respects Reduce Motion and Reduce Transparency in macOS.</p></section>
      <div className="preferences-local-action"><button type="submit" className="preferences-commit" data-dirty="true">{busy ? 'Saving…' : 'Save appearance'}</button>
        {saved && <span role="status">Appearance saved for the whole app.</span>}</div>
      {(error || nativeError) && <p className="preferences-error" role="alert">{error ?? nativeError}</p>}
    </fieldset>
  </form>;
}
