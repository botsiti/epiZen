import { useCallback, useEffect, useRef, useState } from 'react';
import { consumeQuickOpen, hideQuickPrompt, onQuickCommand, onQuickPrompt, openQuickConversation, quickPromptFlushed, quickPromptState, saveQuickDraft, submitQuickPrompt, transcribeQuickPrompt, type QuickSnapshot } from '../../lib/api';
import { useVoice } from './useVoice';
import { ErrorBoundary } from '../ErrorBoundary';
import { Spike } from './Spike';
import './quickPrompt.css';

export function QuickPrompt() {
  const [snapshot, setSnapshot] = useState<QuickSnapshot>(), [error, setError] = useState<string>();
  useEffect(() => {
    let gone = false, stop: (() => void) | undefined;
    const accept = (next: QuickSnapshot) => { if (!gone && next?.root && next.document && next.status) setSnapshot(next); };
    void onQuickPrompt(accept).then(async (off) => { if (gone) { off(); return; } stop = off; accept(await quickPromptState()); }).catch((error: unknown) => { if (!gone) setError(String(error)); });
    return () => { gone = true; stop?.(); };
  }, []);
  if (!snapshot) return <main className="quick-prompt"><p role={error ? 'alert' : 'status'}>{error ?? 'Opening Spike…'}</p></main>;
  return <QuickEntry key={snapshot.root} snapshot={snapshot} />;
}

