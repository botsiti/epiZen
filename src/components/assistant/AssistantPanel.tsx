import { AssistantIcon } from './AssistantIcon';
import { Fragment, memo, useCallback, useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage, AssistantSettings as Preferences } from '../../lib/assistant/types';
import { noteTitle } from '../../lib/links';
import { AssistantSettings } from './AssistantSettings';
import { Spike } from './Spike';
import type { AssistantController, AssistantSnapshot } from './controller';
import type { VoiceControls } from './useVoice';
import { assistantOpenUrl } from '../../lib/api';

interface Props {
  controller: AssistantController; snapshot: AssistantSnapshot; settings: Preferences; currentPath?: string; profileExists: boolean;
  voice: VoiceControls; companionError?: string;
  onSaveSettings: (value: Preferences) => Promise<void>; onOpenNote: (path: string) => void; onClose: () => void;
}
export function AssistantPanel({ controller, snapshot, voice, companionError, settings, currentPath, profileExists, onSaveSettings, onOpenNote, onClose }: Props) {
  const [preferences, setPreferences] = useState(false), [history, setHistory] = useState(false);
  const bottom = useRef<HTMLDivElement>(null), input = useRef<HTMLTextAreaElement>(null);
  const { pauseRecording } = voice;
  useEffect(() => () => pauseRecording(), [pauseRecording]);
  const { thread, busy, error } = snapshot;
  const [linkError, setLinkError] = useState<string>();
  const voiceBusy = ['requesting', 'recording', 'transcribing'].includes(voice.phase);
  const openUrl = useCallback((url: string) => { void assistantOpenUrl(url).catch((error: unknown) => setLinkError(String(error))); }, []);
  const waiting = thread.actions.filter((action) => action.status === 'review' || action.status === 'failed');
  const interrupted = Boolean(thread.run && thread.run.phase !== 'complete');
  useEffect(() => { bottom.current?.scrollIntoView?.({ block: 'nearest' }); }, [thread.messages.length, waiting.length, busy, preferences]);
  useEffect(() => { if (!preferences && snapshot.configured) input.current?.focus(); }, [preferences, snapshot.configured]);
  const connected = snapshot.configured && settings.enabled;
  const send = () => void controller.send();
  return <aside className="assistant-sidebar" aria-label="Spike assistant" data-testid="assistant-sidebar">
    <header className="assistant-header"><Spike size={44} state={voice.phase === 'recording' ? 'listening' : busy || voice.phase === 'transcribing' ? 'thinking' : waiting.length ? 'listening' : 'idle'} /><div><strong>Spike</strong><span>{busy ? snapshot.progress ?? 'Thinking' : 'Your personal assistant'}</span></div><button type="button" title="Conversation history" aria-label="Conversation history" disabled={voiceBusy} onClick={() => { setHistory(!history); setPreferences(false); }}><AssistantIcon name="history" /></button><button type="button" title="Assistant settings" aria-label="Assistant settings" disabled={voiceBusy} onClick={() => { setPreferences(!preferences); setHistory(false); }}><AssistantIcon name="settings" /></button>{preferences && busy && <button type="button" aria-label="Stop assistant" onClick={controller.stop}>■</button>}<button type="button" aria-label="Close assistant" onClick={onClose}><AssistantIcon name="close" /></button></header>
    {companionError && <p className="assistant-error" role="alert">Desktop Spike: {companionError}</p>}
    {preferences ? <AssistantSettings value={settings} configured={snapshot.configured} profileExists={profileExists} onSave={onSaveSettings} onCompanionChange={(patch) => onSaveSettings({ ...settings, ...patch })} onConnection={controller.checkConnection} onProfile={() => onOpenNote(settings.profilePath)} onBack={() => setPreferences(false)} /> : <>
      {history && <nav className="assistant-history" aria-label="Past conversations"><button type="button" disabled={busy || voiceBusy || snapshot.switching} onClick={() => void controller.exportConversation()}>Export conversation…</button><button type="button" disabled={busy || voiceBusy || snapshot.switching} onClick={() => { void controller.newChat(); setHistory(false); }}>+ New conversation</button>{snapshot.conversations.map((item) => <button type="button" key={item.id} disabled={busy || voiceBusy || snapshot.switching} aria-current={item.id === thread.id ? 'true' : undefined} onClick={() => { void controller.select(item.id).then(() => setHistory(false)).catch(() => undefined); }}>{item.title}{item.error && ' · unavailable'}</button>)}</nav>}
      <div className="assistant-context"><span>{currentPath && settings.shareCurrentNote ? `With ${noteTitle(currentPath)}` : 'Your vault'}</span><button type="button" disabled={busy || voiceBusy || snapshot.switching} onClick={() => void controller.newChat()}>New chat</button></div>
      <div className="assistant-conversation" role="log" aria-label="Conversation with Spike" aria-live="polite">
        {!thread.messages.length && <div className="assistant-welcome"><Spike size={116} state="greeting" followPointer /><h2>A little help, right here.</h2><p>Capture what you watched, make a plan, or talk through what’s on your mind.</p>
          {!connected ? <button type="button" className="assistant-primary" onClick={() => setPreferences(true)}>Connect Spike</button> : <div className="assistant-starters">{['I watched a movie yesterday', 'Help me plan tomorrow', 'Let’s start a thought record'].map((text) => <button type="button" key={text} onClick={() => { controller.setDraft(text); input.current?.focus(); }}>{text}<span>↗</span></button>)}</div>}
        </div>}
        {thread.messages.map((message) => <Fragment key={message.id}>{thread.actions.filter((action) => action.id.startsWith(`${message.id}:`)).map((action) => <AssistantAction key={action.id} action={action} busy={busy || voiceBusy || snapshot.switching} onReview={(id, accept) => void controller.review(id, accept)} onOpenNote={onOpenNote} />)}<AssistantMessage message={message} voiceDisabled={voiceBusy || !snapshot.configured || !settings.enabled} speak={voice.speak} openUrl={openUrl} /></Fragment>)}
        {thread.actions.filter((action) => !thread.messages.some((message) => action.id.startsWith(`${message.id}:`))).map((action) => <AssistantAction key={action.id} action={action} busy={busy || voiceBusy || snapshot.switching} onReview={(id, accept) => void controller.review(id, accept)} onOpenNote={onOpenNote} />)}
        {busy && <div className="assistant-working" role="status"><Spike size={40} state="thinking" /><span>{snapshot.progress ?? 'Thinking'}…</span></div>}
        {snapshot.notice && <p className="assistant-notice" role="status">{snapshot.notice}</p>}{linkError && <p className="assistant-error" role="alert">{linkError}</p>}{error && <div className="assistant-error" role="alert"><p>{error}</p>{snapshot.loaded && <button type="button" disabled={busy || voiceBusy || snapshot.switching} onClick={() => void controller.exportConversation()}>Export this conversation</button>}{!snapshot.loaded && <button type="button" onClick={() => void controller.load()}>Try loading again</button>}</div>}
        {!busy && interrupted && !waiting.length && <div className="assistant-recovery"><p>This turn was interrupted. Your conversation and completed actions are saved.</p><button type="button" onClick={() => void controller.resume()}>Resume</button><button type="button" onClick={() => void controller.finishInterrupted()}>End this turn</button></div>}
        <div ref={bottom} />
      </div>
      <form className="assistant-composer" onSubmit={(event) => { event.preventDefault(); send(); }}>{voice.phase !== 'idle' && <div className="assistant-voice-status" role="status"><span>{voice.phase === 'recording' ? `Listening · ${voice.seconds}s` : voice.phase === 'transcribing' ? 'Transcribing…' : voice.phase === 'speaking' ? 'Speaking…' : 'Opening microphone…'}</span><button type="button" onClick={voice.cancel}>Cancel</button></div>}{voice.error && <p className="assistant-error" role="alert">{voice.error}</p>}{voice.canRetry && <button type="button" className="assistant-text-button" onClick={voice.retry}>Retry saved recording</button>}<textarea ref={input} aria-label="Message Spike" placeholder={connected ? 'Ask Spike anything…' : 'Connect Spike to start a conversation'} value={thread.draft} disabled={!connected || !snapshot.loaded || voiceBusy || snapshot.switching} rows={3} onChange={(event) => controller.setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!busy && !interrupted) send(); } }} /><div><button type="button" aria-label={voice.phase === 'recording' ? 'Send voice message' : 'Speak to Spike'} disabled={!connected || !snapshot.loaded || snapshot.switching || busy || interrupted || voice.phase === 'requesting' || voice.phase === 'transcribing'} aria-pressed={voice.phase === 'recording'} onClick={() => voice.phase === 'recording' ? voice.stop() : void voice.start()}>{voice.phase === 'recording' ? 'Send voice' : 'Mic'}</button><span>{settings.allowChanges ? 'Can apply requested changes' : 'Reviews changes with you'}</span>{busy ? <button type="button" aria-label="Stop assistant" onClick={controller.stop}>Stop</button> : <button type="submit" className="assistant-primary" disabled={!connected || !thread.draft.trim() || interrupted || voiceBusy}>Send ↑</button>}</div></form>
    </>}
  </aside>;
}

