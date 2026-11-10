import { useEffect, useRef, useState } from 'react';
import { enableQuickPrompt, finishQuickPrompt, onQuickCommand, onQuickPrompt, publishQuickPrompt, quickPromptState, flushQuickPrompt, type QuickSnapshot, type QuickStatus } from '../../lib/api';
import { flushBeforeClose } from '../../lib/saving';
import type { AssistantController, AssistantSnapshot } from './controller';
import type { AssistantSettings } from '../../lib/assistant/types';

export function useQuickBridge(root: string, controller: AssistantController, snapshot: AssistantSnapshot, settings: AssistantSettings, glassSurface = false) {
  const [ready, setReady] = useState(false), [error, setError] = useState<string>();
  const pending = useRef<QuickSnapshot['document']['pending']>(null), handling = useRef(new Set<string>());
  const status: QuickStatus = { glass: glassSurface, connected: settings.enabled && snapshot.configured && snapshot.loaded, busy: snapshot.busy || snapshot.switching, review: snapshot.thread.actions.some((action) => action.status === 'review' || action.status === 'failed') || Boolean(snapshot.thread.run && snapshot.thread.run.phase !== 'complete' && !snapshot.busy), label: snapshot.error ?? (snapshot.busy ? snapshot.progress ?? 'Thinking…' : 'Ready when you are'), reply: snapshot.thread.messages.filter((message) => message.role === 'assistant').at(-1)?.text.slice(0, 1500) ?? '', voice: settings.voice };
  const latest = useRef({ status, snapshot });
  useEffect(() => { latest.current = { status, snapshot }; });
  const process = useRef<() => void>(() => undefined);
  useEffect(() => {
    process.current = () => {
      const capture = pending.current;
      if (!capture || capture.error || !latest.current.status.connected || latest.current.status.busy || handling.current.has(capture.id)) return;
      handling.current.add(capture.id);
      void controller.acceptQuickPrompt(capture.id, capture.text).then(
        () => finishQuickPrompt(root, capture.id),
        (error: unknown) => finishQuickPrompt(root, capture.id, String(error)),
      ).catch((error: unknown) => setError(String(error))).finally(() => handling.current.delete(capture.id));
    };
  }, [controller, root]);
  useEffect(() => {
    let gone = false; const stops: (() => void)[] = [];
    const accept = (next: QuickSnapshot) => { if (gone || next.root !== root) return; pending.current = next.document.pending; process.current(); };
    const retain = (stop: () => void) => { if (gone) stop(); else stops.push(stop); };
    void onQuickPrompt(accept, 'main').then(retain).catch((error: unknown) => { if (!gone) setError(String(error)); });
    void onQuickCommand((message) => { if (!gone) setError(message); }, 'main').then(retain).catch((error: unknown) => { if (!gone) setError(String(error)); });
    void enableQuickPrompt(root, true).then(async () => {
      if (gone) return;
      setReady(true); setError(undefined);
      await publishQuickPrompt(root, latest.current.status);
      accept(await quickPromptState());
    }).catch((error: unknown) => { if (!gone) { setError(String(error)); setReady(true); } });
    return () => { gone = true; stops.forEach((stop) => stop()); void enableQuickPrompt(root, false).catch(() => undefined); };
  }, [root]);
  const { connected, busy, review, label, reply, voice, glass } = status;
  useEffect(() => {
    if (!ready) return;
    void publishQuickPrompt(root, { connected, busy, review, label, reply, voice, glass }).catch((error: unknown) => setError(String(error)));
    process.current();
  }, [root, ready, connected, busy, review, label, reply, voice, glass]);
  useEffect(() => flushBeforeClose(() => flushQuickPrompt().then(() => undefined, () => 'Spike quick prompt')), []);
  return error;
}