function QuickEntry({ snapshot }: { snapshot: QuickSnapshot }) {
  const { root, document: doc, status } = snapshot;
  const [draft, setDraft] = useState(doc.draft), [error, setError] = useState<string>(), [submitting, setSubmitting] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null), text = useRef(doc.draft), revision = useRef(doc.revision), saved = useRef(doc.draft);
  const queue = useRef(Promise.resolve()), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sending = useRef(false);
  const pending = useRef(doc.pending), sent = useRef<{ id: string; text: string; revision: number } | undefined>(undefined);
  const save = useCallback(() => {
    clearTimeout(timer.current);
    const captured = text.current;
    const job = queue.current.catch(() => undefined).then(async () => {
      if (saved.current === captured || pending.current) return;
      const next = await saveQuickDraft(root, revision.current, captured);
      revision.current = Math.max(revision.current, next.revision); saved.current = captured;
    });
    queue.current = job; return job;
  }, [root]);
  useEffect(() => {
    revision.current = Math.max(revision.current, doc.revision);
    const wasPending = pending.current;
    pending.current = doc.pending;
    if (!doc.pending && (wasPending || sent.current && doc.revision > sent.current.revision + 1 && doc.draft === '')) {
      sent.current = undefined; text.current = doc.draft; saved.current = doc.draft; setDraft(doc.draft); setSubmitting(false);
    }
  }, [doc]);
  const send = useCallback(async () => {
    if (sending.current || sent.current || pending.current || !text.current.trim()) return;
    sending.current = true;
    setSubmitting(true); setError(undefined);
    try {
      await save();
      const id = crypto.randomUUID(); sent.current = { id, text: text.current, revision: revision.current };
      await submitQuickPrompt(root, revision.current, id);
    } catch (error) { sent.current = undefined; setSubmitting(false); setError(String(error)); }
    finally { sending.current = false; }
  }, [root, save]);
  const receiveVoice = useCallback(async (transcript: string) => {
    text.current = [text.current.trim(), transcript.trim()].filter(Boolean).join('\n'); setDraft(text.current);
    await save(); await send();
  }, [save, send]);
  const transcriber = useCallback<NonNullable<Parameters<typeof useVoice>[3]>>((audio, mime, signal, provider, voice) => transcribeQuickPrompt(root, audio, mime, signal, provider, voice), [root]);
  const voice = useVoice(receiveVoice, 'codex', status.voice, transcriber);
  const { pauseRecording } = voice;
  const close = useCallback(async () => {
    pauseRecording();
    try { await save(); await hideQuickPrompt(); }
    catch (error) { setError(String(error)); }
  }, [pauseRecording, save]);
  const latest = useRef({ close, save, voice });
  useEffect(() => { latest.current = { close, save, voice }; });
  const opened = useRef(0);
  useEffect(() => {
    if (!snapshot.visible) { pauseRecording(); return; }
    if (opened.current === snapshot.opened) return;
    opened.current = snapshot.opened; input.current?.focus();
    void consumeQuickOpen(snapshot.opened).catch((error: unknown) => setError(String(error)));
    if (snapshot.dictate && status.connected && !status.busy && !pending.current) {
      if (latest.current.voice.phase === 'recording') latest.current.voice.stop();
      else if (latest.current.voice.phase === 'idle') void latest.current.voice.start();
    }
  }, [snapshot.visible, snapshot.opened, snapshot.dictate, status.connected, status.busy, pauseRecording]);
  useEffect(() => {
    let gone = false, stop: (() => void) | undefined;
    void onQuickCommand((command) => {
      if (gone) return;
      if (command === 'close') void latest.current.close();
      if (command === 'flush') {
        latest.current.voice.pauseRecording();
        void latest.current.save().then(() => quickPromptFlushed(), (error: unknown) => { setError(String(error)); return quickPromptFlushed(String(error)); }).catch((error: unknown) => setError(String(error)));
      }
    }).then((off) => { if (gone) off(); else stop = off; }).catch((error: unknown) => setError(String(error)));
    return () => { gone = true; stop?.(); clearTimeout(timer.current); void latest.current.save().catch(() => undefined); };
  }, []);
  const change = (value: string) => {
    text.current = value; setDraft(value); setError(undefined); clearTimeout(timer.current);
    timer.current = setTimeout(() => { void save().catch((error: unknown) => setError(String(error))); }, 200);
  };
  const openConversation = () => { pauseRecording(); void save().then(openQuickConversation).then(hideQuickPrompt).catch((error: unknown) => setError(String(error))); };
  const voiceBusy = ['requesting', 'recording', 'transcribing'].includes(voice.phase);
  const locked = submitting || Boolean(doc.pending) || voiceBusy;
  const retry = () => { if (doc.pending) void submitQuickPrompt(root, doc.revision, doc.pending.id).catch((error: unknown) => setError(String(error))); };
  return <ErrorBoundary label="Spike quick prompt" frame={(message) => <main className="quick-prompt quick-feedback">{message}<textarea aria-label="Recover quick prompt" readOnly value={draft} /><button type="button" onClick={() => void close()}>Save and close</button></main>}><main className="quick-prompt" data-testid="quick-prompt" onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); void close(); } }}>
    <form className="quick-pill" onSubmit={(event) => { event.preventDefault(); if (!locked && status.connected && !status.busy) void send(); }}>
      <header><Spike size={36} state={voice.phase === 'recording' ? 'listening' : status.busy ? 'thinking' : 'idle'} motion={voiceBusy || status.busy} /><strong>Spike</strong><span>{voice.phase === 'recording' ? `Listening · ${voice.seconds}s` : voice.phase === 'transcribing' ? 'Transcribing…' : voice.phase === 'requesting' ? 'Opening microphone…' : doc.pending && !doc.pending.error ? 'Sending…' : status.busy ? status.label : 'A little help, wherever you are.'}</span><button type="button" className="quick-icon" aria-label="Close quick prompt" onClick={() => void close()}>×</button></header>
      <textarea ref={input} aria-label="Quick message to Spike" rows={2} maxLength={10000} placeholder={status.connected ? 'What’s on your mind?' : 'Your prompt stays here while you connect Spike…'} value={draft} disabled={locked} onChange={(event) => change(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!locked && status.connected && !status.busy) void send(); } }} />
      <footer><button type="button" aria-label={voice.phase === 'recording' ? 'Send quick voice message' : 'Dictate to Spike'} aria-pressed={voice.phase === 'recording'} disabled={!status.connected || status.busy || submitting || Boolean(doc.pending) || ['requesting', 'transcribing'].includes(voice.phase)} onClick={() => voice.phase === 'recording' ? voice.stop() : void voice.start()}>{voice.phase === 'recording' ? 'Send voice' : 'Speak'}</button>{voiceBusy && <button type="button" onClick={voice.cancel}>Cancel recording</button>}<span>{snapshot.shortcuts.typing && snapshot.shortcuts.dictation ? '⇧⌘Space · type　⌥⇧⌘Space · speak' : 'Shortcut unavailable · click Spike to open'}</span><button type="submit" className="quick-send" disabled={!status.connected || status.busy || locked || !draft.trim()}>Send ↑</button></footer>
    </form>
    {(error || voice.error || doc.pending?.error) && <div className="quick-feedback" role="alert"><p>{error ?? voice.error ?? doc.pending?.error}</p>{doc.pending?.error && <button type="button" onClick={retry}>Retry prompt</button>}{voice.canRetry && <button type="button" onClick={voice.retry}>Retry recording</button>}</div>}
    {voice.canRetry && !voice.error && <div className="quick-feedback"><button type="button" onClick={voice.retry}>Send saved recording</button></div>}
    <div className="quick-response"><p>{!status.connected ? 'Connect your assistant in Spike settings. You can keep typing here.' : status.review ? 'Spike has a change or interrupted turn for you to review.' : status.reply || 'Your notes and conversation stay in Epizen.'}</p><button type="button" onClick={openConversation}>{!status.connected ? 'Connect Spike' : status.review ? 'Review in conversation ↗' : 'Open conversation ↗'}</button></div>
  </main></ErrorBoundary>;
}