function AssistantAction({ action, busy, onReview, onOpenNote }: { action: import('../../lib/assistant/conversation').ConversationAction; busy: boolean; onReview: (id: string, accept: boolean) => void; onOpenNote: (path: string) => void }) {
  return <section className={`assistant-action is-${action.status}`} data-testid="assistant-action"><div><span>{action.status === 'saved' ? '✓ Saved' : action.status === 'declined' ? action.error ? 'Retry stopped' : 'Declined' : action.status === 'failed' ? 'Needs attention' : 'Proposed change'}</span><strong>{action.change.description}</strong><small>{action.change.kind === 'note' ? action.change.path : new Date(action.change.start).toLocaleString()}</small></div>
          <details><summary>{action.change.kind === 'note' ? 'View note text' : 'View event'}</summary><pre>{action.change.kind === 'note' ? action.change.after : `${action.change.title}\n${new Date(action.change.start).toLocaleString()} → ${new Date(action.change.end).toLocaleString()}\n${action.change.notes ?? ''}`}</pre></details>
          {action.error && <p role="alert">{action.error}</p>}
          {(action.status === 'review' || action.status === 'failed') && <div className="assistant-action-buttons"><button type="button" className="assistant-primary" disabled={busy} onClick={() => onReview(action.id, true)}>{action.status === 'failed' ? 'Retry this save' : 'Apply change'}</button><button type="button" disabled={busy} onClick={() => onReview(action.id, false)}>{action.status === 'failed' ? 'Stop retrying' : 'Decline'}</button></div>}
          {action.status === 'saved' && action.change.kind === 'note' && <button type="button" className="assistant-text-button" onClick={() => onOpenNote(action.change.kind === 'note' ? action.change.path : '')}>Open note ↗</button>}
        </section>;
}

// A keystroke changes only the composer; old Markdown messages keep their rendered tree.
const AssistantMessage = memo(function AssistantMessage({ message, voiceDisabled, speak, openUrl }: {
  message: ChatMessage; voiceDisabled: boolean; speak: (text: string) => Promise<void>; openUrl: (url: string) => void;
}) {
  return <article className={`assistant-message is-${message.role}`}><span className="assistant-message-author">{message.role === 'user' ? 'You' : 'Spike'}</span><div className="assistant-message-text"><Markdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => <a href={href} className="assistant-source-text" onClick={(event) => { event.preventDefault(); if (href) openUrl(href); }}>{children}</a> }}>{message.text}</Markdown></div>{message.role === 'assistant' && <button type="button" className="assistant-read-aloud" disabled={voiceDisabled} onClick={() => void speak(message.text)}>Read aloud</button>}{message.sources?.length ? <div className="assistant-sources">{message.sources.map((source) => <button type="button" key={source.url} title={source.url} onClick={() => openUrl(source.url)}>{source.title}</button>)}</div> : null}</article>;
});
