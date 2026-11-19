import { useCallback, useEffect, useRef, useState } from 'react';
import { resizeQuickPrompt, consumeQuickOpen, hideQuickPrompt, onQuickCommand, onQuickPrompt, openQuickConversation, quickPromptFlushed, quickPromptState, saveQuickDraft, submitQuickPrompt, transcribeQuickPrompt, type QuickSnapshot } from '../../lib/api';
import { useVoice } from './useVoice';
import { ErrorBoundary } from '../ErrorBoundary';
import { CaptureIcon } from '../companion/CompanionDock';
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
  const [menuOpening, setMenuOpening] = useState<number>();
  const menuOpen = snapshot.visible && menuOpening === snapshot.opened;
  const [expandedReply, setExpandedReply] = useState<number>();
  const [previousReply, setPreviousReply] = useState('');
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
    sending.current = true; setRequestedAt(snapshot.opened); setPreviousReply(status.replyId ?? status.reply);
    setSubmitting(true); setError(undefined);
    try {
      await save();
      const id = crypto.randomUUID(); sent.current = { id, text: text.current, revision: revision.current };
      await submitQuickPrompt(root, revision.current, id);
    } catch (error) { sent.current = undefined; setSubmitting(false); setError(String(error)); }
    finally { sending.current = false; }
  }, [root, save, snapshot.opened, status.replyId, status.reply]);
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
  const canSpeak = status.connected && !status.busy && !locked;
  const beginVoice = () => { setMenuOpening(undefined); void voice.start(); };
  const reply = requestedAt === snapshot.opened && !status.busy && !submitting && !doc.pending && previousReply !== (status.replyId ?? status.reply) ? status.reply : '';
  const placeholder = voice.phase === 'transcribing' ? 'Transcribing…' : voice.phase === 'requesting' ? 'Opening microphone…' : status.busy ? 'Thinking…' : 'Ask Spike…';
  const waiting = requestedAt === snapshot.opened && (status.busy || submitting || !!doc.pending) && !doc.pending?.error && !error;
  return <ErrorBoundary label="Spike quick prompt" frame={(message) => <main className="quick-prompt quick-feedback">{message}<textarea aria-label="Recover quick prompt" readOnly value={draft} /><button type="button" onClick={() => void close()}>Save and close</button></main>}>
    <main ref={container} className={`quick-prompt${status.glass ? ' is-glass' : ''}`} data-testid="quick-prompt"
      onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); if (menuOpen) { setMenuOpening(undefined); input.current?.focus(); } else void close(); } }}>
      <form key={snapshot.opened} className="quick-pill" onSubmit={(event) => { event.preventDefault(); if (!locked && status.connected && !status.busy) void send(); }}>
        {voice.phase === 'recording' ? <>
          <button type="button" className="quick-round" aria-label="Cancel recording" title="Cancel recording" onClick={voice.cancel}><CaptureIcon name="close" /></button>
          <div className="quick-recording" role="status"><div className="quick-wave" aria-hidden="true">{Array.from({ length: 20 }, (_, index) =>
            <i key={index} style={{ height: `${3 + (voice.level ?? 0) * (8 + 13 * Math.sin(index * .7) ** 2)}px` }} />)}</div>
            <span>Listening · {Math.floor(voice.seconds / 60)}:{String(voice.seconds % 60).padStart(2, '0')}</span></div>
          <button type="button" className="quick-send" aria-label="Send quick voice message" title="Finish and send" onClick={voice.stop}><CaptureIcon name="send" /></button>
        </> : <>
          <button type="button" className="quick-round" aria-label="More prompt actions" title="Prompt actions" aria-expanded={menuOpen}
            onClick={() => setMenuOpening(menuOpen ? undefined : snapshot.opened)}><CaptureIcon name="plus" /></button>
          <textarea ref={input} aria-label="Quick message to Spike" rows={1} maxLength={10000} placeholder={placeholder} value={draft} disabled={locked}
            onFocus={() => setMenuOpening(undefined)} onChange={(event) => change(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!locked && status.connected && !status.busy) void send(); } }} />
          {draft.trim() ? <button type="submit" className="quick-send" aria-label="Send ↑" title="Send · Return" disabled={!canSpeak}><CaptureIcon name="send" /></button>
            : <button type="button" className="quick-round quick-voice" aria-label="Dictate quick message" title="Dictate to Spike" disabled={!canSpeak} onClick={beginVoice}><CaptureIcon name="voice" /></button>}
        </>}
      </form>
      {menuOpen && <div className="quick-actions" role="group" aria-label="Prompt actions">
        <button type="button" aria-label="Open conversation" onClick={openConversation}><CaptureIcon name="conversation" />Conversation</button>
        <button type="button" disabled={!canSpeak} onClick={beginVoice}><CaptureIcon name="voice" />Dictate</button>
        <button type="button" aria-label="Close quick prompt" onClick={() => void close()}><CaptureIcon name="close" />Close</button>
      </div>}
      {(error || voice.error || doc.pending?.error) && <div className="quick-feedback" role="alert"><p>{error ?? voice.error ?? doc.pending?.error}</p>{doc.pending?.error && <button type="button" onClick={retry}>Retry prompt</button>}{voice.canRetry && <button type="button" onClick={voice.retry}>Retry recording</button>}</div>}
      {voice.canRetry && !voice.error && <div className="quick-feedback"><button type="button" onClick={voice.retry}>Send saved recording</button></div>}
      {waiting && <div className="quick-progress" role="status">{status.busy ? status.label || 'Thinking…' : 'Sending…'}</div>}
      {(!status.connected || status.review || reply) && <div className="quick-response">
        {reply && <div className="quick-reply"><p className={expandedReply === snapshot.opened ? 'is-expanded' : undefined}>{reply}</p>
          {reply.length > 160 || reply.includes('\n') ? <button type="button" aria-expanded={expandedReply === snapshot.opened}
            onClick={() => setExpandedReply(expandedReply === snapshot.opened ? undefined : snapshot.opened)}>{expandedReply === snapshot.opened ? 'Less' : 'Expand reply'}</button> : null}</div>}
        <button type="button" onClick={openConversation}>{!status.connected ? 'Connect Spike' : status.review ? 'Review in conversation ↗' : 'Open conversation ↗'}</button>
      </div>}
    </main></ErrorBoundary>;
}
