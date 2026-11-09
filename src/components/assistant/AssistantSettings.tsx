import { useState, type FormEvent } from 'react';
import { assistantConnection, setAssistantKey } from '../../lib/api';
import { safeNotePath } from '../../lib/assistant/changes';
import type { AssistantProvider, AssistantSettings as Preferences } from '../../lib/assistant/types';
interface Props { value: Preferences; configured: boolean; profileExists: boolean; onSave: (value: Preferences) => Promise<void>; onCompanionChange: (value: Partial<Pick<Preferences, 'desktopPet' | 'petMotion'>>) => Promise<void>; onConnection: (provider?: AssistantProvider) => Promise<void>; onProfile: () => void; onBack: () => void }
export function AssistantSettings({ value, configured, profileExists, onSave, onCompanionChange, onConnection, onProfile, onBack }: Props) {
  const [draft, setDraft] = useState(value), [key, setKey] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState<string>();
  const [seenPet, setSeenPet] = useState({ desktopPet: value.desktopPet, petMotion: value.petMotion });
  if (seenPet.desktopPet !== value.desktopPet || seenPet.petMotion !== value.petMotion) {
    const next = { desktopPet: value.desktopPet, petMotion: value.petMotion };
    setSeenPet(next); setDraft({ ...draft, ...next });
  }
  const companion = async (patch: Partial<Pick<Preferences, 'desktopPet' | 'petMotion'>>) => {
    setBusy(true); setError(undefined);
    try { await onCompanionChange(patch); setDraft((previous) => ({ ...previous, ...patch })); }
    catch (error) { setError(String(error)); } finally { setBusy(false); }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(undefined);
    try {
      safeNotePath(draft.profilePath); safeNotePath(`${draft.inboxFolder.replace(/\/$/, '')}/Example.md`);
      if (!draft.model.trim()) throw new Error('Choose a model.');
      if (value.enabled && !draft.enabled) { await onSave({ ...draft, enabled: false }); onBack(); return; }
      if (draft.provider === 'openai' && key.trim()) { await setAssistantKey(key.trim()); setKey(''); }
      const connection = await assistantConnection(draft.provider);
      if (!connection.configured) throw new Error(draft.provider === 'codex' ? 'Sign in to Codex with ChatGPT: run codex login in Terminal, then connect again.' : 'Enter your OpenAI API key.');
      await onSave({ ...draft, enabled: !value.enabled ? true : draft.enabled });
      await onConnection(draft.provider); onBack();
    } catch (error) { setError(String(error)); } finally { setBusy(false); }
  };
  const disconnect = async () => {
    setBusy(true); setError(undefined);
    try { await onSave({ ...draft, enabled: false }); setDraft({ ...draft, enabled: false }); if (draft.provider === 'openai') { await setAssistantKey(null); await onConnection('openai'); } onBack(); }
    catch (error) { setError(String(error)); } finally { setBusy(false); }
  };
  return <form className="assistant-preferences" onSubmit={(event) => void save(event)}>
    <button type="button" className="assistant-back" onClick={onBack}>← Conversation</button>
    <h2>{configured && value.enabled ? 'Make Spike your own' : 'Connect Spike'}</h2>
    <p>Choose how Spike connects. Messages and selected note context are sent through that provider when you talk to Spike.</p>
    <fieldset disabled={busy}>
      <label>Connection<select aria-label="Spike connection" value={draft.provider} onChange={(event) => { setDraft({ ...draft, provider: event.target.value as AssistantProvider }); setError(undefined); }}><option value="codex">ChatGPT subscription · Codex CLI</option><option value="openai">OpenAI API key</option></select></label>
      {draft.provider === 'codex' && <p className="assistant-hint">Uses your installed Codex CLI and its ChatGPT login. Subscription limits apply. If needed, run <code>codex login</code> in Terminal first. Spike keeps note changes in its review flow.</p>}
      <div className="assistant-companion-settings"><strong>Desktop companion</strong><p className="assistant-hint">Drag Spike to a comfortable spot. Use Talk to return to your conversation.</p><button type="button" onClick={() => void companion({ desktopPet: !draft.desktopPet })}>{draft.desktopPet ? 'Hide desktop Spike' : 'Show Spike on desktop'}</button><label className="assistant-check"><input type="checkbox" checked={draft.petMotion} onChange={(event) => void companion({ petMotion: event.target.checked })} />Animate Spike</label></div>
      {draft.provider === 'openai' && <><label>OpenAI API key<input type="password" autoComplete="off" spellCheck={false} aria-label="OpenAI API key" value={key} placeholder={configured && value.provider === 'openai' ? 'Key stored · paste to replace' : 'Paste your API key'} onChange={(event) => setKey(event.target.value)} /></label><p className="assistant-hint">Stored in macOS Keychain. API usage is billed separately from a ChatGPT subscription.</p></>}
      <label>Model<input aria-label="Assistant model" spellCheck={false} value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })} /></label>
      {value.enabled && <label className="assistant-check"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />Enable Spike</label>}
      <label className="assistant-check"><input type="checkbox" checked={draft.shareCurrentNote} onChange={(event) => setDraft({ ...draft, shareCurrentNote: event.target.checked })} />Include the note I’m viewing</label>
      <label className="assistant-check"><input type="checkbox" checked={draft.allowChanges} onChange={(event) => setDraft({ ...draft, allowChanges: event.target.checked })} />Apply the changes I request automatically</label>
      <p className="assistant-hint">When this is off, Spike shows each proposed note or calendar change for your review.</p>
      <label className="assistant-check"><input type="checkbox" checked={draft.speakReplies} onChange={(event) => setDraft({ ...draft, speakReplies: event.target.checked })} />Read replies aloud</label>
      <p className="assistant-hint">{draft.provider === 'codex' ? 'Uses on-device macOS transcription and the system speaking voice. Speech Recognition permission and an installed language are required.' : 'Spike’s speaking voice is AI-generated.'}</p>
      <label>My profile note<input aria-label="Assistant profile note" value={draft.profilePath} onChange={(event) => setDraft({ ...draft, profilePath: event.target.value })} /></label>
      <p className="assistant-hint">Use a note with your preferences, background or personality profile. Spike remembers new details here when you ask. You can edit or remove them at any time.</p>
      {profileExists && <button type="button" className="assistant-text-button" onClick={onProfile}>Open my profile</button>}
      <label>Save links in<input aria-label="Assistant inbox folder" value={draft.inboxFolder} onChange={(event) => setDraft({ ...draft, inboxFolder: event.target.value })} /></label>
      <button className="assistant-primary" type="submit">{busy ? 'Connecting…' : value.enabled && configured ? 'Save preferences' : 'Connect Spike'}</button>
      {value.enabled && <button type="button" className="assistant-text-button" onClick={() => void disconnect()}>{draft.provider === 'codex' ? 'Disable Spike' : 'Disconnect API key'}</button>}
    </fieldset>
    {error && <p className="assistant-error" role="alert">{error}</p>}
  </form>;
}
