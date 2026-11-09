export type VoiceProvider = 'local' | 'openai' | 'openrouter';
export interface VoiceSettings { provider: VoiceProvider; model: string }
export const VOICE_MODELS: Record<VoiceProvider, string> = { local: '', openai: 'gpt-transcribe', openrouter: 'openai/whisper-1' };
export function voiceSettings(value: unknown, fallback: VoiceProvider = 'local'): VoiceSettings {
  const saved = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const provider = saved.provider === 'local' || saved.provider === 'openai' || saved.provider === 'openrouter' ? saved.provider : fallback;
  return { provider, model: provider === 'local' ? '' : typeof saved.model === 'string' && /^[\w./:-]{1,128}$/.test(saved.model) ? saved.model : VOICE_MODELS[provider] };
}
