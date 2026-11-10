import { useCallback, useEffect, useRef, useState } from 'react';
import { resizeQuickPrompt, consumeQuickOpen, hideQuickPrompt, onQuickCommand, onQuickPrompt, openQuickConversation, quickPromptFlushed, quickPromptState, saveQuickDraft, submitQuickPrompt, transcribeQuickPrompt, type QuickSnapshot } from '../../lib/api';
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
  const container = useRef<HTMLElement>(null);
  const input = useRef<HTMLTextAreaElement>(null), text = useRef(doc.draft), revision = useRef(doc.revision), saved = useRef(doc.draft);
  const queue = useRef(Promise.resolve()), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sending = useRef(false);
  const [requestedAt, setRequestedAt] = useState(-1);
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
    sending.current = true; setRequestedAt(snapshot.opened);
    setSubmitting(true); setError(undefined);
    try {
      await save();
      const id = crypto.randomUUID(); sent.current = { id, text: text.current, revision: revision.current };
      await submitQuickPrompt(root, revision.current, id);
    } catch (error) { sent.current = undefined; setSubmitting(false); setError(String(error)); }
    finally { sending.current = false; }
  }, [root, save, snapshot.opened]);
  const receiveVoice = useCallback(async (transcript: string) => {
    text.current = [text.current.trim(), transcript.trim()].filter(Boolean).join('\n'); setDraft(text.current);
    await save(); await send();
  }, [save, send]);
  const transcriber = useCallback<NonNullable<Parameters<typeof useVoice>[3]>>((audio, mime, signal, provider, voice) => transcribeQuickPrompt(root, audio, mime, signal, provider, voice), [root]);
  const voice = useVoice(receiveVoice, 'codex', status.voice, transcriber);
  const { pauseRecording } = voice;
  const close = useCallback(async () => {
    pauseRecording();
    try { await save(); await hideQuickPrompt(snapshot.opened); }
    catch (error) { setError(String(error)); }
  }, [pauseRecording, save, snapshot.opened]);
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
  useEffect(() => {
    const element = container.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => { void resizeQuickPrompt(Math.ceil(element.getBoundingClientRect().height)).catch((error: unknown) => setError(String(error))); });
    observer.observe(element); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = input.current; if (!element) return;
    element.style.height = '24px'; element.style.height = `${Math.min(96, element.scrollHeight)}px`;
  }, [draft, snapshot.opened, voice.phase]);
  const change = (value: string) => {
    text.current = value; setDraft(value); setError(undefined); clearTimeout(timer.current);
    timer.current = setTimeout(() => { void save().catch((error: unknown) => setError(String(error))); }, 200);
  };
  const openConversation = () => { pauseRecording(); void save().then(openQuickConversation).then(() => hideQuickPrompt(snapshot.opened)).catch((error: unknown) => setError(String(error))); };
  const voiceBusy = ['requesting', 'recording', 'transcribing'].includes(voice.phase);
  const locked = submitting || Boolean(doc.pending) || voiceBusy;
  const retry = () => { if (doc.pending) void submitQuickPrompt(root, doc.revision, doc.pending.id).catch((error: unknown) => setError(String(error))); };
  return <ErrorBoundary label="Spike quick prompt" frame={(message) => <main className="quick-prompt quick-feedback">{message}<textarea aria-label="Recover quick prompt" readOnly value={draft} /><button type="button" onClick={() => void close()}>Save and close</button></main>}><main ref={container} className={`quick-prompt${status.glass ? ' is-glass' : ''}`} data-testid="quick-prompt" onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); void close(); } }}>
    <form key={snapshot.opened} className={`quick-pill${voice.phase === 'recording' ? ' is-recording' : ''}`} onSubmit={(event) => { event.preventDefault(); if (!locked && status.connected && !status.busy) void send(); }}>
      <button type="button" className="quick-spike" aria-label="Open conversation" title="Open conversation" onClick={openConversation}><Spike size={24} state={voice.phase === 'recording' ? 'listening' : status.busy ? 'thinking' : 'idle'} motion={voiceBusy || status.busy} /></button>
      {voice.phase === 'recording' ? <div className="quick-recording" role="status"><div className="quick-wave" aria-hidden="true">{Array.from({ length: 16 }, (_, index) => <i key={index} style={{ height: `${4 + (voice.level ?? 0) * (12 + 10 * Math.sin(index * .7) ** 2)}px` }} />)}</div><span>Listening · {voice.seconds}s</span></div> : <textarea ref={input} aria-label="Quick message to Spike" rows={1} maxLength={10000} placeholder={voice.phase === 'transcribing' ? 'Transcribing…' : status.busy ? 'Spike is thinking…' : 'Message Spike…'} value={draft} disabled={locked} onChange={(event) => change(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!locked && status.connected && !status.busy) void send(); } }} />}
      {voice.phase === 'recording' ? <><button type="button" className="quick-icon" aria-label="Cancel recording" onClick={voice.cancel}>×</button><button type="button" className="quick-send" aria-label="Send quick voice message" onClick={voice.stop}>↑</button></> : <><button type="button" className="quick-icon" aria-label="Dictate to Spike" title="Dictate · ⌥⇧⌘Space" disabled={!status.connected || status.busy || locked} onClick={() => void voice.start()}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 10v2a6 6 0 0 0 12 0v-2M12 18v3m-3 0h6"/></svg></button><button type="submit" className="quick-send" aria-label="Send ↑" disabled={!status.connected || status.busy || locked || !draft.trim()}>↑</button><button type="button" className="quick-icon quick-close" aria-label="Close quick prompt" title="Close · Escape" onClick={() => void close()}>×</button></>}
    </form>
    {(error || voice.error || doc.pending?.error) && <div className="quick-feedback" role="alert"><p>{error ?? voice.error ?? doc.pending?.error}</p>{doc.pending?.error && <button type="button" onClick={retry}>Retry prompt</button>}{voice.canRetry && <button type="button" onClick={voice.retry}>Retry recording</button>}</div>}
    {voice.canRetry && !voice.error && <div className="quick-feedback"><button type="button" onClick={voice.retry}>Send saved recording</button></div>}
    {(!status.connected || status.review || requestedAt === snapshot.opened && status.reply) && <div className="quick-response">{status.reply && <p>{status.reply}</p>}<button type="button" onClick={openConversation}>{!status.connected ? 'Connect Spike' : status.review ? 'Review in conversation ↗' : 'Open conversation ↗'}</button></div>}
  </main></ErrorBoundary>;
}
