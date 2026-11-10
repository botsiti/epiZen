import { useState } from 'react';
import type { Appearance } from '../../lib/appearance';
export function AppearancePreferences({ value, onSave, nativeError }: { value: Appearance; onSave: (value: Appearance) => Promise<void>; nativeError?: string }) {
  const [draft, setDraft] = useState(value), [busy, setBusy] = useState(false), [error, setError] = useState<string>(), [saved, setSaved] = useState(false);
  return <form className="preferences-form appearance-form" onSubmit={(event) => { event.preventDefault(); setBusy(true); setError(undefined); setSaved(false); void onSave(draft).then(() => setSaved(true)).catch((error: unknown) => setError(String(error))).finally(() => setBusy(false)); }}><fieldset className="preferences-fields" disabled={busy}>
    <section className="appearance-preview" data-surface={draft.surface}><div>Epizen</div><strong>{draft.surface === 'glass' ? 'Liquid glass' : 'Solid surfaces'}</strong><p>Appearance applies to the whole application, in every vault.</p></section>
    <label>Window surface<select aria-label="Application surface" value={draft.surface} onChange={(event) => { setDraft({ ...draft, surface: event.target.value as Appearance['surface'] }); setSaved(false); }}><option value="solid">Solid</option><option value="glass">Liquid glass · translucent window</option></select></label>
    {draft.surface === 'glass' && <label>Surface opacity · {Math.round(draft.opacity * 100)}%<input type="range" aria-label="Surface opacity" min="45" max="95" value={Math.round(draft.opacity * 100)} onChange={(event) => { setDraft({ ...draft, opacity: Number(event.target.value) / 100 }); setSaved(false); }} /></label>}
    <label className="assistant-check"><input type="checkbox" checked={draft.motion} onChange={(event) => { setDraft({ ...draft, motion: event.target.checked }); setSaved(false); }} />Animated ambient background</label><p className="muted">Subtle colour movement behind the workspace. Reduce Motion disables animation; Reduce Transparency uses solid surfaces.</p>
    <button type="submit" className="quiet-button">{busy ? 'Saving…' : 'Save appearance'}</button>
    {saved && <p role="status">Appearance saved for the whole app.</p>}{(error || nativeError) && <p role="alert">{error ?? nativeError}</p>}
  </fieldset></form>;
}
