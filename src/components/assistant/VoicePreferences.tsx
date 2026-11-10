import { useEffect, useState } from 'react';
import { setVoiceKey, voiceConnection } from '../../lib/api';
import { VOICE_MODELS, VOICE_MODEL_OPTIONS, type VoiceProvider, type VoiceSettings } from '../../lib/assistant/voice';

export function VoicePreferences({ value, onSave, onBusy }: { value: VoiceSettings; onSave: (value: VoiceSettings) => Promise<void>; onBusy?: (busy: boolean) => void }) {
  const [draft, setDraft] = useState(value), [key, setKey] = useState('');
  const [customModel, setCustomModel] = useState(value.provider !== 'local' && !VOICE_MODEL_OPTIONS[value.provider].some((option) => option.id === value.model));
  const [configured, setConfigured] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<string>(), [saved, setSaved] = useState(false);
  useEffect(() => {
    let gone = false;
    void voiceConnection(draft.provider).then((connection) => { if (!gone) setConfigured(connection.configured); }).catch((error: unknown) => { if (!gone) { setConfigured(false); setError(String(error)); } });
    return () => { gone = true; };
  }, [draft.provider]);
  const save = async () => {
    setBusy(true); onBusy?.(true); setError(undefined); setSaved(false);
    try {
      if (draft.provider !== 'local') {
        if (!/^[\w./:-]{1,128}$/.test(draft.model.trim())) throw new Error('Enter a valid transcription model identifier.');
        if (key.trim()) { await setVoiceKey(draft.provider, key.trim()); setKey(''); }
        const connection = await voiceConnection(draft.provider);
        setConfigured(connection.configured);
        if (!connection.configured) throw new Error('Enter an API key for the selected voice provider.');
      }
      await onSave({ ...draft, model: draft.model.trim() }); setSaved(true);
    } catch (error) { setError(String(error)); } finally { setBusy(false); onBusy?.(false); }
  };
  return <section className="assistant-voice-preferences" aria-label="Voice settings">
    <h3>Dictation</h3>
    <p className="assistant-hint">Choose how your recordings become text. This works with either assistant connection.</p>
    <fieldset disabled={busy}>
      <label>Voice provider<select aria-label="Voice provider" value={draft.provider} onChange={(event) => {
        const provider = event.target.value as VoiceProvider;
        setDraft({ provider, model: VOICE_MODELS[provider] }); setCustomModel(false); setKey(''); setConfigured(false); setError(undefined); setSaved(false);
      }}><option value="local">On this Mac · on-device</option><option value="openai">OpenAI API</option><option value="openrouter">OpenRouter</option></select></label>
      {draft.provider === 'local' ? <p className="assistant-hint">Audio stays on your Mac. Requires macOS Speech Recognition permission and a supported installed language.</p> : <>
        <label>Transcription model<select aria-label="Transcription model" value={customModel ? 'custom' : draft.model} onChange={(event) => {
          const model = event.target.value;
          setCustomModel(model === 'custom'); setDraft({ ...draft, model: model === 'custom' ? '' : model }); setSaved(false);
        }}>{VOICE_MODEL_OPTIONS[draft.provider].map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}<option value="custom">Custom model…</option></select></label>
        {customModel && <label>Custom transcription model<input aria-label="Custom transcription model" spellCheck={false} value={draft.model} placeholder="provider/model-id" onChange={(event) => { setDraft({ ...draft, model: event.target.value }); setSaved(false); }} /></label>}
        <label>{draft.provider === 'openrouter' ? 'OpenRouter' : 'OpenAI'} voice API key<input type="password" aria-label="Voice API key" autoComplete="off" spellCheck={false} value={key} placeholder={configured ? 'Key stored · paste to replace' : 'Paste your API key'} onChange={(event) => { setKey(event.target.value); setSaved(false); }} /></label>
        <p className="assistant-hint">Stored in macOS Keychain. Recordings go to {draft.provider === 'openrouter' ? 'OpenRouter and the selected transcription provider' : 'OpenAI'} when you send voice. API usage is billed by that provider.{draft.provider === 'openai' && ' Uses the same OpenAI key as your assistant connection.'}</p>
      </>}
      <button type="button" onClick={() => void save()}>{busy ? 'Saving voice settings…' : 'Save voice settings'}</button>
    </fieldset>
    {saved && <p role="status">Voice settings saved.</p>}
    {error && <p className="assistant-error" role="alert">{error}</p>}
  </section>;
}
