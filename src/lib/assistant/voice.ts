export type VoiceProvider = 'local' | 'openai' | 'openrouter';
export interface VoiceSettings { provider: VoiceProvider; model: string }
export const VOICE_MODELS: Record<VoiceProvider, string> = { local: '', openai: 'gpt-transcribe', openrouter: 'openai/whisper-1' };
/** Completed-recording models supported by the transcription endpoints. */
export const VOICE_MODEL_OPTIONS: Record<Exclude<VoiceProvider, 'local'>, readonly { id: string; label: string }[]> = {
  openai: [
    { id: 'gpt-transcribe', label: 'GPT Transcribe' },
    { id: 'gpt-4o-transcribe', label: 'GPT-4o Transcribe' },
    { id: 'gpt-4o-mini-transcribe', label: 'GPT-4o Mini Transcribe' },
    { id: 'whisper-1', label: 'Whisper 1' },
  ],
  openrouter: [
    { id: 'microsoft/mai-transcribe-2', label: 'MAI-Transcribe 2' },
    { id: 'openai/whisper-large-v3-turbo', label: 'Whisper Large V3 Turbo' },
    { id: 'openai/whisper-large-v3', label: 'Whisper Large V3' },
    { id: 'openai/gpt-transcribe', label: 'GPT Transcribe' },
    { id: 'openai/gpt-4o-mini-transcribe', label: 'GPT-4o Mini Transcribe' },
    { id: 'openai/whisper-1', label: 'Whisper 1' },
  ],
};
export function voiceSettings(value: unknown, fallback: VoiceProvider = 'local'): VoiceSettings {
  const saved = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const provider = saved.provider === 'local' || saved.provider === 'openai' || saved.provider === 'openrouter' ? saved.provider : fallback;
  return { provider, model: provider === 'local' ? '' : typeof saved.model === 'string' && /^[\w./:-]{1,128}$/.test(saved.model) ? saved.model : VOICE_MODELS[provider] };
}
