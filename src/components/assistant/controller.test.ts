import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as api from '../../lib/api';
import { DEFAULT_PERIODIC } from '../../lib/periodic';
import { DEFAULT_ASSISTANT, type AssistantContext } from '../../lib/assistant/types';
import { AssistantController, type AssistantHost } from './controller';
vi.mock('../../lib/api');
const controllers: AssistantController[] = [];
const saved = new Map<string, { revision: number; state: unknown }>();
const reply = (text: string) => ({ output: [{ type: 'message', content: [{ type: 'output_text', text }] }] });
const action = { type: 'function_call', call_id: 'save-1', name: 'add_media', arguments: JSON.stringify({ kind: 'film', title: 'Quiet Harbour', maker: '', year: '', date: '2026-11-07', rating: '', genres: [], thoughts: '' }) };
beforeEach(() => {
  vi.resetAllMocks(); saved.clear();
  vi.mocked(api.assistantConnection).mockResolvedValue({ configured: true });
  vi.mocked(api.assistantListChats).mockResolvedValue([]);
  vi.mocked(api.assistantSaveChat).mockImplementation((_root, id, state, expected) => {
    if ((saved.get(id)?.revision ?? 0) !== expected) return Promise.reject(new Error('Revision conflict'));
    saved.set(id, { revision: expected + 1, state: structuredClone(state) }); return Promise.resolve(expected + 1);
  });
  vi.mocked(api.assistantLoadChat).mockImplementation((_root, id) => Promise.resolve(saved.get(id)));
  vi.mocked(api.assistantApplyNote).mockResolvedValue('Rating/kino/Quiet Harbour.md');
});
afterEach(async () => { await Promise.all(controllers.map(async (controller) => { controller.destroy(); await controller.flush().catch(() => undefined); })); controllers.length = 0; });
async function setup(allowChanges = false) {
  const context: AssistantContext = { root: '/copy', now: new Date(2026, 10, 8, 12), periodic: DEFAULT_PERIODIC, settings: { ...DEFAULT_ASSISTANT, enabled: true, allowChanges }, files: [], texts: new Map() };
  const host: AssistantHost = { context: () => context, onSaved: vi.fn(), onOpen: vi.fn(), onRefresh: vi.fn().mockResolvedValue(undefined) };
  const controller = new AssistantController('/copy', host); controllers.push(controller); controller.mount();
  await waitFor(() => expect(controller.getSnapshot().loaded).toBe(true));
  return { controller, host, context };
}
it('reviews a concrete change, persists approval, saves through the native boundary and reports the result', async () => {
  const { controller, host } = await setup();
  vi.mocked(api.assistantRespond).mockResolvedValueOnce({ output: [action] }).mockResolvedValue(reply('Added Quiet Harbour to your films.'));
  await controller.send('Yesterday I watched Quiet Harbour. Add it.');
  expect(controller.getSnapshot().thread.actions[0]?.status).toBe('review');
  expect(api.assistantApplyNote).not.toHaveBeenCalled();
  const proposed = controller.getSnapshot().thread.actions[0]!;
  await controller.review(proposed.id, true);
  expect(api.assistantApplyNote).toHaveBeenCalledOnce();
  const written = vi.mocked(api.assistantApplyNote).mock.calls[0]![0];
  expect(written).toMatchObject({ root: '/copy', path: 'Rating/kino/Quiet Harbour.md', before: null });
  expect(written.after).toContain('Watched: 2026-11-07');
  expect(host.onSaved).toHaveBeenCalled();
  expect(controller.getSnapshot().thread.messages.at(-1)?.text).toContain('Added Quiet Harbour');
  expect(controller.getSnapshot().thread.actions[0]?.status).toBe('saved');
});
it('cancels a running provider before switching and ignores its late proposed action', async () => {
  const { controller, host, context } = await setup(true);
  let finish: (value: unknown) => void = () => undefined;
  vi.mocked(api.assistantRespond).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const sending = controller.send('Create a note');
  await waitFor(() => expect(api.assistantRespond).toHaveBeenCalledOnce());
  const signal = vi.mocked(api.assistantRespond).mock.calls[0]![1]!;
  controller.updateHost({ ...host, context: () => ({ ...context, settings: { ...context.settings, provider: 'openai' } }) });
  expect(signal.aborted).toBe(true);
  finish({ output: [action] }); await sending;
  expect(api.assistantApplyNote).not.toHaveBeenCalled();
  expect(controller.getSnapshot().thread.messages[0]?.text).toBe('Create a note');
});
it('does not repeat a successful write when the model continuation fails and is resumed', async () => {
  const { controller } = await setup(true);
  vi.mocked(api.assistantRespond).mockResolvedValueOnce({ output: [action] }).mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(reply('Saved.'));
  await controller.send('Add Quiet Harbour.');
  expect(controller.getSnapshot().error).toBe('Offline');
  await controller.resume();
  expect(api.assistantApplyNote).toHaveBeenCalledOnce();
  expect(controller.getSnapshot().thread.messages.at(-1)?.text).toBe('Saved.');
});
it('keeps a rejected save and its full draft for review without letting the model claim success', async () => {
  const { controller } = await setup(true);
  vi.mocked(api.assistantRespond).mockResolvedValue({ output: [action] });
  vi.mocked(api.assistantApplyNote).mockRejectedValue(new Error('File changed on disk'));
  await controller.send('Add Quiet Harbour.');
  expect(controller.getSnapshot().thread.actions[0]).toMatchObject({ status: 'failed', error: 'File changed on disk' });
  const proposed = controller.getSnapshot().thread.actions[0]!.change;
  if (proposed.kind !== 'note') throw new Error('Expected a note action');
  expect(proposed.after).toContain('Watched:');
  expect(api.assistantRespond).toHaveBeenCalledOnce();
});
it('restores conversation messages and an unsent draft after reopening', async () => {
  const { controller } = await setup();
  vi.mocked(api.assistantRespond).mockResolvedValue(reply('Hello.'));
  await controller.send('Hello Spike'); controller.setDraft('An unfinished thought'); await controller.flush();
  const thread = controller.getSnapshot().thread;
  controller.destroy(); await controller.flush();
  vi.mocked(api.assistantListChats).mockResolvedValue([{ id: thread.id, title: thread.title, updated: thread.updated }]);
  const restored = await setup();
  expect(restored.controller.getSnapshot().thread.draft).toBe('An unfinished thought');
  expect(restored.controller.getSnapshot().thread.messages.map((message) => message.text)).toEqual(['Hello Spike', 'Hello.']);
});
it('prevents duplicate sends before the first persistence operation finishes', async () => {
  const { controller } = await setup(); vi.mocked(api.assistantRespond).mockResolvedValue(reply('Done.'));
  await Promise.all([controller.send('First message'), controller.send('Second message')]);
  expect(api.assistantRespond).toHaveBeenCalledOnce();
  expect(controller.getSnapshot().thread.messages.filter((message) => message.role === 'user')).toHaveLength(1);
});
it('preserves the full stored history while limiting the model context to recent turns', async () => {
  const { controller } = await setup(); vi.mocked(api.assistantRespond).mockResolvedValue(reply('Understood.'));
  for (let i = 0; i < 12; i++) await controller.send(`Message ${i}`);
  expect(controller.getSnapshot().thread.messages).toHaveLength(24);
  expect(controller.getSnapshot().thread.history).toHaveLength(24);
  const last = vi.mocked(api.assistantRespond).mock.calls.at(-1)![0];
  expect(last.input.some((item) => item.content === 'Message 0')).toBe(false);
});
it('never executes a model action arriving after leaving its vault', async () => {
  const { controller } = await setup(true);
  let resolve: (value: unknown) => void = () => undefined;
  vi.mocked(api.assistantRespond).mockReturnValue(new Promise((done) => { resolve = done; }));
  const sending = controller.send('Add Quiet Harbour');
  await waitFor(() => expect(api.assistantRespond).toHaveBeenCalled());
  controller.destroy(); resolve({ output: [action] }); await sending;
  expect(api.assistantApplyNote).not.toHaveBeenCalled();
});
it('does not execute a model action after the assistant was disabled', async () => {
  const { controller, context } = await setup(true);
  let resolve: (value: unknown) => void = () => undefined;
  vi.mocked(api.assistantRespond).mockReturnValue(new Promise((done) => { resolve = done; }));
  const sending = controller.send('Add Quiet Harbour');
  await waitFor(() => expect(api.assistantRespond).toHaveBeenCalled());
  context.settings.enabled = false; resolve({ output: [action] }); await sending;
  expect(api.assistantApplyNote).not.toHaveBeenCalled();
  expect(controller.getSnapshot().error).toContain('switched off');
});
it('allows a new conversation after a full thread has been exported, preserving the unsent draft in the export', async () => {
  const { controller } = await setup();
  controller.setDraft('An unsent thought to preserve.');
  const id = controller.getSnapshot().thread.id;
  const save = vi.mocked(api.assistantSaveChat).getMockImplementation()!;
  vi.mocked(api.assistantSaveChat).mockImplementation((root, chatId, state, expected) => chatId === id ? Promise.reject(new Error('This conversation is full.')) : save(root, chatId, state, expected));
  await controller.newChat(); expect(controller.getSnapshot().thread.id).toBe(id);
  vi.mocked(api.assistantExportChat).mockResolvedValue('/chosen/export.md');
  await controller.exportConversation();
  expect(vi.mocked(api.assistantExportChat).mock.calls[0]![1]).toContain('An unsent thought to preserve.');
  await controller.newChat(); expect(controller.getSnapshot().thread.id).not.toBe(id);
});

