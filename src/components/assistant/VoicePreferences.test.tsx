import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { setVoiceKey, voiceConnection } from '../../lib/api';
import { VoicePreferences } from './VoicePreferences';
vi.mock('../../lib/api', () => ({ setVoiceKey: vi.fn(), voiceConnection: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); vi.mocked(voiceConnection).mockResolvedValue({ configured: true }); vi.mocked(setVoiceKey).mockResolvedValue(undefined); });
it('stores an OpenRouter key separately and saves the chosen model without exposing the key in preferences', async () => {
  const save = vi.fn().mockResolvedValue(undefined), user = userEvent.setup();
  render(<VoicePreferences value={{ provider: 'local', model: '' }} onSave={save} />);
  await user.selectOptions(screen.getByLabelText('Voice provider'), 'openrouter');
  await user.selectOptions(screen.getByRole('combobox', { name: 'Transcription model' }), 'microsoft/mai-transcribe-2');
  await user.type(screen.getByLabelText('Voice API key'), 'test-only-voice-key');
  await user.click(screen.getByRole('button', { name: 'Save voice settings' }));
  expect(setVoiceKey).toHaveBeenCalledWith('openrouter', 'test-only-voice-key');
  expect(save).toHaveBeenCalledWith({ provider: 'openrouter', model: 'microsoft/mai-transcribe-2' });
  expect(screen.getByLabelText('Voice API key')).toHaveValue('');
  expect(await screen.findByRole('status')).toHaveTextContent('Voice settings saved');
});
it('keeps failed settings available for retry and switches to local speech without a credential', async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error('Settings busy')).mockResolvedValue(undefined), user = userEvent.setup();
  render(<VoicePreferences value={{ provider: 'openrouter', model: 'openai/whisper-1' }} onSave={save} />);
  await user.click(screen.getByRole('button', { name: 'Save voice settings' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Settings busy');
  expect(screen.getByLabelText('Transcription model')).toHaveValue('openai/whisper-1');
  await user.selectOptions(screen.getByLabelText('Voice provider'), 'local');
  await user.click(screen.getByRole('button', { name: 'Save voice settings' }));
  await waitFor(() => expect(save).toHaveBeenLastCalledWith({ provider: 'local', model: '' }));
  expect(setVoiceKey).not.toHaveBeenCalled();
});
it('refuses to save an unconnected remote provider and never substitutes a different provider', async () => {
  vi.mocked(voiceConnection).mockResolvedValue({ configured: false });
  const save = vi.fn();
  render(<VoicePreferences value={{ provider: 'openrouter', model: 'openai/whisper-1' }} onSave={save} />);
  await userEvent.click(screen.getByRole('button', { name: 'Save voice settings' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter an API key');
  expect(save).not.toHaveBeenCalled();
  expect(vi.mocked(voiceConnection).mock.calls.every(([provider]) => provider === 'openrouter')).toBe(true);
});

it('preserves saved custom models and validates custom input before saving', async () => {
  const save = vi.fn().mockResolvedValue(undefined), user = userEvent.setup();
  render(<VoicePreferences value={{ provider: 'openrouter', model: 'other/saved-model' }} onSave={save} />);
  expect(screen.getByLabelText('Transcription model')).toHaveValue('custom');
  expect(screen.getByLabelText('Custom transcription model')).toHaveValue('other/saved-model');
  await user.click(screen.getByRole('button', { name: 'Save voice settings' }));
  expect(save).toHaveBeenLastCalledWith({ provider: 'openrouter', model: 'other/saved-model' });
  await user.selectOptions(screen.getByLabelText('Transcription model'), 'microsoft/mai-transcribe-2');
  expect(screen.queryByLabelText('Custom transcription model')).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText('Transcription model'), 'custom');
  await user.type(screen.getByLabelText('Custom transcription model'), 'invalid model');
  await user.click(screen.getByRole('button', { name: 'Save voice settings' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('valid transcription model');
  expect(save).toHaveBeenCalledOnce();
});
it('shows models for the selected provider and saves its exact identifier', async () => {
  const save = vi.fn().mockResolvedValue(undefined), user = userEvent.setup();
  render(<VoicePreferences value={{ provider: 'openrouter', model: 'microsoft/mai-transcribe-2' }} onSave={save} />);
  await user.selectOptions(screen.getByLabelText('Voice provider'), 'openai');
  expect(screen.queryByRole('option', { name: 'MAI-Transcribe 2' })).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText('Transcription model'), 'gpt-4o-mini-transcribe');
  await user.click(screen.getByRole('button', { name: 'Save voice settings' }));
  expect(save).toHaveBeenCalledWith({ provider: 'openai', model: 'gpt-4o-mini-transcribe' });
});
