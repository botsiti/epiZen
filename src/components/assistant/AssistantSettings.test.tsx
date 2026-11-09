import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { AssistantSettings } from './AssistantSettings';
import { DEFAULT_ASSISTANT } from '../../lib/assistant/types';
import { voiceConnection, assistantConnection, setAssistantKey } from '../../lib/api';
vi.mock('../../lib/api', () => ({ assistantConnection: vi.fn(), setAssistantKey: vi.fn(), voiceConnection: vi.fn(), setVoiceKey: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); vi.mocked(assistantConnection).mockResolvedValue({ configured: true }); vi.mocked(voiceConnection).mockResolvedValue({ configured: true }); });
function setup() {
  const onSave = vi.fn().mockResolvedValue(undefined), onConnection = vi.fn().mockResolvedValue(undefined), onBack = vi.fn();
  render(<AssistantSettings value={DEFAULT_ASSISTANT} configured={false} profileExists={false} onSave={onSave} onConnection={onConnection} onBack={onBack} onCompanionChange={vi.fn()} onProfile={vi.fn()} />);
  return { onSave, onConnection, onBack, user: userEvent.setup() };
}
it('connects the current Codex subscription without requesting or storing an API key', async () => {
  const { user, onSave, onConnection, onBack } = setup();
  expect(screen.queryByLabelText('OpenAI API key')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Connect Spike' }));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ provider: 'codex', enabled: true })));
  expect(assistantConnection).toHaveBeenCalledWith('codex');
  expect(setAssistantKey).not.toHaveBeenCalled();
  expect(onConnection).toHaveBeenCalledWith('codex');
  expect(onBack).toHaveBeenCalledOnce();
});
it('keeps the form available when subscription login is missing', async () => {
  vi.mocked(assistantConnection).mockResolvedValue({ configured: false });
  const { user, onSave, onBack } = setup();
  await user.click(screen.getByRole('button', { name: 'Connect Spike' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('codex login');
  expect(onSave).not.toHaveBeenCalled(); expect(onBack).not.toHaveBeenCalled();
});
it('can disable Spike even when the selected provider is unavailable', async () => {
  vi.mocked(assistantConnection).mockRejectedValue(new Error('Codex unavailable'));
  const onSave = vi.fn().mockResolvedValue(undefined), onBack = vi.fn();
  render(<AssistantSettings value={{ ...DEFAULT_ASSISTANT, enabled: true }} configured={false} profileExists={false} onSave={onSave} onConnection={vi.fn()} onBack={onBack} onCompanionChange={vi.fn()} onProfile={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Disable Spike' }));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ enabled: false })));
  expect(assistantConnection).not.toHaveBeenCalled(); expect(setAssistantKey).not.toHaveBeenCalled();
  expect(onBack).toHaveBeenCalledOnce();
});
