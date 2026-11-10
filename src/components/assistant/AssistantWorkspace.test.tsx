import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import * as api from '../../lib/api';
import { DEFAULT_ASSISTANT } from '../../lib/assistant/types';
import { DEFAULT_PERIODIC } from '../../lib/periodic';
import { AssistantWorkspace } from './AssistantWorkspace';
import type { AssistantController, AssistantSnapshot } from './controller';
const state = vi.hoisted(() => ({ broken: false }));
vi.mock('../../lib/api');
vi.mock('./AssistantPanel', () => ({ AssistantPanel: ({ controller, snapshot }: { controller: AssistantController; snapshot: AssistantSnapshot }) => {
  if (state.broken) throw new Error('View failure');
  return <textarea aria-label="Retained draft" value={snapshot.thread.draft} onChange={(event) => controller.setDraft(event.target.value)} />;
} }));
it('retains an unsent conversation draft outside a failed view and restores it on retry', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.mocked(api.enableQuickPrompt).mockResolvedValue(undefined);
  vi.mocked(api.publishQuickPrompt).mockResolvedValue(undefined);
  vi.mocked(api.onQuickPrompt).mockResolvedValue(() => undefined);
  vi.mocked(api.onQuickCommand).mockResolvedValue(() => undefined);
  vi.mocked(api.quickPromptState).mockResolvedValue({ root: '/copy', document: { revision: 0, draft: '', pending: null } } as Awaited<ReturnType<typeof api.quickPromptState>>);
  vi.mocked(api.enablePet).mockResolvedValue(undefined);
  vi.mocked(api.onPetCommand).mockResolvedValue(() => undefined);
  vi.mocked(api.onMainHidden).mockResolvedValue(() => undefined);
  vi.mocked(api.assistantConnection).mockResolvedValue({ configured: true });
  vi.mocked(api.assistantListChats).mockResolvedValue([]);
  vi.mocked(api.assistantSaveChat).mockResolvedValue(1);
  const context = { root: '/copy', now: new Date(2026, 10, 8), periodic: DEFAULT_PERIODIC, settings: { ...DEFAULT_ASSISTANT, enabled: true }, files: [], texts: new Map<string, string>() };
  const props = { context, open: true, onOpen: vi.fn(), onClose: vi.fn(), onSaved: vi.fn(), onOpenNote: vi.fn(), onRefresh: vi.fn().mockResolvedValue(undefined), onSaveSettings: vi.fn().mockResolvedValue(undefined) };
  const content = () => <><p>My note stays usable</p><AssistantWorkspace {...props} /></>;
  try {
    const user = userEvent.setup(), view = render(content());
    await waitFor(() => expect(api.assistantListChats).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Retained draft'), { target: { value: 'A thought I have not sent yet.' } });
    await waitFor(() => expect(screen.getByLabelText('Retained draft')).toHaveValue('A thought I have not sent yet.'));
    state.broken = true; view.rerender(content());
    expect(screen.getByRole('alert')).toHaveTextContent('Spike couldn’t be shown');
    expect(screen.getByText('My note stays usable')).toBeVisible();
    state.broken = false; await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByLabelText('Retained draft')).toHaveValue('A thought I have not sent yet.');
    view.unmount();
  } finally { state.broken = false; log.mockRestore(); }
});