it('accepts a quick prompt only once while keeping the sidebar draft and ordinary action review', async () => {
  const { controller } = await setup();
  vi.mocked(api.assistantHasMessage).mockResolvedValue(false);
  vi.mocked(api.assistantRespond).mockResolvedValue({ output: [action] });
  controller.setDraft('A separate unfinished thought.');
  await controller.acceptQuickPrompt('quick-request-1', 'Add Quiet Harbour.');
  await waitFor(() => expect(controller.getSnapshot().busy).toBe(false));
  await controller.acceptQuickPrompt('quick-request-1', 'Add Quiet Harbour.');
  expect(controller.getSnapshot().thread.messages.filter((message) => message.role === 'user')).toHaveLength(1);
  expect(controller.getSnapshot().thread.draft).toBe('A separate unfinished thought.');
  expect(api.assistantRespond).toHaveBeenCalledOnce();
  expect(api.assistantApplyNote).not.toHaveBeenCalled();
  expect(controller.getSnapshot().thread.actions[0]?.status).toBe('review');
});
it('acknowledges a quick request already saved in another conversation without replaying it', async () => {
  const { controller } = await setup();
  vi.mocked(api.assistantHasMessage).mockResolvedValue(true);
  await controller.acceptQuickPrompt('previous-request', 'An already processed request');
  expect(api.assistantRespond).not.toHaveBeenCalled();
  expect(controller.getSnapshot().thread.messages).toHaveLength(0);
});
it('retains a quick prompt when its conversation save fails and does not run actions until recovery', async () => {
  const { controller } = await setup();
  vi.mocked(api.assistantHasMessage).mockResolvedValue(false);
  vi.mocked(api.assistantSaveChat).mockRejectedValueOnce(new Error('Disk full'));
  await expect(controller.acceptQuickPrompt('failed-request', 'Keep my request')).rejects.toThrow('Disk full');
  expect(api.assistantRespond).not.toHaveBeenCalled();
  expect(controller.getSnapshot().thread.messages[0]?.text).toBe('Keep my request');
  await controller.acceptQuickPrompt('failed-request', 'Keep my request');
  expect(controller.getSnapshot().thread.messages).toHaveLength(1);
  expect(controller.getSnapshot().thread.run?.phase).toBe('ready');
});
