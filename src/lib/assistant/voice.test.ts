import { expect, it } from 'vitest';
import { assistantSettings, DEFAULT_ASSISTANT } from './types';
import { voiceSettings } from './voice';
it('preserves existing speech routing on upgrade and separates future voice choices from the conversation provider', () => {
  expect(assistantSettings({ enabled: true }).voice.provider).toBe('openai');
  expect(assistantSettings({ provider: 'codex' }).voice.provider).toBe('local');
  expect(assistantSettings({ ...DEFAULT_ASSISTANT, provider: 'codex', voice: { provider: 'openrouter', model: 'microsoft/mai-transcribe-2' } }).voice).toEqual({ provider: 'openrouter', model: 'microsoft/mai-transcribe-2' });
  expect(voiceSettings({ provider: 'unknown', model: 'bad\nmodel' })).toEqual({ provider: 'local', model: '' });
});
