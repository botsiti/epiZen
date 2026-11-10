import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AssistantPanel } from './AssistantPanel';
import { newConversation } from '../../lib/assistant/conversation';
import { DEFAULT_ASSISTANT } from '../../lib/assistant/types';
import type { AssistantController, AssistantSnapshot } from './controller';
import type { VoiceControls } from './useVoice';

const markdown = vi.hoisted(() => vi.fn());
vi.mock('react-markdown', () => ({ default: ({ children }: { children: string }) => { markdown(children); return <p>{children}</p>; } }));
vi.mock('./Spike', () => ({ Spike: () => null }));
it('keeps earlier messages rendered while typing and updates speech controls when recording starts', () => {
  const setDraft = vi.fn();
  const controller = { setDraft } as unknown as AssistantController;
  const voice: VoiceControls = { level: 0, phase: 'idle', seconds: 0, canRetry: false, error: undefined, start: vi.fn(), stop: vi.fn(), pauseRecording: vi.fn(), cancel: vi.fn(), retry: vi.fn(), speak: vi.fn() };
  const snapshot: AssistantSnapshot = { thread: { ...newConversation('/copy'), messages: [{ id: '1', role: 'assistant', text: 'A long earlier reply.', created: '' }] }, loaded: true, configured: true, busy: false, switching: false, conversations: [] };
  const props = { controller, snapshot, voice, settings: { ...DEFAULT_ASSISTANT, enabled: true }, profileExists: false, onSaveSettings: vi.fn(), onOpenNote: vi.fn(), onClose: vi.fn() };
  const view = render(<AssistantPanel {...props} />);
  expect(markdown).toHaveBeenCalledOnce();
  fireEvent.change(screen.getByLabelText('Message Spike'), { target: { value: 'My new draft' } });
  expect(setDraft).toHaveBeenCalledWith('My new draft');
  view.rerender(<AssistantPanel {...props} snapshot={{ ...snapshot, thread: { ...snapshot.thread, draft: 'My new draft' } }} />);
  expect(screen.getByLabelText('Message Spike')).toHaveValue('My new draft');
  expect(markdown).toHaveBeenCalledOnce();
  view.rerender(<AssistantPanel {...props} voice={{ ...voice, phase: 'recording' }} />);
  expect(screen.getByRole('button', { name: 'Read aloud' })).toBeDisabled();
  expect(markdown).toHaveBeenCalledTimes(2);
});
